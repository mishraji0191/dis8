const express = require("express");

const { loginAdmin, getAdminProfile, logoutAdmin } = require("../controllers/adminAuthController");
const companySettingsController = require("../controllers/adminCompanySettingsController");
const categoryController = require("../controllers/categoryController");
const heroSliderController = require("../controllers/heroSliderController");
const productController = require("../controllers/adminProductController");
const orderController = require("../controllers/adminOrderController");
const userController = require("../controllers/adminUserController");
const adminAuth = require("../middleware/adminAuth");
const { authLimiter } = require("../middleware/security");
const {
  uploadCategoryImage,
  uploadHeroSliderImage,
  uploadProductImage,
  uploadSettingsImage,
} = require("../middleware/upload");
const { idParamRule, loginRules, validateRequest } = require("../middleware/validators");

const router = express.Router();

router.post("/login", authLimiter, loginRules, validateRequest, loginAdmin);
router.post("/logout", logoutAdmin);
router.get("/me", adminAuth, getAdminProfile);

router.get("/hero-slider", adminAuth, heroSliderController.listAdminHeroSliders);
router.post(
  "/hero-slider",
  adminAuth,
  uploadHeroSliderImage.single("image"),
  heroSliderController.createHeroSlider
);
router.put(
  "/hero-slider/:id",
  adminAuth,
  uploadHeroSliderImage.single("image"),
  heroSliderController.updateHeroSlider
);
router.delete("/hero-slider/:id", adminAuth, heroSliderController.deleteHeroSlider);
router.patch(
  "/hero-slider/:id/status",
  adminAuth,
  heroSliderController.updateHeroSliderStatus
);
router.patch("/hero-slider/reorder", adminAuth, heroSliderController.reorderHeroSliders);

router.get("/categories", adminAuth, categoryController.listAdminCategories);
router.post(
  "/categories",
  adminAuth,
  uploadCategoryImage.single("image"),
  categoryController.createCategory
);
router.put(
  "/categories/:id",
  adminAuth,
  uploadCategoryImage.single("image"),
  categoryController.updateCategory
);
router.delete("/categories/:id", adminAuth, categoryController.deleteCategory);

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
    { name: "customizationSectionImages", maxCount: 10 },
  ]),
  productController.createProduct
);
router.put(
  "/products/:id",
  adminAuth,
  uploadProductImage.fields([
    { name: "images", maxCount: 10 },
    { name: "image", maxCount: 1 },
    { name: "customizationSectionImages", maxCount: 10 },
  ]),
  productController.updateProduct
);
router.delete("/products/:id", adminAuth, productController.deleteProduct);

router.get("/users", adminAuth, userController.listUsers);

router.get("/orders", adminAuth, orderController.listOrders);
router.get("/orders/:id", adminAuth, orderController.getOrderById);
router.put("/orders/:id/status", adminAuth, idParamRule, validateRequest, orderController.updateOrderStatus);
router.delete("/orders/:id", adminAuth, idParamRule, validateRequest, orderController.deleteOrder);
router.get("/payments", adminAuth, orderController.listPayments);

module.exports = router;
