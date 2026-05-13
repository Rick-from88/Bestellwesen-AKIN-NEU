import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

const host = (process.env.DB_HOST || process.env.PGHOST || "localhost")
  .toString()
  .trim();
const port = Number(
  (process.env.DB_PORT || process.env.PGPORT || 5432).toString(),
);
const user = (process.env.DB_USER || process.env.PGUSER || "postgres")
  .toString()
  .trim();
const password = (
  process.env.DB_PASSWORD ||
  process.env.PGPASSWORD ||
  "postgres"
)
  .toString()
  .trim();
const database = (
  process.env.DB_NAME ||
  process.env.PGDATABASE ||
  "bestellwesen"
)
  .toString()
  .trim();

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

// Öffentliche Postgres-Hosts (Cloud SQL, Neon, …) verlangen oft TLS. Unix-Socket (/cloudsql/…) nicht.
const isUnixSocket = host.startsWith("/");
const sslHint = String(process.env.DB_SSL || process.env.PGSSLMODE || "")
  .trim()
  .toLowerCase();
const useSsl =
  !isUnixSocket &&
  (sslHint === "true" ||
    sslHint === "require" ||
    sslHint === "1" ||
    sslHint === "yes");
if (useSsl) {
  const rejectUnauthorized =
    String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "true").toLowerCase() !==
    "false";
  poolConfig.ssl = { rejectUnauthorized };
}

const pool = new Pool(poolConfig);

export const query = (text: string, params?: Array<unknown>) =>
  pool.query(text, params);
export const getClient = () => pool.connect();

export const ensureSchema = async () => {
  // Idempotent: fehlende Spalten nachziehen (Cloud-DB oft älter als schema.sql).
  await query(
    "alter table lieferanten add column if not exists kundennummer text",
  );
  await query(
    "alter table bestellungen add column if not exists bestellnummer integer",
  );
  await query(
    "alter table bestellungen add column if not exists created_by_uid text",
  );
  await query(
    "alter table bestellungen add column if not exists created_by_name text",
  );
  await query(
    "alter table bestellungen add column if not exists created_by_email text",
  );
  await query(
    "alter table bestellungen add column if not exists auftrags_bestaetigt boolean not null default false",
  );
  await query(
    "alter table bestellpositionen add column if not exists notiz text",
  );
  await query(
    "alter table bestellpositionen add column if not exists geliefert_menge integer not null default 0",
  );
  await query(
    "alter table bestellpositionen add column if not exists storniert_menge integer not null default 0",
  );
  await query(
    "alter table bestellungen drop constraint if exists bestellungen_status_check",
  );
  await query(`alter table bestellungen
    add constraint bestellungen_status_check
    check (status in ('offen', 'bestellt', 'teilgeliefert', 'geliefert', 'teilstorniert', 'storniert'))`);
  await query(
    "alter table artikel add column if not exists beschreibung text",
  );
  await query(
    "alter table artikel add column if not exists artikelnummer text",
  );
  await query("alter table artikel add column if not exists einheit text");
  await query(
    "alter table artikel add column if not exists verpackungseinheit text",
  );
  await query(
    "alter table artikel add column if not exists standard_bestellwert integer",
  );
  await query("alter table artikel add column if not exists foto_url text");
  await query("alter table artikel drop column if exists lagerbestand");
  await query("alter table artikel drop column if exists min_bestand");
  await query(`
    create table if not exists user_push_tokens (
      id serial primary key,
      firebase_uid text not null,
      fcm_token text not null unique,
      app_role text not null,
      user_agent text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await query(
    "create index if not exists user_push_tokens_uid_idx on user_push_tokens(firebase_uid)",
  );
  await query(
    "create index if not exists user_push_tokens_role_idx on user_push_tokens(app_role)",
  );
};
