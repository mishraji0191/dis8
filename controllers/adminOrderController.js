const pool = require("../config/db");

const VALID_ORDER_STATUSES = new Set(["pending", "shipped", "delivered"]);

function normalizeOrderStatus(status) {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

async function getOrderItems(orderIds) {
  if (orderIds.length === 0) {
    return new Map();
  }

  const result = await pool.query(
    `SELECT oi.id,
            oi.order_id,
            oi.product_id,
            oi.product_name,
            oi.quantity,
            oi.price,
            p.image_url,
            COALESCE(p.images, ARRAY[]::text[]) AS images
     FROM order_items oi
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ANY($1::int[])
     ORDER BY oi.id ASC`,
    [orderIds]
  );

  return result.rows.reduce((itemsByOrderId, item) => {
    const items = itemsByOrderId.get(item.order_id) || [];
    items.push(item);
    itemsByOrderId.set(item.order_id, items);
    return itemsByOrderId;
  }, new Map());
}

function mapOrder(row, items = []) {
  return {
    id: row.id,
    userId: row.user_id,
    customerName: row.customer_name || row.user_name,
    customerEmail: row.customer_email || row.user_email,
    customerPhone: row.customer_phone,
    totalAmount: row.total_amount,
    paymentScreenshot: row.payment_screenshot,
    status: row.status,
    createdAt: row.created_at,
    user: row.user_id
      ? {
          id: row.user_id,
          name: row.user_name,
          email: row.user_email,
        }
      : null,
    items,
  };
}

async function listOrders(req, res) {
  try {
    const result = await pool.query(
      `SELECT o.id,
              o.user_id,
              o.customer_name,
              o.customer_email,
              o.customer_phone,
              o.total_amount,
              o.payment_screenshot,
              o.status,
              o.created_at,
              u.name AS user_name,
              u.email AS user_email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       ORDER BY o.created_at DESC, o.id DESC`
    );

    const orderIds = result.rows.map((order) => order.id);
    const itemsByOrderId = await getOrderItems(orderIds);
    const orders = result.rows.map((order) =>
      mapOrder(order, itemsByOrderId.get(order.id) || [])
    );

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Unable to list orders:", error);
    return res.status(500).json({ message: "Unable to list orders." });
  }
}

async function getOrderById(req, res) {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT o.id,
              o.user_id,
              o.customer_name,
              o.customer_email,
              o.customer_phone,
              o.total_amount,
              o.payment_screenshot,
              o.status,
              o.created_at,
              u.name AS user_name,
              u.email AS user_email
       FROM orders o
       LEFT JOIN users u ON u.id = o.user_id
       WHERE o.id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    const itemsByOrderId = await getOrderItems([Number(id)]);

    return res.json({
      success: true,
      order: mapOrder(result.rows[0], itemsByOrderId.get(Number(id)) || []),
    });
  } catch (error) {
    console.error("Unable to load order:", error);
    return res.status(500).json({ message: "Unable to load order." });
  }
}

async function updateOrderStatus(req, res) {
  const { id } = req.params;
  const status = normalizeOrderStatus(req.body.status);

  if (!VALID_ORDER_STATUSES.has(status)) {
    return res.status(400).json({
      message: "Status must be one of: pending, shipped, delivered.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2
       RETURNING id, user_id, customer_name, customer_email, customer_phone, total_amount, payment_screenshot, status, created_at`,
      [status, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    return res.json({
      success: true,
      message: "Order status updated.",
      order: mapOrder(result.rows[0]),
    });
  } catch (error) {
    console.error("Unable to update order status:", error);
    return res.status(500).json({ message: "Unable to update order status." });
  }
}

async function deleteOrder(req, res) {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "DELETE FROM orders WHERE id = $1 RETURNING id",
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found." });
    }

    return res.json({
      success: true,
      message: "Order deleted successfully.",
    });
  } catch (error) {
    console.error("Unable to delete order:", error);
    return res.status(500).json({ message: "Unable to delete order." });
  }
}

module.exports = {
  listOrders,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
};
