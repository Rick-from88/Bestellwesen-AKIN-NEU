#!/usr/bin/env node
/**
 * Firebase Hosting deploy ohne Browser-Login.
 * Setzt voraus: FIREBASE_TOKEN (von `npx firebase-tools@latest login:ci`).
 * Laedt optional .env und .env.local aus dem Projektroot (nicht committen).
 */
const path = require("path");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const token = String(process.env.FIREBASE_TOKEN || "").trim();
if (!token) {
  console.error(
    "[deploy-hosting] FIREBASE_TOKEN fehlt.\n\n" +
      "  1) Lokal (einmal):  npx firebase-tools@latest login:ci\n" +
      "  2) Ausgegebenen Token in .env oder .env.local speichern:\n" +
      "       FIREBASE_TOKEN=...\n" +
      "  3) Dann:             npm run deploy:hosting\n\n" +
      "  Token niemals ins Git committen (.env ist in .gitignore).",
  );
  process.exit(1);
}

const root = path.join(__dirname, "..");
const result = spawnSync(
  "npx",
  ["--yes", "firebase-tools@latest", "deploy", "--only", "hosting"],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, FIREBASE_TOKEN: token },
    shell: true,
  },
);

process.exit(result.status === 0 ? 0 : result.status || 1);
