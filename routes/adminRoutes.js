const express = require("express");

const { loginAdmin, getAdminProfile, logoutAdmin } = require("../controllers/adminAuthController");
const companySettingsController = require("../controllers/adminCompanySettingsController");
const productController = require("../controllers/adminProductController");
const orderController = require("../controllers/adminOrderController");
const userController = require("../controllers/adminUserController");
const adminAuth = require("../middleware/adminAuth");
const { authLimiter } = require("../middleware/security");
const { uploadProductImage, uploadSettingsImage } = require("../middleware/upload");
const { idParamRule, loginRules, validateRequest } = require("../middleware/validators");

const router = express.Router();

router.post("/login", authLimiter, loginRules, validateRequest, loginAdmin);
router.post("/logout", logoutAdmin);
router.get("/me", adminAuth, getAdminProfile);

router.get("/company-details", companySettingsController.getCompanyDetails);
router.put(
  "/company-details",
  adminAuth,
  uploadSettingsImage.fields([
    { name: "googlePayQR", maxCount: 1 },
    { name: "phonePeQR", maxCount: 1 },
    { name: "logo", maxCount: 1 },
  ]),
  companySettingsController.updateCompanyDetails
);

router.get("/products", adminAuth, productController.listProducts);
router.post(
  "/products",
  adminAuth,
  uploadProductImage.fields([
    { name: "images", maxCount: 10 },
    { name: "image", maxCount: 1 },
  ]),
  productController.createProduct
);
router.put(
  "/products/:id",
  adminAuth,
  uploadProductImage.fields([
    { name: "images", maxCount: 10 },
    { name: "image", maxCount: 1 },
  ]),
  productController.updateProduct
);
router.delete("/products/:id", adminAuth, productController.deleteProduct);

router.get("/users", adminAuth, userController.listUsers);

router.get("/orders", adminAuth, orderController.listOrders);
router.get("/orders/:id", adminAuth, orderController.getOrderById);
router.put("/orders/:id/status", adminAuth, idParamRule, validateRequest, orderController.updateOrderStatus);
router.delete("/orders/:id", adminAuth, idParamRule, validateRequest, orderController.deleteOrder);

module.exports = router;
