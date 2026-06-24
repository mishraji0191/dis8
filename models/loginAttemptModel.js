const pool = require("../config/db");
const { getClientIp } = require("../utils/security");

async function recordLoginAttempt(req, { email, success, reason }) {
  await pool.query(
    `INSERT INTO login_attempts (email, ip_address, user_agent, success, reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      email || null,
      getClientIp(req),
      req.headers["user-agent"] || null,
      Boolean(success),
      reason || null,
    ]
  );
}

module.exports = {
  recordLoginAttempt,
};
