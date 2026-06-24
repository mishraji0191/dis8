const pool = require("../config/db");

async function getProfile(req, res) {
  return res.json({ user: req.user });
}

async function getCart(req, res) {
  return res.json({ userId: req.user.id, items: [] });
}

function normalizeCheckoutBody(req, res, next) {
  if (typeof req.body.items === "string") {
    try {
      req.body.items = JSON.parse(req.body.items);
    } catch {
      req.body.items = [];
    }
  }

  return next();
}

async function checkout(req, res) {
  const { customerName, customerEmail, customerPhone, totalAmount, items } = req.body;
  const paymentScreenshot = req.file
    ? `/uploads/payments/${req.file.filename}`
    : req.body.paymentScreenshot || "";
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `INSERT INTO orders (user_id, customer_name, customer_email, customer_phone, total_amount, payment_screenshot, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING id, user_id, customer_name, customer_email, customer_phone, total_amount, payment_screenshot, status, created_at`,
      [req.user.id, customerName, customerEmail, customerPhone, totalAmount, paymentScreenshot]
    );

    const order = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.productId, item.productName, item.quantity, item.price]
      );
    }

    await client.query("COMMIT");
    return res.status(201).json({ order, message: "Order created." });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Unable to create checkout order:", error);
    return res.status(500).json({ message: "Unable to create checkout order." });
  } finally {
    client.release();
  }
}

module.exports = {
  checkout,
  getCart,
  getProfile,
  normalizeCheckoutBody,
};
