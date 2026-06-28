const express = require("express");
const privateController = require("../controllers/privateController");
const auth = require("../middleware/auth");

const router = express.Router();

router.get("/profile", auth, privateController.getProfile);
router.get("/cart", auth, privateController.getCart);

module.exports = router;
