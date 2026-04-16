import express from "express";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import fs from "fs";
import * as admin from "firebase-admin";
import path from "path";
import {
  createBestellung,
  listBestellungen,
  updateBestellung,
  deleteBestellung,
  BestellungStatus,
} from "./repositories/bestellungen";
import {
  createLieferant,
  deleteLieferant,
  getLieferantById,
  listLieferantArtikel,
  listLieferantBestellungen,
  listLieferanten,
  updateLieferant,
} from "./repositories/lieferanten";
import { createTransporter, testSmtpConnection } from "./services/email";
import {
  createArtikel,
  deleteArtikel,
  listArtikel,
  updateArtikel,
} from "./repositories/artikel";
import { ensureSchema } from "./db";

const app = express();
const PORT = process.env.PORT || 3000;

// Hinter Firebase Hosting / Load Balancer: korrekte Client-Proto/Host für Cookies.
app.set("trust proxy", true);

app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use("/static", express.static(path.join(__dirname, "..", "public")));

// Admin auth middleware: if `ADMIN_TOKEN` is set, require it via
// `Authorization: Bearer <token>` header or `?admin_token=...` query.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
// Firebase Hosting → Cloud Run: nur das Cookie "__session" wird durchgereicht (siehe Firebase-Doku).
const FB_SESSION_COOKIE = process.env.FB_SESSION_COOKIE || "__session";

/** Session-Cookie für Firebase Hosting (*.web.app): Domain muss zur sichtbaren Origin passen. */
function sessionCookieDomainFromReq(req: {
  get(name: string): string | undefined;
}): string | undefined {
  const fromEnv =
    process.env.SESSION_COOKIE_DOMAIN || process.env.COOKIE_DOMAIN || "";
  const trimmed = fromEnv.trim();
  if (trimmed) return trimmed;
  const raw = String(req.get("x-forwarded-host") || req.get("host") || "")
    .split(",")[0]
    .trim()
    .split(":")[0];
  if (!raw) return undefined;
  if (raw.endsWith(".web.app") || raw.endsWith(".firebaseapp.com")) {
    return raw;
  }
  return undefined;
}

function sessionCookieSecure(req: {
  secure: boolean;
  get(name: string): string | undefined;
}): boolean {
  const proto = String(req.get("x-forwarded-proto") || "")
    .split(",")[0]
    .trim();
  if (proto === "https") return true;
  if (req.secure) return true;
  return process.env.NODE_ENV === "production";
}

