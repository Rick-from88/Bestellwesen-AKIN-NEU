"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSchema = exports.getClient = exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const host = (process.env.DB_HOST || process.env.PGHOST || "localhost")
    .toString()
    .trim();
const port = Number((process.env.DB_PORT || process.env.PGPORT || 5432).toString());
const user = (process.env.DB_USER || process.env.PGUSER || "postgres")
    .toString()
    .trim();
const password = (process.env.DB_PASSWORD ||
    process.env.PGPASSWORD ||
    "postgres")
    .toString()
    .trim();
const database = (process.env.DB_NAME ||
    process.env.PGDATABASE ||
    "bestellwesen")
    .toString()
    .trim();
const poolConfig = {
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
}
else {
    poolConfig.port = port;
}
// Öffentliche Postgres-Hosts (Cloud SQL, Neon, …) verlangen oft TLS. Unix-Socket (/cloudsql/…) nicht.
const isUnixSocket = host.startsWith("/");
const sslHint = String(process.env.DB_SSL || process.env.PGSSLMODE || "")
    .trim()
    .toLowerCase();
const useSsl = !isUnixSocket &&
    (sslHint === "true" ||
        sslHint === "require" ||
        sslHint === "1" ||
        sslHint === "yes");
if (useSsl) {
    const rejectUnauthorized = String((_a = process.env.DB_SSL_REJECT_UNAUTHORIZED) !== null && _a !== void 0 ? _a : "true").toLowerCase() !==
        "false";
    poolConfig.ssl = { rejectUnauthorized };
}
const pool = new pg_1.Pool(poolConfig);
const query = (text, params) => pool.query(text, params);
exports.query = query;
const getClient = () => pool.connect();
exports.getClient = getClient;
const ensureSchema = () => __awaiter(void 0, void 0, void 0, function* () {
    // Idempotent: fehlende Spalten nachziehen (Cloud-DB oft älter als schema.sql).
    yield (0, exports.query)("alter table lieferanten add column if not exists kundennummer text");
    yield (0, exports.query)("alter table bestellungen add column if not exists bestellnummer integer");
    yield (0, exports.query)("alter table bestellungen add column if not exists created_by_uid text");
    yield (0, exports.query)("alter table bestellungen add column if not exists created_by_name text");
    yield (0, exports.query)("alter table bestellungen add column if not exists created_by_email text");
    yield (0, exports.query)("alter table bestellungen add column if not exists auftrags_bestaetigt boolean not null default false");
    yield (0, exports.query)("alter table bestellpositionen add column if not exists notiz text");
    yield (0, exports.query)("alter table bestellpositionen add column if not exists geliefert_menge integer not null default 0");
    yield (0, exports.query)("alter table bestellpositionen add column if not exists storniert_menge integer not null default 0");
    yield (0, exports.query)("alter table bestellungen drop constraint if exists bestellungen_status_check");
    yield (0, exports.query)(`alter table bestellungen
    add constraint bestellungen_status_check
    check (status in ('offen', 'bestellt', 'teilgeliefert', 'geliefert', 'teilstorniert', 'storniert'))`);
    yield (0, exports.query)("alter table artikel add column if not exists beschreibung text");
    yield (0, exports.query)("alter table artikel add column if not exists artikelnummer text");
    yield (0, exports.query)("alter table artikel add column if not exists einheit text");
    yield (0, exports.query)("alter table artikel add column if not exists verpackungseinheit text");
    yield (0, exports.query)("alter table artikel add column if not exists standard_bestellwert integer");
    yield (0, exports.query)("alter table artikel add column if not exists foto_url text");
    yield (0, exports.query)("alter table artikel drop column if exists lagerbestand");
    yield (0, exports.query)("alter table artikel drop column if exists min_bestand");
    yield (0, exports.query)(`
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
    yield (0, exports.query)("create index if not exists user_push_tokens_uid_idx on user_push_tokens(firebase_uid)");
    yield (0, exports.query)("create index if not exists user_push_tokens_role_idx on user_push_tokens(app_role)");
});
exports.ensureSchema = ensureSchema;
