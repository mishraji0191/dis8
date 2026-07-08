const Cart = require("../models/cartModel");

async function getCart(req, res) {
  const items = await Cart.getCart(req.user.id);
  return res.json({ items });
}

async function syncCart(req, res) {
  try {
    const items = await Cart.syncCart(req.user.id, req.body.items || []);
    return res.json({ items });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    if (error.code === "23503") {
      return res.status(400).json({ message: "One or more products do not exist." });
    }

    console.error("Unable to sync cart:", error);
    return res.status(500).json({ message: "Unable to sync cart." });
  }
}

async function upsertItem(req, res) {
  try {
    await Cart.upsertItem(
      req.user.id,
      req.body.productId,
      req.body.quantity,
      req.body.selectedSize,
      {
        customizationType: req.body.customizationType,
        customizationData: req.body.customizationData,
        uploadedFiles: req.body.uploadedFiles,
      }
    );
    const items = await Cart.getCart(req.user.id);
    return res.json({ items });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }

    if (error.code === "23503") {
      return res.status(400).json({ message: "Product does not exist." });
    }

    console.error("Unable to update cart:", error);
    return res.status(500).json({ message: "Unable to update cart." });
  }
}

async function removeItem(req, res) {
  await Cart.removeItem(req.user.id, req.params.id, req.query.selectedSize);
  const items = await Cart.getCart(req.user.id);
  return res.json({ items });
}

async function clearCart(req, res) {
  await Cart.clearCart(req.user.id);
  return res.json({ items: [] });
}

module.exports = {
  clearCart,
  getCart,
  removeItem,
  syncCart,
  upsertItem,
};
