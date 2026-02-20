require('dotenv').config();
const { Pool } = require('pg');

const host = (process.env.DB_HOST || process.env.PGHOST || 'localhost').toString().trim();
const port = Number((process.env.DB_PORT || process.env.PGPORT || 5432).toString());
const user = (process.env.DB_USER || process.env.PGUSER || 'postgres').toString().trim();
const password = (process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres').toString().trim();
const database = (process.env.DB_NAME || process.env.PGDATABASE || 'bestellwesen').toString().trim();

console.log('Connecting with:', { host, port, user, database });
const pool = new Pool({ host, port, user, password, database });

(async () => {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT 1 AS ok, now()');
    console.log('Query result:', res.rows[0]);
    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('DB connect error:', err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
    process.exit(2);
  }
})();
