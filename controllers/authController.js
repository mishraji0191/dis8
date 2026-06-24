const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const SecurityToken = require("../models/securityTokenModel");
const LoginAttempt = require("../models/loginAttemptModel");
const Notification = require("../services/notificationService");
const {
  ACCESS_TOKEN_COOKIE,
  generateNumericCode,
  generateSecureToken,
  getCookieOptions,
  logSecurityEvent,
} = require("../utils/security");

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const OTP_EXPIRY_MINUTES = 10;
const RESET_EXPIRY_MINUTES = 30;

function createUserToken(user) {
  return jwt.sign(User.toPublicUser(user), process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}

function setAuthCookie(res, token) {
  res.cookie(ACCESS_TOKEN_COOKIE, token, getCookieOptions(TOKEN_MAX_AGE_MS));
}

async function sendOtp(user, purpose) {
  const otp = generateNumericCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await SecurityToken.clearPurpose(user.id, purpose);
  await SecurityToken.createToken({ userId: user.id, purpose, token: otp, expiresAt });
  await Notification.sendOtpEmail({ user, otp, purpose });

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

    const token = createUserToken(user);
    setAuthCookie(res, token);

    return res.status(201).json({
      token,
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
  const { email, password } = req.body;

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

    const token = createUserToken(user);
    setAuthCookie(res, token);
    await LoginAttempt.recordLoginAttempt(req, { email, success: true, reason: "password" });

    return res.json({ token, user: User.toPublicUser(user) });
  } catch (error) {
    console.error("Unable to login user:", error);
    return res.status(500).json({ message: "Unable to login user." });
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
    const token = createUserToken(updatedUser);
    setAuthCookie(res, token);

    return res.json({ token, user: User.toPublicUser(updatedUser), verified: true });
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

function logout(req, res) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, getCookieOptions(0));
  return res.json({ message: "Logged out." });
}

module.exports = {
  disableTwoFactor,
  enableTwoFactor,
  forgotPassword,
  login,
  logout,
  me,
  register,
  requestTwoFactorOtp,
  resetPassword,
  verifyOtp,
};
