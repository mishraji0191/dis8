const { Pool } = require("pg");
require("dotenv").config();

const dbConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
    }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };

const pool = new Pool({
  ...dbConfig,
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false,
        }
      : false,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected successfully.");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL connection error:", err);
});

module.exports = pool;
