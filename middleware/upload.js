const fs = require("fs");
const path = require("path");
const multer = require("multer");

const productsDirectory = path.join(__dirname, "..", "uploads", "products");
const settingsDirectory = path.join(__dirname, "..", "uploads", "settings");
const paymentsDirectory = path.join(__dirname, "..", "uploads", "payments");

for (const directory of [productsDirectory, settingsDirectory, paymentsDirectory]) {
  fs.mkdirSync(directory, { recursive: true });
}

function createStorage(uploadDirectory) {
  return multer.diskStorage({
    destination: uploadDirectory,
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
      cb(null, safeName);
    },
  });
}

const productStorage = multer.diskStorage({
  destination: productsDirectory,
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    cb(null, safeName);
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
    return;
  }

  cb(new Error("Only image files are allowed."));
};

const uploadProductImage = multer({
  storage: productStorage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uploadSettingsImage = multer({
  storage: createStorage(settingsDirectory),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

const uploadPaymentScreenshot = multer({
  storage: createStorage(paymentsDirectory),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = {
  uploadPaymentScreenshot,
  uploadProductImage,
  uploadSettingsImage,
};
