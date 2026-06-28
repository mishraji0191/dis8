const Order = require("../models/orderModel");

const VALID_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
]);

function normalizeOrderStatus(status) {
  return typeof status === "string" ? status.trim().toLowerCase() : "";
}

async function listOrders(req, res) {
  try {
    const orders = await Order.listOrders();

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
  try {
    const order = await Order.getOrderById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    return res.json({
      success: true,
      order,
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
      message:
        "Status must be one of: pending, confirmed, packed, shipped, delivered, cancelled.",
    });
  }

  try {
    const order = await Order.updateOrderStatus(id, status);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    return res.json({
      success: true,
      message: "Order status updated.",
      order,
    });
  } catch (error) {
    console.error("Unable to update order status:", error);
    return res.status(500).json({ message: "Unable to update order status." });
  }
}

async function deleteOrder(req, res) {
  try {
    const deleted = await Order.deleteOrder(req.params.id);

    if (!deleted) {
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

async function listPayments(req, res) {
  try {
    const payments = await Order.listPayments();

    return res.json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    console.error("Unable to list payments:", error);
    return res.status(500).json({ message: "Unable to list payments." });
  }
}

module.exports = {
  deleteOrder,
  getOrderById,
  listOrders,
  listPayments,
  updateOrderStatus,
};
