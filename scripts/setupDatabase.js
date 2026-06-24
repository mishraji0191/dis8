require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

async function setupDatabase() {
  const schemaPath = path.join(__dirname, "..", "database", "admin-schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");

  await pool.query(schema);
  console.log("Database schema is ready.");
}

setupDatabase()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
