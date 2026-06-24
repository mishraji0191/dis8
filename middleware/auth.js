const jwt = require("jsonwebtoken");
const { ACCESS_TOKEN_COOKIE } = require("../utils/security");

function getRequestToken(req) {
  const authHeader = req.headers.authorization || "";

  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }

  return req.cookies?.[ACCESS_TOKEN_COOKIE] || null;
}

function auth(req, res, next) {
  const token = getRequestToken(req);

  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT secret is not configured." });
  }

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.role === "admin") {
      req.admin = decoded;
    } else {
      req.user = decoded;
    }

    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

module.exports = auth;
