"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClient = exports.query = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const host = process.env.DB_HOST || process.env.PGHOST || "localhost";
const port = Number(process.env.DB_PORT || process.env.PGPORT || 5432);
const user = process.env.DB_USER || process.env.PGUSER || "postgres";
const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || "postgres";
const database = process.env.DB_NAME || process.env.PGDATABASE || "bestellwesen";
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
