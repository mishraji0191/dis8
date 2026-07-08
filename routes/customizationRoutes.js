const express = require("express");
const customizationController = require("../controllers/customizationController");
const { uploadCustomizationFile } = require("../middleware/upload");

const router = express.Router();

router.post(
  "/upload",
  uploadCustomizationFile.array("files", 6),
  customizationController.uploadCustomizationFiles
);

module.exports = router;
