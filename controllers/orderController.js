const Order = require("../models/orderModel");
const { calculateOrderTotals } = require("../utils/orderTotals");

async function listOrders(req, res) {
  try {
    const orders = await Order.listOrders({ userId: req.user.id });
    return res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    console.error("Unable to list customer orders:", error);
    return res.status(500).json({ message: "Unable to list orders." });
  }
}

async function getOrderById(req, res) {
  try {
    const order = await Order.getOrderById(req.params.id, { userId: req.user.id });

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    return res.json({ success: true, order });
  } catch (error) {
    console.error("Unable to load customer order:", error);
    return res.status(500).json({ message: "Unable to load order." });
  }
}

async function createOrder(req, res) {
  try {
    const totals = calculateOrderTotals(req.body.items);
    const order = await Order.createOrderWithItems({
      userId: req.user.id,
      customer: {
        name: req.body.customerName,
        email: req.body.customerEmail,
        phone: req.body.customerPhone,
        address: req.body.address,
        landmark: req.body.landmark || "",
        city: req.body.city,
        state: req.body.state,
        pincode: req.body.pincode,
      },
      items: req.body.items,
      totalAmount: totals.total,
      paymentStatus: "pending",
      paymentMethod: "razorpay",
      razorpayOrderId: null,
      razorpayPaymentId: null,
      status: "pending",
    });

    return res.status(201).json({ message: "Order created.", order, totals });
  } catch (error) {
    console.error("Unable to create order:", error);
    return res.status(500).json({ message: "Unable to create order." });
  }
}

module.exports = {
  createOrder,
  getOrderById,
  listOrders,
};
