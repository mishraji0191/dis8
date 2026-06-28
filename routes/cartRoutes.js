const express = require("express");
const auth = require("../middleware/auth");
const cartController = require("../controllers/cartController");
const {
  cartItemRules,
  cartSyncRules,
  idParamRule,
  validateRequest,
} = require("../middleware/validators");

const router = express.Router();

router.use(auth);
router.get("/", cartController.getCart);
router.put("/sync", cartSyncRules, validateRequest, cartController.syncCart);
router.put("/items", cartItemRules, validateRequest, cartController.upsertItem);
router.delete("/items/:id", idParamRule, validateRequest, cartController.removeItem);
router.delete("/", cartController.clearCart);

module.exports = router;
