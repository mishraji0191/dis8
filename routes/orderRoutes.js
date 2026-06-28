const express = require("express");
const orderController = require("../controllers/orderController");
const auth = require("../middleware/auth");
const { checkoutRules, idParamRule, validateRequest } = require("../middleware/validators");

const router = express.Router();

router.get("/", auth, orderController.listOrders);
router.get("/:id", auth, idParamRule, validateRequest, orderController.getOrderById);
router.post("/", auth, checkoutRules, validateRequest, orderController.createOrder);

module.exports = router;
