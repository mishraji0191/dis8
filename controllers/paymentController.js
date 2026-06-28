const crypto = require("crypto");
const Razorpay = require("razorpay");
const pool = require("../config/db");
const Order = require("../models/orderModel");
const { calculateOrderTotals } = require("../utils/orderTotals");

function getRazorpayClient() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    const error = new Error("Razorpay credentials are not configured.");
    error.status = 500;
    throw error;
  }

  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function getCustomer(customer) {
  return {
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    landmark: customer.landmark || "",
    city: customer.city,
    state: customer.state,
    pincode: customer.pincode,
  };
}

async function getOrderItemsFromProducts(requestItems) {
  const quantitiesByProductId = new Map(
    requestItems.map((item) => [Number(item.productId), Number(item.quantity)])
  );
  const productIds = [...quantitiesByProductId.keys()];

  const result = await pool.query(
    `SELECT id, name, price
     FROM products
     WHERE id = ANY($1::int[])`,
    [productIds]
  );

  if (result.rowCount !== productIds.length) {
    const error = new Error("One or more products are unavailable.");
    error.status = 400;
    throw error;
  }

  return result.rows.map((product) => ({
    productId: product.id,
    productName: product.name,
    quantity: quantitiesByProductId.get(product.id),
    price: Number(product.price) || 0,
  }));
}

function verifyRazorpaySignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(razorpaySignature);

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function createPaymentOrder(req, res) {
  try {
    const razorpay = getRazorpayClient();
    const customer = getCustomer(req.body.customer);
    const items = await getOrderItemsFromProducts(req.body.items);
    const totals = calculateOrderTotals(items);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(totals.total * 100),
      currency: "INR",
      receipt: `dis8_${Date.now()}`,
      notes: {
        userId: String(req.user.id),
        customerEmail: customer.email,
      },
    });

    return res.status(201).json({
      keyId: process.env.RAZORPAY_KEY_ID,
      razorpayOrder,
      items,
      totals,
      customer,
    });
  } catch (error) {
    console.error("Unable to create Razorpay order:", error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Unable to create payment order.",
    });
  }
}

async function verifyPayment(req, res) {
  const {
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    paymentMethod = "razorpay",
  } = req.body;

  try {
    getRazorpayClient();

    const customer = getCustomer(req.body.customer);
    const items = await getOrderItemsFromProducts(req.body.items);
    const totals = calculateOrderTotals(items);
    const signatureMatches = verifyRazorpaySignature({
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });

    const order = await Order.createOrderWithItems({
      userId: req.user.id,
      customer,
      items,
      totalAmount: totals.total,
      paymentStatus: signatureMatches ? "paid" : "failed",
      paymentMethod,
      razorpayOrderId,
      razorpayPaymentId,
      status: signatureMatches ? "confirmed" : "pending",
    });

    await pool.query(
      `INSERT INTO payments
        (order_id, user_id, provider, provider_order_id, provider_payment_id, method, status, amount, verified_at, raw_payload)
       VALUES ($1, $2, 'razorpay', $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (provider, provider_payment_id)
       WHERE provider_payment_id IS NOT NULL
       DO NOTHING`,
      [
        order.id,
        req.user.id,
        razorpayOrderId,
        razorpayPaymentId,
        paymentMethod,
        signatureMatches ? "captured" : "failed",
        totals.total,
        signatureMatches ? new Date() : null,
        req.body,
      ]
    );

    if (!signatureMatches) {
      return res.status(400).json({ message: "Payment verification failed.", order });
    }

    return res.status(201).json({
      message: "Payment verified and order created.",
      order,
      totals,
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({ message: "This payment order has already been processed." });
    }

    console.error("Unable to verify Razorpay payment:", error);
    return res.status(error.status || 500).json({
      message: error.status ? error.message : "Unable to verify payment.",
    });
  }
}

function verifyWebhookSignature(rawBody, signature) {
  if (!process.env.RAZORPAY_WEBHOOK_SECRET || !signature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(signature);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function handleRazorpayWebhook(req, res) {
  const rawBody = req.body.toString("utf8");
  const signature = req.headers["x-razorpay-signature"];

  if (!verifyWebhookSignature(rawBody, signature)) {
    return res.status(400).json({ message: "Invalid webhook signature." });
  }

  const event = JSON.parse(rawBody);
  const payment = event.payload?.payment?.entity;

  if (payment?.id) {
    await pool.query(
      `INSERT INTO payments
        (provider, provider_order_id, provider_payment_id, method, status, amount, currency, verified_at, raw_payload)
       VALUES ('razorpay', $1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP, $7)
       ON CONFLICT (provider, provider_payment_id)
       WHERE provider_payment_id IS NOT NULL
       DO UPDATE SET status = EXCLUDED.status,
                     method = EXCLUDED.method,
                     raw_payload = EXCLUDED.raw_payload,
                     verified_at = CURRENT_TIMESTAMP`,
      [
        payment.order_id || null,
        payment.id,
        payment.method || null,
        payment.status || event.event,
        Number(payment.amount || 0) / 100,
        payment.currency || "INR",
        event,
      ]
    );

    if (payment.order_id) {
      await pool.query(
        `UPDATE orders
         SET payment_status = CASE WHEN $1 IN ('captured', 'authorized') THEN 'paid' ELSE payment_status END,
             status = CASE WHEN $1 IN ('captured', 'authorized') AND status = 'pending' THEN 'confirmed' ELSE status END
         WHERE razorpay_order_id = $2`,
        [payment.status, payment.order_id]
      );
    }
  }

  return res.json({ received: true });
}

async function refundPayment(req, res) {
  const { paymentId, amount, reason } = req.body;

  try {
    const razorpay = getRazorpayClient();
    const refund = await razorpay.payments.refund(paymentId, {
      amount: amount ? Math.round(Number(amount) * 100) : undefined,
      notes: { reason: reason || "Customer refund" },
    });

    await pool.query(
      `INSERT INTO refunds (provider_refund_id, amount, status, reason, raw_payload)
       VALUES ($1, $2, $3, $4, $5)`,
      [refund.id, Number(refund.amount || 0) / 100, refund.status || "processed", reason || null, refund]
    );

    return res.status(201).json({ refund });
  } catch (error) {
    console.error("Unable to create Razorpay refund:", error);
    return res.status(error.status || 500).json({ message: "Unable to create refund." });
  }
}

module.exports = {
  createPaymentOrder,
  handleRazorpayWebhook,
  refundPayment,
  verifyPayment,
};
