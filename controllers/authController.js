const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const SecurityToken = require("../models/securityTokenModel");
const UserSession = require("../models/userSessionModel");
const LoginAttempt = require("../models/loginAttemptModel");
const { sendPasswordResetEmail } = require("../services/notificationService");
const {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  generateSecureToken,
  getClientIp,
  getCookieOptions,
} = require("../utils/security");

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REMEMBER_DEVICE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const PASSWORD_RESET_EXPIRY_MINUTES = 30;
const PASSWORD_RESET_PURPOSE = "password_reset";

function logAuthError(context, error, metadata = {}) {
  console.error(context, {
    metadata,
    message: error?.message,
    stack: error?.stack,
    name: error?.name,
    code: error?.code,
    detail: error?.detail,
    constraint: error?.constraint,
  });
}

function authErrorStatus(error) {
  if (error?.status) return error.status;
  if (error?.code === "23505") return 409;
  if (error?.code?.startsWith?.("23")) return 409;
  if (error?.code?.startsWith?.("22")) return 400;
  return 500;
}

function ensureJwtConfigured() {
  if (!process.env.JWT_SECRET) {
    const error = new Error("JWT secret is not configured.");
    error.status = 403;
    throw error;
  }
}

function createUserToken(user) {
  return jwt.sign(User.toPublicUser(user), process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "15m",
  });
}

function setAuthCookies(res, accessToken, refreshToken, refreshMaxAgeMs) {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, getCookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, getCookieOptions(refreshMaxAgeMs));
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, getCookieOptions(0));
  res.clearCookie(REFRESH_TOKEN_COOKIE, getCookieOptions(0));
}

function getDeviceName(req) {
  return req.body.deviceName || req.headers["x-device-name"] || req.headers["user-agent"] || "Unknown device";
}

async function issueAuthSession(req, res, user, rememberDevice = false) {
  ensureJwtConfigured();

  const accessToken = createUserToken(user);
  const refreshToken = generateSecureToken();
  const refreshMaxAgeMs = rememberDevice ? REMEMBER_DEVICE_MAX_AGE_MS : REFRESH_TOKEN_MAX_AGE_MS;
  const expiresAt = new Date(Date.now() + refreshMaxAgeMs);

  const session = await UserSession.createSession({
    userId: user.id,
    refreshToken,
    deviceName: getDeviceName(req),
    userAgent: req.headers["user-agent"],
    ipAddress: getClientIp(req),
    rememberDevice,
    expiresAt,
  });

  setAuthCookies(res, accessToken, refreshToken, refreshMaxAgeMs);
  return { accessToken, refreshToken, session };
}

async function register(req, res) {
  const { name, email, phone, password, confirmPassword, rememberMe = true } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match." });
  }

  try {
    const existing = await User.findUserByEmail(email);

    if (existing) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.createPasswordUser({ name, email, phone, passwordHash });
    const { accessToken } = await issueAuthSession(req, res, user, rememberMe);

    await LoginAttempt.recordLoginAttempt(req, {
      email: user.email,
      phone: user.phone,
      success: true,
      reason: "register",
    });

    return res.status(201).json({ token: accessToken, user: User.toPublicUser(user) });
  } catch (error) {
    logAuthError("Unable to register user.", error, { email });
    return res.status(authErrorStatus(error)).json({
      message:
        error?.code === "23505"
          ? "An account with this email or phone already exists."
          : "Unable to register. Please try again.",
    });
  }
}

