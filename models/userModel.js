const pool = require("../config/db");

const USER_COLUMNS =
  "id, name, email, phone, password_hash, role, email_verified, two_factor_enabled, created_at";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role || "user",
    emailVerified: Boolean(user.email_verified),
    twoFactorEnabled: Boolean(user.two_factor_enabled),
  };
}

async function createUser({ name, email, phone, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ($1, $2, $3, $4, 'user')
     RETURNING ${USER_COLUMNS}`,
    [name, normalizeEmail(email), phone || null, passwordHash]
  );

  return result.rows[0];
}

async function findUserByEmail(email) {
  const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [
    normalizeEmail(email),
  ]);

  return result.rows[0] || null;
}

async function findUserById(id) {
  const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

async function markEmailVerified(userId) {
  await pool.query("UPDATE users SET email_verified = true WHERE id = $1", [userId]);
}

async function updatePassword(userId, passwordHash) {
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

async function setTwoFactorEnabled(userId, enabled) {
  const result = await pool.query(
    `UPDATE users
     SET two_factor_enabled = $1
     WHERE id = $2
     RETURNING ${USER_COLUMNS}`,
    [enabled, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  createUser,
  findUserByEmail,
  findUserById,
  markEmailVerified,
  normalizeEmail,
  setTwoFactorEnabled,
  toPublicUser,
  updatePassword,
};
