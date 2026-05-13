#!/usr/bin/env node
/**
 * Firebase Hosting deploy ohne Browser-Login.
 *
 * Variante A: FIREBASE_TOKEN (von `npx firebase-tools@latest login:ci`)
 * Variante B: GOOGLE_APPLICATION_CREDENTIALS = absoluter Pfad zur JSON-Key-Datei
 *             eines Dienstkontos mit Rolle "Firebase Hosting Admin" (GCP IAM).
 *
 * Laedt .env und .env.local aus dem Projektroot (nicht committen).
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const root = path.join(__dirname, "..");

function resolveCredentialPath(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (path.isAbsolute(s)) return s;
  return path.join(root, s);
}

const token = String(process.env.FIREBASE_TOKEN || "").trim();
const gacRaw =
  String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim() ||
  String(process.env.FIREBASE_HOSTING_SA_PATH || "").trim();
const gacPath = gacRaw ? resolveCredentialPath(gacRaw) : "";

if (gacRaw && !fs.existsSync(gacPath)) {
  console.error(
    `[deploy-hosting] Datei fuer GOOGLE_APPLICATION_CREDENTIALS nicht gefunden:\n  ${gacPath}\n` +
      "  Pfad pruefen (Leerzeichen, Laufwerk).",
  );
  process.exit(1);
}

const useAdc = gacPath && fs.existsSync(gacPath);

if (!useAdc && !token) {
  console.error(
    "[deploy-hosting] Keine Authentifizierung gefunden.\n\n" +
      "  Option A — CI-Token:\n" +
      "    FIREBASE_TOKEN=...   (npx firebase-tools@latest login:ci)\n\n" +
      "  Option B — Service-Account-JSON (empfohlen wenn login:ci / attest blockiert):\n" +
      "    In Google Cloud Console: IAM > Dienstkonto > Schluessel JSON\n" +
      "    Rolle u.a.: Firebase Hosting Admin\n" +
      "    In .env z.B.:\n" +
      "    GOOGLE_APPLICATION_CREDENTIALS=C:\\\\pfad\\\\hosting-deploy-sa.json\n" +
      "    oder relativer Pfad: GOOGLE_APPLICATION_CREDENTIALS=./firebase-hosting-ci-sa.json\n\n" +
      "  Dann: npm run deploy:hosting\n" +
      "  JSON-Dateien und .env niemals committen.",
  );
  process.exit(1);
}

if (useAdc && !gacPath.endsWith(".json")) {
  console.warn(
    "[deploy-hosting] Hinweis: GOOGLE_APPLICATION_CREDENTIALS sollte auf eine .json-Datei zeigen.",
  );
}

const env = { ...process.env };
if (useAdc) {
  env.GOOGLE_APPLICATION_CREDENTIALS = gacPath;
  delete env.FIREBASE_TOKEN;
} else {
  env.FIREBASE_TOKEN = token;
  delete env.GOOGLE_APPLICATION_CREDENTIALS;
}

const result = spawnSync(
  "npx",
  ["--yes", "firebase-tools@latest", "deploy", "--only", "hosting"],
  {
    cwd: root,
    stdio: "inherit",
    env,
    shell: true,
  },
);

process.exit(result.status === 0 ? 0 : result.status || 1);