const ADMIN_UIDS = (process.env.ADMIN_UIDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
/** Feste Admin-Mails (zusätzlich zu ADMIN_EMAILS in der Umgebung). */
const ADMIN_EMAILS_BUILTIN = ["patrick@akin-pulverbeschichtungen.de"];
const ADMIN_EMAILS_FROM_ENV = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_EMAIL_SET = new Set(
  [...ADMIN_EMAILS_BUILTIN, ...ADMIN_EMAILS_FROM_ENV].map((e) =>
    e.toLowerCase(),
  ),
);

const initFirebaseAdmin = () => {
  if (admin.apps.length) return admin;

  const sdkJson = process.env.FIREBASE_ADMIN_SDK_JSON || "";
  const sdkPath = process.env.FIREBASE_ADMIN_SDK_PATH || "";

  if (sdkJson) {
    const parsed = JSON.parse(sdkJson);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
    return admin;
  }

  if (sdkPath) {
    const raw = fs.readFileSync(sdkPath, "utf8");
    const parsed = JSON.parse(raw);
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
    return admin;
  }

  // If deployed (e.g. Cloud Run), application default credentials can work.
  // For local development you typically need GOOGLE_APPLICATION_CREDENTIALS set.
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
  return admin;
};

let firebaseAdminReady = true;
try {
  initFirebaseAdmin();
} catch (e) {
  firebaseAdminReady = false;
  console.error("Firebase Admin SDK konnte nicht initialisiert werden:", e);
}

type AuthedRequest = {
  firebaseUser?: admin.auth.DecodedIdToken;
};

type AppRole = "admin" | "buero" | "produktion";

const SESSION_MAX_AGE_MS = Number(
  process.env.SESSION_MAX_AGE_MS || 8 * 60 * 60 * 1000,
);

const extractSessionCookie = (req: any): string | null => {
  const raw = req.cookies?.[FB_SESSION_COOKIE];
  return typeof raw === "string" && raw.trim() ? raw : null;
};

const extractIdToken = (req: any): string => {
  const fromHeader = String(req.headers["authorization"] || "");
  if (fromHeader.startsWith("Bearer ")) return fromHeader.slice(7);
  const fromCookie = req.cookies?.[FB_SESSION_COOKIE];
  return typeof fromCookie === "string" ? fromCookie : "";
};

const requireUserApi = async (req: any, res: any, next: any) => {
  if (!firebaseAdminReady) {
    return res.status(503).json({
      error: "firebase admin not configured",
    });
  }
  try {
    const sessionCookie = extractSessionCookie(req);
    let decoded: admin.auth.DecodedIdToken | null = null;

    if (sessionCookie) {
      decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
    } else {
      const token = extractIdToken(req);
      if (!token) {
        return res.status(401).json({ error: "unauthorized" });
      }
      decoded = await admin.auth().verifyIdToken(token);
    }

    (req as AuthedRequest).firebaseUser = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
};

const isAdminUser = (user: admin.auth.DecodedIdToken): boolean => {
  if (ADMIN_UIDS.includes(user.uid)) return true;
  const email = (user.email || "").toLowerCase();
  if (email && ADMIN_EMAIL_SET.has(email)) return true;
  return false;
};

const getUserRole = (user: admin.auth.DecodedIdToken | undefined): AppRole => {
  if (!user) return "produktion";
  if (isAdminUser(user)) return "admin";
  const claimRole = String((user as any).role || "");
  if (
    claimRole === "admin" ||
    claimRole === "buero" ||
    claimRole === "produktion"
  ) {
    return claimRole as AppRole;
  }
  return "produktion";
};

const requireAdminApi = async (req: any, res: any, next: any) => {
  // Legacy allow-list via ADMIN_TOKEN (optional)
  if (ADMIN_TOKEN) {
    const raw = String(
      req.headers["authorization"] || req.query?.admin_token || "",
    );
    const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
    if (token === ADMIN_TOKEN) return next();
  }

  if (!firebaseAdminReady) {
    return res.status(503).json({
      error: "firebase admin not configured",
    });
  }

  try {
    const sessionCookie = extractSessionCookie(req);
    let decoded: admin.auth.DecodedIdToken | null = null;

    if (sessionCookie) {
      decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
    } else {
      const token = extractIdToken(req);
      if (!token) return res.status(401).json({ error: "unauthorized" });
      decoded = await admin.auth().verifyIdToken(token);
    }

    (req as AuthedRequest).firebaseUser = decoded;
    if (!isAdminUser(decoded)) return res.status(403).json({ error: "forbidden" });
    return next();
  } catch {
    return res.status(401).json({ error: "unauthorized" });
  }
};

const requireUserPage = async (req: any, res: any, next: any) => {
  if (!firebaseAdminReady) {
    return res.redirect("/login");
  }
  try {
    const sessionCookie = extractSessionCookie(req);
    let decoded: admin.auth.DecodedIdToken | null = null;

    if (sessionCookie) {
      decoded = await admin.auth().verifySessionCookie(sessionCookie, true);
    } else {
      const token = extractIdToken(req);
      if (!token) return res.redirect("/login");
      decoded = await admin.auth().verifyIdToken(token);
    }

    (req as AuthedRequest).firebaseUser = decoded;
    return next();
  } catch {
    return res.redirect("/login");
  }
};

const requireAdminPage = async (req: any, res: any, next: any) => {
  await requireUserPage(req, res, async () => {
    const u = (req as AuthedRequest).firebaseUser;
    if (!u || !isAdminUser(u)) return res.redirect("/uebersicht");
    return next();
  });
};

const toDisplayNameFromEmail = (email: string | undefined): string | undefined => {
  if (!email) return undefined;
  const local = email.split("@")[0] || "";
  const firstToken = local
    .split(/[.\-_+]/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  if (!firstToken) return undefined;
  return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
};

const resolveActorProfile = async (
  user: admin.auth.DecodedIdToken | undefined,
): Promise<{ uid?: string; email?: string; name?: string }> => {
  if (!user?.uid) return {};
  let email = user.email || undefined;
  let name = ((user as any).name as string | undefined) || undefined;
  if (name) name = name.trim() || undefined;

  if (email && !name) {
    name = toDisplayNameFromEmail(email);
  }

  if (!firebaseAdminReady) {
    return { uid: user.uid, email, name };
  }

  try {
    const record = await admin.auth().getUser(user.uid);
    const recordEmail = record.email || undefined;
    const recordName = record.displayName?.trim() || undefined;

    email = email || recordEmail;
    name = name || recordName || toDisplayNameFromEmail(email);

    // Wenn noch kein Anzeigename in Firebase gepflegt ist, setzen wir ihn automatisch.
    if (!recordName && name) {
      try {
        await admin.auth().updateUser(user.uid, { displayName: name });
      } catch {
        // Nicht kritisch fuer Bestellerfassung.
      }
    }

    return { uid: user.uid, email, name };
  } catch {
    return { uid: user.uid, email, name };
  }
};

const resolveConfiguredMailRecipient = async (
  settingsRepo: { getSetting: (key: string) => Promise<string | null> },
): Promise<string> => {
  const configuredRecipient =
    (await settingsRepo.getSetting("email_recipient")) ||
    (await settingsRepo.getSetting("mail_to")) ||
    (await settingsRepo.getSetting("mail_user")) ||
    process.env.MAIL_TO ||
    process.env.MAIL_USER ||
    "";
  return String(configuredRecipient || "").trim();
};

const sendMailUsingConfiguredSmtp = async (
  settingsRepo: { getSetting: (key: string) => Promise<string | null> },
  to: string,
  subject: string,
  text: string,
  html?: string,
) => {
  const host =
    (await settingsRepo.getSetting("mail_host")) ||
    process.env.MAIL_HOST ||
    process.env.SMTP_HOST ||
    "";
  const portRaw =
    (await settingsRepo.getSetting("mail_port")) ||
    process.env.MAIL_PORT ||
    process.env.SMTP_PORT ||
    "587";
  const user =
    (await settingsRepo.getSetting("mail_user")) ||
    process.env.MAIL_USER ||
    process.env.SMTP_USER ||
    "";
  const pass =
    (await settingsRepo.getSetting("mail_pass")) ||
    process.env.MAIL_PASS ||
    process.env.SMTP_PASS ||
    "";
  const from =
    (await settingsRepo.getSetting("mail_from")) ||
    process.env.MAIL_FROM ||
    user ||
    "no-reply@example.com";

  const transporter = createTransporter({
    host: String(host || ""),
    port: Number(portRaw || 587),
    user: String(user || ""),
    pass: String(pass || ""),
  });
  const mailOptions: any = {
    from: `"Bestellwesen App" <${from}>`,
    to,
    subject,
    text,
  };
  if (html) mailOptions.html = html;
  return transporter.sendMail(mailOptions);
};

const stripHtmlToText = (html: string) => {
  return String(html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|tr|br|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const escapeHtml = (value: unknown): string => {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const buildArtikelListeForMail = (
  positionen: any[],
  artikelMap: Record<number, any>,
) => {
  const tableStyle =
    "border-collapse:collapse;width:100%;table-layout:fixed;font-family:Arial,Helvetica,sans-serif;font-size:14px;";
  const thStyle =
    "text-align:left;border-bottom:1px solid #e5e7eb;padding:8px 6px;font-weight:700;";
  const tdStyle = "border-bottom:1px solid #f1f5f9;padding:8px 6px;vertical-align:top;";
  const tdRightStyle = `${tdStyle}text-align:right;white-space:nowrap;`;
  const tdNoWrapStyle = `${tdStyle}white-space:nowrap;`;

  let artikelHtml =
    `<table border="0" cellpadding="0" cellspacing="0" style="${tableStyle}">` +
    `<thead><tr>` +
    `<th style="${thStyle}width:34%;">Artikel</th>` +
    `<th style="${thStyle}width:34%;">Beschreibung</th>` +
    `<th style="${thStyle}width:17%;">Artikelnummer</th>` +
    `<th style="${thStyle}width:15%;text-align:right;">Stueckzahl</th>` +
    `</tr></thead><tbody>`;

  let artikelText = "";
  for (const pos of positionen || []) {
    const a = artikelMap[Number(pos.artikelId)] || {
      name: `Artikel #${pos.artikelId}`,
      beschreibung: "",
      artikelnummer: "",
    };
    const name = String(a.name || `Artikel #${pos.artikelId}`);
    const beschreibung = String(a.beschreibung || "").trim() || "-";
    const nrRaw = a.artikelnummer ?? a.artikelNummer ?? "";
    const nr = String(nrRaw || "").trim();
    const menge = Number(pos.menge) || 0;
    const nrDisplay = nr || "-";

    artikelHtml +=
      `<tr>` +
      `<td style="${tdStyle}">${escapeHtml(name)}</td>` +
      `<td style="${tdStyle}">${escapeHtml(beschreibung)}</td>` +
      `<td style="${tdNoWrapStyle}">${escapeHtml(nrDisplay)}</td>` +
      `<td style="${tdRightStyle}">${escapeHtml(String(menge))}</td>` +
      `</tr>`;
    artikelText += `- ${name} | Beschreibung: ${beschreibung} | Artikelnummer: ${nrDisplay} | Stueckzahl: ${menge}\n`;
  }
  artikelHtml += "</tbody></table>";

  return { artikelHtml, artikelText };
};

const ensureArtikelDetailsInDraft = (
  html: string,
  text: string,
  templateSource: string,
  artikelHtml: string,
  artikelText: string,
) => {
  const source = String(templateSource || "");
  const hasArticlePlaceholder =
    source.includes("{{artikel_liste}}") || source.includes("{{artikel_text}}");
  if (hasArticlePlaceholder) {
    return { html, text };
  }

  const htmlWithList =
    `${String(html || "")}` +
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:14px 0;" />` +
    `<div><strong>Artikeldetails</strong></div>` +
    `${artikelHtml}`;
  const textWithList =
    `${String(text || "")}\n\nArtikeldetails:\n${artikelText}`;
  return { html: htmlWithList, text: textWithList };
};

const buildOrderMailDraft = async (id: number) => {
  const { getBestellungById } = await Promise.resolve(
    require("./repositories/bestellungen"),
  );
  const bestellung = await getBestellungById(id);
  if (!bestellung) {
    const err: any = new Error("Bestellung nicht gefunden");
    err.statusCode = 404;
    throw err;
  }

  const db = await Promise.resolve(require("./db"));

  const artikelIds = Array.from(
    new Set((bestellung.positionen || []).map((p: any) => p.artikelId)),
  );
  let artikelRows: any[] = [];
  if (artikelIds.length) {
    const aRes = await db.query(
      "select id, name, beschreibung, artikelnummer from artikel where id = ANY($1)",
      [artikelIds],
    );
    artikelRows = aRes.rows || [];
  }
  const artikelMap: Record<number, any> = {};
  artikelRows.forEach((r) => {
    artikelMap[Number(r.id)] = r;
  });

  const firstPos = Array.isArray(bestellung.positionen)
    ? bestellung.positionen[0]
    : null;
  const lieferantId = firstPos ? Number(firstPos.lieferantId) : NaN;
  let lieferantName = "";
  let lieferantEmail = "";
  let lieferantKundenNummer = "";
  if (Number.isFinite(lieferantId) && lieferantId > 0) {
    const lRes = await db.query(
      "select name, email, kundennummer from lieferanten where id = $1",
      [lieferantId],
    );
    lieferantName = String(lRes.rows?.[0]?.name || "");
    lieferantEmail = String(lRes.rows?.[0]?.email || "");
    lieferantKundenNummer = String(lRes.rows?.[0]?.kundennummer || "").trim();
  }

  const { artikelHtml, artikelText } = buildArtikelListeForMail(
    bestellung.positionen || [],
    artikelMap,
  );

  const replacements: Record<string, string> = {
    "{{bestellnummer}}": String(bestellung.bestellnummer ?? ""),
    "{{datum}}": String(bestellung.bestellDatum ?? ""),
    "{{lieferant}}": lieferantName,
    "{{kundennummer}}": lieferantKundenNummer,
    "{{artikel_liste}}": artikelHtml,
    "{{artikel_text}}": artikelText,
  };

  const settingsRepo = await Promise.resolve(require("./repositories/settings"));
  const subjTemplate =
    (await settingsRepo.getSetting("email_subject")) ||
    `Bestellung ${bestellung.bestellnummer ?? ""}`;
  const bodyTemplate =
    (await settingsRepo.getSetting("email_body")) ||
    `<h2>Bestellung ${bestellung.bestellnummer ?? ""}</h2><p>Datum: ${bestellung.bestellDatum ?? ""}</p>{{artikel_liste}}`;
  const signature = (await settingsRepo.getSetting("email_signature")) || "";

  let subject = subjTemplate;
  let html = bodyTemplate;
  let text = `Bestellung ${bestellung.bestellnummer ?? ""}\nDatum: ${bestellung.bestellDatum ?? ""}\n\n${artikelText}`;
  for (const key of Object.keys(replacements)) {
    const val = replacements[key];
    const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    subject = subject.replace(re, val);
    html = html.replace(re, val);
    text = text.replace(re, val);
  }
  ({ html, text } = ensureArtikelDetailsInDraft(
    html,
    text,
    bodyTemplate,
    artikelHtml,
    artikelText,
  ));
  if (lieferantKundenNummer && !subject.toLowerCase().includes("kundennummer")) {
    subject = `${subject} (Kundennummer: ${lieferantKundenNummer})`;
  }
  if (signature) {
    html += `<div>${signature}</div>`;
    text += `\n${signature}`;
  }

  const fallbackTo = await resolveConfiguredMailRecipient(settingsRepo);
  const to = String(lieferantEmail || "").trim() || String(fallbackTo || "").trim();

  return {
    settingsRepo,
    bestellung,
    to,
    subject,
    html,
    text,
    lieferantName,
    lieferantEmail,
    fallbackTo,
  };
};

const parseNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

const parseString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value.trim() : undefined;
};

const hasDeleteIntent = (req: any): boolean => {
  const rawHeader = String(req.get?.("x-delete-intent") || req.headers?.["x-delete-intent"] || "")
    .trim()
    .toLowerCase();
  if (rawHeader === "true" || rawHeader === "1" || rawHeader === "yes") {
    return true;
  }
  const rawQuery = String(req.query?.delete_intent || "")
    .trim()
    .toLowerCase();
  return rawQuery === "true" || rawQuery === "1" || rawQuery === "yes";
};

const requireDeleteIntent = (req: any, res: any): boolean => {
  if (hasDeleteIntent(req)) {
    return true;
  }
  res.status(400).json({
    error: "Delete-Intent fehlt. Bitte Loeschung explizit bestaetigen.",
  });
  return false;
};

const parseStatus = (value: unknown): BestellungStatus | null => {
  if (
    value === "offen" ||
    value === "bestellt" ||
    value === "teilgeliefert" ||
    value === "geliefert" ||
    value === "teilstorniert" ||
    value === "storniert"
  ) {
    return value as BestellungStatus;
  }
  return null;
};

type BestellungPositionBody = {
  artikelId?: unknown;
  lieferantId?: unknown;
  menge?: unknown;
  geliefertMenge?: unknown;
  storniertMenge?: unknown;
  notiz?: unknown;
};

type BestellungPositionParsed = {
  artikelId: number | null;
  lieferantId: number | null;
  menge: number | null;
  geliefertMenge?: number | null;
  storniertMenge?: number | null;
  notiz?: string;
};

type BestellungPositionValid = {
  artikelId: number;
  lieferantId: number;
  menge: number;
  geliefertMenge: number;
  storniertMenge: number;
  notiz?: string;
};

const parsePositionen = (value: unknown): BestellungPositionValid[] | null => {
  const positionenInput: BestellungPositionBody[] = Array.isArray(value)
    ? value
    : [];

  const positionen = positionenInput
    .map((position: BestellungPositionBody): BestellungPositionParsed => {
      const artikelId = parseInteger(position?.artikelId);
      const lieferantId = parseInteger(position?.lieferantId);
      const menge = parseInteger(position?.menge);
      const geliefertMenge = parseInteger(position?.geliefertMenge);
      const storniertMenge = parseInteger(position?.storniertMenge);
      const notiz = parseString(position?.notiz);
      return {
        artikelId,
        lieferantId,
        menge,
        geliefertMenge,
        storniertMenge,
        notiz,
      };
    })
    .filter(
      (position: BestellungPositionParsed) =>
        position.artikelId &&
        position.lieferantId &&
        position.menge &&
        position.menge > 0,
    )
    .map((position: BestellungPositionParsed) => ({
      artikelId: position.artikelId as number,
      lieferantId: position.lieferantId as number,
      menge: position.menge as number,
      geliefertMenge: position.geliefertMenge ?? 0,
      storniertMenge: position.storniertMenge ?? 0,
      notiz: position.notiz,
    }));

  if (!positionen.length || positionen.length !== positionenInput.length) {
    return null;
  }

  return positionen;
};

const computeDeliveryStatus = (
  positions: BestellungPositionValid[],
  previousStatus: BestellungStatus,
  requestedStatus: BestellungStatus,
): BestellungStatus => {
  const ordered = positions.reduce(
    (sum, p) => sum + Number(p.menge || 0),
    0,
  );
  const delivered = positions.reduce(
    (sum, p) => sum + Number(p.geliefertMenge || 0),
    0,
  );
  const canceled = positions.reduce(
    (sum, p) => sum + Number(p.storniertMenge || 0),
    0,
  );

  if (!ordered) return requestedStatus;

  if (delivered >= ordered && canceled <= 0) return "geliefert";
  if (canceled >= ordered && delivered <= 0) return "storniert";

  // If nothing was delivered/canceled, honor the user's requested status.
  if (delivered <= 0 && canceled <= 0) return requestedStatus;

  const remaining = ordered - delivered - canceled;

  // Noch etwas erwartet: bleibt Teilgeliefert.
  if (remaining > 0) return "teilgeliefert";

  // Erwartung ist komplett weg, aber nicht alles geliefert.
  if (remaining === 0 && canceled > 0 && delivered < ordered) {
    return "teilstorniert";
  }

  if (delivered > 0 && delivered < ordered) return "teilgeliefert";

  return previousStatus;
};

// -----------------------
// Firebase Auth (Login)
// -----------------------
app.post("/api/auth/login", async (req, res) => {
  try {
    if (!firebaseAdminReady) {
      return res.status(503).json({ error: "firebase admin not configured" });
    }

    const idToken =
      typeof req.body?.idToken === "string" ? req.body.idToken : "";
    if (!idToken) return res.status(400).json({ error: "missing idToken" });

    const decoded = await admin.auth().verifyIdToken(idToken);
    const sessionCookie = await admin
      .auth()
      .createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });

    const domain = sessionCookieDomainFromReq(req);
    const secure = sessionCookieSecure(req);
    res.cookie(FB_SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      maxAge: SESSION_MAX_AGE_MS,
      path: "/",
      ...(domain ? { domain } : {}),
    });

    return res.json({ uid: decoded.uid, email: decoded.email || null });
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
});

app.post("/api/auth/logout", async (req, res) => {
  const domain = sessionCookieDomainFromReq(req);
  res.clearCookie(FB_SESSION_COOKIE, {
    path: "/",
    ...(domain ? { domain } : {}),
  });
  return res.status(204).send();
});

app.get("/api/auth/me", requireUserApi, async (req, res) => {
  const u = (req as AuthedRequest).firebaseUser;
  return res.json({
    uid: u?.uid,
    email: u?.email || null,
    role: getUserRole(u),
    claims: u?.claims || {},
  });
});

// -----------------------
// Nutzerverwaltung (Admin)
// -----------------------
app.get("/api/admin/users", requireAdminApi, async (req, res) => {
  try {
    const pageSize = Number(req.query.pageSize || 50);
    const pageToken =
      typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;

    const maxResults = Number.isFinite(pageSize) ? pageSize : 50;
    const result = await admin.auth().listUsers(maxResults, pageToken);

    return res.json({
      users: result.users.map((u) => ({
        uid: u.uid,
        email: u.email || null,
        disabled: u.disabled,
        role:
          isAdminUser(u as any) || (u.customClaims as any)?.role === "admin"
            ? "admin"
            : (u.customClaims as any)?.role === "buero"
              ? "buero"
              : "produktion",
        displayName: u.displayName || null,
        metadata: {
          creationTime: u.metadata?.creationTime || null,
          lastSignInTime: u.metadata?.lastSignInTime || null,
        },
      })),
      pageToken: result.pageToken || null,
    });
  } catch (e: any) {
    return res.status(500).json({ error: "failed to list users", detail: String(e) });
  }
});

app.post("/api/admin/users/:uid/role", requireAdminApi, async (req, res) => {
  try {
    const uid = String(req.params.uid || "");
    const role = String(req.body?.role || "");
    if (!uid || !["admin", "buero", "produktion"].includes(role)) {
      return res.status(400).json({ error: "invalid role payload" });
    }
    await admin.auth().setCustomUserClaims(uid, { role });
    return res.status(204).send();
  } catch (e: any) {
    return res.status(500).json({ error: "failed to set role", detail: String(e) });
  }
});

app.post("/api/admin/users", requireAdminApi, async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
    const displayNameInput =
      typeof req.body?.displayName === "string" ? req.body.displayName.trim() : "";
    const displayName = displayNameInput || toDisplayNameFromEmail(email);
    const password =
      typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }

    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: displayName || undefined,
    });

    return res.status(201).json({
      uid: userRecord.uid,
      email: userRecord.email || null,
      displayName: userRecord.displayName || null,
      disabled: userRecord.disabled,
    });
  } catch (e: any) {
    return res.status(500).json({ error: "failed to create user", detail: String(e) });
  }
});

app.post("/api/admin/users/:uid/disable", requireAdminApi, async (req, res) => {
  try {
    const uid = String(req.params.uid || "");
    await admin.auth().updateUser(uid, { disabled: true });
    return res.status(204).send();
  } catch (e: any) {
    return res.status(500).json({ error: "failed to disable user", detail: String(e) });
  }
});

