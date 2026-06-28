const express = require("express");
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");
const { authLimiter } = require("../middleware/security");
const {
  forgotPasswordRules,
  loginRules,
  otpLoginRequestRules,
  otpLoginVerifyRules,
  otpRules,
  registerRules,
  resetPasswordRules,
  twoFactorOtpRules,
  validateRequest,
} = require("../middleware/validators");

const router = express.Router();

router.post("/register", authLimiter, registerRules, validateRequest, authController.register);
router.post("/login", authLimiter, loginRules, validateRequest, authController.login);
router.post("/otp/request", authLimiter, otpLoginRequestRules, validateRequest, authController.requestOtpLogin);
router.post("/otp/verify", authLimiter, otpLoginVerifyRules, validateRequest, authController.verifyOtpLogin);
router.post("/verify-otp", authLimiter, otpRules, validateRequest, authController.verifyOtp);
router.post("/refresh", authLimiter, authController.refresh);
router.post("/forgot-password", authLimiter, forgotPasswordRules, validateRequest, authController.forgotPassword);
router.post("/reset-password", authLimiter, resetPasswordRules, validateRequest, authController.resetPassword);
router.post("/2fa/request", auth, authLimiter, authController.requestTwoFactorOtp);
router.post("/2fa/enable", auth, authLimiter, twoFactorOtpRules, validateRequest, authController.enableTwoFactor);
router.post("/2fa/disable", auth, authLimiter, authController.disableTwoFactor);
router.get("/me", auth, authController.me);
router.get("/sessions", auth, authController.sessions);
router.delete("/sessions/:id", auth, authController.revokeSession);
router.post("/logout", authController.logout);

module.exports = router;
