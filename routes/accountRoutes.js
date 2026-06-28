const express = require("express");
const { body } = require("express-validator");
const auth = require("../middleware/auth");
const accountController = require("../controllers/accountController");
const { idParamRule, validateRequest } = require("../middleware/validators");

const router = express.Router();

router.use(auth);
router.get("/", accountController.getAccount);
router.post(
  "/addresses",
  [
    body("recipientName").trim().isLength({ min: 2, max: 120 }),
    body("phone").trim().isLength({ min: 7, max: 30 }),
    body("addressLine1").trim().isLength({ min: 8, max: 255 }),
    body("city").trim().isLength({ min: 2, max: 120 }),
    body("state").trim().isLength({ min: 2, max: 120 }),
    body("pincode").trim().isPostalCode("IN"),
  ],
  validateRequest,
  accountController.createAddress
);
router.post(
  "/wishlist",
  [body("productId").isInt({ min: 1 })],
  validateRequest,
  accountController.addWishlistItem
);
router.delete("/wishlist/:id", idParamRule, validateRequest, accountController.removeWishlistItem);

module.exports = router;