app.post("/api/admin/users/:uid/enable", requireAdminApi, async (req, res) => {
  try {
    const uid = String(req.params.uid || "");
    await admin.auth().updateUser(uid, { disabled: false });
    return res.status(204).send();
  } catch (e: any) {
    return res.status(500).json({ error: "failed to enable user", detail: String(e) });
  }
});

app.post("/api/admin/users/:uid/delete", requireAdminApi, async (req, res) => {
  if (!requireDeleteIntent(req, res)) return;
  try {
    const uid = String(req.params.uid || "");
    await admin.auth().deleteUser(uid);
    return res.status(204).send();
  } catch (e: any) {
    return res.status(500).json({ error: "failed to delete user", detail: String(e) });
  }
});

// Protect all other /api routes with Firebase Auth cookie.
app.use("/api", (req: any, res: any, next: any) => {
  if (req.path.startsWith("/auth/")) return next();
  if (req.path.startsWith("/admin/")) return next();
  return requireUserApi(req, res, () => {
    const role = getUserRole((req as AuthedRequest).firebaseUser);
    const p = String(req.path || "");
    const m = String(req.method || "GET").toUpperCase();

    if (role === "admin") return next();

    if (role === "buero") {
      // Büro darf alles außer SMTP und Benutzerverwaltung.
      if (p === "/mail/test") {
        return res.status(403).json({ error: "forbidden for role buero" });
      }
      if (p === "/settings" && m === "PUT") {
        const body = req.body || {};
        const forbiddenMailKeys = [
          "mail_host",
          "mail_port",
          "mail_user",
          "mail_pass",
          "mail_from",
          "mail_to",
          "email_subject",
          "email_body",
          "email_signature",
          "email_recipient",
          "reminder_subject",
          "reminder_body",
        ];
        const hasForbiddenKey = forbiddenMailKeys.some(
          (k) => body[k] !== undefined,
        );
        if (hasForbiddenKey) {
          return res
            .status(403)
            .json({ error: "smtp/mail settings forbidden for role buero" });
        }
      }
      return next();
    }

    // produktion: anlegen/ansehen von Bestellungen, Artikeln, Lieferanten.
    // Keine Bestellung auslösen, keine Einstellungen ändern.
    const allow =
      (m === "GET" &&
        (p === "/bestellungen" ||
          p === "/bestellungen/next-number" ||
          p === "/lieferanten" ||
          /^\/lieferanten\/\d+$/.test(p) ||
          /^\/lieferanten\/\d+\/artikel$/.test(p) ||
          /^\/lieferanten\/\d+\/bestellungen$/.test(p) ||
          p === "/artikel" ||
          p === "/dashboard/notes" ||
          p === "/dashboard/chat" ||
          p === "/settings" ||
          p === "/settings/effective")) ||
      (m === "POST" &&
        (p === "/bestellungen" ||
          p === "/lieferanten" ||
          p === "/artikel" ||
          p === "/dashboard/chat")) ||
      (m === "PUT" &&
        (p === "/dashboard/notes" || /^\/lieferanten\/\d+$/.test(p)));

    if (allow) return next();
    return res.status(403).json({ error: "forbidden for role produktion" });
  });
});

app.get("/api/bestellungen", async (req, res) => {
  try {
    const bestellungen = await listBestellungen();
    res.json(bestellungen);
  } catch (error) {
    console.error("Fehler beim Laden der Bestellungen", error);
    res
      .status(500)
      .json({ error: "Bestellungen konnten nicht geladen werden." });
  }
});

app.post("/api/bestellungen", async (req, res) => {
  const status = parseStatus(req.body.status) ?? "offen";
  const actorProfile = await resolveActorProfile(
    (req as AuthedRequest).firebaseUser,
  );
  const bestellDatum =
    typeof req.body.bestellDatum === "string"
      ? req.body.bestellDatum
      : undefined;

  const positionen = parsePositionen(req.body.positionen);
  if (!positionen) {
    res.status(400).json({
      error: "Alle Positionen muessen Artikel, Lieferant und Menge enthalten.",
    });
    return;
  }

  try {
    const positionenNachLieferant = new Map<
      number,
      BestellungPositionValid[]
    >();
    positionen.forEach((position) => {
      const entries = positionenNachLieferant.get(position.lieferantId) ?? [];
      entries.push(position);
      positionenNachLieferant.set(position.lieferantId, entries);
    });

    const bestellungen = [];
    for (const entry of positionenNachLieferant.values()) {
      const bestellung = await createBestellung({
        status,
        bestellDatum,
        createdByUid: actorProfile.uid,
        createdByName: actorProfile.name,
        createdByEmail: actorProfile.email,
        positionen: entry,
      });
      bestellungen.push(bestellung);
    }

    res.status(201).json(bestellungen);
  } catch (error) {
    console.error("Fehler beim Erstellen der Bestellung", error);
    res.status(500).json({ error: "Bestellung konnte nicht erstellt werden." });
  }
});

app.put("/api/bestellungen/:id", async (req, res) => {
  const bestellungId = parseInteger(req.params.id);
  const auftragsBestaetigt = Boolean(req.body?.auftragsBestaetigt === true);
  const actorProfile = await resolveActorProfile(
    (req as AuthedRequest).firebaseUser,
  );
  const bestellDatum =
    typeof req.body.bestellDatum === "string"
      ? req.body.bestellDatum
      : undefined;

  const requestedStatus: BestellungStatus =
    parseStatus(req.body?.status) ?? "offen";

  if (!bestellungId) {
    res.status(400).json({ error: "Ungueltige Bestellungs-ID." });
    return;
  }

  const positionen = parsePositionen(req.body.positionen);
  if (!positionen) {
    res.status(400).json({
      error: "Alle Positionen muessen Artikel, Lieferant und Menge enthalten.",
    });
    return;
  }

  try {
    // prevent editing positions if order is delivered or cancelled
    const db = await Promise.resolve(require("./db"));
    const cur = await db.query(
      "select status from bestellungen where id = $1",
      [bestellungId],
    );
    const curStatus = cur.rows[0]?.status;
    if (
      curStatus === "geliefert" ||
      curStatus === "storniert" ||
      curStatus === "teilstorniert"
    ) {
      res.status(409).json({
        error:
          "Bestellung ist abgeschlossen und kann nicht mehr bearbeitet werden.",
      });
      return;
    }

    const previousStatus: BestellungStatus =
      (curStatus as BestellungStatus) || "offen";

    // determine existing supplier ids for this order
    const existingRows = await db.query(
      "select lieferant_id from bestellpositionen where bestellung_id = $1",
      [bestellungId],
    );
    const existingSupplierIds = new Set<number>();
    for (const r of existingRows.rows) {
      if (r.lieferant_id) existingSupplierIds.add(Number(r.lieferant_id));
    }
    if (!existingSupplierIds.size) {
      // fallback: single-position stored on bestellungen table
      const mainRow = await db.query(
        "select lieferant_id from bestellungen where id = $1 and lieferant_id is not null",
        [bestellungId],
      );
      if (mainRow.rows[0] && mainRow.rows[0].lieferant_id)
        existingSupplierIds.add(Number(mainRow.rows[0].lieferant_id));
    }

    // group incoming positions by supplier
    const bySupplier: Record<number, any[]> = {};
    for (const pos of positionen) {
      const lid = Number(pos.lieferantId);
      if (!bySupplier[lid]) bySupplier[lid] = [];
      bySupplier[lid].push({
        artikelId: Number(pos.artikelId),
        lieferantId: lid,
        menge: Number(pos.menge),
        geliefertMenge: Number(pos.geliefertMenge ?? 0),
        storniertMenge: Number(pos.storniertMenge ?? 0),
        notiz: pos.notiz,
      });
    }

    // positions to keep on the original order (suppliers that were already present)
    const positionsForOriginal: any[] = [];
    // new suppliers -> create separate orders
    const { createBestellung } = await Promise.resolve(
      require("./repositories/bestellungen"),
    );
    for (const [lidStr, poses] of Object.entries(bySupplier)) {
      const lid = Number(lidStr);
      if (existingSupplierIds.has(lid)) {
        positionsForOriginal.push(...poses);
      } else {
        // create a new order for this supplier
        try {
          const computedStatusForNew =
            computeDeliveryStatus(
              poses as BestellungPositionValid[],
              previousStatus,
              requestedStatus,
            );
          await createBestellung({
            status: computedStatusForNew,
            bestellDatum,
            createdByUid: actorProfile.uid,
            createdByName: actorProfile.name,
            createdByEmail: actorProfile.email,
            positionen: poses,
            auftragsBestaetigt,
          });
        } catch (e) {
          console.error(
            "Fehler beim Erstellen der neuen Bestellung fuer Lieferant",
            lid,
            e,
          );
          res
            .status(500)
            .json({ error: "Fehler beim Anlegen neuer Bestellung(en)" });
          return;
        }
      }
    }

    if (positionsForOriginal.length) {
      const computedStatusForOriginal = computeDeliveryStatus(
        positionsForOriginal as BestellungPositionValid[],
        previousStatus,
        requestedStatus,
      );
      const bestellung = await updateBestellung(bestellungId, {
        status: computedStatusForOriginal,
        bestellDatum,
        positionen: positionsForOriginal,
        auftragsBestaetigt,
      });
      res.json(bestellung);
      return;
    } else {
      // no positions left for original order -> delete it
      try {
        await deleteBestellung(bestellungId);
        res.json({ deleted: true });
        return;
      } catch (e) {
        console.error("Fehler beim Loeschen leerer Bestellung", e);
        res.status(500).json({ error: "Fehler beim Loeschen der Bestellung" });
        return;
      }
    }
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Bestellung", error);
    res
      .status(500)
      .json({ error: "Bestellung konnte nicht aktualisiert werden." });
  }
});

