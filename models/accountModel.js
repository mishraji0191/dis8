const pool = require("../config/db");

async function getAccount(userId) {
  const [
    addresses,
    wishlist,
    orders,
    coupons,
    wallet,
    coinHistory,
    referrals,
    returns,
    notifications,
  ] = await Promise.all([
    pool.query("SELECT * FROM user_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC", [userId]),
    pool.query(
      `SELECT w.product_id, w.created_at, p.name, p.price, p.category, p.image_url
       FROM wishlists w
       JOIN products p ON p.id = w.product_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [userId]
    ),
    pool.query("SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC", [userId]),
    pool.query(
      `SELECT c.*
       FROM coupons c
       WHERE c.is_active = true
         AND (c.expires_at IS NULL OR c.expires_at > CURRENT_TIMESTAMP)
       ORDER BY c.created_at DESC`
    ),
    pool.query("SELECT * FROM wallets WHERE user_id = $1", [userId]),
    pool.query("SELECT * FROM loyalty_ledger WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [userId]),
    pool.query("SELECT * FROM referrals WHERE referrer_user_id = $1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT * FROM return_requests WHERE user_id = $1 ORDER BY created_at DESC", [userId]),
    pool.query("SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [userId]),
  ]);

  return {
    addresses: addresses.rows,
    wishlist: wishlist.rows,
    orders: orders.rows,
    coupons: coupons.rows,
    wallet: wallet.rows[0] || { balance: 0, dis8_coins: 0, referral_earnings: 0 },
    coinHistory: coinHistory.rows,
    referrals: referrals.rows,
    returns: returns.rows,
    notifications: notifications.rows,
  };
}

async function upsertAddress(userId, address) {
  const result = await pool.query(
    `INSERT INTO user_addresses
      (user_id, label, recipient_name, phone, address_line1, address_line2, city, state, pincode, country, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, 'India'), COALESCE($11, false))
     RETURNING *`,
    [
      userId,
      address.label || "Home",
      address.recipientName,
      address.phone,
      address.addressLine1,
      address.addressLine2 || null,
      address.city,
      address.state,
      address.pincode,
      address.country,
      address.isDefault,
    ]
  );

  return result.rows[0];
}

async function addWishlistItem(userId, productId) {
  const result = await pool.query(
    `INSERT INTO wishlists (user_id, product_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, product_id) DO NOTHING
     RETURNING *`,
    [userId, productId]
  );

  return result.rows[0] || null;
}

async function removeWishlistItem(userId, productId) {
  await pool.query("DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2", [userId, productId]);
}

module.exports = {
  addWishlistItem,
  getAccount,
  removeWishlistItem,
  upsertAddress,
};
