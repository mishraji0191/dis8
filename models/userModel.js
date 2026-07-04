const pool = require("../config/db");

const USER_COLUMNS =
  "id, name, email, phone, password_hash, role, email_verified, phone_verified, two_factor_enabled, referral_code, created_at";

function normalizeEmail(email) {
  if (!email) return null;
  return email.trim().toLowerCase();
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");

  if (/^[6-9]\d{9}$/.test(digits)) return `+91${digits}`;
  if (/^91[6-9]\d{9}$/.test(digits)) return `+${digits}`;

  return digits ? `+${digits}` : null;
}

function getIndianMobileDigits(phone) {
  const normalized = normalizePhone(phone);
  const digits = String(normalized || "").replace(/\D/g, "");

  if (/^91[6-9]\d{9}$/.test(digits)) return digits.slice(2);
  if (/^[6-9]\d{9}$/.test(digits)) return digits;

  return null;
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
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  const result = await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role, referral_code)
     VALUES ($1, $2, $3, $4, 'user', UPPER(SUBSTRING(MD5(RANDOM()::text || CLOCK_TIMESTAMP()::text), 1, 8)))
     RETURNING ${USER_COLUMNS}`,
    [name, normalizedEmail, normalizedPhone, passwordHash || null]
  );

  return result.rows[0];
}

async function createPasswordUser({ name, email, phone, passwordHash }) {
  const user = await createUser({ name, email, phone, passwordHash });
  await markEmailVerified(user.id);
  return findUserById(user.id);
}

async function findOrCreateMobileOtpUser({ phone, name }) {
  const normalizedPhone = normalizePhone(phone);
  const existing = await findUserByPhone(normalizedPhone);

  if (existing) return existing;

  return createUser({
    name: name || "DIS8 Customer",
    email: null,
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
  const normalizedPhone = normalizePhone(phone);
  const mobileDigits = getIndianMobileDigits(phone);
  const lookupDigits = mobileDigits ? [`91${mobileDigits}`, mobileDigits] : [];
  const result = await pool.query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE phone = $1
        OR regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = ANY($2::text[])
     ORDER BY phone_verified DESC, created_at ASC
     LIMIT 1`,
    [normalizedPhone, lookupDigits]
  );

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
  createPasswordUser,
  createUser,
  findOrCreateMobileOtpUser,
  findUserByEmail,
  findUserById,
  findUserByPhone,
  getIndianMobileDigits,
  markPhoneVerified,
  markEmailVerified,
  normalizePhone,
  normalizeEmail,
  setTwoFactorEnabled,
  toPublicUser,
  updatePassword,
};
