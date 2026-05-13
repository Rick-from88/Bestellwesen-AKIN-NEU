#!/usr/bin/env node
/**
 * Cloud Run Service `akin-api` aus dem Projektroot deployen (Dockerfile).
 *
 * Laedt .env und .env.local (nicht committen).
 *
 * Voraussetzung: gcloud installiert, Projekt gesetzt, Nutzer eingeloggt
 * (`gcloud auth login` / ADC).
 *
 * TLS / Zscaler:
 * - Besser: Firmen-Root als .pem und NODE_EXTRA_CA_CERTS setzen — dieses Skript
 *   setzt dann auch REQUESTS_CA_BUNDLE, CURL_CA_BUNDLE und SSL_CERT_FILE (gcloud
 *   nutzt Python), damit Token-Refresh und API-Calls funktionieren.
 * - Notfall: BW_TLS_INSECURE_GCLOUD_DEPLOY=1 setzt NODE_TLS_REJECT_UNAUTHORIZED=0
 *   (nur Node-Unterprozesse; fuer gcloud oft unzureichend — trotzdem Firmen-CA
 *   bevorzugen).
 *
 * Nach dem Deploy in der Cloud Console (oder per gcloud) sicherstellen:
 *   FCM_VAPID_PUBLIC_KEY = oeffentlicher Schluessel aus Firebase > Cloud Messaging
 *   > Web-Push-Zertifikate (sonst liefert /api/me/push-config keinen Key).
 *
 * Umgebung (optional, Defaults fuer dieses Repo):
 *   BW_GCP_PROJECT   (Default: akin-bestellwesen aus .firebaserc)
 *   BW_RUN_REGION    (Default: europe-west1)
 *   BW_RUN_SERVICE   (Default: akin-api)
 */
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", ".env.local") });

const root = path.join(__dirname, "..");

if (String(process.env.BW_TLS_INSECURE_GCLOUD_DEPLOY || "").trim() === "1") {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  console.warn(
    "[deploy-cloud-run] WARNUNG: NODE_TLS_REJECT_UNAUTHORIZED=0. " +
      "Nur Notfall; fuer gcloud oft NODE_EXTRA_CA_CERTS / Firmen-CA noetig.",
  );
}

const extraCa = String(process.env.NODE_EXTRA_CA_CERTS || "").trim();
if (extraCa) {
  const caPath = path.isAbsolute(extraCa) ? extraCa : path.join(root, extraCa);
  if (fs.existsSync(caPath)) {
    process.env.REQUESTS_CA_BUNDLE = caPath;
    process.env.CURL_CA_BUNDLE = caPath;
    process.env.SSL_CERT_FILE = caPath;
    console.log("[deploy-cloud-run] CA-Bundle fuer gcloud/Python: " + caPath);
  } else {
    console.warn(
      "[deploy-cloud-run] NODE_EXTRA_CA_CERTS gesetzt, Datei nicht gefunden: " + caPath,
    );
  }
}

function readDefaultProject() {
  try {
    const rc = JSON.parse(
      fs.readFileSync(path.join(root, ".firebaserc"), "utf8"),
    );
    return String(rc?.projects?.default || "").trim();
  } catch {
    return "";
  }
}

const project =
  String(process.env.BW_GCP_PROJECT || process.env.GCLOUD_PROJECT || "").trim() ||
  readDefaultProject();
const region = String(process.env.BW_RUN_REGION || "europe-west1").trim();
const service = String(process.env.BW_RUN_SERVICE || "akin-api").trim();

if (!project) {
  console.error(
    "[deploy-cloud-run] Kein GCP-Projekt. BW_GCP_PROJECT setzen oder .firebaserc mit projects.default.",
  );
  process.exit(1);
}

const args = [
  "run",
  "deploy",
  service,
  "--source",
  ".",
  "--region",
  region,
  "--project",
  project,
];

console.log(
  `[deploy-cloud-run] gcloud ${args.join(" ")}\n` +
    "  Hinweis: FCM_VAPID_PUBLIC_KEY nach dem Deploy auf dem Service setzen, falls noch leer.",
);

const result = spawnSync("gcloud", args, {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env },
  shell: true,
});

process.exit(result.status === 0 ? 0 : result.status || 1);
