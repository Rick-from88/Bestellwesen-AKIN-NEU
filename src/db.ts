import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const host = process.env.DB_HOST || process.env.PGHOST || "localhost";
const port = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
const user = process.env.DB_USER || process.env.PGUSER || "postgres";
const password =
  process.env.DB_PASSWORD || process.env.PGPASSWORD || "postgres";
const database =
  process.env.DB_NAME || process.env.PGDATABASE || "bestellwesen";

const poolConfig: any = {
  user,
  password,
  database,
};
// If host is provided, set it. For Cloud SQL Unix socket paths (start with '/cloudsql/') do not set port.
if (host) {
  poolConfig.host = host;
  if (!host.startsWith("/")) {
    poolConfig.port = port;
  }
} else {
  poolConfig.port = port;
}

const pool = new Pool(poolConfig);

export const query = (text: string, params?: Array<unknown>) =>
  pool.query(text, params);
export const getClient = () => pool.connect();
