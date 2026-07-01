const express = require("express");
const heroSliderController = require("../controllers/heroSliderController");

const router = express.Router();

router.get("/", heroSliderController.listActiveHeroSliders);

module.exports = router;