// change status only (allows changing status even when positions are locked)
app.put("/api/bestellungen/:id/status", express.json(), async (req, res) => {
  const id = parseInteger(req.params.id);
  const status = parseStatus(req.body?.status);
  const auftragsBestaetigt =
    typeof req.body?.auftragsBestaetigt === "boolean"
      ? req.body.auftragsBestaetigt
      : undefined;
  if (!id || !status) {
    res.status(400).json({ error: "ungueltige anfrage" });
    return;
  }
  try {
    const db = await Promise.resolve(require("./db"));
    const cur = await db.query(
      "select status from bestellungen where id = $1",
      [id],
    );
    if (!cur.rows.length) {
      res.status(404).json({ error: "Bestellung nicht gefunden" });
      return;
    }
    const curStatus = cur.rows[0].status;

    // simple transition rules: delivered is final except it can be set to 'storniert'
    if (curStatus === "geliefert" && status !== "storniert") {
      res.status(409).json({
        error: "Gelieferte Bestellungen koennen nur storniert werden.",
      });
      return;
    }

    if (auftragsBestaetigt !== undefined) {
      await db.query(
        "update bestellungen set status = $1, auftrags_bestaetigt = $2 where id = $3",
        [status, auftragsBestaetigt, id],
      );
    } else {
      await db.query("update bestellungen set status = $1 where id = $2", [
        status,
        id,
      ]);
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
});

// Test SMTP connection (used by settings UI)
app.post("/api/mail/test", express.json(), async (req, res) => {
  try {
    // build effective SMTP config from DB settings + env
    const settings = await Promise.resolve(require("./repositories/settings"));
    const dbSettings = await settings.listSettings();
    const cfg: any = {};
    cfg.host =
      dbSettings.mail_host ||
      process.env.MAIL_HOST ||
      process.env.SMTP_HOST ||
      null;
    cfg.port =
      dbSettings.mail_port ||
      process.env.MAIL_PORT ||
      process.env.SMTP_PORT ||
      null;
    cfg.user =
      dbSettings.mail_user ||
      process.env.MAIL_USER ||
      process.env.SMTP_USER ||
      null;
    cfg.pass =
      dbSettings.mail_pass ||
      process.env.MAIL_PASS ||
      process.env.SMTP_PASS ||
      null;
    cfg.from =
      dbSettings.mail_from || process.env.MAIL_FROM || cfg.user || null;

    const result = await testSmtpConnection(cfg);
    if (result.ok) {
      res.json({ ok: true, message: "SMTP Verbindung OK", used: result.used });
    } else {
      res.status(502).json({
        ok: false,
        error: String(result.error || "unknown"),
        used: result.used,
      });
    }
  } catch (err) {
    console.error("SMTP test error", err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.delete("/api/bestellungen/:id", async (req, res) => {
  if (!requireDeleteIntent(req, res)) return;
  const bestellungId = parseInteger(req.params.id);

  if (!bestellungId) {
    res.status(400).json({ error: "Ungueltige Bestellungs-ID." });
    return;
  }

  try {
    await deleteBestellung(bestellungId);
    res.status(204).send();
  } catch (error) {
    console.error("Fehler beim Loeschen der Bestellung", error);
    res
      .status(500)
      .json({ error: "Bestellung konnte nicht geloescht werden." });
  }
});

app.get("/api/lieferanten", async (req, res) => {
  try {
    const lieferanten = await listLieferanten();
    res.json(lieferanten);
  } catch (error) {
    console.error("Fehler beim Laden der Lieferanten", error);
    res
      .status(500)
      .json({ error: "Lieferanten konnten nicht geladen werden." });
  }
});

app.post("/api/lieferanten", async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const kundenNummer = parseString(req.body.kundenNummer);
  const kontaktPerson =
    typeof req.body.kontaktPerson === "string"
      ? req.body.kontaktPerson.trim()
      : undefined;
  const email =
    typeof req.body.email === "string" ? req.body.email.trim() : undefined;
  const telefon =
    typeof req.body.telefon === "string" ? req.body.telefon.trim() : undefined;
  const strasse = parseString(req.body.strasse);
  const plz = parseString(req.body.plz);
  const stadt = parseString(req.body.stadt);
  const land = parseString(req.body.land);

  if (!name) {
    res.status(400).json({ error: "name ist ein Pflichtfeld." });
    return;
  }

  try {
    const lieferant = await createLieferant({
      name,
      kundenNummer,
      kontaktPerson,
      email,
      telefon,
      strasse,
      plz,
      stadt,
      land,
    });
    res.status(201).json(lieferant);
  } catch (error) {
    console.error("Fehler beim Erstellen des Lieferanten", error);
    res.status(500).json({ error: "Lieferant konnte nicht erstellt werden." });
  }
});

app.get("/api/lieferanten/:id", async (req, res) => {
  const lieferantId = parseInteger(req.params.id);

  if (!lieferantId) {
    res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
    return;
  }

  try {
    const lieferant = await getLieferantById(lieferantId);
    if (!lieferant) {
      res.status(404).json({ error: "Lieferant nicht gefunden." });
      return;
    }

    res.json(lieferant);
  } catch (error) {
    console.error("Fehler beim Laden des Lieferanten", error);
    res.status(500).json({ error: "Lieferant konnte nicht geladen werden." });
  }
});

app.put("/api/lieferanten/:id", async (req, res) => {
  const lieferantId = parseInteger(req.params.id);
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const kundenNummer = parseString(req.body.kundenNummer);
  const kontaktPerson = parseString(req.body.kontaktPerson);
  const email = parseString(req.body.email);
  const telefon = parseString(req.body.telefon);
  const strasse = parseString(req.body.strasse);
  const plz = parseString(req.body.plz);
  const stadt = parseString(req.body.stadt);
  const land = parseString(req.body.land);

  if (!lieferantId) {
    res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
    return;
  }

  if (!name) {
    res.status(400).json({ error: "name ist ein Pflichtfeld." });
    return;
  }

  try {
    const lieferant = await updateLieferant(lieferantId, {
      name,
      kundenNummer,
      kontaktPerson,
      email,
      telefon,
      strasse,
      plz,
      stadt,
      land,
    });

    if (!lieferant) {
      res.status(404).json({ error: "Lieferant nicht gefunden." });
      return;
    }

    res.json(lieferant);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Lieferanten", error);
    res
      .status(500)
      .json({ error: "Lieferant konnte nicht aktualisiert werden." });
  }
});

app.delete("/api/lieferanten/:id", async (req, res) => {
  if (!requireDeleteIntent(req, res)) return;
  const lieferantId = parseInteger(req.params.id);

  if (!lieferantId) {
    res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
    return;
  }

  try {
    const deleted = await deleteLieferant(lieferantId);
    if (!deleted) {
      res.status(404).json({ error: "Lieferant nicht gefunden." });
      return;
    }

    res.status(204).send();
  } catch (error) {
    const err = error as { code?: string };
    if (err && err.code === "23503") {
      res.status(409).json({ error: "Lieferant ist noch referenziert." });
      return;
    }

    console.error("Fehler beim Loeschen des Lieferanten", error);
    res.status(500).json({ error: "Lieferant konnte nicht geloescht werden." });
  }
});

app.get("/api/lieferanten/:id/artikel", async (req, res) => {
  const lieferantId = parseInteger(req.params.id);

  if (!lieferantId) {
    res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
    return;
  }

  try {
    const artikel = await listLieferantArtikel(lieferantId);
    res.json(artikel);
  } catch (error) {
    console.error("Fehler beim Laden der Lieferanten-Artikel", error);
    res.status(500).json({ error: "Artikel konnten nicht geladen werden." });
  }
});

app.get("/api/lieferanten/:id/bestellungen", async (req, res) => {
  const lieferantId = parseInteger(req.params.id);

  if (!lieferantId) {
    res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
    return;
  }

  try {
    const bestellungen = await listLieferantBestellungen(lieferantId);
    res.json(bestellungen);
  } catch (error) {
    console.error("Fehler beim Laden des Bestellverlaufs", error);
    res
      .status(500)
      .json({ error: "Bestellverlauf konnte nicht geladen werden." });
  }
});

app.get("/api/artikel", async (req, res) => {
  try {
    const artikel = await listArtikel();
    res.json(artikel);
  } catch (error) {
    console.error("Fehler beim Laden der Artikel", error);
    res.status(500).json({ error: "Artikel konnten nicht geladen werden." });
  }
});

app.post("/api/artikel", async (req, res) => {
  const lieferantId = parseInteger(req.body.lieferantId);
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const beschreibung =
    typeof req.body.beschreibung === "string"
      ? req.body.beschreibung.trim()
      : undefined;
  const artikelnummer =
    typeof req.body.artikelnummer === "string"
      ? req.body.artikelnummer.trim()
      : undefined;
  const einheit =
    typeof req.body.einheit === "string" ? req.body.einheit.trim() : undefined;
  const verpackungseinheit =
    typeof req.body.verpackungseinheit === "string"
      ? req.body.verpackungseinheit.trim()
      : undefined;
  const standardBestellwert = parseInteger(req.body.standardBestellwert);
  const fotoUrl =
    typeof req.body.fotoUrl === "string" ? req.body.fotoUrl.trim() : undefined;
  const preis = parseNumber(req.body.preis);

  if (!lieferantId || !name || preis === null || preis < 0) {
    res.status(400).json({
      error: "lieferant, artikelbezeichnung und preis sind Pflichtfelder.",
    });
    return;
  }
  if (standardBestellwert !== null && standardBestellwert < 1) {
    res
      .status(400)
      .json({ error: "standardBestellwert muss 1 oder groesser sein." });
    return;
  }

  try {
    const artikel = await createArtikel({
      lieferantId,
      name,
      beschreibung,
      artikelnummer,
      einheit,
      verpackungseinheit,
      standardBestellwert: standardBestellwert ?? undefined,
      fotoUrl,
      preis,
    });
    res.status(201).json(artikel);
  } catch (error) {
    console.error("Fehler beim Erstellen des Artikels", error);
    res.status(500).json({ error: "Artikel konnte nicht erstellt werden." });
  }
});

app.put("/api/artikel/:id", async (req, res) => {
  const artikelId = parseInteger(req.params.id);
  const lieferantId = parseInteger(req.body.lieferantId);
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const beschreibung =
    typeof req.body.beschreibung === "string"
      ? req.body.beschreibung.trim()
      : undefined;
  const artikelnummer =
    typeof req.body.artikelnummer === "string"
      ? req.body.artikelnummer.trim()
      : undefined;
  const einheit =
    typeof req.body.einheit === "string" ? req.body.einheit.trim() : undefined;
  const verpackungseinheit =
    typeof req.body.verpackungseinheit === "string"
      ? req.body.verpackungseinheit.trim()
      : undefined;
  const standardBestellwert = parseInteger(req.body.standardBestellwert);
  const fotoUrl =
    typeof req.body.fotoUrl === "string" ? req.body.fotoUrl.trim() : undefined;
  const preis = parseNumber(req.body.preis);

  if (!artikelId) {
    res.status(400).json({ error: "Ungueltige Artikel-ID." });
    return;
  }

  if (!lieferantId || !name || preis === null) {
    res.status(400).json({
      error: "Lieferant, Artikelbezeichnung und Preis sind Pflichtfelder.",
    });
    return;
  }
  if (standardBestellwert !== null && standardBestellwert < 1) {
    res
      .status(400)
      .json({ error: "standardBestellwert muss 1 oder groesser sein." });
    return;
  }

  try {
    const artikel = await updateArtikel(artikelId, {
      lieferantId,
      name,
      beschreibung,
      artikelnummer,
      einheit,
      verpackungseinheit,
      standardBestellwert: standardBestellwert ?? undefined,
      fotoUrl,
      preis,
    });

    if (!artikel) {
      res.status(404).json({ error: "Artikel nicht gefunden." });
      return;
    }

    res.json(artikel);
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Artikels", error);
    res
      .status(500)
      .json({ error: "Artikel konnte nicht aktualisiert werden." });
  }
});

app.delete("/api/artikel/:id", async (req, res) => {
  if (!requireDeleteIntent(req, res)) return;
  const artikelId = parseInteger(req.params.id);

  if (!artikelId) {
    res.status(400).json({ error: "Ungueltige Artikel-ID." });
    return;
  }

  try {
    const deleted = await deleteArtikel(artikelId);
    if (!deleted) {
      res.status(404).json({ error: "Artikel nicht gefunden." });
      return;
    }

    res.status(204).send();
  } catch (error) {
    const err = error as { code?: string };
    if (err && err.code === "23503") {
      res.status(409).json({ error: "Artikel ist noch referenziert." });
      return;
    }

    console.error("Fehler beim Loeschen des Artikels", error);
    res.status(500).json({ error: "Artikel konnte nicht geloescht werden." });
  }
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "login.html"));
});

app.get("/uebersicht", requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "uebersicht.html"));
});

app.get("/bestellungen", requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "bestellungen.html"));
});

app.get("/einstellungen", requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "einstellungen.html"));
});

app.get("/bestellung-neu", requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "bestellung-neu.html"));
});

app.get("/nutzerverwaltung", requireAdminPage, (req, res) => {
  res.redirect("/einstellungen");
});
app.get("/api/settings", async (req, res) => {
  try {
    const { listSettings } = await Promise.resolve(
      require("./repositories/settings"),
    );
    const settings = await listSettings();
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
});

// Return effective settings (DB + environment overrides) for frontend display
app.get("/api/settings/effective", async (req, res) => {
  try {
    const { listSettings } = await Promise.resolve(
      require("./repositories/settings"),
    );
    const dbSettings = await listSettings();
    const effective: Record<string, any> = { ...dbSettings };
    // overlay common MAIL_* env vars if not set in DB
    const envMap: Record<string, any> = {
      mail_host: process.env.MAIL_HOST || process.env.SMTP_HOST || null,
      mail_port: process.env.MAIL_PORT || process.env.SMTP_PORT || null,
      mail_user: process.env.MAIL_USER || process.env.SMTP_USER || null,
      mail_from: process.env.MAIL_FROM || null,
      mail_to: process.env.MAIL_TO || null,
    };
    Object.keys(envMap).forEach((k) => {
      if (!effective[k] && envMap[k] !== null) effective[k] = String(envMap[k]);
    });
    res.json(effective);
  } catch (err) {
    console.error("effective settings error", err);
    res.status(500).json({ error: "error" });
  }
});

// Dashboard notes endpoints: persist simple notes in settings table
app.get("/api/dashboard/notes", async (req, res) => {
  try {
    const settingsRepo = await Promise.resolve(
      require("./repositories/settings"),
    );
    const notesRaw = await settingsRepo.getSetting("dashboard_notes");
    // normalize legacy empty-string value to JSON array in DB
    if (notesRaw === "") {
      try {
        await settingsRepo.setSetting("dashboard_notes", "[]");
      } catch (e) {
        /* ignore */
      }
    }
    let notesArr: any[] = [];
    if (notesRaw) {
      try {
        const parsed = JSON.parse(notesRaw);
        if (Array.isArray(parsed)) notesArr = parsed;
      } catch (e) {
        // fallback: treat raw string as single note
        notesArr = [
          {
            id: Date.now(),
            text: String(notesRaw),
            done: false,
            createdAt: new Date().toISOString(),
          },
        ];
      }
    }
    res.json({ notes: notesArr });
  } catch (err) {
    console.error("Error loading dashboard notes", err);
    res.status(500).json({ error: "Konnte Notizen nicht laden" });
  }
});

app.put("/api/dashboard/notes", express.json(), async (req, res) => {
  try {
    const settingsRepo = await Promise.resolve(
      require("./repositories/settings"),
    );
    // Accept either a single new note via { note: 'text' }
    // or a full replacement via { notes: [...] }
    if (Array.isArray(req.body?.notes)) {
      const notesArr = req.body.notes;
      await settingsRepo.setSetting(
        "dashboard_notes",
        JSON.stringify(notesArr),
      );
      res.status(204).send();
      return;
    }

    if (typeof req.body?.note === "string" && req.body.note.trim()) {
      const noteText = req.body.note.trim();
      const existingRaw = await settingsRepo.getSetting("dashboard_notes");
      let notesArr: any[] = [];
      if (existingRaw) {
        try {
          const parsed = JSON.parse(existingRaw);
          if (Array.isArray(parsed)) notesArr = parsed;
        } catch (e) {}
      }
      const newNote = {
        id: Date.now(),
        text: noteText,
        done: false,
        createdAt: new Date().toISOString(),
      };
      notesArr.unshift(newNote);
      await settingsRepo.setSetting(
        "dashboard_notes",
        JSON.stringify(notesArr),
      );
      res.status(201).json(newNote);
      return;
    }

    res.status(400).json({ error: "ungueltige anfrage" });
  } catch (err) {
    console.error("Error saving dashboard notes", err);
    res.status(500).json({ error: "Konnte Notizen nicht speichern" });
  }
});

// Dashboard chat endpoints: simple shared chat persisted in settings table
app.get("/api/dashboard/chat", async (req, res) => {
  try {
    const settingsRepo = await Promise.resolve(
      require("./repositories/settings"),
    );
    const raw = await settingsRepo.getSetting("dashboard_chat");
    let messages: any[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) messages = parsed;
      } catch {
        messages = [];
      }
    }
    res.json({ messages });
  } catch (err) {
    console.error("Error loading dashboard chat", err);
    res.status(500).json({ error: "Konnte Chat nicht laden" });
  }
});

