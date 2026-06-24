const crypto = require("crypto");

const ACCESS_TOKEN_COOKIE = "dis8_access_token";
const CSRF_COOKIE = "dis8_csrf_token";
const CSRF_HEADER = "x-csrf-token";

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    req.ip ||
    "unknown"
  );
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function generateNumericCode(length = 6) {
  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;
  return String(crypto.randomInt(min, max + 1));
}

function generateSecureToken() {
  return crypto.randomBytes(32).toString("hex");
}

function getSigningSecret() {
  return process.env.COOKIE_SECRET || process.env.JWT_SECRET || "development-only-secret";
}

function signValue(value) {
  return crypto.createHmac("sha256", getSigningSecret()).update(String(value)).digest("hex");
}

function timingSafeEqual(a, b) {
  const first = Buffer.from(String(a));
  const second = Buffer.from(String(b));

  return first.length === second.length && crypto.timingSafeEqual(first, second);
}

function getCookieOptions(maxAgeMs) {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
    maxAge: maxAgeMs,
  };
}

function getCsrfCookieOptions() {
  const isProduction = process.env.NODE_ENV === "production";

  return {
    httpOnly: false,
    sameSite: isProduction ? "none" : "lax",
    secure: isProduction,
  };
}

function logSecurityEvent(event, req, metadata = {}) {
  const record = {
    event,
    ip: getClientIp(req),
    userAgent: req.headers["user-agent"] || "unknown",
    at: new Date().toISOString(),
    ...metadata,
  };

  console.warn("[security]", JSON.stringify(record));
}

module.exports = {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  generateNumericCode,
  generateSecureToken,
  getClientIp,
  getCookieOptions,
  getCsrfCookieOptions,
  hashValue,
  logSecurityEvent,
  signValue,
  timingSafeEqual,
};
