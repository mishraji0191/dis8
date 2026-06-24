const { body, param, validationResult } = require("express-validator");
const xss = require("xss");

function cleanString(value) {
  return typeof value === "string" ? xss(value.trim()) : value;
}

function validateRequest(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Invalid request data.",
      errors: errors.array().map((error) => ({
        field: error.path,
        message: error.msg,
      })),
    });
  }

  return next();
}

const emailRule = () =>
  body("email")
    .trim()
    .isEmail()
    .withMessage("A valid email is required.")
    .normalizeEmail();

const passwordRule = () =>
  body("password")
    .isString()
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters.");

const registerRules = [
  body("name")
    .customSanitizer(cleanString)
    .isLength({ min: 2, max: 120 })
    .withMessage("Name must be between 2 and 120 characters."),
  emailRule(),
  passwordRule(),
  body("phone").optional({ checkFalsy: true }).customSanitizer(cleanString).isLength({ max: 30 }),
];

const loginRules = [emailRule(), passwordRule()];

const otpRules = [
  emailRule(),
  body("otp").trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage("A valid OTP is required."),
  body("purpose")
    .optional({ checkFalsy: true })
    .isIn(["email_verification", "two_factor"])
    .withMessage("Invalid OTP purpose."),
];

const twoFactorOtpRules = [
  body("otp").trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage("A valid OTP is required."),
];

const forgotPasswordRules = [emailRule()];

const resetPasswordRules = [
  body("token").trim().isLength({ min: 32 }).withMessage("A valid reset token is required."),
  passwordRule(),
];

const checkoutRules = [
  body("customerName").customSanitizer(cleanString).isLength({ min: 2, max: 120 }),
  body("customerEmail").trim().isEmail().normalizeEmail(),
  body("customerPhone").customSanitizer(cleanString).isLength({ min: 7, max: 30 }),
  body("totalAmount").isFloat({ min: 0 }),
  body("items").isArray({ min: 1 }).withMessage("At least one order item is required."),
  body("items.*.productId").isInt({ min: 1 }),
  body("items.*.productName").customSanitizer(cleanString).isLength({ min: 1, max: 255 }),
  body("items.*.quantity").isInt({ min: 1, max: 100 }),
  body("items.*.price").isFloat({ min: 0 }),
];

const idParamRule = [param("id").isInt({ min: 1 }).withMessage("A valid id is required.")];

module.exports = {
  checkoutRules,
  forgotPasswordRules,
  idParamRule,
  loginRules,
  otpRules,
  registerRules,
  resetPasswordRules,
  twoFactorOtpRules,
  validateRequest,
};
