import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const rawHostEnv = process.env.DB_HOST;
const host = (process.env.DB_HOST || process.env.PGHOST || "localhost").toString().trim();

// DEBUG: show raw and used host values (codepoints) to detect invisible chars
console.log("DB host raw:", JSON.stringify(rawHostEnv));
console.log("DB host used:", JSON.stringify(host), host.split("").map((c) => c.charCodeAt(0)));
const port = Number((process.env.DB_PORT || process.env.PGPORT || 5432).toString());
const user = (process.env.DB_USER || process.env.PGUSER || "postgres").toString().trim();
const password = (process.env.DB_PASSWORD || process.env.PGPASSWORD || "postgres").toString().trim();
const database = (process.env.DB_NAME || process.env.PGDATABASE || "bestellwesen").toString().trim();

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
