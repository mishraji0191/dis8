const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const SecurityToken = require("../models/securityTokenModel");
const UserSession = require("../models/userSessionModel");
const LoginAttempt = require("../models/loginAttemptModel");
const { sendOtpSms } = require("../services/otpProviderService");
const {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  generateNumericCode,
  generateSecureToken,
  getClientIp,
  getCookieOptions,
  logSecurityEvent,
} = require("../utils/security");

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const REMEMBER_DEVICE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const OTP_EXPIRY_MINUTES = 10;
const MOBILE_LOGIN_PURPOSE = "phone_login";

function logAuthError(context, error, metadata = {}) {
  console.error(context, {
    metadata,
    message: error?.message,
    stack: error?.stack,
    name: error?.name,
    code: error?.code,
    detail: error?.detail,
    hint: error?.hint,
    table: error?.table,
    column: error?.column,
    constraint: error?.constraint,
    routine: error?.routine,
    severity: error?.severity,
  });
}

function authErrorStatus(error) {
  if (error?.status) return error.status;
  if (error?.code === "23505") return 409;
  if (error?.code?.startsWith?.("23")) return 409;
  if (error?.code?.startsWith?.("22")) return 400;
  return 403;
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

function ensureJwtConfigured() {
  if (!process.env.JWT_SECRET) {
    const error = new Error("JWT secret is not configured.");
    error.status = 403;
    throw error;
  }
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

async function sendMobileLoginOtp(user) {
  const otp = generateNumericCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await SecurityToken.clearPurpose(user.id, MOBILE_LOGIN_PURPOSE);
  await SecurityToken.createToken({
    userId: user.id,
    purpose: MOBILE_LOGIN_PURPOSE,
    token: otp,
    expiresAt,
  });
  await sendOtpSms({ phone: user.phone, otp, purpose: MOBILE_LOGIN_PURPOSE });

  return { expiresAt };
}

async function requestOtpLogin(req, res) {
  const { phone } = req.body;

  try {
    const user = await User.findOrCreateMobileOtpUser({ phone });
    const { expiresAt } = await sendMobileLoginOtp(user);

    await LoginAttempt.recordLoginAttempt(req, {
      email: user.email,
      phone: user.phone,
      success: false,
      reason: "phone_login_requested",
    });

    return res.status(202).json({
      message: "OTP sent.",
      expiresAt,
      channel: "sms",
      purpose: MOBILE_LOGIN_PURPOSE,
      mobile: user.phone,
    });
  } catch (error) {
    logAuthError("Unable to request mobile login OTP.", error, { phone });

    if (error?.code === "23505") {
      return res.status(409).json({ message: "Mobile number is already linked to another account." });
    }

    return res.status(authErrorStatus(error)).json({
      message: error?.status === 403 ? error.message : "Unable to send OTP. Please try again.",
    });
  }
}

async function verifyOtpLogin(req, res) {
  const { phone, otp, rememberDevice = true } = req.body;

  try {
    const user = await User.findUserByPhone(phone);

    if (!user) {
      return res.status(404).json({ message: "No OTP request found for this mobile number." });
    }

    const tokenRow = await SecurityToken.consumeToken({ token: otp, purpose: MOBILE_LOGIN_PURPOSE });

    if (!tokenRow || Number(tokenRow.user_id) !== Number(user.id)) {
      logSecurityEvent("otp_login_failed", req, { phone: user.phone, purpose: MOBILE_LOGIN_PURPOSE });
      await LoginAttempt.recordLoginAttempt(req, {
        email: user.email,
        phone: user.phone,
        success: false,
        reason: "invalid_or_expired_otp",
      });
      return res.status(401).json({ message: "Invalid or expired OTP." });
    }

    await User.markPhoneVerified(user.id);

    const updatedUser = await User.findUserById(user.id);
    const { accessToken } = await issueAuthSession(req, res, updatedUser, rememberDevice);
    await LoginAttempt.recordLoginAttempt(req, {
      email: updatedUser.email,
      phone: updatedUser.phone,
      success: true,
      reason: MOBILE_LOGIN_PURPOSE,
    });

    return res.json({ token: accessToken, user: User.toPublicUser(updatedUser) });
  } catch (error) {
    logAuthError("Unable to verify mobile login OTP.", error, { phone });
    return res.status(authErrorStatus(error)).json({
      message: error?.status === 403 ? error.message : "Unable to verify OTP. Please try again.",
    });
  }
}

async function requestTwoFactorOtp(req, res) {
  try {
    const user = await User.findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    await sendMobileLoginOtp(user);
    return res.json({ message: "Two-factor OTP sent." });
  } catch (error) {
    logAuthError("Unable to request two-factor OTP.", error, { userId: req.user?.id });
    return res.status(authErrorStatus(error)).json({ message: "Unable to send OTP." });
  }
}

async function enableTwoFactor(req, res) {
  const { otp } = req.body;

  try {
    const tokenRow = await SecurityToken.consumeToken({ token: otp, purpose: MOBILE_LOGIN_PURPOSE });

    if (!tokenRow || Number(tokenRow.user_id) !== Number(req.user.id)) {
      return res.status(401).json({ message: "Invalid or expired OTP." });
    }

    const user = await User.setTwoFactorEnabled(req.user.id, true);
    return res.json({ user: User.toPublicUser(user), message: "Two-factor authentication enabled." });
  } catch (error) {
    logAuthError("Unable to enable two-factor authentication.", error, { userId: req.user?.id });
    return res.status(authErrorStatus(error)).json({ message: "Unable to enable two-factor authentication." });
  }
}

async function disableTwoFactor(req, res) {
  try {
    const user = await User.setTwoFactorEnabled(req.user.id, false);
    return res.json({ user: User.toPublicUser(user), message: "Two-factor authentication disabled." });
  } catch (error) {
    logAuthError("Unable to disable two-factor authentication.", error, { userId: req.user?.id });
    return res.status(authErrorStatus(error)).json({ message: "Unable to disable two-factor authentication." });
  }
}

async function me(req, res) {
  try {
    const user = await User.findUserById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.json({ user: User.toPublicUser(user) });
  } catch (error) {
    logAuthError("Unable to load user profile.", error, { userId: req.user?.id });
    return res.status(authErrorStatus(error)).json({ message: "Unable to load user profile." });
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
  disableTwoFactor,
  enableTwoFactor,
  logout,
  me,
  refresh,
  requestOtpLogin,
  requestTwoFactorOtp,
  revokeSession,
  sessions,
  verifyOtpLogin,
};
