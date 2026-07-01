const express = require("express");
const router = express.Router();
const pool = require("../config/db");

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.id, p.name, p.description, p.price, p.category,
              p.category_id, category.name AS category_name, category.slug AS category_slug,
              p.subcategory_id, subcategory.name AS subcategory_name,
              subcategory.slug AS subcategory_slug,
              p.image_url, COALESCE(p.images, ARRAY[]::text[]) AS images,
              p.stock, p.created_at
       FROM products p
       LEFT JOIN categories category ON category.id = p.category_id
       LEFT JOIN categories subcategory ON subcategory.id = p.subcategory_id
       WHERE COALESCE(category.is_active, true) = true
         AND COALESCE(subcategory.is_active, true) = true
       ORDER BY p.id DESC`
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
