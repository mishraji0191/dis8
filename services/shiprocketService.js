let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function requestJson(path, { method = "GET", token, body } = {}) {
  const response = await fetch(`https://apiv2.shiprocket.in/v1/external${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shiprocket returned ${response.status}: ${text}`);
  }

  return response.json();
}

async function getShiprocketToken() {
  if (cachedToken && cachedTokenExpiresAt > Date.now() + 60_000) {
    return cachedToken;
  }

  if (!process.env.SHIPROCKET_EMAIL || !process.env.SHIPROCKET_PASSWORD) {
    throw new Error("SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD are required.");
  }

  const data = await requestJson("/auth/login", {
    method: "POST",
    body: {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    },
  });

  cachedToken = data.token;
  cachedTokenExpiresAt = Date.now() + 9 * 24 * 60 * 60 * 1000;
  return cachedToken;
}

async function createShipment({ order, items }) {
  const token = await getShiprocketToken();
  const billingAddress = [order.address, order.landmark].filter(Boolean).join(", ");

  return requestJson("/orders/create/adhoc", {
    method: "POST",
    token,
    body: {
      order_id: order.orderNumber || `DIS8-${order.id}`,
      order_date: new Date(order.createdAt || Date.now()).toISOString().slice(0, 10),
      pickup_location: process.env.SHIPROCKET_PICKUP_LOCATION,
      billing_customer_name: order.customerName,
      billing_last_name: "",
      billing_address: billingAddress,
      billing_city: order.city,
      billing_pincode: order.pincode,
      billing_state: order.state,
      billing_country: "India",
      billing_email: order.customerEmail,
      billing_phone: order.customerPhone,
      shipping_is_billing: true,
      order_items: items.map((item) => ({
        name: item.product_name || item.productName,
        sku: String(item.product_id || item.productId),
        units: Number(item.quantity),
        selling_price: Number(item.price),
      })),
      payment_method: order.paymentMethod === "cod" ? "COD" : "Prepaid",
      sub_total: Number(order.totalAmount),
      length: Number(process.env.SHIPROCKET_DEFAULT_LENGTH_CM || 30),
      breadth: Number(process.env.SHIPROCKET_DEFAULT_BREADTH_CM || 25),
      height: Number(process.env.SHIPROCKET_DEFAULT_HEIGHT_CM || 4),
      weight: Number(process.env.SHIPROCKET_DEFAULT_WEIGHT_KG || 0.5),
    },
  });
}

async function trackAwb(awbCode) {
  const token = await getShiprocketToken();
  return requestJson(`/courier/track/awb/${awbCode}`, { token });
}

module.exports = {
  createShipment,
  trackAwb,
};
