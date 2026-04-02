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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureSchema = exports.getClient = exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const rawHostEnv = process.env.DB_HOST;
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
const pool = new pg_1.Pool(poolConfig);
const query = (text, params) => pool.query(text, params);
exports.query = query;
const getClient = () => pool.connect();
exports.getClient = getClient;
const ensureSchema = () => __awaiter(void 0, void 0, void 0, function* () {
    // Keep this minimal and idempotent; older DBs may miss newer columns.
    yield (0, exports.query)("alter table lieferanten add column if not exists kundennummer text");
});
exports.ensureSchema = ensureSchema;
