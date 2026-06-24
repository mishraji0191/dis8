const jwt = require("jsonwebtoken");
const { ACCESS_TOKEN_COOKIE } = require("../utils/security");

function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : req.cookies?.[ACCESS_TOKEN_COOKIE] || null;

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT secret is not configured." });
  }

  if (!token) {
    return res.status(401).json({ message: "Admin authentication required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access only." });
    }

    req.admin = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired admin token." });
  }
}

module.exports = adminAuth;
