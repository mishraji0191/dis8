const express = require("express");
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");
const { authLimiter } = require("../middleware/security");
const {
  forgotPasswordRules,
  loginRules,
  otpRules,
  registerRules,
  resetPasswordRules,
  twoFactorOtpRules,
  validateRequest,
} = require("../middleware/validators");

const router = express.Router();

router.post("/register", authLimiter, registerRules, validateRequest, authController.register);
router.post("/login", authLimiter, loginRules, validateRequest, authController.login);
router.post("/verify-otp", authLimiter, otpRules, validateRequest, authController.verifyOtp);
router.post("/forgot-password", authLimiter, forgotPasswordRules, validateRequest, authController.forgotPassword);
router.post("/reset-password", authLimiter, resetPasswordRules, validateRequest, authController.resetPassword);
router.post("/2fa/request", auth, authLimiter, authController.requestTwoFactorOtp);
router.post("/2fa/enable", auth, authLimiter, twoFactorOtpRules, validateRequest, authController.enableTwoFactor);
router.post("/2fa/disable", auth, authLimiter, authController.disableTwoFactor);
router.get("/me", auth, authController.me);
router.post("/logout", authController.logout);

module.exports = router;
