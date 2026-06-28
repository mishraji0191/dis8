const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const SecurityToken = require("../models/securityTokenModel");
const UserSession = require("../models/userSessionModel");
const LoginAttempt = require("../models/loginAttemptModel");
const Notification = require("../services/notificationService");
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
const RESET_EXPIRY_MINUTES = 30;

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

async function sendOtp(user, purpose, channel = "email") {
  const otp = generateNumericCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await SecurityToken.clearPurpose(user.id, purpose);
  await SecurityToken.createToken({ userId: user.id, purpose, token: otp, expiresAt });

  if (channel === "sms") {
    await sendOtpSms({ phone: user.phone, otp, purpose });
  } else {
    await Notification.sendOtpEmail({ user, otp, purpose });
  }

  return { expiresAt };
}

async function register(req, res) {
  const { name, email, phone, password } = req.body;

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT secret is not configured." });
  }

  try {
    const existingUser = await User.findUserByEmail(email);

    if (existingUser) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.createUser({ name, email, phone, passwordHash });
    await sendOtp(user, "email_verification");

    const { accessToken } = await issueAuthSession(req, res, user, false);

    return res.status(201).json({
      token: accessToken,
      user: User.toPublicUser(user),
      requiresOtpVerification: true,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    console.error("Unable to register user:", error);
    return res.status(500).json({ message: "Unable to register user." });
  }
}

async function login(req, res) {
  const { email, password, rememberDevice = false } = req.body;

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT secret is not configured." });
  }

  try {
    const user = await User.findUserByEmail(email);

    if (!user || !user.password_hash) {
      await LoginAttempt.recordLoginAttempt(req, { email, success: false, reason: "not_found" });
      logSecurityEvent("login_failed", req, { email, reason: "not_found" });
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      await LoginAttempt.recordLoginAttempt(req, { email, success: false, reason: "bad_password" });
      logSecurityEvent("login_failed", req, { email, reason: "bad_password" });
      return res.status(401).json({ message: "Invalid credentials." });
    }

    if (user.two_factor_enabled) {
      await sendOtp(user, "two_factor");
      await LoginAttempt.recordLoginAttempt(req, { email, success: false, reason: "2fa_required" });
      return res.json({ requiresTwoFactor: true, message: "Two-factor verification required." });
    }

    const { accessToken } = await issueAuthSession(req, res, user, rememberDevice);
    await LoginAttempt.recordLoginAttempt(req, { email, success: true, reason: "password" });

    return res.json({ token: accessToken, user: User.toPublicUser(user) });
  } catch (error) {
    console.error("Unable to login user:", error);
    return res.status(500).json({ message: "Unable to login user." });
  }
}

async function requestOtpLogin(req, res) {
  const { email, phone, name, channel = phone ? "sms" : "email" } = req.body;

  try {
    const user = await User.findOrCreateOtpUser({ email, phone, name });
    const purpose = phone ? "phone_login" : "email_login";
    const { expiresAt } = await sendOtp(user, purpose, channel);

    await LoginAttempt.recordLoginAttempt(req, {
      email: user.email,
      success: false,
      reason: `${purpose}_requested`,
    });

    return res.status(202).json({
      message: "OTP sent.",
      expiresAt,
      channel,
      purpose,
      userHint: phone || email,
    });
  } catch (error) {
    console.error("Unable to request login OTP:", error);
    return res.status(500).json({ message: "Unable to send OTP." });
  }
}

