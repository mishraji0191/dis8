const Account = require("../models/accountModel");

async function getAccount(req, res) {
  const account = await Account.getAccount(req.user.id);
  return res.json(account);
}

async function createAddress(req, res) {
  const address = await Account.upsertAddress(req.user.id, req.body);
  return res.status(201).json({ address });
}

async function addWishlistItem(req, res) {
  try {
    await Account.addWishlistItem(req.user.id, req.body.productId);
    return res.status(201).json({ message: "Added to wishlist." });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({ message: "Product does not exist." });
    }

    console.error("Unable to add wishlist item:", error);
    return res.status(500).json({ message: "Unable to update wishlist." });
  }
}

async function removeWishlistItem(req, res) {
  await Account.removeWishlistItem(req.user.id, req.params.id);
  return res.json({ message: "Removed from wishlist." });
}

module.exports = {
  addWishlistItem,
  createAddress,
  getAccount,
  removeWishlistItem,
};
