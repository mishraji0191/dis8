const pool = require("../config/db");

function createOrderNumber(id) {
  return `DIS8-${String(id).padStart(6, "0")}`;
}

async function getOrderItems(client, orderIds) {
  if (orderIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
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
    orderNumber: row.order_number,
    userId: row.user_id,
    customerName: row.customer_name || row.user_name,
    customerEmail: row.customer_email || row.user_email,
    customerPhone: row.customer_phone,
    address: row.address,
    landmark: row.landmark,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    totalAmount: row.total_amount,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    razorpayOrderId: row.razorpay_order_id,
    razorpayPaymentId: row.razorpay_payment_id,
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

async function createOrderWithItems({
  userId,
  customer,
  items,
  totalAmount,
  paymentStatus,
  paymentMethod,
  razorpayOrderId,
  razorpayPaymentId,
  status = "pending",
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const orderResult = await client.query(
      `INSERT INTO orders (
         user_id,
         customer_name,
         customer_email,
         customer_phone,
         address,
         landmark,
         city,
         state,
         pincode,
         total_amount,
         payment_status,
         payment_method,
         razorpay_order_id,
         razorpay_payment_id,
         status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING id, order_number, user_id, customer_name, customer_email, customer_phone,
                 address, landmark, city, state, pincode, total_amount, payment_status,
                 payment_method, razorpay_order_id, razorpay_payment_id, status, created_at`,
      [
        userId,
        customer.name,
        customer.email,
        customer.phone,
        customer.address,
        customer.landmark || "",
        customer.city,
        customer.state,
        customer.pincode,
        totalAmount,
        paymentStatus,
        paymentMethod,
        razorpayOrderId,
        razorpayPaymentId || null,
        status,
      ]
    );

    let order = orderResult.rows[0];
    const orderNumber = createOrderNumber(order.id);

    const updatedOrder = await client.query(
      `UPDATE orders
       SET order_number = COALESCE(order_number, $1)
       WHERE id = $2
       RETURNING id, order_number, user_id, customer_name, customer_email, customer_phone,
                 address, landmark, city, state, pincode, total_amount, payment_status,
                 payment_method, razorpay_order_id, razorpay_payment_id, status, created_at`,
      [orderNumber, order.id]
    );
    order = updatedOrder.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.productId, item.productName, item.quantity, item.price]
      );
    }

    const itemsByOrderId = await getOrderItems(client, [order.id]);

    await client.query("COMMIT");
    return mapOrder(order, itemsByOrderId.get(order.id) || []);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function listOrders({ userId } = {}) {
  const params = [];
  const where = userId ? "WHERE o.user_id = $1" : "";

  if (userId) {
    params.push(userId);
  }

  const result = await pool.query(
    `SELECT o.id,
            o.order_number,
            o.user_id,
            o.customer_name,
            o.customer_email,
            o.customer_phone,
            o.address,
            o.landmark,
            o.city,
            o.state,
            o.pincode,
            o.total_amount,
            o.payment_status,
            o.payment_method,
            o.razorpay_order_id,
            o.razorpay_payment_id,
            o.status,
            o.created_at,
            u.name AS user_name,
            u.email AS user_email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     ${where}
     ORDER BY o.created_at DESC, o.id DESC`,
    params
  );

  const orderIds = result.rows.map((order) => order.id);
  const itemsByOrderId = await getOrderItems(pool, orderIds);
  return result.rows.map((order) => mapOrder(order, itemsByOrderId.get(order.id) || []));
}

async function getOrderById(id, { userId } = {}) {
  const params = [id];
  const userClause = userId ? "AND o.user_id = $2" : "";

  if (userId) {
    params.push(userId);
  }

  const result = await pool.query(
    `SELECT o.id,
            o.order_number,
            o.user_id,
            o.customer_name,
            o.customer_email,
            o.customer_phone,
            o.address,
            o.landmark,
            o.city,
            o.state,
            o.pincode,
            o.total_amount,
            o.payment_status,
            o.payment_method,
            o.razorpay_order_id,
            o.razorpay_payment_id,
            o.status,
            o.created_at,
            u.name AS user_name,
            u.email AS user_email
     FROM orders o
     LEFT JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 ${userClause}`,
    params
  );

  if (result.rowCount === 0) {
    return null;
  }

  const itemsByOrderId = await getOrderItems(pool, [Number(id)]);
  return mapOrder(result.rows[0], itemsByOrderId.get(Number(id)) || []);
}

async function updateOrderStatus(id, status) {
  const result = await pool.query(
    `UPDATE orders
     SET status = $1
     WHERE id = $2
     RETURNING id, order_number, user_id, customer_name, customer_email, customer_phone,
               address, landmark, city, state, pincode, total_amount, payment_status,
               payment_method, razorpay_order_id, razorpay_payment_id, status, created_at`,
    [status, id]
  );

  return result.rows[0] ? mapOrder(result.rows[0]) : null;
}

async function deleteOrder(id) {
  const result = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING id", [id]);
  return result.rowCount > 0;
}

async function listPayments() {
  const result = await pool.query(
    `SELECT o.id,
            o.order_number,
            o.customer_name,
            o.customer_email,
            o.customer_phone,
            o.total_amount,
            o.payment_status,
            o.payment_method,
            o.razorpay_payment_id,
            o.created_at
     FROM orders o
     ORDER BY o.created_at DESC, o.id DESC`
  );

  return result.rows.map((row) => ({
    transactionId: row.order_number || `DIS8-${String(row.id).padStart(6, "0")}`,
    razorpayPaymentId: row.razorpay_payment_id,
    amount: row.total_amount,
    customer: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    paymentMethod: row.payment_method,
    status: row.payment_status,
    date: row.created_at,
  }));
}

module.exports = {
  createOrderWithItems,
  deleteOrder,
  getOrderById,
  listOrders,
  listPayments,
  mapOrder,
  updateOrderStatus,
};
