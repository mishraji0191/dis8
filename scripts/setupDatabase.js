require("dotenv").config();

const fs = require("fs");
const path = require("path");
const pool = require("../config/db");

async function setupDatabase() {
  const schemaPath = path.join(__dirname, "..", "database", "admin-schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const migrationsDir = path.join(__dirname, "..", "database");
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql") && file !== "admin-schema.sql")
    .sort();

  await pool.query(schema);
  for (const file of migrationFiles) {
    const migration = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    await pool.query(migration);
    console.log(`Applied migration ${file}.`);
  }
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
