const pool = require("../config/db");

const USER_COLUMNS =
  "id, name, email, phone, password_hash, role, email_verified, phone_verified, two_factor_enabled, referral_code, created_at";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

function toPublicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role || "user",
    emailVerified: Boolean(user.email_verified),
    phoneVerified: Boolean(user.phone_verified),
    twoFactorEnabled: Boolean(user.two_factor_enabled),
    referralCode: user.referral_code,
  };
}

async function createUser({ name, email, phone, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, referral_code)
     VALUES ($1, $2, $3, $4, 'user', UPPER(SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text), 1, 8)))
     RETURNING ${USER_COLUMNS}`,
    [name, normalizeEmail(email), phone ? normalizePhone(phone) : null, passwordHash]
  );

  return result.rows[0];
}

async function findOrCreateOtpUser({ email, phone, name }) {
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  const existing = normalizedEmail
    ? await findUserByEmail(normalizedEmail)
    : await findUserByPhone(normalizedPhone);

  if (existing) return existing;

  const syntheticEmail = normalizedEmail || `${normalizedPhone.replace(/[^\d]/g, "")}@otp.dis8.local`;

  return createUser({
    name: name || "DIS8 Customer",
    email: syntheticEmail,
    phone: normalizedPhone,
    passwordHash: null,
  });
}

async function findUserByEmail(email) {
  const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [
    normalizeEmail(email),
  ]);

  return result.rows[0] || null;
}

async function findUserByPhone(phone) {
  const result = await pool.query(`SELECT ${USER_COLUMNS} FROM users WHERE phone = $1`, [
    normalizePhone(phone),
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

async function markPhoneVerified(userId) {
  await pool.query("UPDATE users SET phone_verified = true WHERE id = $1", [userId]);
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
  findOrCreateOtpUser,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  markPhoneVerified,
  markEmailVerified,
  normalizePhone,
  normalizeEmail,
  setTwoFactorEnabled,
  toPublicUser,
  updatePassword,
};