async function login(req, res) {
  const { email, password, rememberMe = false } = req.body;

  try {
    const user = await User.findUserByEmail(email);

    if (!user?.password_hash) {
      await LoginAttempt.recordLoginAttempt(req, {
        email,
        phone: user?.phone,
        success: false,
        reason: "invalid_credentials",
      });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const matches = await bcrypt.compare(password, user.password_hash);

    if (!matches) {
      await LoginAttempt.recordLoginAttempt(req, {
        email: user.email,
        phone: user.phone,
        success: false,
        reason: "invalid_credentials",
      });
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const { accessToken } = await issueAuthSession(req, res, user, rememberMe);
    await LoginAttempt.recordLoginAttempt(req, {
      email: user.email,
      phone: user.phone,
      success: true,
      reason: "password_login",
    });

    return res.json({ token: accessToken, user: User.toPublicUser(user) });
  } catch (error) {
    logAuthError("Unable to login user.", error, { email });
    return res.status(authErrorStatus(error)).json({ message: "Unable to login. Please try again." });
  }
}

async function forgotPassword(req, res) {
  const { email } = req.body;

  try {
    const user = await User.findUserByEmail(email);

    if (user) {
      const resetToken = generateSecureToken();
      const expiresAt = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);

      await SecurityToken.clearPurpose(user.id, PASSWORD_RESET_PURPOSE);
      await SecurityToken.createToken({
        userId: user.id,
        purpose: PASSWORD_RESET_PURPOSE,
        token: resetToken,
        expiresAt,
      });
      await sendPasswordResetEmail({ user, resetToken });
    }

    return res.json({
      message: "If an account exists for this email, a password reset link has been sent.",
    });
  } catch (error) {
    logAuthError("Unable to request password reset.", error, { email });
    return res.status(authErrorStatus(error)).json({ message: "Unable to send reset link." });
  }
}

async function resetPassword(req, res) {
  const { token, password, confirmPassword } = req.body;

  if (password !== confirmPassword) {
    return res.status(400).json({ message: "Passwords do not match." });
  }

  try {
    const tokenRow = await SecurityToken.consumeToken({
      token,
      purpose: PASSWORD_RESET_PURPOSE,
    });

    if (!tokenRow) {
      return res.status(400).json({ message: "Invalid or expired reset link." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.updatePassword(tokenRow.user_id, passwordHash);
    await UserSession.revokeAllForUser(tokenRow.user_id);
    clearAuthCookies(res);

    return res.json({ message: "Password reset successfully. Please login." });
  } catch (error) {
    logAuthError("Unable to reset password.", error);
    return res.status(authErrorStatus(error)).json({ message: "Unable to reset password." });
  }
}

async function profile(req, res) {
  try {
    const user = await User.findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({ user: User.toPublicUser(user) });
  } catch (error) {
    logAuthError("Unable to load user profile.", error, { userId: req.user?.id });
    return res.status(authErrorStatus(error)).json({ message: "Unable to load profile." });
  }
}

async function refresh(req, res) {
  const currentRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body.refreshToken;

  try {
    ensureJwtConfigured();

    if (!currentRefreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh session expired." });
    }

    const session = await UserSession.findActiveSessionByRefreshToken(currentRefreshToken);

    if (!session) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh session expired." });
    }

    const user = await User.findUserById(session.user_id);

    if (!user) {
      clearAuthCookies(res);
      return res.status(401).json({ message: "Refresh session expired." });
    }

    const accessToken = createUserToken(user);
    const refreshToken = generateSecureToken();
    const refreshMaxAgeMs = session.remember_device ? REMEMBER_DEVICE_MAX_AGE_MS : REFRESH_TOKEN_MAX_AGE_MS;

    await UserSession.rotateSession(
      session.id,
      refreshToken,
      new Date(Date.now() + refreshMaxAgeMs)
    );
    setAuthCookies(res, accessToken, refreshToken, refreshMaxAgeMs);

    return res.json({ token: accessToken, user: User.toPublicUser(user) });
  } catch (error) {
    logAuthError("Unable to refresh token.", error);
    clearAuthCookies(res);
    return res.status(authErrorStatus(error)).json({
      message: error?.status === 403 ? error.message : "Unable to refresh session.",
    });
  }
}

async function sessions(req, res) {
  try {
    const rows = await UserSession.listUserSessions(req.user.id);
    return res.json({ sessions: rows });
  } catch (error) {
    logAuthError("Unable to list user sessions.", error, { userId: req.user?.id });
    return res.status(authErrorStatus(error)).json({ message: "Unable to list sessions." });
  }
}

async function revokeSession(req, res) {
  try {
    await UserSession.revokeSession(req.params.id, req.user.id);
    return res.json({ message: "Session revoked." });
  } catch (error) {
    logAuthError("Unable to revoke user session.", error, {
      userId: req.user?.id,
      sessionId: req.params.id,
    });
    return res.status(authErrorStatus(error)).json({ message: "Unable to revoke session." });
  }
}

async function logout(req, res) {
  try {
    await UserSession.revokeByRefreshToken(req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body.refreshToken);
    clearAuthCookies(res);
    return res.json({ message: "Logged out." });
  } catch (error) {
    logAuthError("Unable to logout user.", error);
    clearAuthCookies(res);
    return res.status(authErrorStatus(error)).json({ message: "Unable to logout." });
  }
}

module.exports = {
  forgotPassword,
  login,
  logout,
  profile,
  refresh,
  register,
  resetPassword,
  revokeSession,
  sessions,
};