async function verifyOtpLogin(req, res) {
  const { email, phone, otp, rememberDevice = false } = req.body;
  const purpose = phone ? "phone_login" : "email_login";

  try {
    const user = phone ? await User.findUserByPhone(phone) : await User.findUserByEmail(email);

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    const tokenRow = await SecurityToken.consumeToken({ token: otp, purpose });

    if (!tokenRow || Number(tokenRow.user_id) !== Number(user.id)) {
      logSecurityEvent("otp_login_failed", req, { email: user.email, phone, purpose });
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    if (phone) {
      await User.markPhoneVerified(user.id);
    } else {
      await User.markEmailVerified(user.id);
    }

    const updatedUser = await User.findUserById(user.id);
    const { accessToken } = await issueAuthSession(req, res, updatedUser, rememberDevice);
    await LoginAttempt.recordLoginAttempt(req, {
      email: updatedUser.email,
      success: true,
      reason: purpose,
    });

    return res.json({ token: accessToken, user: User.toPublicUser(updatedUser) });
  } catch (error) {
    console.error("Unable to verify login OTP:", error);
    return res.status(500).json({ message: "Unable to verify OTP." });
  }
}

async function verifyOtp(req, res) {
  const { email, otp, purpose = "email_verification" } = req.body;

  try {
    const user = await User.findUserByEmail(email);

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    const tokenRow = await SecurityToken.consumeToken({ token: otp, purpose });

    if (!tokenRow || Number(tokenRow.user_id) !== Number(user.id)) {
      logSecurityEvent("otp_failed", req, { email, purpose });
      return res.status(400).json({ message: "Invalid or expired OTP." });
    }

    if (purpose === "email_verification") {
      await User.markEmailVerified(user.id);
    }

    const updatedUser = await User.findUserById(user.id);
    const { accessToken } = await issueAuthSession(req, res, updatedUser, false);

    return res.json({ token: accessToken, user: User.toPublicUser(updatedUser), verified: true });
  } catch (error) {
    console.error("Unable to verify OTP:", error);
    return res.status(500).json({ message: "Unable to verify OTP." });
  }
}

async function requestTwoFactorOtp(req, res) {
  const user = await User.findUserById(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  await sendOtp(user, "two_factor");
  return res.json({ message: "Two-factor OTP sent." });
}

async function enableTwoFactor(req, res) {
  const { otp } = req.body;
  const tokenRow = await SecurityToken.consumeToken({ token: otp, purpose: "two_factor" });

  if (!tokenRow || Number(tokenRow.user_id) !== Number(req.user.id)) {
    return res.status(400).json({ message: "Invalid or expired OTP." });
  }

  const user = await User.setTwoFactorEnabled(req.user.id, true);
  return res.json({ user: User.toPublicUser(user), message: "Two-factor authentication enabled." });
}

async function disableTwoFactor(req, res) {
  const user = await User.setTwoFactorEnabled(req.user.id, false);
  return res.json({ user: User.toPublicUser(user), message: "Two-factor authentication disabled." });
}

async function forgotPassword(req, res) {
  const { email } = req.body;

  try {
    const user = await User.findUserByEmail(email);

    if (user) {
      const resetToken = generateSecureToken();
      const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000);

      await SecurityToken.clearPurpose(user.id, "password_reset");
      await SecurityToken.createToken({
        userId: user.id,
        purpose: "password_reset",
        token: resetToken,
        expiresAt,
      });
      await Notification.sendPasswordResetEmail({ user, resetToken });
    }

    return res.json({
      message: "If that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Unable to request password reset:", error);
    return res.status(500).json({ message: "Unable to request password reset." });
  }
}

async function resetPassword(req, res) {
  const { token, password } = req.body;

  try {
    const tokenRow = await SecurityToken.consumeToken({ token, purpose: "password_reset" });

    if (!tokenRow) {
      return res.status(400).json({ message: "Invalid or expired reset token." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await User.updatePassword(tokenRow.user_id, passwordHash);

    return res.json({ message: "Password reset successful." });
  } catch (error) {
    console.error("Unable to reset password:", error);
    return res.status(500).json({ message: "Unable to reset password." });
  }
}

async function me(req, res) {
  const user = await User.findUserById(req.user.id);

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  return res.json({ user: User.toPublicUser(user) });
}

async function refresh(req, res) {
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT secret is not configured." });
  }

  const currentRefreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body.refreshToken;

  try {
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
    console.error("Unable to refresh token:", error);
    return res.status(500).json({ message: "Unable to refresh session." });
  }
}

async function sessions(req, res) {
  const rows = await UserSession.listUserSessions(req.user.id);
  return res.json({ sessions: rows });
}

async function revokeSession(req, res) {
  await UserSession.revokeSession(req.params.id, req.user.id);
  return res.json({ message: "Session revoked." });
}

async function logout(req, res) {
  await UserSession.revokeByRefreshToken(req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body.refreshToken);
  clearAuthCookies(res);
  return res.json({ message: "Logged out." });
}

module.exports = {
  disableTwoFactor,
  enableTwoFactor,
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  requestOtpLogin,
  requestTwoFactorOtp,
  resetPassword,
  revokeSession,
  sessions,
  verifyOtpLogin,
  verifyOtp,
};
