async function getProfile(req, res) {
  return res.json({ user: req.user });
}

async function getCart(req, res) {
  return res.json({ userId: req.user.id, items: [] });
}

module.exports = {
  getCart,
  getProfile,
};
