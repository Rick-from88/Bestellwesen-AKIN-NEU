#!/usr/bin/env node
/*
 Safe local SQL import script.
 Usage: node scripts/import-local.js <path-to-sql-file>
 The script reads DB connection from environment variables (see .env),
 and will refuse to run when NODE_ENV=production unless FORCE_IMPORT=1 is set.
 It executes the SQL inside a transaction and rolls back on error.
*/
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const sqlFile =
  process.argv[2] || path.join(__dirname, "..", "db", "seed_cloud.sql");
if (!fs.existsSync(sqlFile)) {
  fail(`SQL file not found: ${sqlFile}`);
}

if (process.env.NODE_ENV === "production" && process.env.FORCE_IMPORT !== "1") {
  fail("Refusing to run import in production. Set FORCE_IMPORT=1 to override.");
}

const sql = fs.readFileSync(sqlFile, "utf8");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "akindb",
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
});

(async () => {
  const client = await pool.connect();
  try {
    console.log("Beginning import of", sqlFile);
    await client.query("BEGIN");
    // Execute whole SQL file. Most schemas/dumps will contain multiple statements.
    await client.query(sql);
    await client.query("COMMIT");
    console.log("Import finished successfully.");
    process.exit(0);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (e) {}
    console.error("Import failed:", err && err.message ? err.message : err);
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
})();