app.post("/api/dashboard/chat", express.json(), async (req, res) => {
  try {
    const text =
      typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({ error: "text required" });
      return;
    }

    const settingsRepo = await Promise.resolve(
      require("./repositories/settings"),
    );
    const raw = await settingsRepo.getSetting("dashboard_chat");
    let messages: any[] = [];
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) messages = parsed;
      } catch {}
    }

    const actor = await resolveActorProfile((req as AuthedRequest).firebaseUser);
    const msg = {
      id: Date.now(),
      text: text.slice(0, 2000),
      author: actor.name || actor.email || actor.uid || "Unbekannt",
      authorUid: actor.uid || null,
      createdAt: new Date().toISOString(),
    };
    messages.unshift(msg);
    if (messages.length > 200) messages = messages.slice(0, 200);

    await settingsRepo.setSetting("dashboard_chat", JSON.stringify(messages));
    res.status(201).json(msg);
  } catch (err) {
    console.error("Error saving dashboard chat", err);
    res.status(500).json({ error: "Konnte Chat nicht speichern" });
  }
});

app.put("/api/settings", express.json(), async (req, res) => {
  try {
    const settingsRepo = await Promise.resolve(
      require("./repositories/settings"),
    );
    const body = req.body || {};
    if (body.bestellnummer_prefix !== undefined) {
      await settingsRepo.setSetting(
        "bestellnummer_prefix",
        String(body.bestellnummer_prefix),
      );
    }
    if (body.bestellnummer_seq_digits !== undefined) {
      await settingsRepo.setSetting(
        "bestellnummer_seq_digits",
        String(body.bestellnummer_seq_digits),
      );
    }

    // SMTP / Mail settings and templates
    if (body.mail_host !== undefined)
      await settingsRepo.setSetting("mail_host", String(body.mail_host));
    if (body.mail_port !== undefined)
      await settingsRepo.setSetting("mail_port", String(body.mail_port));
    if (body.mail_user !== undefined)
      await settingsRepo.setSetting("mail_user", String(body.mail_user));
    if (body.mail_pass !== undefined)
      await settingsRepo.setSetting("mail_pass", String(body.mail_pass));
    if (body.mail_from !== undefined)
      await settingsRepo.setSetting("mail_from", String(body.mail_from));
    if (body.mail_to !== undefined)
      await settingsRepo.setSetting("mail_to", String(body.mail_to));

    if (body.email_subject !== undefined)
      await settingsRepo.setSetting(
        "email_subject",
        String(body.email_subject),
      );
    if (body.email_body !== undefined)
      await settingsRepo.setSetting("email_body", String(body.email_body));
    if (body.email_signature !== undefined)
      await settingsRepo.setSetting(
        "email_signature",
        String(body.email_signature),
      );
    if (body.email_recipient !== undefined)
      await settingsRepo.setSetting(
        "email_recipient",
        String(body.email_recipient),
      );

    // Reminder templates (separate from order templates)
    if (body.reminder_subject !== undefined)
      await settingsRepo.setSetting(
        "reminder_subject",
        String(body.reminder_subject),
      );
    if (body.reminder_body !== undefined)
      await settingsRepo.setSetting("reminder_body", String(body.reminder_body));

    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
});

app.put(
  "/api/settings/sequence",
  express.json(),
  requireAdminApi,
  async (req, res) => {
    try {
      const settingsRepo = await Promise.resolve(
        require("./repositories/settings"),
      );
      const db = await Promise.resolve(require("./db"));

      const prefixSetting = await settingsRepo.getSetting(
        "bestellnummer_prefix",
      );
      const seqDigitsSetting = await settingsRepo.getSetting(
        "bestellnummer_seq_digits",
      );

      if (!prefixSetting || !seqDigitsSetting) {
        res
          .status(400)
          .json({ error: "Prefix oder Anzahl Ziffern nicht konfiguriert." });
        return;
      }

      const prefix = String(prefixSetting);
      const seqDigits = Number(seqDigitsSetting);
      const lastDigits = Number(req.body?.lastDigits);
      if (
        !Number.isInteger(lastDigits) ||
        lastDigits < 0 ||
        lastDigits >= Math.pow(10, seqDigits)
      ) {
        res.status(400).json({ error: "ungueltige lastDigits" });
        return;
      }

      const multiplier = Math.pow(10, seqDigits);
      const lower = Number(prefix) * multiplier;
      const upper = (Number(prefix) + 1) * multiplier - 1;

      // we store the full next number; choose next = prefix*multiplier + lastDigits + 1
      const desiredNext = Number(prefix) * multiplier + lastDigits + 1;

      const maxRes = await db.query(
        "select max(bestellnummer) as mx from bestellungen where bestellnummer between $1 and $2",
        [lower, upper],
      );
      const mx = maxRes.rows[0]?.mx ?? null;
      if (mx && Number(mx) >= desiredNext) {
        res.status(400).json({
          error:
            "Gewuenschte Zahl ist kleiner oder gleich bestehender Maximalnummer.",
        });
        return;
      }

      const overrideKey = `bestellnummer_next_${prefix}`;
      await settingsRepo.setSetting(overrideKey, String(desiredNext));
      res.status(204).send();
    } catch (error) {
      console.error(error);
      res.status(500).send("error");
    }
  },
);

app.get("/api/bestellungen/next-number", async (req, res) => {
  try {
    const { getNextBestellnummer } = await Promise.resolve(
      require("./repositories/bestellungen"),
    );
    const date = req.query.date ? String(req.query.date) : undefined;
    const next = await getNextBestellnummer(date);
    res.json({ next });
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
});

// Export endpoint (JSON or CSV)
app.get("/api/export/:entity", requireAdminApi, async (req, res) => {
  const entity = String(req.params.entity || "").toLowerCase();
  const format = String(req.query.format || "json").toLowerCase();
  try {
    let items: any[] = [];
    if (entity === "lieferanten") {
      const { listLieferanten } = await Promise.resolve(
        require("./repositories/lieferanten"),
      );
      items = await listLieferanten();
    } else if (entity === "artikel") {
      const { listArtikel } = await Promise.resolve(
        require("./repositories/artikel"),
      );
      items = await listArtikel();
    } else if (entity === "bestellungen") {
      const { listBestellungen } = await Promise.resolve(
        require("./repositories/bestellungen"),
      );
      items = await listBestellungen();
    } else if (entity === "settings") {
      const { listSettings } = await Promise.resolve(
        require("./repositories/settings"),
      );
      items = await listSettings();
    } else {
      res.status(404).json({ error: "unknown entity" });
      return;
    }

    if (format === "csv") {
      // simple CSV serialization
      const escapeCsv = (v: any) => {
        if (v === null || v === undefined) return "";
        const s = String(v);
        if (s.includes(",") || s.includes('"') || s.includes("\n")) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      };

      // special-case settings: listSettings returns an object map
      if (entity === "settings" && items && !Array.isArray(items)) {
        const rows = ["key,value"];
        for (const [k, v] of Object.entries(items)) {
          rows.push(`${escapeCsv(k)},${escapeCsv(v)}`);
        }
        const csv = rows.join("\n");
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${entity}.csv"`,
        );
        res.send(csv);
        return;
      }

      const headerKeys =
        Array.isArray(items) && items.length ? Object.keys(items[0]) : [];
      const rows = [headerKeys.join(",")];
      for (const it of Array.isArray(items) ? items : []) {
        const vals = headerKeys.map((k) => escapeCsv(it[k]));
        rows.push(vals.join(","));
      }
      const csv = rows.join("\n");
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${entity}.csv"`,
      );
      res.send(csv);
      return;
    }

    res.json(items);
  } catch (error) {
    const errAny = error as any;
    console.error("Export error", errAny && (errAny.stack || errAny));
    res.status(500).json({
      error: "Export fehlgeschlagen",
      detail: String(errAny && (errAny.stack || errAny)).slice(0, 1000),
    });
  }
});

// One-click backup: return combined JSON of main entities
app.get("/api/backup", requireAdminApi, async (req, res) => {
  try {
    const [
      { listLieferanten },
      { listArtikel },
      { listBestellungen },
      { listSettings },
    ] = await Promise.all([
      Promise.resolve(require("./repositories/lieferanten")),
      Promise.resolve(require("./repositories/artikel")),
      Promise.resolve(require("./repositories/bestellungen")),
      Promise.resolve(require("./repositories/settings")),
    ]);

    const [lieferanten, artikel, bestellungen, settings] = await Promise.all([
      listLieferanten(),
      listArtikel(),
      listBestellungen(),
      listSettings(),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      lieferanten,
      artikel,
      bestellungen,
      settings,
    });
  } catch (error) {
    console.error("Backup error", error);
    res.status(500).json({ error: "Backup fehlgeschlagen" });
  }
});

const normText = (v: unknown): string =>
  String(v ?? "")
    .trim()
    .toLowerCase();

const nonEmptyOrNull = (v: unknown): string | null => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

type ImportStats = { created: number; updated: number; skipped: number };

const upsertLieferantByName = async (
  db: any,
  item: any,
): Promise<{ id: number; action: "created" | "updated" | "skipped" }> => {
  const name = nonEmptyOrNull(item?.name);
  if (!name) return { id: 0, action: "skipped" };

  const existing = await db.query(
    "select id from lieferanten where lower(trim(name)) = lower(trim($1)) limit 1",
    [name],
  );
  const kontakt = nonEmptyOrNull(item?.kontaktPerson ?? item?.kontakt_person);
  const email = nonEmptyOrNull(item?.email);
  const telefon = nonEmptyOrNull(item?.telefon);
  const strasse = nonEmptyOrNull(item?.strasse);
  const plz = nonEmptyOrNull(item?.plz);
  const stadt = nonEmptyOrNull(item?.stadt);
  const land = nonEmptyOrNull(item?.land);

  if (existing.rows[0]?.id) {
    const id = Number(existing.rows[0].id);
    const updated = await db.query(
      `update lieferanten
          set kontakt_person = coalesce($2, kontakt_person),
              email = coalesce($3, email),
              telefon = coalesce($4, telefon),
              strasse = coalesce($5, strasse),
              plz = coalesce($6, plz),
              stadt = coalesce($7, stadt),
              land = coalesce($8, land)
        where id = $1`,
      [id, kontakt, email, telefon, strasse, plz, stadt, land],
    );
    return {
      id,
      action: (updated.rowCount ?? 0) > 0 ? "updated" : "skipped",
    };
  }

  const inserted = await db.query(
    `insert into lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id`,
    [name, kontakt, email, telefon, strasse, plz, stadt, land],
  );
  return { id: Number(inserted.rows[0].id), action: "created" };
};

const upsertArtikelForLieferant = async (
  db: any,
  lieferantId: number,
  item: any,
): Promise<{ id: number; action: "created" | "updated" | "skipped" }> => {
  const name = nonEmptyOrNull(item?.name);
  const preisNum = Number(item?.preis);
  if (!lieferantId || !name || !Number.isFinite(preisNum)) {
    return { id: 0, action: "skipped" };
  }
  const artikelnummer = nonEmptyOrNull(item?.artikelnummer);

  let existing: any = { rows: [] };
  if (artikelnummer) {
    existing = await db.query(
      `select id from artikel
        where lieferant_id = $1
          and lower(trim(coalesce(artikelnummer,''))) = lower(trim($2))
        limit 1`,
      [lieferantId, artikelnummer],
    );
  }
  if (!existing.rows[0]?.id) {
    existing = await db.query(
      `select id from artikel
        where lieferant_id = $1
          and lower(trim(name)) = lower(trim($2))
        limit 1`,
      [lieferantId, name],
    );
  }

  const beschreibung = nonEmptyOrNull(item?.beschreibung);
  const einheit = nonEmptyOrNull(item?.einheit);
  const ve = nonEmptyOrNull(item?.verpackungseinheit);
  const standardBestellwertRaw = Number(item?.standardBestellwert);
  const standardBestellwert = Number.isFinite(standardBestellwertRaw)
    ? Math.max(1, Math.trunc(standardBestellwertRaw))
    : null;
  const fotoUrl = nonEmptyOrNull(item?.fotoUrl ?? item?.foto_url);

  if (existing.rows[0]?.id) {
    const id = Number(existing.rows[0].id);
    const updated = await db.query(
      `update artikel
          set name = $2,
              beschreibung = coalesce($3, beschreibung),
              artikelnummer = coalesce($4, artikelnummer),
              einheit = coalesce($5, einheit),
              verpackungseinheit = coalesce($6, verpackungseinheit),
              standard_bestellwert = coalesce($7, standard_bestellwert),
              foto_url = coalesce($8, foto_url),
              preis = $9
        where id = $1`,
      [
        id,
        name,
        beschreibung,
        artikelnummer,
        einheit,
        ve,
        standardBestellwert,
        fotoUrl,
        preisNum,
      ],
    );
    return {
      id,
      action: (updated.rowCount ?? 0) > 0 ? "updated" : "skipped",
    };
  }

  const inserted = await db.query(
    `insert into artikel
      (lieferant_id, name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert, foto_url, preis)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`,
    [
      lieferantId,
      name,
      beschreibung,
      artikelnummer,
      einheit,
      ve,
      standardBestellwert,
      fotoUrl,
      preisNum,
    ],
  );
  return { id: Number(inserted.rows[0].id), action: "created" };
};

