const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/adminModel");
const {
  ACCESS_TOKEN_COOKIE,
  getCookieOptions,
  logSecurityEvent,
} = require("../utils/security");

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function createAdminToken(admin) {
  return jwt.sign(Admin.toPublicAdmin(admin), process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}

function setAdminCookie(res, token) {
  res.cookie(
    ACCESS_TOKEN_COOKIE,
    token,
    getCookieOptions(TOKEN_MAX_AGE_MS)
  );
}

function logAdminLoginDebug(details) {
  console.info("[admin-login]", JSON.stringify(details));
}

async function loginAdmin(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const { password } = req.body;

  logAdminLoginDebug({
    step: "received",
    email,
  });

  if (!email || !password) {
    logAdminLoginDebug({
      step: "failed",
      reason: "missing_email_or_password",
      emailReceived: Boolean(email),
      passwordReceived: Boolean(password),
    });

    return res.status(400).json({
      message: "Email and password are required.",
    });
  }

  if (!process.env.JWT_SECRET) {
    logAdminLoginDebug({
      step: "failed",
      reason: "missing_jwt_secret",
      email,
    });

    return res.status(500).json({
      message: "JWT secret is not configured.",
    });
  }

  try {
    const admin = await Admin.findAdminByEmail(email);

    if (!admin) {
      logAdminLoginDebug({
        step: "failed",
        reason: "admin_not_found",
        email,
        adminFound: false,
        passwordHashExists: false,
      });

      return res.status(401).json({
        message: "Invalid admin credentials.",
      });
    }

    logAdminLoginDebug({
      step: "admin_lookup",
      email,
      adminFound: true,
      adminId: admin.id,
      passwordHashExists: Boolean(admin.password_hash),
    });

    const passwordMatches = await bcrypt.compare(
      password,
      admin.password_hash || ""
    );

    logAdminLoginDebug({
      step: "password_check",
      email,
      adminId: admin.id,
      bcryptCompare: passwordMatches,
    });

    if (!passwordMatches) {
      logSecurityEvent("admin_login_failed", req, {
        email,
        reason: "bad_password",
      });

      return res.status(401).json({
        message: "Invalid admin credentials.",
      });
    }

    const token = createAdminToken(admin);

    logAdminLoginDebug({
      step: "jwt_generated",
      email,
      adminId: admin.id,
      jwtGenerated: Boolean(token),
    });

    setAdminCookie(res, token);

    logAdminLoginDebug({
      step: "login_success",
      email,
      adminId: admin.id,
      cookieCreated: true,
    });

    return res.json({
      token,
      admin: Admin.toPublicAdmin(admin),
    });
  } catch (error) {
    logAdminLoginDebug({
      step: "failed",
      reason: "exception",
      email,
      error: error.message,
    });
    console.error("Unable to login admin:", error);

    return res.status(500).json({
      message: "Unable to login admin.",
    });
  }
}

async function getAdminProfile(req, res) {
  if (!req.admin?.id) {
    return res.status(401).json({
      message: "Admin authentication required.",
    });
  }

  try {
    const admin = await Admin.findAdminById(req.admin.id);

    if (!admin) {
      return res.status(404).json({
        message: "Admin not found.",
      });
    }

    return res.json({
      admin: Admin.toPublicAdmin(admin),
    });
  } catch (error) {
    console.error("Unable to load admin profile:", error);

    return res.status(500).json({
      message: "Unable to load admin profile.",
    });
  }
}

function logoutAdmin(req, res) {
  res.clearCookie(
    ACCESS_TOKEN_COOKIE,
    getCookieOptions(0)
  );

  return res.json({
    message: "Logged out.",
  });
}

module.exports = {
  loginAdmin,
  getAdminProfile,
  logoutAdmin,
};
