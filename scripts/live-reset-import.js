#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const baseUrl = (process.env.LIVE_BASE_URL || "https://akin-bestellwesen.web.app").replace(
  /\/$/,
  "",
);
const token = process.env.LIVE_ADMIN_TOKEN || "";
const payloadPath = process.env.IMPORT_PAYLOAD_PATH || "tmp_catalog_import_payload.json";
const deleteOnly = process.env.DELETE_ONLY === "1";

if (!token) {
  console.error("LIVE_ADMIN_TOKEN fehlt.");
  process.exit(1);
}
if (!deleteOnly && !fs.existsSync(payloadPath)) {
  console.error(`Import-Payload fehlt: ${payloadPath}`);
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${token}`,
};

const call = async (method, endpoint, body) => {
  const res = await fetch(`${baseUrl}${endpoint}`, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
};

const listIds = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => Number(x && x.id))
    .filter((x) => Number.isFinite(x) && x > 0);

const run = async () => {
  console.log("1) Live-Backup...");
  const backup = await call("GET", "/api/backup");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join("backups", `live-backup-before-reset-${stamp}.json`);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), "utf8");
  console.log(`   Backup gespeichert: ${backupPath}`);

  console.log("2) Datenbestand laden...");
  const [orders, articles, suppliers] = await Promise.all([
    call("GET", "/api/bestellungen"),
    call("GET", "/api/artikel"),
    call("GET", "/api/lieferanten"),
  ]);
  const orderIds = listIds(orders);
  const articleIds = listIds(articles);
  const supplierIds = listIds(suppliers);
  console.log(
    `   Vorher: bestellungen=${orderIds.length}, artikel=${articleIds.length}, lieferanten=${supplierIds.length}`,
  );

  console.log("3) Bestellungen loeschen...");
  for (const id of orderIds) await call("DELETE", `/api/bestellungen/${id}`);
  console.log("4) Artikel loeschen...");
  for (const id of articleIds) await call("DELETE", `/api/artikel/${id}`);
  console.log("5) Lieferanten loeschen...");
  for (const id of supplierIds) await call("DELETE", `/api/lieferanten/${id}`);

  if (!deleteOnly) {
    console.log("6) Katalog importieren...");
    const payload = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
    const importResult = await call("POST", "/api/import/catalog", payload);
    console.log("   Import-Result:", JSON.stringify(importResult, null, 2));
  } else {
    console.log("6) Import uebersprungen (DELETE_ONLY=1).");
  }

  console.log("7) Nachkontrolle...");
  const [ordersAfter, articlesAfter, suppliersAfter] = await Promise.all([
    call("GET", "/api/bestellungen"),
    call("GET", "/api/artikel"),
    call("GET", "/api/lieferanten"),
  ]);
  console.log(
    `   Nachher: bestellungen=${listIds(ordersAfter).length}, artikel=${listIds(
      articlesAfter,
    ).length}, lieferanten=${listIds(suppliersAfter).length}`,
  );
};

run().catch((err) => {
  console.error("Live-Reset/Import fehlgeschlagen:", err.message || err);
  process.exit(2);
});