app.post("/api/import/catalog", requireAdminApi, express.json(), async (req, res) => {
  try {
    const db = await Promise.resolve(require("./db"));
    const lieferanten = Array.isArray(req.body?.lieferanten)
      ? req.body.lieferanten
      : [];
    const artikel = Array.isArray(req.body?.artikel) ? req.body.artikel : [];

    const lieferantenStats: ImportStats = { created: 0, updated: 0, skipped: 0 };
    const lieferantenIdMap = new Map<number, number>();
    const lieferantenNameMap = new Map<string, number>();
    for (const l of lieferanten) {
      const out = await upsertLieferantByName(db, l);
      if (Number.isFinite(Number(l?.id)) && out.id) {
        lieferantenIdMap.set(Number(l.id), out.id);
      }
      if (l?.name && out.id) {
        lieferantenNameMap.set(normText(l.name), out.id);
      }
      if (out.action === "created") lieferantenStats.created++;
      else if (out.action === "updated") lieferantenStats.updated++;
      else lieferantenStats.skipped++;
    }

    const artikelStats: ImportStats = { created: 0, updated: 0, skipped: 0 };
    for (const a of artikel) {
      let lid = Number(a?.lieferantId ?? a?.lieferant_id ?? 0);
      if (lieferantenIdMap.has(lid)) lid = Number(lieferantenIdMap.get(lid));
      if (!lid && a?.lieferantName) {
        lid = Number(lieferantenNameMap.get(normText(a.lieferantName)) || 0);
      }
      const out = await upsertArtikelForLieferant(db, lid, a);
      if (out.action === "created") artikelStats.created++;
      else if (out.action === "updated") artikelStats.updated++;
      else artikelStats.skipped++;
    }

    res.json({ success: true, lieferantenStats, artikelStats });
  } catch (error) {
    console.error("Import catalog error", error);
    res.status(500).json({ error: "Katalog-Import fehlgeschlagen" });
  }
});

app.post("/api/backup/restore", requireAdminApi, express.json(), async (req, res) => {
  try {
    const backup = req.body || {};
    const db = await Promise.resolve(require("./db"));
    const lieferanten = Array.isArray(backup.lieferanten) ? backup.lieferanten : [];
    const artikel = Array.isArray(backup.artikel) ? backup.artikel : [];
    const bestellungen = Array.isArray(backup.bestellungen)
      ? backup.bestellungen
      : [];
    const settings = backup.settings && typeof backup.settings === "object"
      ? backup.settings
      : {};

    const lieferantenIdMap = new Map<number, number>();
    const lieferantenNameMap = new Map<string, number>();
    const lieferantenStats: ImportStats = { created: 0, updated: 0, skipped: 0 };
    for (const l of lieferanten) {
      const out = await upsertLieferantByName(db, l);
      if (Number.isFinite(Number(l?.id)) && out.id) {
        lieferantenIdMap.set(Number(l.id), out.id);
      }
      if (l?.name && out.id) {
        lieferantenNameMap.set(normText(l.name), out.id);
      }
      if (out.action === "created") lieferantenStats.created++;
      else if (out.action === "updated") lieferantenStats.updated++;
      else lieferantenStats.skipped++;
    }

    const artikelIdMap = new Map<number, number>();
    const artikelStats: ImportStats = { created: 0, updated: 0, skipped: 0 };
    for (const a of artikel) {
      let lid = Number(a?.lieferantId ?? a?.lieferant_id ?? 0);
      if (lieferantenIdMap.has(lid)) lid = Number(lieferantenIdMap.get(lid));
      if (!lid && a?.lieferantName) {
        lid = Number(lieferantenNameMap.get(normText(a.lieferantName)) || 0);
      }
      const out = await upsertArtikelForLieferant(db, lid, a);
      if (Number.isFinite(Number(a?.id)) && out.id) {
        artikelIdMap.set(Number(a.id), out.id);
      }
      if (out.action === "created") artikelStats.created++;
      else if (out.action === "updated") artikelStats.updated++;
      else artikelStats.skipped++;
    }

    let ordersCreated = 0;
    let ordersSkipped = 0;
    let orderErrors = 0;
    let orderWarning = "";
    const bestellungColsRes = await db.query(
      `select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bestellungen'`,
    );
    const bestellungCols = new Set<string>(
      (bestellungColsRes.rows || []).map((r: any) => String(r.column_name)),
    );
    const hasBestellnummer = bestellungCols.has("bestellnummer");
    const hasCreatedByUid = bestellungCols.has("created_by_uid");
    const hasCreatedByName = bestellungCols.has("created_by_name");
    const hasCreatedByEmail = bestellungCols.has("created_by_email");
    if (!hasBestellnummer && bestellungen.length) {
      ordersSkipped = bestellungen.length;
      orderWarning =
        "Bestellungen wurden übersprungen, da die DB-Spalte 'bestellnummer' fehlt.";
    }
    for (const b of hasBestellnummer ? bestellungen : []) {
      try {
      const bestellnummer = Number(b?.bestellnummer);
      const positionenRaw = Array.isArray(b?.positionen) ? b.positionen : [];
      if (!Number.isFinite(bestellnummer) || !positionenRaw.length) {
        ordersSkipped++;
        continue;
      }
      const exists = await db.query(
        "select id from bestellungen where bestellnummer = $1 limit 1",
        [bestellnummer],
      );
      if (exists.rows[0]?.id) {
        ordersSkipped++;
        continue;
      }

      const mappedPos = positionenRaw
        .map((p: any) => {
          const oldAid = Number(p?.artikelId);
          const oldLid = Number(p?.lieferantId);
          let newAid = Number(artikelIdMap.get(oldAid) || oldAid);
          let newLid = Number(lieferantenIdMap.get(oldLid) || oldLid);
          if (!newLid && p?.lieferantName) {
            newLid = Number(lieferantenNameMap.get(normText(p.lieferantName)) || 0);
          }
          return {
            artikelId: newAid,
            lieferantId: newLid,
            menge: Number(p?.menge || 0),
            notiz: nonEmptyOrNull(p?.notiz),
          };
        })
        .filter((p: any) => p.artikelId && p.lieferantId && p.menge > 0);

      if (!mappedPos.length) {
        ordersSkipped++;
        continue;
      }

      const statusCandidate = String(b?.status || "offen");
      const status =
        statusCandidate === "offen" ||
        statusCandidate === "bestellt" ||
        statusCandidate === "geliefert" ||
        statusCandidate === "storniert"
          ? statusCandidate
          : "offen";
      const first = mappedPos[0];
      const insertCols = [
        "bestellnummer",
        "artikel_id",
        "lieferant_id",
        "menge",
        "status",
        "bestell_datum",
      ];
      const insertVals: Array<unknown> = [
        bestellnummer,
        first.artikelId,
        first.lieferantId,
        first.menge,
        status,
        b?.bestellDatum || null,
      ];
      if (hasCreatedByUid) {
        insertCols.splice(1, 0, "created_by_uid");
        insertVals.splice(1, 0, nonEmptyOrNull(b?.createdByUid));
      }
      if (hasCreatedByName) {
        const idx = hasCreatedByUid ? 2 : 1;
        insertCols.splice(idx, 0, "created_by_name");
        insertVals.splice(idx, 0, nonEmptyOrNull(b?.createdByName));
      }
      if (hasCreatedByEmail) {
        const idx = hasCreatedByUid && hasCreatedByName ? 3 : hasCreatedByUid || hasCreatedByName ? 2 : 1;
        insertCols.splice(idx, 0, "created_by_email");
        insertVals.splice(idx, 0, nonEmptyOrNull(b?.createdByEmail));
      }
      const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(",");
      const inserted = await db.query(
        `insert into bestellungen (${insertCols.join(",")})
         values (${placeholders})
         returning id`,
        insertVals,
      );
      const newId = Number(inserted.rows[0].id);
      for (const p of mappedPos) {
        await db.query(
          `insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge, notiz)
           values ($1,$2,$3,$4,$5)`,
          [newId, p.artikelId, p.lieferantId, p.menge, p.notiz],
        );
      }
      ordersCreated++;
      } catch (err) {
        orderErrors++;
        ordersSkipped++;
      }
    }

    const settingsRepo = await Promise.resolve(require("./repositories/settings"));
    const settingKeys = Object.keys(settings || {});
    for (const key of settingKeys) {
      await settingsRepo.setSetting(key, String(settings[key] ?? ""));
    }

    res.json({
      success: true,
      lieferantenStats,
      artikelStats,
      bestellungen: { created: ordersCreated, skipped: ordersSkipped },
      settingsUpdated: settingKeys.length,
      warning: orderWarning || undefined,
      orderErrors: orderErrors || undefined,
    });
  } catch (error) {
    console.error("Backup restore error", error);
    res.status(500).json({ error: "Backup-Import fehlgeschlagen" });
  }
});

