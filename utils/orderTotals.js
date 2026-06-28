const SHIPPING_CHARGE = 149;
const FREE_SHIPPING_THRESHOLD = 1999;
const GST_RATE = 0.05;

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function calculateOrderTotals(items = []) {
  const subtotal = items.reduce((total, item) => {
    return total + toNumber(item.price) * toNumber(item.quantity);
  }, 0);
  const shipping = subtotal > FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_CHARGE;
  const gst = subtotal * GST_RATE;
  const discount = 0;
  const total = subtotal + shipping + gst - discount;

  return {
    subtotal: Number(subtotal.toFixed(2)),
    shipping: Number(shipping.toFixed(2)),
    gst: Number(gst.toFixed(2)),
    discount,
    total: Number(total.toFixed(2)),
  };
}

module.exports = {
  calculateOrderTotals,
};
