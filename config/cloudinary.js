const cloudinary = require("cloudinary").v2;

const requiredEnvironment = [
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

const missingEnvironment = requiredEnvironment.filter(
  (key) => !process.env[key] || !String(process.env[key]).trim()
);

if (missingEnvironment.length > 0) {
  throw new Error(
    `Cloudinary configuration is missing: ${missingEnvironment.join(", ")}. ` +
      "Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET."
  );
}

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

module.exports = cloudinary;