// Send order by email and set status to 'bestellt'
const buildOpenOrderGroups = async () => {
  const { listBestellungen } = await Promise.resolve(
    require("./repositories/bestellungen"),
  );
  const db = await Promise.resolve(require("./db"));

  const allBestellungen = await listBestellungen();
  const offene = (Array.isArray(allBestellungen) ? allBestellungen : []).filter(
    (b: any) => String(b.status || "offen") === "offen",
  );
  const orderMetaById = new Map<
    number,
    { bestellDatum?: string; createdByName?: string }
  >(
    offene.map((b: any) => [
      Number(b.id),
      {
        bestellDatum: b?.bestellDatum
          ? new Date(b.bestellDatum).toISOString()
          : undefined,
        createdByName:
          String(
            b?.createdByName || b?.createdByEmail || b?.createdByUid || "",
          ).trim() || undefined,
      },
    ]),
  );

  const artikelIds = Array.from(
    new Set(
      offene.flatMap((b: any) =>
        Array.isArray(b.positionen) ? b.positionen.map((p: any) => p.artikelId) : [],
      ),
    ),
  );
  const lieferantIds = Array.from(
    new Set(
      offene.flatMap((b: any) =>
        Array.isArray(b.positionen)
          ? b.positionen.map((p: any) => p.lieferantId)
          : [],
      ),
    ),
  );

  let artikelRows: any[] = [];
  if (artikelIds.length) {
    const res = await db.query(
      "select id, name, beschreibung, artikelnummer, preis from artikel where id = ANY($1)",
      [artikelIds],
    );
    artikelRows = res.rows || [];
  }
  let lieferantRows: any[] = [];
  if (lieferantIds.length) {
    const res = await db.query(
      "select id, name, email, kundennummer from lieferanten where id = ANY($1)",
      [lieferantIds],
    );
    lieferantRows = res.rows || [];
  }

  const artikelMap: Record<number, any> = {};
  artikelRows.forEach((r) => {
    artikelMap[Number(r.id)] = r;
  });
  const lieferantMap: Record<number, any> = {};
  lieferantRows.forEach((r) => {
    lieferantMap[Number(r.id)] = r;
  });

  const groups = new Map<
    number,
    {
      lieferantId: number;
      lieferantName: string;
      lieferantEmail: string;
      lieferantKundennummer: string;
      orderIds: Set<number>;
      bestellnummern: Set<string>;
      positionen: Array<{
        orderId: number;
        bestellnummer: string;
        artikelName: string;
        artikelBeschreibung: string;
        artikelNummer: string;
        menge: number;
        preis: number;
        notiz?: string;
        bestellDatum?: string;
        createdByName?: string;
      }>;
      gesamt: number;
    }
  >();

  for (const b of offene) {
    const orderId = Number(b.id);
    const nr = String(b.bestellnummer ?? b.id ?? "");
    const pos = Array.isArray(b.positionen) ? b.positionen : [];
    for (const p of pos) {
      const lid = Number(p.lieferantId);
      if (!Number.isFinite(lid)) continue;
      const group =
        groups.get(lid) ||
        {
          lieferantId: lid,
          lieferantName: lieferantMap[lid]?.name || `Lieferant #${lid}`,
          lieferantEmail: String(lieferantMap[lid]?.email || "").trim(),
          lieferantKundennummer: String(
            lieferantMap[lid]?.kundennummer || "",
          ).trim(),
          orderIds: new Set<number>(),
          bestellnummern: new Set<string>(),
          positionen: [] as Array<{
            orderId: number;
            bestellnummer: string;
            artikelName: string;
            artikelBeschreibung: string;
            artikelNummer: string;
            menge: number;
            preis: number;
            notiz?: string;
            bestellDatum?: string;
            createdByName?: string;
          }>,
          gesamt: 0,
        };

      const artikel = artikelMap[Number(p.artikelId)] || {
        name: `Artikel #${p.artikelId}`,
        preis: 0,
      };
      const menge = Number(p.menge) || 0;
      const preis = Number(artikel.preis) || 0;

      group.orderIds.add(orderId);
      group.bestellnummern.add(nr);
      group.positionen.push({
        orderId,
        bestellnummer: nr,
        artikelName: String(artikel.name || `Artikel #${p.artikelId}`),
        artikelBeschreibung: String(artikel.beschreibung || "").trim() || "-",
        artikelNummer: String(artikel.artikelnummer || "").trim() || "-",
        menge,
        preis,
        notiz: p.notiz ? String(p.notiz) : undefined,
        bestellDatum: orderMetaById.get(orderId)?.bestellDatum,
        createdByName: orderMetaById.get(orderId)?.createdByName,
      });
      group.gesamt += menge * preis;
      groups.set(lid, group);
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.lieferantName.localeCompare(b.lieferantName, "de"),
  );
};

const buildSammelDraftForGroup = async (
  settingsRepo: { getSetting: (key: string) => Promise<string | null> },
  group: any,
  baseTo: string,
) => {
  const subjTemplate =
    (await settingsRepo.getSetting("email_subject")) ||
    "Sammelbestellung {{lieferant}}";
  const bodyTemplate =
    (await settingsRepo.getSetting("email_body")) ||
    "<h2>Sammelbestellung {{lieferant}}</h2>{{artikel_liste}}";
  const signature = (await settingsRepo.getSetting("email_signature")) || "";

  let artikelHtml = `<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr style="text-align:left"><th>Bestellung</th><th>Artikel</th><th>Beschreibung</th><th>Artikelnummer</th><th>Stueckzahl</th><th>Preis</th><th>Gesamt</th><th>Notiz</th></tr></thead><tbody>`;
  let artikelText = "";
  for (const p of group.positionen || []) {
    const gesamt = (Number(p.preis) * Number(p.menge)).toFixed(2);
    const notiz = p.notiz ? String(p.notiz) : "";
    artikelHtml += `<tr><td>#${p.bestellnummer}</td><td>${p.artikelName}</td><td>${p.artikelBeschreibung}</td><td>${p.artikelNummer}</td><td>${p.menge}</td><td>${Number(p.preis).toFixed(2)} €</td><td>${gesamt} €</td><td>${notiz}</td></tr>`;
    artikelText += `- #${p.bestellnummer} | ${p.artikelName} | Beschreibung: ${p.artikelBeschreibung} | Artikelnummer: ${p.artikelNummer} | Stueckzahl: ${p.menge} | Preis: ${Number(p.preis).toFixed(2)}€ | Gesamt: ${gesamt}€${notiz ? ` | Notiz: ${notiz}` : ""}\n`;
  }
  artikelHtml += "</tbody></table>";

  const replacements: Record<string, string> = {
    "{{bestellnummer}}": Array.from(group.bestellnummern || []).join(", "),
    "{{datum}}":
      String(group.positionen?.[0]?.bestellDatum || "")
        .replace("T", " ")
        .slice(0, 10) || new Date().toLocaleDateString("de-DE"),
    "{{lieferant}}": String(group.lieferantName || ""),
    "{{kundennummer}}": String(group.lieferantKundennummer || ""),
    "{{artikel_liste}}": artikelHtml,
    "{{artikel_text}}": artikelText,
  };

  let subject = subjTemplate;
  let html = bodyTemplate;
  let text = `Sammelbestellung ${group.lieferantName}\n\n${artikelText}`;
  for (const key of Object.keys(replacements)) {
    const val = replacements[key];
    const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    subject = subject.replace(re, val);
    html = html.replace(re, val);
    text = text.replace(re, val);
  }
  ({ html, text } = ensureArtikelDetailsInDraft(
    html,
    text,
    bodyTemplate,
    artikelHtml,
    artikelText,
  ));
  if (signature) {
    html += `<div>${signature}</div>`;
    text += `\n${signature}`;
  }
  const lieferantKundennummer = String(group.lieferantKundennummer || "").trim();
  if (lieferantKundennummer && !subject.toLowerCase().includes("kundennummer")) {
    subject = `${subject} (Kundennummer: ${lieferantKundennummer})`;
  }

  const to =
    String(group.lieferantEmail || "").trim() || String(baseTo || "").trim();
  return {
    lieferantId: Number(group.lieferantId),
    lieferantName: String(group.lieferantName || ""),
    to,
    subject,
    html,
    text,
    orderIds: Array.from(group.orderIds || []),
    bestellnummern: Array.from(group.bestellnummern || []),
    anzahlPositionen: Array.isArray(group.positionen) ? group.positionen.length : 0,
    gesamt: Number(Number(group.gesamt || 0).toFixed(2)),
  };
};

app.get("/api/bestellungen/sammel/preview", async (req, res) => {
  try {
    const role = getUserRole((req as AuthedRequest).firebaseUser);
    if (!(role === "admin" || role === "buero")) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const groups = await buildOpenOrderGroups();
    res.json({
      groups: groups.map((g) => ({
        lieferantId: g.lieferantId,
        lieferantName: g.lieferantName,
        anzahlBestellungen: g.orderIds.size,
        orderIds: Array.from(g.orderIds),
        bestellnummern: Array.from(g.bestellnummern),
        orders: Object.values(
          g.positionen.reduce(
            (acc, p) => {
              const key = String(Number(p.orderId));
              if (!acc[key]) {
                acc[key] = {
                  orderId: Number(p.orderId),
                  bestellnummer: String(p.bestellnummer || p.orderId),
                  anzahlPositionen: 0,
                  summe: 0,
                  bestellDatum: p.bestellDatum || null,
                  createdByName: p.createdByName || null,
                };
              }
              acc[key].anzahlPositionen += 1;
              acc[key].summe += Number(p.menge || 0) * Number(p.preis || 0);
              return acc;
            },
            {} as Record<
              string,
              {
                orderId: number;
                bestellnummer: string;
                anzahlPositionen: number;
                summe: number;
                bestellDatum: string | null;
                createdByName: string | null;
              }
            >,
          ),
        ).map((o) => ({ ...o, summe: Number(o.summe.toFixed(2)) })),
        anzahlPositionen: g.positionen.length,
        gesamt: Number(g.gesamt.toFixed(2)),
      })),
      totalGroups: groups.length,
      totalOrders: groups.reduce((sum, g) => sum + g.orderIds.size, 0),
    });
  } catch (error) {
    console.error("Fehler bei Sammelbestellung-Vorschau", error);
    res.status(500).json({ error: "Sammelvorschau fehlgeschlagen" });
  }
});

app.post(
  "/api/bestellungen/sammel/send/preview",
  express.json(),
  async (req, res) => {
    try {
      const role = getUserRole((req as AuthedRequest).firebaseUser);
      if (!(role === "admin" || role === "buero")) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const requestedOrderIdsRaw = Array.isArray(req.body?.orderIds)
        ? req.body.orderIds
        : [];
      const requestedOrderIds = new Set<number>(
        requestedOrderIdsRaw
          .map((v: any) => Number(v))
          .filter((v: number) => Number.isFinite(v) && v > 0),
      );

      const allGroups = await buildOpenOrderGroups();
      const groups = requestedOrderIds.size
        ? allGroups
            .map((g) => {
              const filteredPos = g.positionen.filter((p: any) =>
                requestedOrderIds.has(Number(p.orderId)),
              );
              const filteredOrderIds = new Set<number>(
                filteredPos.map((p: any) => Number(p.orderId)),
              );
              const filteredBestellnummern = new Set<string>(
                filteredPos.map((p: any) => String(p.bestellnummer)),
              );
              return {
                ...g,
                positionen: filteredPos,
                orderIds: filteredOrderIds,
                bestellnummern: filteredBestellnummern,
                gesamt: filteredPos.reduce(
                  (sum: number, p: any) =>
                    sum + Number(p.menge || 0) * Number(p.preis || 0),
                  0,
                ),
              };
            })
            .filter((g) => g.orderIds.size > 0)
        : allGroups;

      if (!groups.length) {
        res.json({ drafts: [], totalGroups: 0, totalOrders: 0 });
        return;
      }

      const settingsRepo = await Promise.resolve(
        require("./repositories/settings"),
      );
      const to = await resolveConfiguredMailRecipient(settingsRepo);
      if (!to) {
        res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
        return;
      }

      const drafts = [];
      for (const g of groups) {
        drafts.push(await buildSammelDraftForGroup(settingsRepo, g, to));
      }

      res.json({
        drafts,
        totalGroups: drafts.length,
        totalOrders: drafts.reduce(
          (sum: number, d: any) =>
            sum + (Array.isArray(d.orderIds) ? d.orderIds.length : 0),
          0,
        ),
      });
    } catch (error: any) {
      console.error("Fehler bei Sammelbestellung-Entwurf", error);
      res.status(500).json({
        error: "Sammel-Entwurf fehlgeschlagen",
        detail: String(error?.message || error).slice(0, 1000),
      });
    }
  },
);

app.post("/api/bestellungen/sammel/send", express.json(), async (req, res) => {
  try {
    const role = getUserRole((req as AuthedRequest).firebaseUser);
    if (!(role === "admin" || role === "buero")) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const requestedOrderIdsRaw = Array.isArray(req.body?.orderIds)
      ? req.body.orderIds
      : [];
    const requestedOrderIds = new Set<number>(
      requestedOrderIdsRaw
        .map((v: any) => Number(v))
        .filter((v: number) => Number.isFinite(v) && v > 0),
    );

    const allGroups = await buildOpenOrderGroups();
    const groups = requestedOrderIds.size
      ? allGroups
          .map((g) => {
            const filteredPos = g.positionen.filter((p) =>
              requestedOrderIds.has(Number(p.orderId)),
            );
            const filteredOrderIds = new Set<number>(
              filteredPos.map((p) => Number(p.orderId)),
            );
            const filteredBestellnummern = new Set<string>(
              filteredPos.map((p) => String(p.bestellnummer)),
            );
            return {
              ...g,
              positionen: filteredPos,
              orderIds: filteredOrderIds,
              bestellnummern: filteredBestellnummern,
              gesamt: filteredPos.reduce(
                (sum, p) => sum + Number(p.menge || 0) * Number(p.preis || 0),
                0,
              ),
            };
          })
          .filter((g) => g.orderIds.size > 0)
      : allGroups;
    if (!groups.length) {
      res.json({ success: true, sentGroups: 0, updatedOrders: 0 });
      return;
    }

    const settingsRepo = await Promise.resolve(require("./repositories/settings"));
    const to = await resolveConfiguredMailRecipient(settingsRepo);
    if (!to) {
      res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
      return;
    }

    const overridesRaw = Array.isArray(req.body?.overrides) ? req.body.overrides : [];
    const overridesByLieferantId = new Map<number, any>();
    overridesRaw.forEach((o: any) => {
      const lid = Number(o?.lieferantId);
      if (!Number.isFinite(lid) || lid <= 0) return;
      overridesByLieferantId.set(lid, {
        to: parseString(o?.to) || parseString(o?.recipient) || "",
        subject: parseString(o?.subject) || "",
        html: parseString(o?.html) || "",
        text: parseString(o?.text) || "",
      });
    });

    const db = await Promise.resolve(require("./db"));

    const sentOrderIds = new Set<number>();
    const sentGroupNames: string[] = [];

    for (const g of groups) {
      const baseDraft = await buildSammelDraftForGroup(settingsRepo, g, to);
      const override = overridesByLieferantId.get(Number(g.lieferantId)) || null;
      const finalTo =
        (override?.to && String(override.to).trim()) || String(baseDraft.to || "").trim();
      const finalSubject =
        (override?.subject && String(override.subject).trim()) || baseDraft.subject;
      const finalHtml = (override?.html && String(override.html)) || baseDraft.html;
      const finalText =
        (override?.text && String(override.text)) ||
        (finalHtml ? stripHtmlToText(finalHtml) : "") ||
        baseDraft.text;

      await sendMailUsingConfiguredSmtp(
        settingsRepo,
        finalTo,
        finalSubject,
        finalText,
        finalHtml,
      );
      const ids = Array.from(g.orderIds);
      if (ids.length) {
        await db.query(
          "update bestellungen set status = 'bestellt', auftrags_bestaetigt = false where id = ANY($1::int[]) and status = 'offen'",
          [ids],
        );
        ids.forEach((id) => sentOrderIds.add(id));
      }
      sentGroupNames.push(g.lieferantName);
    }

    res.json({
      success: true,
      sentGroups: sentGroupNames.length,
      groups: sentGroupNames,
      updatedOrders: sentOrderIds.size,
    });
  } catch (error: any) {
    console.error("Fehler bei Sammelbestellung-Ausfuehrung", error);
    res.status(500).json({
      error: "Sammelbestellung fehlgeschlagen",
      detail: String(error?.message || error).slice(0, 1000),
    });
  }
});

app.put("/api/bestellungen/:id/send", express.json(), async (req, res) => {
  const id = parseInteger(req.params.id);
  if (!id) {
    res.status(400).json({ error: "ungueltige id" });
    return;
  }
  try {
    const role = getUserRole((req as AuthedRequest).firebaseUser);
    if (!(role === "admin" || role === "buero")) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const draft = await buildOrderMailDraft(id);
    const settingsRepo = draft.settingsRepo;
    const to =
      parseString(req.body?.to) || parseString(req.body?.recipient) || draft.to;
    const subject = parseString(req.body?.subject) || draft.subject;
    const html = parseString(req.body?.html) || draft.html;
    const text =
      parseString(req.body?.text) ||
      (html ? stripHtmlToText(html) : "") ||
      draft.text;

    if (!to) {
      res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
      return;
    }

    // send email
    try {
      await sendMailUsingConfiguredSmtp(
        settingsRepo,
        to,
        subject,
        text,
        html,
      );
    } catch (err) {
      const e: any = err;
      console.error("Error during sendOrderEmail", e && (e.stack || e));
      res.status(500).json({
        error: "E-Mail Versand fehlgeschlagen",
        detail: String(e && (e.message || e)).slice(0, 1000),
      });
      return;
    }

    // mark as bestellt
    const db = await Promise.resolve(require("./db"));
    await db.query(
      "update bestellungen set status = $1, auftrags_bestaetigt = false where id = $2",
      ["bestellt", id],
    );

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).send("error");
  }
});

