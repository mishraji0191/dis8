const pool = require("../config/db");
const { hashValue } = require("../utils/security");

const SESSION_COLUMNS = `
  id, user_id, refresh_token_hash, device_name, user_agent, ip_address,
  remember_device, last_seen_at, expires_at, revoked_at, created_at
`;

async function createSession({
  userId,
  refreshToken,
  deviceName,
  userAgent,
  ipAddress,
  rememberDevice,
  expiresAt,
}) {
  const result = await pool.query(
    `INSERT INTO user_sessions
      (user_id, refresh_token_hash, device_name, user_agent, ip_address, remember_device, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${SESSION_COLUMNS}`,
    [
      userId,
      hashValue(refreshToken),
      deviceName || "Unknown device",
      userAgent || null,
      ipAddress || null,
      Boolean(rememberDevice),
      expiresAt,
    ]
  );

  return result.rows[0];
}

async function findActiveSessionByRefreshToken(refreshToken) {
  const result = await pool.query(
    `UPDATE user_sessions
     SET last_seen_at = CURRENT_TIMESTAMP
     WHERE refresh_token_hash = $1
       AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     RETURNING ${SESSION_COLUMNS}`,
    [hashValue(refreshToken)]
  );

  return result.rows[0] || null;
}

async function rotateSession(sessionId, refreshToken, expiresAt) {
  const result = await pool.query(
    `UPDATE user_sessions
     SET refresh_token_hash = $1,
         expires_at = $2,
         last_seen_at = CURRENT_TIMESTAMP
     WHERE id = $3
       AND revoked_at IS NULL
     RETURNING ${SESSION_COLUMNS}`,
    [hashValue(refreshToken), expiresAt, sessionId]
  );

  return result.rows[0] || null;
}

async function revokeSession(sessionId, userId) {
  await pool.query(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
    [sessionId, userId]
  );
}

async function revokeByRefreshToken(refreshToken) {
  if (!refreshToken) return;

  await pool.query(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
    [hashValue(refreshToken)]
  );
}

async function revokeAllForUser(userId) {
  await pool.query(
    `UPDATE user_sessions
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

async function listUserSessions(userId) {
  const result = await pool.query(
    `SELECT id, device_name, user_agent, ip_address, remember_device,
            last_seen_at, expires_at, created_at
     FROM user_sessions
     WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
     ORDER BY last_seen_at DESC, created_at DESC`,
    [userId]
  );

  return result.rows;
}

module.exports = {
  createSession,
  findActiveSessionByRefreshToken,
  listUserSessions,
  revokeAllForUser,
  revokeByRefreshToken,
  revokeSession,
  rotateSession,
};
