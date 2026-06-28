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

const otpLoginRequestRules = [
  body("email").optional({ checkFalsy: true }).trim().isEmail().normalizeEmail(),
  body("phone")
    .optional({ checkFalsy: true })
    .customSanitizer(cleanString)
    .isLength({ min: 7, max: 16 })
    .withMessage("A valid phone number is required."),
  body("name").optional({ checkFalsy: true }).customSanitizer(cleanString).isLength({ max: 120 }),
  body("channel").optional({ checkFalsy: true }).isIn(["email", "sms"]),
  body().custom((value) => {
    if (!value.email && !value.phone) {
      throw new Error("Email or phone is required.");
    }
    return true;
  }),
];

const otpLoginVerifyRules = [
  body("email").optional({ checkFalsy: true }).trim().isEmail().normalizeEmail(),
  body("phone").optional({ checkFalsy: true }).customSanitizer(cleanString).isLength({ min: 7, max: 16 }),
  body("otp").trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage("A valid OTP is required."),
  body("rememberDevice").optional().isBoolean(),
  body().custom((value) => {
    if (!value.email && !value.phone) {
      throw new Error("Email or phone is required.");
    }
    return true;
  }),
];

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
  body("address").customSanitizer(cleanString).isLength({ min: 8, max: 500 }),
  body("landmark").optional({ checkFalsy: true }).customSanitizer(cleanString).isLength({ max: 255 }),
  body("city").customSanitizer(cleanString).isLength({ min: 2, max: 120 }),
  body("state").customSanitizer(cleanString).isLength({ min: 2, max: 120 }),
  body("pincode").customSanitizer(cleanString).isPostalCode("IN"),
  body("totalAmount").isFloat({ min: 0 }),
  body("items").isArray({ min: 1 }).withMessage("At least one order item is required."),
  body("items.*.productId").isInt({ min: 1 }),
  body("items.*.productName").customSanitizer(cleanString).isLength({ min: 1, max: 255 }),
  body("items.*.quantity").isInt({ min: 1, max: 100 }),
  body("items.*.price").isFloat({ min: 0 }),
];

const paymentOrderRules = [
  body("customer.name").customSanitizer(cleanString).isLength({ min: 2, max: 120 }),
  body("customer.email").trim().isEmail().normalizeEmail(),
  body("customer.phone").customSanitizer(cleanString).isLength({ min: 7, max: 30 }),
  body("customer.address").customSanitizer(cleanString).isLength({ min: 8, max: 500 }),
  body("customer.landmark").optional({ checkFalsy: true }).customSanitizer(cleanString).isLength({ max: 255 }),
  body("customer.city").customSanitizer(cleanString).isLength({ min: 2, max: 120 }),
  body("customer.state").customSanitizer(cleanString).isLength({ min: 2, max: 120 }),
  body("customer.pincode").customSanitizer(cleanString).isPostalCode("IN"),
  body("items").isArray({ min: 1 }).withMessage("At least one order item is required."),
  body("items.*.productId").isInt({ min: 1 }),
  body("items.*.quantity").isInt({ min: 1, max: 100 }),
];

const paymentVerifyRules = [
  ...paymentOrderRules,
  body("razorpayOrderId").trim().isLength({ min: 10, max: 120 }),
  body("razorpayPaymentId").trim().isLength({ min: 10, max: 120 }),
  body("razorpaySignature").trim().isLength({ min: 20, max: 255 }),
  body("paymentMethod").optional({ checkFalsy: true }).customSanitizer(cleanString).isLength({ max: 60 }),
];

const idParamRule = [param("id").isInt({ min: 1 }).withMessage("A valid id is required.")];

const cartSyncRules = [
  body("items").isArray().withMessage("Cart items must be an array."),
  body("items.*.productId").optional().isInt({ min: 1 }),
  body("items.*.id").optional().isInt({ min: 1 }),
  body("items.*.quantity").isInt({ min: 1, max: 100 }),
];

const cartItemRules = [
  body("productId").isInt({ min: 1 }),
  body("quantity").isInt({ min: 1, max: 100 }),
];

module.exports = {
  checkoutRules,
  forgotPasswordRules,
  idParamRule,
  loginRules,
  cartItemRules,
  cartSyncRules,
  otpRules,
  otpLoginRequestRules,
  otpLoginVerifyRules,
  paymentOrderRules,
  paymentVerifyRules,
  registerRules,
  resetPasswordRules,
  twoFactorOtpRules,
  validateRequest,
};
