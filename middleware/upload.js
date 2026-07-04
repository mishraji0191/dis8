const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const allowedImageFormats = [
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "webp",
];

const imageMimeTypes = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

function createCloudinaryStorage(folder) {
  return new CloudinaryStorage({
    cloudinary,
    params: async (req, file) => {
      return {
        folder,
        resource_type: "image",
        allowed_formats: allowedImageFormats,
      };
    },
  });
}

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/") && imageMimeTypes.has(file.mimetype)) {
    cb(null, true);
    return;
  }

  cb(new Error("Only image files are allowed."));
};

function handleUploadError(error, req, res, next) {
  if (!error) {
    next();
    return;
  }

  console.error("Cloudinary upload failed:", {
    message: error.message,
    code: error.code,
    field: error.field,
  });

  const status = error instanceof multer.MulterError ? 400 : 500;
  return res.status(status).json({
    message: error.message || "Cloudinary upload failed.",
  });
}

function withUploadErrorHandling(upload) {
  return {
    single(fieldName) {
      const middleware = upload.single(fieldName);
      return (req, res, next) => middleware(req, res, (error) => {
        handleUploadError(error, req, res, next);
      });
    },
    array(fieldName, maxCount) {
      const middleware = upload.array(fieldName, maxCount);
      return (req, res, next) => middleware(req, res, (error) => {
        handleUploadError(error, req, res, next);
      });
    },
    fields(fields) {
      const middleware = upload.fields(fields);
      return (req, res, next) => middleware(req, res, (error) => {
        handleUploadError(error, req, res, next);
      });
    },
    any() {
      const middleware = upload.any();
      return (req, res, next) => middleware(req, res, (error) => {
        handleUploadError(error, req, res, next);
      });
    },
    none() {
      const middleware = upload.none();
      return (req, res, next) => middleware(req, res, (error) => {
        handleUploadError(error, req, res, next);
      });
    },
  };
}

function createUpload(folder, fileSize) {
  return withUploadErrorHandling(
    multer({
      storage: createCloudinaryStorage(folder),
      fileFilter,
      limits: {
        fileSize,
      },
    })
  );
}

const uploadProductImage = createUpload("DIS8/products", 5 * 1024 * 1024);
const uploadHeroSliderImage = createUpload("DIS8/hero-slider", 10 * 1024 * 1024);
const uploadCategoryImage = createUpload("DIS8/categories", 5 * 1024 * 1024);
const uploadSettingsImage = createUpload("DIS8/settings", 5 * 1024 * 1024);
const uploadPaymentScreenshot = createUpload("DIS8/payments", 5 * 1024 * 1024);

module.exports = {
  uploadCategoryImage,
  uploadHeroSliderImage,
  uploadPaymentScreenshot,
  uploadProductImage,
  uploadSettingsImage,
};
