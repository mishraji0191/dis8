const express = require("express");
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");
const { authLimiter } = require("../middleware/security");
const {
  customerLoginRules,
  forgotPasswordRules,
  registerRules,
  resetPasswordRules,
  validateRequest,
} = require("../middleware/validators");

const router = express.Router();

router.post("/register", authLimiter, registerRules, validateRequest, authController.register);
router.post("/login", authLimiter, customerLoginRules, validateRequest, authController.login);
router.post("/forgot-password", authLimiter, forgotPasswordRules, validateRequest, authController.forgotPassword);
router.post("/reset-password", authLimiter, resetPasswordRules, validateRequest, authController.resetPassword);
router.post("/refresh", authLimiter, authController.refresh);
router.post("/logout", authController.logout);
router.get("/profile", auth, authController.profile);
router.get("/me", auth, authController.profile);
router.get("/sessions", auth, authController.sessions);
router.delete("/sessions/:id", auth, authController.revokeSession);

module.exports = router;
