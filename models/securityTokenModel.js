const pool = require("../config/db");
const { hashValue } = require("../utils/security");

async function createToken({ userId, purpose, token, expiresAt }) {
  const tokenHash = hashValue(token);

  await pool.query(
    `INSERT INTO security_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [userId, purpose, tokenHash, expiresAt]
  );
}

async function consumeToken({ token, purpose }) {
  const tokenHash = hashValue(token);
  const result = await pool.query(
    `UPDATE security_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE id = (
       SELECT id
       FROM security_tokens
       WHERE token_hash = $1
         AND purpose = $2
         AND used_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
       ORDER BY created_at DESC
       LIMIT 1
     )
     RETURNING user_id`,
    [tokenHash, purpose]
  );

  return result.rows[0] || null;
}

async function clearPurpose(userId, purpose) {
  await pool.query(
    `UPDATE security_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
    [userId, purpose]
  );
}

module.exports = {
  clearPurpose,
  consumeToken,
  createToken,
};