app.get("/api/bestellungen/:id/send/preview", async (req, res) => {
  const id = parseInteger(req.params.id);
  if (!id) {
    res.status(400).json({ error: "ungueltige id" });
    return;
  }
  try {
    const role = getUserRole((req as AuthedRequest).firebaseUser);
    if (!(role === "admin" || role === "buero")) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const draft = await buildOrderMailDraft(id);
    res.json({
      to: draft.to,
      subject: draft.subject,
      html: draft.html,
      text: draft.text,
      lieferantName: draft.lieferantName,
      lieferantEmail: draft.lieferantEmail,
      fallbackTo: draft.fallbackTo,
      bestellnummer: draft.bestellung?.bestellnummer ?? null,
      status: draft.bestellung?.status ?? null,
    });
  } catch (e: any) {
    const status = Number(e?.statusCode) || 500;
    res.status(status).json({ error: String(e?.message || e || "error") });
  }
});

// Send reminder mail to supplier for a given order (no status change)
app.post(
  "/api/bestellungen/:id/reminder/send",
  express.json(),
  async (req, res) => {
    const id = parseInteger(req.params.id);
    if (!id) {
      res.status(400).json({ error: "ungueltige id" });
      return;
    }
    try {
      const role = getUserRole((req as AuthedRequest).firebaseUser);
      if (!(role === "admin" || role === "buero")) {
        res.status(403).json({ error: "forbidden" });
        return;
      }

      const { getBestellungById } = await Promise.resolve(
        require("./repositories/bestellungen"),
      );
      const bestellung = await getBestellungById(id);
      if (!bestellung) {
        res.status(404).json({ error: "Bestellung nicht gefunden" });
        return;
      }
      if (
        !Array.isArray(bestellung.positionen) ||
        !bestellung.positionen.length
      ) {
        res.status(400).json({ error: "Bestellung ohne Positionen" });
        return;
      }

      const firstPos = bestellung.positionen[0];
      const lieferantId = Number(firstPos.lieferantId);
      if (!Number.isFinite(lieferantId) || lieferantId <= 0) {
        res.status(400).json({ error: "Lieferant nicht bestimmt" });
        return;
      }

      const settingsRepo = await Promise.resolve(
        require("./repositories/settings"),
      );
      const subjTemplate =
        (await settingsRepo.getSetting("reminder_subject")) ||
        "Nachfassen Bestellung {{bestellnummer}} bei {{lieferant}}";
      const bodyTemplate =
        (await settingsRepo.getSetting("reminder_body")) ||
        "<h2>Nachfassen zur Bestellung {{bestellnummer}}</h2><p>Bitte um Rückmeldung zum Liefertermin.</p>{{artikel_liste}}";
      const signature = (await settingsRepo.getSetting("email_signature")) || "";

      const db = await Promise.resolve(require("./db"));
      const artikelIds = Array.from(
        new Set((bestellung.positionen || []).map((p: any) => p.artikelId)),
      );
      let artikelRows: any[] = [];
      if (artikelIds.length) {
        const aRes = await db.query(
          "select id, name, beschreibung, artikelnummer from artikel where id = ANY($1)",
          [artikelIds],
        );
        artikelRows = aRes.rows || [];
      }
      const artikelMap: Record<number, any> = {};
      artikelRows.forEach((r) => {
        artikelMap[Number(r.id)] = r;
      });

      const lieferantRes = await db.query(
        "select id, name, email, kundennummer from lieferanten where id = $1",
        [lieferantId],
      );
      const lieferantRow = lieferantRes.rows[0] || null;
      const lieferantName =
        lieferantRow?.name || `Lieferant #${lieferantId}`;
      const lieferantKundenNummer = String(lieferantRow?.kundennummer || "").trim();
      const supplierEmail = lieferantRow?.email
        ? String(lieferantRow.email)
        : "";

      // Use supplier email if present, otherwise fallback to configured recipient
      const fallbackTo = await resolveConfiguredMailRecipient(settingsRepo);
      const to = supplierEmail || fallbackTo;
      if (!to) {
        res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
        return;
      }

      const { artikelHtml, artikelText } = buildArtikelListeForMail(
        bestellung.positionen || [],
        artikelMap,
      );

      const replacements: Record<string, string> = {
        "{{bestellnummer}}": String(bestellung.bestellnummer ?? ""),
        "{{datum}}": new Date(bestellung.bestellDatum).toLocaleDateString(
          "de-DE",
        ),
        "{{lieferant}}": lieferantName,
        "{{kundennummer}}": lieferantKundenNummer,
        "{{artikel_liste}}": artikelHtml,
        "{{artikel_text}}": artikelText,
      };

      let subject = parseString(req.body?.subject) || subjTemplate;
      const rawHtmlTemplate = parseString(req.body?.html) || bodyTemplate;
      let html = rawHtmlTemplate;
      let text =
        parseString(req.body?.text) ||
        (html ? stripHtmlToText(html) : "") ||
        `Nachfassen Bestellung ${bestellung.bestellnummer ?? ""}\nDatum: ${replacements["{{datum}}"]}\n\n${artikelText}`;
      for (const key of Object.keys(replacements)) {
        const val = replacements[key];
        const re = new RegExp(
          key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
          "g",
        );
        subject = subject.replace(re, val);
        html = html.replace(re, val);
        text = text.replace(re, val);
      }
      ({ html, text } = ensureArtikelDetailsInDraft(
        html,
        text,
        rawHtmlTemplate,
        artikelHtml,
        artikelText,
      ));
      if (
        lieferantKundenNummer &&
        !subject.toLowerCase().includes("kundennummer")
      ) {
        subject = `${subject} (Kundennummer: ${lieferantKundenNummer})`;
      }
      if (signature) {
        html += `<div>${signature}</div>`;
        text += `\n${signature}`;
      }

      const toOverride =
        parseString(req.body?.to) || parseString(req.body?.recipient) || to;
      if (!toOverride) {
        res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
        return;
      }

      await sendMailUsingConfiguredSmtp(
        settingsRepo,
        toOverride,
        subject,
        text,
        html,
      );
      res.json({ success: true });
    } catch (error: any) {
      console.error("Fehler bei Reminder-Mail", error);
      res.status(500).json({
        error: "Reminder-Mail fehlgeschlagen",
        detail: String(error?.message || error).slice(0, 1000),
      });
    }
  },
);

app.get("/api/bestellungen/:id/reminder/send/preview", async (req, res) => {
  const id = parseInteger(req.params.id);
  if (!id) {
    res.status(400).json({ error: "ungueltige id" });
    return;
  }
  try {
    const role = getUserRole((req as AuthedRequest).firebaseUser);
    if (!(role === "admin" || role === "buero")) {
      res.status(403).json({ error: "forbidden" });
      return;
    }

    const { getBestellungById } = await Promise.resolve(
      require("./repositories/bestellungen"),
    );
    const bestellung = await getBestellungById(id);
    if (!bestellung) {
      res.status(404).json({ error: "Bestellung nicht gefunden" });
      return;
    }
    if (!Array.isArray(bestellung.positionen) || !bestellung.positionen.length) {
      res.status(400).json({ error: "Bestellung ohne Positionen" });
      return;
    }

    const firstPos = bestellung.positionen[0];
    const lieferantId = Number(firstPos.lieferantId);
    if (!Number.isFinite(lieferantId) || lieferantId <= 0) {
      res.status(400).json({ error: "Lieferant nicht bestimmt" });
      return;
    }

    const settingsRepo = await Promise.resolve(require("./repositories/settings"));
    const subjTemplate =
      (await settingsRepo.getSetting("reminder_subject")) ||
      "Nachfassen Bestellung {{bestellnummer}} bei {{lieferant}}";
    const bodyTemplate =
      (await settingsRepo.getSetting("reminder_body")) ||
      "<h2>Nachfassen zur Bestellung {{bestellnummer}}</h2><p>Bitte um Rückmeldung zum Liefertermin.</p>{{artikel_liste}}";
    const signature = (await settingsRepo.getSetting("email_signature")) || "";

    const db = await Promise.resolve(require("./db"));
    const artikelIds = Array.from(
      new Set((bestellung.positionen || []).map((p: any) => p.artikelId)),
    );
    let artikelRows: any[] = [];
    if (artikelIds.length) {
      const aRes = await db.query(
        "select id, name, beschreibung, artikelnummer from artikel where id = ANY($1)",
        [artikelIds],
      );
      artikelRows = aRes.rows || [];
    }
    const artikelMap: Record<number, any> = {};
    artikelRows.forEach((r) => {
      artikelMap[Number(r.id)] = r;
    });

    const lieferantRes = await db.query(
      "select id, name, email, kundennummer from lieferanten where id = $1",
      [lieferantId],
    );
    const lieferantRow = lieferantRes.rows[0] || null;
    const lieferantName = lieferantRow?.name || `Lieferant #${lieferantId}`;
    const lieferantKundenNummer = String(lieferantRow?.kundennummer || "").trim();
    const supplierEmail = lieferantRow?.email ? String(lieferantRow.email) : "";
    const fallbackTo = await resolveConfiguredMailRecipient(settingsRepo);
    const to = String(supplierEmail || "").trim() || String(fallbackTo || "").trim();

    const { artikelHtml, artikelText } = buildArtikelListeForMail(
      bestellung.positionen || [],
      artikelMap,
    );

    const replacements: Record<string, string> = {
      "{{bestellnummer}}": String(bestellung.bestellnummer ?? ""),
      "{{datum}}": new Date(bestellung.bestellDatum).toLocaleDateString("de-DE"),
      "{{lieferant}}": lieferantName,
      "{{kundennummer}}": lieferantKundenNummer,
      "{{artikel_liste}}": artikelHtml,
      "{{artikel_text}}": artikelText,
    };

    let subject = subjTemplate;
    let html = bodyTemplate;
    let text = `Nachfassen Bestellung ${bestellung.bestellnummer ?? ""}\nDatum: ${replacements["{{datum}}"]}\n\n${artikelText}`;
    for (const key of Object.keys(replacements)) {
      const val = replacements[key];
      const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      subject = subject.replace(re, val);
      html = html.replace(re, val);
      text = text.replace(re, val);
    }
    ({ html, text } = ensureArtikelDetailsInDraft(
      html,
      text,
      bodyTemplate,
      artikelHtml,
      artikelText,
    ));
    if (lieferantKundenNummer && !subject.toLowerCase().includes("kundennummer")) {
      subject = `${subject} (Kundennummer: ${lieferantKundenNummer})`;
    }
    if (signature) {
      html += `<div>${signature}</div>`;
      text += `\n${signature}`;
    }

    res.json({
      to,
      subject,
      html,
      text,
      lieferantName,
      lieferantEmail: supplierEmail,
      fallbackTo,
      bestellnummer: bestellung?.bestellnummer ?? null,
      status: bestellung?.status ?? null,
    });
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e || "error") });
  }
});
app.get("/lieferanten", requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "lieferanten.html"));
});
app.get("/lieferanten/:id", requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "lieferant-detail.html"));
});

app.get("/artikel", requireUserPage, (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "artikel.html"));
});

app.get("/", (req, res) => {
  res.redirect("/uebersicht");
});

// Debug: list registered routes
app.get("/__routes", (req, res) => {
  const routes: string[] = [];
  const stack: any[] = (app as any)._router?.stack || [];
  stack.forEach((layer: any) => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
      routes.push(`${methods} ${layer.route.path}`);
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      layer.handle.stack.forEach((l: any) => {
        if (l.route && l.route.path) {
          const methods = Object.keys(l.route.methods).join(",").toUpperCase();
          routes.push(`${methods} ${l.route.path}`);
        }
      });
    }
  });
  res.json({ routes });
});

// Internal: run SQL schema from repo (temporary migration helper)
// migration endpoint removed
ensureSchema()
  .catch((e) => {
    console.error("Warnung: Schema-Migration fehlgeschlagen", e);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server läuft auf http://localhost:${PORT}`);
    });
  });
