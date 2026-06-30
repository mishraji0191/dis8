const express = require("express");
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");
const { authLimiter } = require("../middleware/security");
const {
  otpLoginRequestRules,
  otpLoginVerifyRules,
  twoFactorOtpRules,
  validateRequest,
} = require("../middleware/validators");

const router = express.Router();

router.post("/register", authLimiter, (req, res) =>
  res.status(404).json({ message: "Registration is no longer available. Use mobile OTP login." })
);
router.post("/login", authLimiter, (req, res) =>
  res.status(404).json({ message: "Email login is no longer available. Use mobile OTP login." })
);
router.post("/otp/request", authLimiter, otpLoginRequestRules, validateRequest, authController.requestOtpLogin);
router.post("/otp/verify", authLimiter, otpLoginVerifyRules, validateRequest, authController.verifyOtpLogin);
router.post("/verify-otp", authLimiter, (req, res) =>
  res.status(404).json({ message: "Email OTP is no longer available. Use mobile OTP login." })
);
router.post("/refresh", authLimiter, authController.refresh);
router.post("/forgot-password", authLimiter, (req, res) =>
  res.status(404).json({ message: "Password recovery is no longer available. Use mobile OTP login." })
);
router.post("/reset-password", authLimiter, (req, res) =>
  res.status(404).json({ message: "Password reset is no longer available. Use mobile OTP login." })
);
router.post("/2fa/request", auth, authLimiter, authController.requestTwoFactorOtp);
router.post("/2fa/enable", auth, authLimiter, twoFactorOtpRules, validateRequest, authController.enableTwoFactor);
router.post("/2fa/disable", auth, authLimiter, authController.disableTwoFactor);
router.get("/me", auth, authController.me);
router.get("/sessions", auth, authController.sessions);
router.delete("/sessions/:id", auth, authController.revokeSession);
router.post("/logout", authController.logout);

module.exports = router;
