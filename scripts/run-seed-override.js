process.env.DB_HOST = "127.0.0.1";
process.env.DB_USER = "postgres";
process.env.DB_PASSWORD = "localpass";
process.env.DB_NAME = "akindb";
require("./seed-local.js");
