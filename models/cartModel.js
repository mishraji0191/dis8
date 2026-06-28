const pool = require("../config/db");

function normalizeItems(items = []) {
  return items
    .filter((item) => item && Number(item.productId || item.id) > 0 && Number(item.quantity) > 0)
    .map((item) => ({
      productId: Number(item.productId || item.id),
      quantity: Math.min(Number(item.quantity), 100),
    }));
}

async function getCart(userId) {
  const result = await pool.query(
    `SELECT ci.product_id AS "productId",
            ci.quantity,
            p.name,
            p.price,
            p.category,
            p.image_url AS "imageUrl",
            p.images
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     WHERE ci.user_id = $1
     ORDER BY ci.updated_at DESC`,
    [userId]
  );

  return result.rows;
}

async function upsertItem(userId, productId, quantity) {
  const result = await pool.query(
    `INSERT INTO cart_items (user_id, product_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP
     RETURNING user_id`,
    [userId, productId, quantity]
  );

  return result.rows[0];
}

async function removeItem(userId, productId) {
  await pool.query("DELETE FROM cart_items WHERE user_id = $1 AND product_id = $2", [
    userId,
    productId,
  ]);
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
      await client.query(
        `INSERT INTO cart_items (user_id, product_id, quantity)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, product_id)
         DO UPDATE SET quantity = EXCLUDED.quantity, updated_at = CURRENT_TIMESTAMP`,
        [userId, item.productId, item.quantity]
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
