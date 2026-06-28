const express = require("express");
const { body, param } = require("express-validator");
const auth = require("../middleware/auth");
const shippingController = require("../controllers/shippingController");
const { validateRequest } = require("../middleware/validators");

const router = express.Router();

router.post(
  "/shiprocket/shipments",
  auth,
  [body("orderId").isInt({ min: 1 })],
  validateRequest,
  shippingController.createShipment
);

router.get(
  "/track/:awb",
  auth,
  [param("awb").trim().isLength({ min: 4, max: 120 })],
  validateRequest,
  shippingController.trackShipment
);

module.exports = router;
