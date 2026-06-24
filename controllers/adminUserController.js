const pool = require("../config/db");

// ================= LIST USERS =================
async function listUsers(req, res) {
  try {
    const result = await pool.query(
      `SELECT id, name, email, phone, role, created_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({
      message: "Unable to fetch users",
    });
  }
}

module.exports = {
  listUsers,
};