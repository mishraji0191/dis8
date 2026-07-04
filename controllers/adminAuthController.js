const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Admin = require("../models/adminModel");
const { ACCESS_TOKEN_COOKIE, getCookieOptions, logSecurityEvent } = require("../utils/security");

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function createAdminToken(admin) {
  return jwt.sign(Admin.toPublicAdmin(admin), process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}

function setAdminCookie(res, token) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, getCookieOptions(TOKEN_MAX_AGE_MS));
}

async function loginAdmin(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  if (!process.env.JWT_SECRET) 
    return res.status(500).json({ message: "JWT secret is not configured." });
  }

  try {
    const admin = await Admin.findAdminByEmail(email);

    if (!admin) {
      return res.status(401).json({ message: "Invalid admin credentials." });
    }

    const passwordMatches = await bcrypt.compare(password, admin.password_hash);

    if (!passwordMatches) {
      logSecurityEvent("admin_login_failed", req, { email, reason: "bad_password" });
      return res.status(401).json({ message: "Invalid admin credentials." });
    }

    const token = createAdminToken(admin);
    setAdminCookie(res, token);

    return res.json({
      token,
      admin: Admin.toPublicAdmin(admin),
    });
  } catch (error) {
    console.error("Unable to login admin:", error);
    return res.status(500).json({ message: "Unable to login admin." });
  }
}

async function getAdminProfile(req, res) {
  if (!req.admin?.id) {
    return res.status(401).json({ message: "Admin authentication required." });
  }

  try {
    const admin = await Admin.findAdminById(req.admin.id);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found." });
    }

    return res.json({ admin: Admin.toPublicAdmin(admin) });
  } catch (error) {
    console.error("Unable to load admin profile:", error);
    return res.status(500).json({ message: "Unable to load admin profile." });
  }
}

function logoutAdmin(req, res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, getCookieOptions(0));
  return res.json({ message: "Logged out." });
}

module.exports = {
  loginAdmin,
  getAdminProfile,
  logoutAdmin,
};
