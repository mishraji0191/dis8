const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, price, category, image_url,
              COALESCE(images, ARRAY[]::text[]) AS images,
              stock, created_at
       FROM products
       ORDER BY id DESC`
    );

    res.json(
      result.rows.map((product) => ({
        ...product,
        imageUrl: product.images?.[0] || product.image_url,
      }))
    );
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Server Error",
    });
  }
});

module.exports = router;
