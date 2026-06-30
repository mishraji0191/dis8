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

const loginRules = [emailRule(), passwordRule()];

const removedCustomerAuthRules = [
  body().custom(() => {
    throw new Error("This authentication method is no longer available. Use mobile OTP login.");
  }),
];

const indianMobileRule = () =>
  body("phone")
    .customSanitizer(cleanString)
    .custom((value) => {
      const digits = String(value || "").replace(/\D/g, "");

      if (!/^(91)?[6-9]\d{9}$/.test(digits)) {
        throw new Error("Enter a valid 10-digit Indian mobile number.");
      }

      return true;
    });

const otpLoginRequestRules = [indianMobileRule()];

const otpLoginVerifyRules = [
  indianMobileRule(),
  body("otp")
    .trim()
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage("Enter the 6-digit OTP."),
  body("rememberDevice").optional().isBoolean(),
];

const otpRules = [
  body().custom(() => {
    throw new Error("Email OTP is no longer available. Use mobile OTP login.");
  }),
];

const registerRules = removedCustomerAuthRules;
const forgotPasswordRules = removedCustomerAuthRules;
const resetPasswordRules = removedCustomerAuthRules;
const customerLoginRules = removedCustomerAuthRules;

const twoFactorOtpRules = [
  body("otp").trim().isLength({ min: 6, max: 6 }).isNumeric().withMessage("A valid OTP is required."),
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
  customerLoginRules,
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
