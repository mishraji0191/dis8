require("dotenv").config();

const express = require("express");
const path = require("path");
const pool = require("./config/db");
const adminRoutes = require("./routes/adminRoutes");
const authRoutes = require("./routes/authRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const privateRoutes = require("./routes/privateRoutes");
const productRoutes = require("./routes/productRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const cartRoutes = require("./routes/cartRoutes");
const accountRoutes = require("./routes/accountRoutes");
const shippingRoutes = require("./routes/shippingRoutes");
const heroSliderRoutes = require("./routes/heroSliderRoutes");
const {
  applySecurityMiddleware,
  cookieCsrfGuard,
  issueCsrfToken,
  securityErrorHandler,
} = require("./middleware/security");
const paymentController = require("./controllers/paymentController");

const app = express();

applySecurityMiddleware(app);
app.post(
  "/api/payment/webhook/razorpay",
  express.raw({ type: "application/json", limit: "100kb" }),
  paymentController.handleRazorpayWebhook
);
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/api/security/csrf-token", issueCsrfToken);
app.use(cookieCsrfGuard);

app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/hero-slider", heroSliderRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/account", accountRoutes);
app.use("/api/shipping", shippingRoutes);
app.use("/api", privateRoutes);
app.use("/api/admin", adminRoutes);

app.get("/", (req, res) => {
  res.send("SportX Backend Running");
});

app.get("/test-db", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json(result.rows);
  } catch (error) {
    console.error("Database health check failed:", error);
    res.status(500).json({ message: "Database health check failed." });
  }
});

app.use(securityErrorHandler);
app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);
  const message =
    process.env.NODE_ENV === "production"
      ? "Something went wrong."
      : error.message || "Something went wrong.";

  return res.status(error.status || 500).json({ message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
