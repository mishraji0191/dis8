const express = require("express");
const { body } = require("express-validator");
const paymentController = require("../controllers/paymentController");
const auth = require("../middleware/auth");
const {
  paymentOrderRules,
  paymentVerifyRules,
  validateRequest,
} = require("../middleware/validators");

const router = express.Router();

router.post("/create-order", auth, paymentOrderRules, validateRequest, paymentController.createPaymentOrder);
router.post("/verify", auth, paymentVerifyRules, validateRequest, paymentController.verifyPayment);
router.post(
  "/refunds",
  auth,
  [
    body("paymentId").trim().isLength({ min: 10, max: 120 }),
    body("amount").optional({ checkFalsy: true }).isFloat({ min: 1 }),
    body("reason").optional({ checkFalsy: true }).trim().isLength({ max: 255 }),
  ],
  validateRequest,
  paymentController.refundPayment
);

module.exports = router;
