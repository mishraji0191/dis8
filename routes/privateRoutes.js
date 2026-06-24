const express = require("express");
const privateController = require("../controllers/privateController");
const auth = require("../middleware/auth");
const { uploadPaymentScreenshot } = require("../middleware/upload");
const { checkoutRules, validateRequest } = require("../middleware/validators");

const router = express.Router();

router.get("/profile", auth, privateController.getProfile);
router.get("/cart", auth, privateController.getCart);
router.post(
  "/checkout",
  auth,
  uploadPaymentScreenshot.single("paymentScreenshot"),
  privateController.normalizeCheckoutBody,
  checkoutRules,
  validateRequest,
  privateController.checkout
);

module.exports = router;
