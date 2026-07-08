const pool = require("../config/db");

const ADMIN_COLUMNS = "id, name, email, password_hash, role, created_at";

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function toPublicAdmin(admin) {
  return {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role || "admin",
  };
}

async function findAdminByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const result = await pool.query(
    `SELECT ${ADMIN_COLUMNS} FROM admins WHERE LOWER(email) = LOWER($1)`,
    [normalizedEmail]
  );

  return result.rows[0] || null;
}

async function findAdminById(id) {
  const result = await pool.query(
    `SELECT ${ADMIN_COLUMNS} FROM admins WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function upsertAdmin({ name, email, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO admins (name, email, password_hash, role)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email)
     DO UPDATE SET name = EXCLUDED.name,
                   password_hash = EXCLUDED.password_hash,
                   role = 'admin'
     RETURNING ${ADMIN_COLUMNS}`,
    [name, normalizeEmail(email), passwordHash]
  );

  return result.rows[0];
}

module.exports = {
  findAdminByEmail,
  findAdminById,
  normalizeEmail,
  toPublicAdmin,
  upsertAdmin,
};
