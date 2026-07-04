const pool = require("../config/db");

function normalizeSize(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeItems(items = []) {
  return items
    .filter((item) => item && Number(item.productId || item.id) > 0 && Number(item.quantity) > 0)
    .map((item) => ({
      productId: Number(item.productId || item.id),
      selectedSize: normalizeSize(item.selectedSize || item.size),
      quantity: Math.min(Number(item.quantity), 100),
    }));
}

async function getProductPricing(productId, selectedSize = "") {
  const result = await pool.query(
    `SELECT p.id, p.price, p.stock,
            ps.size,
            ps.stock AS size_stock,
            ps.price_adjustment
     FROM products p
     LEFT JOIN product_sizes ps
       ON ps.product_id = p.id AND ps.size = $2
     WHERE p.id = $1`,
    [productId, normalizeSize(selectedSize)]
  );

  const row = result.rows[0];

  if (!row) {
    const error = new Error("Product does not exist.");
    error.status = 400;
    throw error;
  }

  const sizesResult = await pool.query("SELECT COUNT(*)::int AS count FROM product_sizes WHERE product_id = $1", [
    productId,
  ]);
  const hasSizes = sizesResult.rows[0].count > 0;

  if (hasSizes && !row.size) {
    const error = new Error("Select a valid size for this product.");
    error.status = 400;
    throw error;
  }

  const availableStock = hasSizes ? Number(row.size_stock) || 0 : Number(row.stock) || 0;
  const priceAdjustment = hasSizes ? Number(row.price_adjustment) || 0 : 0;
  const unitPrice = Number(row.price) + priceAdjustment;

  return {
    availableStock,
    priceAdjustment,
    unitPrice,
    selectedSize: hasSizes ? row.size : "",
  };
}

async function getCart(userId) {
  const result = await pool.query(
    `SELECT ci.product_id AS "productId",
            ci.selected_size AS "selectedSize",
            ci.quantity,
            COALESCE(ci.unit_price, p.price + COALESCE(ps.price_adjustment, 0)) AS price,
            COALESCE(ci.price_adjustment, ps.price_adjustment, 0) AS "priceAdjustment",
            p.name,
            p.category,
            p.image_url AS "imageUrl",
            p.images,
            COALESCE(ps.stock, p.stock) AS stock
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     LEFT JOIN product_sizes ps ON ps.product_id = p.id AND ps.size = ci.selected_size
     WHERE ci.user_id = $1
     ORDER BY ci.updated_at DESC`,
    [userId]
  );

  return result.rows;
}

async function upsertItem(userId, productId, quantity, selectedSize = "") {
  const pricing = await getProductPricing(productId, selectedSize);

  if (quantity > pricing.availableStock) {
    const error = new Error("Requested quantity exceeds available stock.");
    error.status = 400;
    throw error;
  }

  const result = await pool.query(
    `INSERT INTO cart_items
       (user_id, product_id, selected_size, quantity, unit_price, price_adjustment)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, product_id, selected_size)
     DO UPDATE SET quantity = EXCLUDED.quantity,
                   unit_price = EXCLUDED.unit_price,
                   price_adjustment = EXCLUDED.price_adjustment,
                   updated_at = CURRENT_TIMESTAMP
     RETURNING user_id`,
    [
      userId,
      productId,
      pricing.selectedSize,
      quantity,
      pricing.unitPrice,
      pricing.priceAdjustment,
    ]
  );

  return result.rows[0];
}

async function removeItem(userId, productId, selectedSize = "") {
  await pool.query(
    "DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2 AND selected_size = $3",
    [userId, productId, normalizeSize(selectedSize)]
  );
}

async function clearCart(userId) {
  await pool.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);
}

async function syncCart(userId, items) {
  const normalizedItems = normalizeItems(items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM cart_items WHERE user_id = $1", [userId]);

    for (const item of normalizedItems) {
      const pricing = await getProductPricing(item.productId, item.selectedSize);

      if (item.quantity > pricing.availableStock) {
        const error = new Error(`Requested quantity exceeds available stock for product ${item.productId}.`);
        error.status = 400;
        throw error;
      }

      await client.query(
        `INSERT INTO cart_items
           (user_id, product_id, selected_size, quantity, unit_price, price_adjustment)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, product_id, selected_size)
         DO UPDATE SET quantity = EXCLUDED.quantity,
                       unit_price = EXCLUDED.unit_price,
                       price_adjustment = EXCLUDED.price_adjustment,
                       updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          item.productId,
          pricing.selectedSize,
          item.quantity,
          pricing.unitPrice,
          pricing.priceAdjustment,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getCart(userId);
}

module.exports = {
  clearCart,
  getCart,
  removeItem,
  syncCart,
  upsertItem,
};
