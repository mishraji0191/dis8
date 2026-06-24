const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const {
  CSRF_COOKIE,
  CSRF_HEADER,
  getCsrfCookieOptions,
  generateSecureToken,
  signValue,
  timingSafeEqual,
} = require("../utils/security");

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173,http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

function corsOptions(req, callback) {
  const origin = req.header("Origin");

  if (!origin || allowedOrigins.includes(origin)) {
    return callback(null, {
      origin: true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", CSRF_HEADER],
    });
  }

  return callback(new Error("Not allowed by CORS"));
}

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many authentication attempts. Please try again later." },
});

function requireHttps(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    return next();
  }

  if (req.secure || req.headers["x-forwarded-proto"] === "https") {
    return next();
  }

  return res.status(403).json({ message: "HTTPS is required." });
}

function issueCsrfToken(req, res) {
  const token = generateSecureToken();
  res.cookie(CSRF_COOKIE, `${token}.${signValue(token)}`, getCsrfCookieOptions());
  return res.json({ csrfToken: token, headerName: CSRF_HEADER });
}

function cookieCsrfGuard(req, res, next) {
  const usesCookieAuth = Boolean(req.cookies?.dis8_access_token);
  const mutatesState = !["GET", "HEAD", "OPTIONS"].includes(req.method);

  if (!usesCookieAuth || !mutatesState) {
    return next();
  }

  const submittedToken = req.headers[CSRF_HEADER] || req.body?._csrf;
  const cookieValue = req.cookies?.[CSRF_COOKIE] || "";
  const [cookieToken, cookieSignature] = cookieValue.split(".");
  const validCookie =
    cookieToken &&
    cookieSignature &&
    timingSafeEqual(cookieSignature, signValue(cookieToken));

  if (!submittedToken || !validCookie || !timingSafeEqual(submittedToken, cookieToken)) {
    return res.status(403).json({ message: "Invalid or missing CSRF token." });
  }

  return next();
}

function securityErrorHandler(error, req, res, next) {
  if (error.message === "Not allowed by CORS") {
    return res.status(403).json({ message: "Origin is not allowed." });
  }

  return next(error);
}

function applySecurityMiddleware(app) {
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(requireHttps);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
  app.use(cors(corsOptions));
  app.use(cookieParser(process.env.COOKIE_SECRET || process.env.JWT_SECRET));
  app.use(generalLimiter);
}

module.exports = {
  applySecurityMiddleware,
  authLimiter,
  cookieCsrfGuard,
  issueCsrfToken,
  securityErrorHandler,
};
