const pool = require("../config/db");
const Order = require("../models/orderModel");
const Shiprocket = require("../services/shiprocketService");

async function createShipment(req, res) {
  try {
    const order = await Order.getOrderById(req.body.orderId);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    const response = await Shiprocket.createShipment({ order, items: order.items });
    const shipment = response.shipment_id ? response : response.data || response;

    await pool.query(
      `INSERT INTO shipments
        (order_id, provider_order_id, shipment_id, awb_code, courier_name, tracking_url, label_url, invoice_url, status, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9, 'created'), $10)
       ON CONFLICT DO NOTHING`,
      [
        order.id,
        String(response.order_id || order.orderNumber || order.id),
        String(shipment.shipment_id || ""),
        shipment.awb_code || shipment.awb || null,
        shipment.courier_name || null,
        shipment.tracking_url || null,
        shipment.label_url || null,
        shipment.invoice_url || null,
        shipment.status || "created",
        response,
      ]
    );

    await Order.updateOrderStatus(order.id, "packed");
    return res.status(201).json({ shipment: response });
  } catch (error) {
    console.error("Unable to create Shiprocket shipment:", error);
    return res.status(500).json({ message: "Unable to create shipment." });
  }
}

async function trackShipment(req, res) {
  try {
    const result = await Shiprocket.trackAwb(req.params.awb);
    return res.json({ tracking: result });
  } catch (error) {
    console.error("Unable to track shipment:", error);
    return res.status(500).json({ message: "Unable to track shipment." });
  }
}

module.exports = {
  createShipment,
  trackShipment,
};
