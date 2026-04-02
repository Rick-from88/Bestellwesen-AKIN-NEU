"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const fs_1 = __importDefault(require("fs"));
const admin = __importStar(require("firebase-admin"));
const path_1 = __importDefault(require("path"));
const bestellungen_1 = require("./repositories/bestellungen");
const lieferanten_1 = require("./repositories/lieferanten");
const email_1 = require("./services/email");
const artikel_1 = require("./repositories/artikel");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(body_parser_1.default.json({ limit: "10mb" }));
app.use(body_parser_1.default.urlencoded({ extended: true, limit: "10mb" }));
app.use((0, cookie_parser_1.default)());
app.use("/static", express_1.default.static(path_1.default.join(__dirname, "..", "public")));
// Admin auth middleware: if `ADMIN_TOKEN` is set, require it via
// `Authorization: Bearer <token>` header or `?admin_token=...` query.
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
const FB_SESSION_COOKIE = process.env.FB_SESSION_COOKIE || "fb_session";
const ADMIN_UIDS = (process.env.ADMIN_UIDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const initFirebaseAdmin = () => {
    if (admin.apps.length)
        return admin;
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
        const raw = fs_1.default.readFileSync(sdkPath, "utf8");
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
}
catch (e) {
    firebaseAdminReady = false;
    console.error("Firebase Admin SDK konnte nicht initialisiert werden:", e);
}
const extractIdToken = (req) => {
    var _a;
    const fromHeader = String(req.headers["authorization"] || "");
    if (fromHeader.startsWith("Bearer "))
        return fromHeader.slice(7);
    const fromCookie = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[FB_SESSION_COOKIE];
    return typeof fromCookie === "string" ? fromCookie : "";
};
const requireUserApi = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!firebaseAdminReady) {
        return res.status(503).json({
            error: "firebase admin not configured",
        });
    }
    const token = extractIdToken(req);
    if (!token)
        return res.status(401).json({ error: "unauthorized" });
    try {
        const decoded = yield admin.auth().verifyIdToken(token);
        req.firebaseUser = decoded;
        return next();
    }
    catch (_a) {
        return res.status(401).json({ error: "unauthorized" });
    }
});
const isAdminUser = (user) => {
    if (ADMIN_UIDS.includes(user.uid))
        return true;
    const email = user.email || "";
    if (email && ADMIN_EMAILS.includes(email))
        return true;
    return false;
};
const getUserRole = (user) => {
    if (!user)
        return "produktion";
    if (isAdminUser(user))
        return "admin";
    const claimRole = String(user.role || "");
    if (claimRole === "admin" ||
        claimRole === "buero" ||
        claimRole === "produktion") {
        return claimRole;
    }
    return "produktion";
};
const requireAdminApi = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _b;
    // Legacy allow-list via ADMIN_TOKEN (optional)
    if (ADMIN_TOKEN) {
        const raw = String(req.headers["authorization"] || ((_b = req.query) === null || _b === void 0 ? void 0 : _b.admin_token) || "");
        const token = raw.startsWith("Bearer ") ? raw.slice(7) : raw;
        if (token === ADMIN_TOKEN)
            return next();
    }
    if (!firebaseAdminReady) {
        return res.status(503).json({
            error: "firebase admin not configured",
        });
    }
    const token = extractIdToken(req);
    if (!token)
        return res.status(401).json({ error: "unauthorized" });
    try {
        const decoded = yield admin.auth().verifyIdToken(token);
        req.firebaseUser = decoded;
        if (!isAdminUser(decoded))
            return res.status(403).json({ error: "forbidden" });
        return next();
    }
    catch (_c) {
        return res.status(401).json({ error: "unauthorized" });
    }
});
const requireUserPage = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    if (!firebaseAdminReady) {
        return res.redirect("/login");
    }
    const token = extractIdToken(req);
    if (!token)
        return res.redirect("/login");
    try {
        const decoded = yield admin.auth().verifyIdToken(token);
        req.firebaseUser = decoded;
        return next();
    }
    catch (_d) {
        return res.redirect("/login");
    }
});
const requireAdminPage = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    yield requireUserPage(req, res, () => __awaiter(void 0, void 0, void 0, function* () {
        const u = req.firebaseUser;
        if (!u || !isAdminUser(u))
            return res.redirect("/uebersicht");
        return next();
    }));
});
const toDisplayNameFromEmail = (email) => {
    if (!email)
        return undefined;
    const local = email.split("@")[0] || "";
    const firstToken = local
        .split(/[.\-_+]/)
        .map((s) => s.trim())
        .filter(Boolean)[0];
    if (!firstToken)
        return undefined;
    return firstToken.charAt(0).toUpperCase() + firstToken.slice(1).toLowerCase();
};
const resolveActorProfile = (user) => __awaiter(void 0, void 0, void 0, function* () {
    var _e;
    if (!(user === null || user === void 0 ? void 0 : user.uid))
        return {};
    let email = user.email || undefined;
    let name = user.name || undefined;
    if (name)
        name = name.trim() || undefined;
    if (email && !name) {
        name = toDisplayNameFromEmail(email);
    }
    if (!firebaseAdminReady) {
        return { uid: user.uid, email, name };
    }
    try {
        const record = yield admin.auth().getUser(user.uid);
        const recordEmail = record.email || undefined;
        const recordName = ((_e = record.displayName) === null || _e === void 0 ? void 0 : _e.trim()) || undefined;
        email = email || recordEmail;
        name = name || recordName || toDisplayNameFromEmail(email);
        // Wenn noch kein Anzeigename in Firebase gepflegt ist, setzen wir ihn automatisch.
        if (!recordName && name) {
            try {
                yield admin.auth().updateUser(user.uid, { displayName: name });
            }
            catch (_f) {
                // Nicht kritisch fuer Bestellerfassung.
            }
        }
        return { uid: user.uid, email, name };
    }
    catch (_g) {
        return { uid: user.uid, email, name };
    }
});
const resolveConfiguredMailRecipient = (settingsRepo) => __awaiter(void 0, void 0, void 0, function* () {
    const configuredRecipient = (yield settingsRepo.getSetting("email_recipient")) ||
        (yield settingsRepo.getSetting("mail_to")) ||
        (yield settingsRepo.getSetting("mail_user")) ||
        process.env.MAIL_TO ||
        process.env.MAIL_USER ||
        "";
    return String(configuredRecipient || "").trim();
});
const sendMailUsingConfiguredSmtp = (settingsRepo, to, subject, text, html) => __awaiter(void 0, void 0, void 0, function* () {
    const host = (yield settingsRepo.getSetting("mail_host")) ||
        process.env.MAIL_HOST ||
        process.env.SMTP_HOST ||
        "";
    const portRaw = (yield settingsRepo.getSetting("mail_port")) ||
        process.env.MAIL_PORT ||
        process.env.SMTP_PORT ||
        "587";
    const user = (yield settingsRepo.getSetting("mail_user")) ||
        process.env.MAIL_USER ||
        process.env.SMTP_USER ||
        "";
    const pass = (yield settingsRepo.getSetting("mail_pass")) ||
        process.env.MAIL_PASS ||
        process.env.SMTP_PASS ||
        "";
    const from = (yield settingsRepo.getSetting("mail_from")) ||
        process.env.MAIL_FROM ||
        user ||
        "no-reply@example.com";
    const transporter = (0, email_1.createTransporter)({
        host: String(host || ""),
        port: Number(portRaw || 587),
        user: String(user || ""),
        pass: String(pass || ""),
    });
    const mailOptions = {
        from: `"Bestellwesen App" <${from}>`,
        to,
        subject,
        text,
    };
    if (html)
        mailOptions.html = html;
    return transporter.sendMail(mailOptions);
});
const stripHtmlToText = (html) => {
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
const buildOrderMailDraft = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
    const { getBestellungById } = yield Promise.resolve(require("./repositories/bestellungen"));
    const bestellung = yield getBestellungById(id);
    if (!bestellung) {
        const err = new Error("Bestellung nicht gefunden");
        err.statusCode = 404;
        throw err;
    }
    const db = yield Promise.resolve(require("./db"));
    const artikelIds = Array.from(new Set((bestellung.positionen || []).map((p) => p.artikelId)));
    let artikelRows = [];
    if (artikelIds.length) {
        const aRes = yield db.query("select id, name, preis from artikel where id = ANY($1)", [artikelIds]);
        artikelRows = aRes.rows || [];
    }
    const artikelMap = {};
    artikelRows.forEach((r) => {
        artikelMap[r.id] = r;
    });
    const firstPos = Array.isArray(bestellung.positionen)
        ? bestellung.positionen[0]
        : null;
    const lieferantId = firstPos ? Number(firstPos.lieferantId) : NaN;
    let lieferantName = "";
    let lieferantEmail = "";
    if (Number.isFinite(lieferantId) && lieferantId > 0) {
        const lRes = yield db.query("select name, email from lieferanten where id = $1", [lieferantId]);
        lieferantName = String(((_j = (_h = lRes.rows) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.name) || "");
        lieferantEmail = String(((_l = (_k = lRes.rows) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.email) || "");
    }
    let artikelHtml = `<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr style="text-align:left"><th>Artikel</th><th>Menge</th><th>Preis</th><th>Gesamt</th><th>Notiz</th></tr></thead><tbody>`;
    let artikelText = "";
    for (const pos of bestellung.positionen || []) {
        const a = artikelMap[pos.artikelId] || {
            name: `Artikel #${pos.artikelId}`,
            preis: 0,
        };
        const menge = Number(pos.menge) || 0;
        const preis = Number(a.preis) || 0;
        const gesamt = (preis * menge).toFixed(2);
        const notiz = pos.notiz ? String(pos.notiz) : "";
        artikelHtml += `<tr><td>${a.name}</td><td>${menge}</td><td>${preis.toFixed(2)} €</td><td>${gesamt} €</td><td>${notiz}</td></tr>`;
        artikelText += `- ${a.name} | Menge: ${menge} | Preis: ${preis.toFixed(2)}€ | Gesamt: ${gesamt}€${notiz ? ` | Notiz: ${notiz}` : ""}\n`;
    }
    artikelHtml += "</tbody></table>";
    const replacements = {
        "{{bestellnummer}}": String((_m = bestellung.bestellnummer) !== null && _m !== void 0 ? _m : ""),
        "{{datum}}": String((_o = bestellung.bestellDatum) !== null && _o !== void 0 ? _o : ""),
        "{{lieferant}}": lieferantName,
        "{{artikel_liste}}": artikelHtml,
        "{{artikel_text}}": artikelText,
    };
    const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
    const subjTemplate = (yield settingsRepo.getSetting("email_subject")) ||
        `Bestellung ${(_p = bestellung.bestellnummer) !== null && _p !== void 0 ? _p : ""}`;
    const bodyTemplate = (yield settingsRepo.getSetting("email_body")) ||
        `<h2>Bestellung ${(_q = bestellung.bestellnummer) !== null && _q !== void 0 ? _q : ""}</h2><p>Datum: ${(_r = bestellung.bestellDatum) !== null && _r !== void 0 ? _r : ""}</p>{{artikel_liste}}`;
    const signature = (yield settingsRepo.getSetting("email_signature")) || "";
    let subject = subjTemplate;
    let html = bodyTemplate;
    let text = `Bestellung ${(_s = bestellung.bestellnummer) !== null && _s !== void 0 ? _s : ""}\nDatum: ${(_t = bestellung.bestellDatum) !== null && _t !== void 0 ? _t : ""}\n\n${artikelText}`;
    for (const key of Object.keys(replacements)) {
        const val = replacements[key];
        const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
        subject = subject.replace(re, val);
        html = html.replace(re, val);
        text = text.replace(re, val);
    }
    if (signature) {
        html += `<div>${signature}</div>`;
        text += `\n${signature}`;
    }
    const fallbackTo = yield resolveConfiguredMailRecipient(settingsRepo);
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
});
const parseNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};
const parseInteger = (value) => {
    const parsed = parseNumber(value);
    return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};
const parseString = (value) => {
    return typeof value === "string" ? value.trim() : undefined;
};
const parseStatus = (value) => {
    if (value === "offen" ||
        value === "bestellt" ||
        value === "teilgeliefert" ||
        value === "geliefert" ||
        value === "teilstorniert" ||
        value === "storniert") {
        return value;
    }
    return null;
};
const parsePositionen = (value) => {
    const positionenInput = Array.isArray(value)
        ? value
        : [];
    const positionen = positionenInput
        .map((position) => {
        const artikelId = parseInteger(position === null || position === void 0 ? void 0 : position.artikelId);
        const lieferantId = parseInteger(position === null || position === void 0 ? void 0 : position.lieferantId);
        const menge = parseInteger(position === null || position === void 0 ? void 0 : position.menge);
        const geliefertMenge = parseInteger(position === null || position === void 0 ? void 0 : position.geliefertMenge);
        const storniertMenge = parseInteger(position === null || position === void 0 ? void 0 : position.storniertMenge);
        const notiz = parseString(position === null || position === void 0 ? void 0 : position.notiz);
        return {
            artikelId,
            lieferantId,
            menge,
            geliefertMenge,
            storniertMenge,
            notiz,
        };
    })
        .filter((position) => position.artikelId &&
        position.lieferantId &&
        position.menge &&
        position.menge > 0)
        .map((position) => {
        var _a, _b;
        return ({
            artikelId: position.artikelId,
            lieferantId: position.lieferantId,
            menge: position.menge,
            geliefertMenge: (_a = position.geliefertMenge) !== null && _a !== void 0 ? _a : 0,
            storniertMenge: (_b = position.storniertMenge) !== null && _b !== void 0 ? _b : 0,
            notiz: position.notiz,
        });
    });
    if (!positionen.length || positionen.length !== positionenInput.length) {
        return null;
    }
    return positionen;
};
const computeDeliveryStatus = (positions, previousStatus, requestedStatus) => {
    const ordered = positions.reduce((sum, p) => sum + Number(p.menge || 0), 0);
    const delivered = positions.reduce((sum, p) => sum + Number(p.geliefertMenge || 0), 0);
    const canceled = positions.reduce((sum, p) => sum + Number(p.storniertMenge || 0), 0);
    if (!ordered)
        return requestedStatus;
    if (delivered >= ordered && canceled <= 0)
        return "geliefert";
    if (canceled >= ordered && delivered <= 0)
        return "storniert";
    // If nothing was delivered/canceled, honor the user's requested status.
    if (delivered <= 0 && canceled <= 0)
        return requestedStatus;
    const remaining = ordered - delivered - canceled;
    // Noch etwas erwartet: bleibt Teilgeliefert.
    if (remaining > 0)
        return "teilgeliefert";
    // Erwartung ist komplett weg, aber nicht alles geliefert.
    if (remaining === 0 && canceled > 0 && delivered < ordered) {
        return "teilstorniert";
    }
    if (delivered > 0 && delivered < ordered)
        return "teilgeliefert";
    return previousStatus;
};
// -----------------------
// Firebase Auth (Login)
// -----------------------
app.post("/api/auth/login", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _u;
    try {
        if (!firebaseAdminReady) {
            return res.status(503).json({ error: "firebase admin not configured" });
        }
        const idToken = typeof ((_u = req.body) === null || _u === void 0 ? void 0 : _u.idToken) === "string" ? req.body.idToken : "";
        if (!idToken)
            return res.status(400).json({ error: "missing idToken" });
        const decoded = yield admin.auth().verifyIdToken(idToken);
        // Use ID token as session payload; every request will be verified again.
        const secure = process.env.NODE_ENV === "production";
        res.cookie(FB_SESSION_COOKIE, idToken, {
            httpOnly: true,
            sameSite: "lax",
            secure,
            maxAge: 60 * 60 * 1000,
            path: "/",
        });
        return res.json({ uid: decoded.uid, email: decoded.email || null });
    }
    catch (_v) {
        return res.status(401).json({ error: "invalid token" });
    }
}));
app.post("/api/auth/logout", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.clearCookie(FB_SESSION_COOKIE, { path: "/" });
    return res.status(204).send();
}));
app.get("/api/auth/me", requireUserApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const u = req.firebaseUser;
    return res.json({
        uid: u === null || u === void 0 ? void 0 : u.uid,
        email: (u === null || u === void 0 ? void 0 : u.email) || null,
        role: getUserRole(u),
        claims: (u === null || u === void 0 ? void 0 : u.claims) || {},
    });
}));
// -----------------------
// Nutzerverwaltung (Admin)
// -----------------------
app.get("/api/admin/users", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pageSize = Number(req.query.pageSize || 50);
        const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
        const maxResults = Number.isFinite(pageSize) ? pageSize : 50;
        const result = yield admin.auth().listUsers(maxResults, pageToken);
        return res.json({
            users: result.users.map((u) => {
                var _a, _b, _c, _d;
                return ({
                    uid: u.uid,
                    email: u.email || null,
                    disabled: u.disabled,
                    role: isAdminUser(u) || ((_a = u.customClaims) === null || _a === void 0 ? void 0 : _a.role) === "admin"
                        ? "admin"
                        : ((_b = u.customClaims) === null || _b === void 0 ? void 0 : _b.role) === "buero"
                            ? "buero"
                            : "produktion",
                    displayName: u.displayName || null,
                    metadata: {
                        creationTime: ((_c = u.metadata) === null || _c === void 0 ? void 0 : _c.creationTime) || null,
                        lastSignInTime: ((_d = u.metadata) === null || _d === void 0 ? void 0 : _d.lastSignInTime) || null,
                    },
                });
            }),
            pageToken: result.pageToken || null,
        });
    }
    catch (e) {
        return res.status(500).json({ error: "failed to list users", detail: String(e) });
    }
}));
app.post("/api/admin/users/:uid/role", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _w;
    try {
        const uid = String(req.params.uid || "");
        const role = String(((_w = req.body) === null || _w === void 0 ? void 0 : _w.role) || "");
        if (!uid || !["admin", "buero", "produktion"].includes(role)) {
            return res.status(400).json({ error: "invalid role payload" });
        }
        yield admin.auth().setCustomUserClaims(uid, { role });
        return res.status(204).send();
    }
    catch (e) {
        return res.status(500).json({ error: "failed to set role", detail: String(e) });
    }
}));
app.post("/api/admin/users", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _x, _y, _z;
    try {
        const email = typeof ((_x = req.body) === null || _x === void 0 ? void 0 : _x.email) === "string" ? req.body.email.trim() : "";
        const displayNameInput = typeof ((_y = req.body) === null || _y === void 0 ? void 0 : _y.displayName) === "string" ? req.body.displayName.trim() : "";
        const displayName = displayNameInput || toDisplayNameFromEmail(email);
        const password = typeof ((_z = req.body) === null || _z === void 0 ? void 0 : _z.password) === "string" ? req.body.password : "";
        if (!email || !password) {
            return res.status(400).json({ error: "email and password required" });
        }
        const userRecord = yield admin.auth().createUser({
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
    }
    catch (e) {
        return res.status(500).json({ error: "failed to create user", detail: String(e) });
    }
}));
app.post("/api/admin/users/:uid/disable", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uid = String(req.params.uid || "");
        yield admin.auth().updateUser(uid, { disabled: true });
        return res.status(204).send();
    }
    catch (e) {
        return res.status(500).json({ error: "failed to disable user", detail: String(e) });
    }
}));
app.post("/api/admin/users/:uid/enable", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uid = String(req.params.uid || "");
        yield admin.auth().updateUser(uid, { disabled: false });
        return res.status(204).send();
    }
    catch (e) {
        return res.status(500).json({ error: "failed to enable user", detail: String(e) });
    }
}));
app.post("/api/admin/users/:uid/delete", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const uid = String(req.params.uid || "");
        yield admin.auth().deleteUser(uid);
        return res.status(204).send();
    }
    catch (e) {
        return res.status(500).json({ error: "failed to delete user", detail: String(e) });
    }
}));
// Protect all other /api routes with Firebase Auth cookie.
app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/auth/"))
        return next();
    if (req.path.startsWith("/admin/"))
        return next();
    return requireUserApi(req, res, () => {
        const role = getUserRole(req.firebaseUser);
        const p = String(req.path || "");
        const m = String(req.method || "GET").toUpperCase();
        if (role === "admin")
            return next();
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
                const hasForbiddenKey = forbiddenMailKeys.some((k) => body[k] !== undefined);
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
        const allow = (m === "GET" &&
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
            (m === "PUT" && p === "/dashboard/notes");
        if (allow)
            return next();
        return res.status(403).json({ error: "forbidden for role produktion" });
    });
});
app.get("/api/bestellungen", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const bestellungen = yield (0, bestellungen_1.listBestellungen)();
        res.json(bestellungen);
    }
    catch (error) {
        console.error("Fehler beim Laden der Bestellungen", error);
        res
            .status(500)
            .json({ error: "Bestellungen konnten nicht geladen werden." });
    }
}));
app.post("/api/bestellungen", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _0;
    const status = (_0 = parseStatus(req.body.status)) !== null && _0 !== void 0 ? _0 : "offen";
    const actorProfile = yield resolveActorProfile(req.firebaseUser);
    const bestellDatum = typeof req.body.bestellDatum === "string"
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
        const positionenNachLieferant = new Map();
        positionen.forEach((position) => {
            var _a;
            const entries = (_a = positionenNachLieferant.get(position.lieferantId)) !== null && _a !== void 0 ? _a : [];
            entries.push(position);
            positionenNachLieferant.set(position.lieferantId, entries);
        });
        const bestellungen = [];
        for (const entry of positionenNachLieferant.values()) {
            const bestellung = yield (0, bestellungen_1.createBestellung)({
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
    }
    catch (error) {
        console.error("Fehler beim Erstellen der Bestellung", error);
        res.status(500).json({ error: "Bestellung konnte nicht erstellt werden." });
    }
}));
app.put("/api/bestellungen/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _1, _2, _3, _4, _5, _6;
    const bestellungId = parseInteger(req.params.id);
    const auftragsBestaetigt = Boolean(((_1 = req.body) === null || _1 === void 0 ? void 0 : _1.auftragsBestaetigt) === true);
    const actorProfile = yield resolveActorProfile(req.firebaseUser);
    const bestellDatum = typeof req.body.bestellDatum === "string"
        ? req.body.bestellDatum
        : undefined;
    const requestedStatus = (_3 = parseStatus((_2 = req.body) === null || _2 === void 0 ? void 0 : _2.status)) !== null && _3 !== void 0 ? _3 : "offen";
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
        const db = yield Promise.resolve(require("./db"));
        const cur = yield db.query("select status from bestellungen where id = $1", [bestellungId]);
        const curStatus = (_4 = cur.rows[0]) === null || _4 === void 0 ? void 0 : _4.status;
        if (curStatus === "geliefert" ||
            curStatus === "storniert" ||
            curStatus === "teilstorniert") {
            res.status(409).json({
                error: "Bestellung ist abgeschlossen und kann nicht mehr bearbeitet werden.",
            });
            return;
        }
        const previousStatus = curStatus || "offen";
        // determine existing supplier ids for this order
        const existingRows = yield db.query("select lieferant_id from bestellpositionen where bestellung_id = $1", [bestellungId]);
        const existingSupplierIds = new Set();
        for (const r of existingRows.rows) {
            if (r.lieferant_id)
                existingSupplierIds.add(Number(r.lieferant_id));
        }
        if (!existingSupplierIds.size) {
            // fallback: single-position stored on bestellungen table
            const mainRow = yield db.query("select lieferant_id from bestellungen where id = $1 and lieferant_id is not null", [bestellungId]);
            if (mainRow.rows[0] && mainRow.rows[0].lieferant_id)
                existingSupplierIds.add(Number(mainRow.rows[0].lieferant_id));
        }
        // group incoming positions by supplier
        const bySupplier = {};
        for (const pos of positionen) {
            const lid = Number(pos.lieferantId);
            if (!bySupplier[lid])
                bySupplier[lid] = [];
            bySupplier[lid].push({
                artikelId: Number(pos.artikelId),
                lieferantId: lid,
                menge: Number(pos.menge),
                geliefertMenge: Number((_5 = pos.geliefertMenge) !== null && _5 !== void 0 ? _5 : 0),
                storniertMenge: Number((_6 = pos.storniertMenge) !== null && _6 !== void 0 ? _6 : 0),
                notiz: pos.notiz,
            });
        }
        // positions to keep on the original order (suppliers that were already present)
        const positionsForOriginal = [];
        // new suppliers -> create separate orders
        const { createBestellung } = yield Promise.resolve(require("./repositories/bestellungen"));
        for (const [lidStr, poses] of Object.entries(bySupplier)) {
            const lid = Number(lidStr);
            if (existingSupplierIds.has(lid)) {
                positionsForOriginal.push(...poses);
            }
            else {
                // create a new order for this supplier
                try {
                    const computedStatusForNew = computeDeliveryStatus(poses, previousStatus, requestedStatus);
                    yield createBestellung({
                        status: computedStatusForNew,
                        bestellDatum,
                        createdByUid: actorProfile.uid,
                        createdByName: actorProfile.name,
                        createdByEmail: actorProfile.email,
                        positionen: poses,
                        auftragsBestaetigt,
                    });
                }
                catch (e) {
                    console.error("Fehler beim Erstellen der neuen Bestellung fuer Lieferant", lid, e);
                    res
                        .status(500)
                        .json({ error: "Fehler beim Anlegen neuer Bestellung(en)" });
                    return;
                }
            }
        }
        if (positionsForOriginal.length) {
            const computedStatusForOriginal = computeDeliveryStatus(positionsForOriginal, previousStatus, requestedStatus);
            const bestellung = yield (0, bestellungen_1.updateBestellung)(bestellungId, {
                status: computedStatusForOriginal,
                bestellDatum,
                positionen: positionsForOriginal,
                auftragsBestaetigt,
            });
            res.json(bestellung);
            return;
        }
        else {
            // no positions left for original order -> delete it
            try {
                yield (0, bestellungen_1.deleteBestellung)(bestellungId);
                res.json({ deleted: true });
                return;
            }
            catch (e) {
                console.error("Fehler beim Loeschen leerer Bestellung", e);
                res.status(500).json({ error: "Fehler beim Loeschen der Bestellung" });
                return;
            }
        }
    }
    catch (error) {
        console.error("Fehler beim Aktualisieren der Bestellung", error);
        res
            .status(500)
            .json({ error: "Bestellung konnte nicht aktualisiert werden." });
    }
}));
// change status only (allows changing status even when positions are locked)
app.put("/api/bestellungen/:id/status", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _7, _8;
    const id = parseInteger(req.params.id);
    const status = parseStatus((_7 = req.body) === null || _7 === void 0 ? void 0 : _7.status);
    const auftragsBestaetigt = typeof ((_8 = req.body) === null || _8 === void 0 ? void 0 : _8.auftragsBestaetigt) === "boolean"
        ? req.body.auftragsBestaetigt
        : undefined;
    if (!id || !status) {
        res.status(400).json({ error: "ungueltige anfrage" });
        return;
    }
    try {
        const db = yield Promise.resolve(require("./db"));
        const cur = yield db.query("select status from bestellungen where id = $1", [id]);
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
            yield db.query("update bestellungen set status = $1, auftrags_bestaetigt = $2 where id = $3", [status, auftragsBestaetigt, id]);
        }
        else {
            yield db.query("update bestellungen set status = $1 where id = $2", [
                status,
                id,
            ]);
        }
        res.status(204).send();
    }
    catch (error) {
        console.error(error);
        res.status(500).send("error");
    }
}));
// Test SMTP connection (used by settings UI)
app.post("/api/mail/test", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // build effective SMTP config from DB settings + env
        const settings = yield Promise.resolve(require("./repositories/settings"));
        const dbSettings = yield settings.listSettings();
        const cfg = {};
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
        const result = yield (0, email_1.testSmtpConnection)(cfg);
        if (result.ok) {
            res.json({ ok: true, message: "SMTP Verbindung OK", used: result.used });
        }
        else {
            res.status(502).json({
                ok: false,
                error: String(result.error || "unknown"),
                used: result.used,
            });
        }
    }
    catch (err) {
        console.error("SMTP test error", err);
        res.status(500).json({ ok: false, error: String(err) });
    }
}));
app.delete("/api/bestellungen/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const bestellungId = parseInteger(req.params.id);
    if (!bestellungId) {
        res.status(400).json({ error: "Ungueltige Bestellungs-ID." });
        return;
    }
    try {
        yield (0, bestellungen_1.deleteBestellung)(bestellungId);
        res.status(204).send();
    }
    catch (error) {
        console.error("Fehler beim Loeschen der Bestellung", error);
        res
            .status(500)
            .json({ error: "Bestellung konnte nicht geloescht werden." });
    }
}));
app.get("/api/lieferanten", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const lieferanten = yield (0, lieferanten_1.listLieferanten)();
        res.json(lieferanten);
    }
    catch (error) {
        console.error("Fehler beim Laden der Lieferanten", error);
        res
            .status(500)
            .json({ error: "Lieferanten konnten nicht geladen werden." });
    }
}));
app.post("/api/lieferanten", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const kontaktPerson = typeof req.body.kontaktPerson === "string"
        ? req.body.kontaktPerson.trim()
        : undefined;
    const email = typeof req.body.email === "string" ? req.body.email.trim() : undefined;
    const telefon = typeof req.body.telefon === "string" ? req.body.telefon.trim() : undefined;
    const strasse = parseString(req.body.strasse);
    const plz = parseString(req.body.plz);
    const stadt = parseString(req.body.stadt);
    const land = parseString(req.body.land);
    if (!name) {
        res.status(400).json({ error: "name ist ein Pflichtfeld." });
        return;
    }
    try {
        const lieferant = yield (0, lieferanten_1.createLieferant)({
            name,
            kontaktPerson,
            email,
            telefon,
            strasse,
            plz,
            stadt,
            land,
        });
        res.status(201).json(lieferant);
    }
    catch (error) {
        console.error("Fehler beim Erstellen des Lieferanten", error);
        res.status(500).json({ error: "Lieferant konnte nicht erstellt werden." });
    }
}));
app.get("/api/lieferanten/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const lieferantId = parseInteger(req.params.id);
    if (!lieferantId) {
        res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
        return;
    }
    try {
        const lieferant = yield (0, lieferanten_1.getLieferantById)(lieferantId);
        if (!lieferant) {
            res.status(404).json({ error: "Lieferant nicht gefunden." });
            return;
        }
        res.json(lieferant);
    }
    catch (error) {
        console.error("Fehler beim Laden des Lieferanten", error);
        res.status(500).json({ error: "Lieferant konnte nicht geladen werden." });
    }
}));
app.put("/api/lieferanten/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const lieferantId = parseInteger(req.params.id);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
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
        const lieferant = yield (0, lieferanten_1.updateLieferant)(lieferantId, {
            name,
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
    }
    catch (error) {
        console.error("Fehler beim Aktualisieren des Lieferanten", error);
        res
            .status(500)
            .json({ error: "Lieferant konnte nicht aktualisiert werden." });
    }
}));
app.delete("/api/lieferanten/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const lieferantId = parseInteger(req.params.id);
    if (!lieferantId) {
        res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
        return;
    }
    try {
        const deleted = yield (0, lieferanten_1.deleteLieferant)(lieferantId);
        if (!deleted) {
            res.status(404).json({ error: "Lieferant nicht gefunden." });
            return;
        }
        res.status(204).send();
    }
    catch (error) {
        const err = error;
        if (err && err.code === "23503") {
            res.status(409).json({ error: "Lieferant ist noch referenziert." });
            return;
        }
        console.error("Fehler beim Loeschen des Lieferanten", error);
        res.status(500).json({ error: "Lieferant konnte nicht geloescht werden." });
    }
}));
app.get("/api/lieferanten/:id/artikel", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const lieferantId = parseInteger(req.params.id);
    if (!lieferantId) {
        res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
        return;
    }
    try {
        const artikel = yield (0, lieferanten_1.listLieferantArtikel)(lieferantId);
        res.json(artikel);
    }
    catch (error) {
        console.error("Fehler beim Laden der Lieferanten-Artikel", error);
        res.status(500).json({ error: "Artikel konnten nicht geladen werden." });
    }
}));
app.get("/api/lieferanten/:id/bestellungen", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const lieferantId = parseInteger(req.params.id);
    if (!lieferantId) {
        res.status(400).json({ error: "Ungueltige Lieferanten-ID." });
        return;
    }
    try {
        const bestellungen = yield (0, lieferanten_1.listLieferantBestellungen)(lieferantId);
        res.json(bestellungen);
    }
    catch (error) {
        console.error("Fehler beim Laden des Bestellverlaufs", error);
        res
            .status(500)
            .json({ error: "Bestellverlauf konnte nicht geladen werden." });
    }
}));
app.get("/api/artikel", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const artikel = yield (0, artikel_1.listArtikel)();
        res.json(artikel);
    }
    catch (error) {
        console.error("Fehler beim Laden der Artikel", error);
        res.status(500).json({ error: "Artikel konnten nicht geladen werden." });
    }
}));
app.post("/api/artikel", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const lieferantId = parseInteger(req.body.lieferantId);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const beschreibung = typeof req.body.beschreibung === "string"
        ? req.body.beschreibung.trim()
        : undefined;
    const artikelnummer = typeof req.body.artikelnummer === "string"
        ? req.body.artikelnummer.trim()
        : undefined;
    const einheit = typeof req.body.einheit === "string" ? req.body.einheit.trim() : undefined;
    const verpackungseinheit = typeof req.body.verpackungseinheit === "string"
        ? req.body.verpackungseinheit.trim()
        : undefined;
    const standardBestellwert = parseInteger(req.body.standardBestellwert);
    const fotoUrl = typeof req.body.fotoUrl === "string" ? req.body.fotoUrl.trim() : undefined;
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
        const artikel = yield (0, artikel_1.createArtikel)({
            lieferantId,
            name,
            beschreibung,
            artikelnummer,
            einheit,
            verpackungseinheit,
            standardBestellwert: standardBestellwert !== null && standardBestellwert !== void 0 ? standardBestellwert : undefined,
            fotoUrl,
            preis,
        });
        res.status(201).json(artikel);
    }
    catch (error) {
        console.error("Fehler beim Erstellen des Artikels", error);
        res.status(500).json({ error: "Artikel konnte nicht erstellt werden." });
    }
}));
app.put("/api/artikel/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const artikelId = parseInteger(req.params.id);
    const lieferantId = parseInteger(req.body.lieferantId);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const beschreibung = typeof req.body.beschreibung === "string"
        ? req.body.beschreibung.trim()
        : undefined;
    const artikelnummer = typeof req.body.artikelnummer === "string"
        ? req.body.artikelnummer.trim()
        : undefined;
    const einheit = typeof req.body.einheit === "string" ? req.body.einheit.trim() : undefined;
    const verpackungseinheit = typeof req.body.verpackungseinheit === "string"
        ? req.body.verpackungseinheit.trim()
        : undefined;
    const standardBestellwert = parseInteger(req.body.standardBestellwert);
    const fotoUrl = typeof req.body.fotoUrl === "string" ? req.body.fotoUrl.trim() : undefined;
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
        const artikel = yield (0, artikel_1.updateArtikel)(artikelId, {
            lieferantId,
            name,
            beschreibung,
            artikelnummer,
            einheit,
            verpackungseinheit,
            standardBestellwert: standardBestellwert !== null && standardBestellwert !== void 0 ? standardBestellwert : undefined,
            fotoUrl,
            preis,
        });
        if (!artikel) {
            res.status(404).json({ error: "Artikel nicht gefunden." });
            return;
        }
        res.json(artikel);
    }
    catch (error) {
        console.error("Fehler beim Aktualisieren des Artikels", error);
        res
            .status(500)
            .json({ error: "Artikel konnte nicht aktualisiert werden." });
    }
}));
app.delete("/api/artikel/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const artikelId = parseInteger(req.params.id);
    if (!artikelId) {
        res.status(400).json({ error: "Ungueltige Artikel-ID." });
        return;
    }
    try {
        const deleted = yield (0, artikel_1.deleteArtikel)(artikelId);
        if (!deleted) {
            res.status(404).json({ error: "Artikel nicht gefunden." });
            return;
        }
        res.status(204).send();
    }
    catch (error) {
        const err = error;
        if (err && err.code === "23503") {
            res.status(409).json({ error: "Artikel ist noch referenziert." });
            return;
        }
        console.error("Fehler beim Loeschen des Artikels", error);
        res.status(500).json({ error: "Artikel konnte nicht geloescht werden." });
    }
}));
app.get("/login", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "login.html"));
});
app.get("/uebersicht", requireUserPage, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "uebersicht.html"));
});
app.get("/bestellungen", requireUserPage, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "bestellungen.html"));
});
app.get("/einstellungen", requireUserPage, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "einstellungen.html"));
});
app.get("/bestellung-neu", requireUserPage, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "bestellung-neu.html"));
});
app.get("/nutzerverwaltung", requireAdminPage, (req, res) => {
    res.redirect("/einstellungen");
});
app.get("/api/settings", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listSettings } = yield Promise.resolve(require("./repositories/settings"));
        const settings = yield listSettings();
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).send("error");
    }
}));
// Return effective settings (DB + environment overrides) for frontend display
app.get("/api/settings/effective", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listSettings } = yield Promise.resolve(require("./repositories/settings"));
        const dbSettings = yield listSettings();
        const effective = Object.assign({}, dbSettings);
        // overlay common MAIL_* env vars if not set in DB
        const envMap = {
            mail_host: process.env.MAIL_HOST || process.env.SMTP_HOST || null,
            mail_port: process.env.MAIL_PORT || process.env.SMTP_PORT || null,
            mail_user: process.env.MAIL_USER || process.env.SMTP_USER || null,
            mail_from: process.env.MAIL_FROM || null,
            mail_to: process.env.MAIL_TO || null,
        };
        Object.keys(envMap).forEach((k) => {
            if (!effective[k] && envMap[k] !== null)
                effective[k] = String(envMap[k]);
        });
        res.json(effective);
    }
    catch (err) {
        console.error("effective settings error", err);
        res.status(500).json({ error: "error" });
    }
}));
// Dashboard notes endpoints: persist simple notes in settings table
app.get("/api/dashboard/notes", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const notesRaw = yield settingsRepo.getSetting("dashboard_notes");
        // normalize legacy empty-string value to JSON array in DB
        if (notesRaw === "") {
            try {
                yield settingsRepo.setSetting("dashboard_notes", "[]");
            }
            catch (e) {
                /* ignore */
            }
        }
        let notesArr = [];
        if (notesRaw) {
            try {
                const parsed = JSON.parse(notesRaw);
                if (Array.isArray(parsed))
                    notesArr = parsed;
            }
            catch (e) {
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
    }
    catch (err) {
        console.error("Error loading dashboard notes", err);
        res.status(500).json({ error: "Konnte Notizen nicht laden" });
    }
}));
app.put("/api/dashboard/notes", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _9, _10;
    try {
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        // Accept either a single new note via { note: 'text' }
        // or a full replacement via { notes: [...] }
        if (Array.isArray((_9 = req.body) === null || _9 === void 0 ? void 0 : _9.notes)) {
            const notesArr = req.body.notes;
            yield settingsRepo.setSetting("dashboard_notes", JSON.stringify(notesArr));
            res.status(204).send();
            return;
        }
        if (typeof ((_10 = req.body) === null || _10 === void 0 ? void 0 : _10.note) === "string" && req.body.note.trim()) {
            const noteText = req.body.note.trim();
            const existingRaw = yield settingsRepo.getSetting("dashboard_notes");
            let notesArr = [];
            if (existingRaw) {
                try {
                    const parsed = JSON.parse(existingRaw);
                    if (Array.isArray(parsed))
                        notesArr = parsed;
                }
                catch (e) { }
            }
            const newNote = {
                id: Date.now(),
                text: noteText,
                done: false,
                createdAt: new Date().toISOString(),
            };
            notesArr.unshift(newNote);
            yield settingsRepo.setSetting("dashboard_notes", JSON.stringify(notesArr));
            res.status(201).json(newNote);
            return;
        }
        res.status(400).json({ error: "ungueltige anfrage" });
    }
    catch (err) {
        console.error("Error saving dashboard notes", err);
        res.status(500).json({ error: "Konnte Notizen nicht speichern" });
    }
}));
// Dashboard chat endpoints: simple shared chat persisted in settings table
app.get("/api/dashboard/chat", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const raw = yield settingsRepo.getSetting("dashboard_chat");
        let messages = [];
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed))
                    messages = parsed;
            }
            catch (_11) {
                messages = [];
            }
        }
        res.json({ messages });
    }
    catch (err) {
        console.error("Error loading dashboard chat", err);
        res.status(500).json({ error: "Konnte Chat nicht laden" });
    }
}));
app.post("/api/dashboard/chat", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _12;
    try {
        const text = typeof ((_12 = req.body) === null || _12 === void 0 ? void 0 : _12.text) === "string" ? req.body.text.trim() : "";
        if (!text) {
            res.status(400).json({ error: "text required" });
            return;
        }
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const raw = yield settingsRepo.getSetting("dashboard_chat");
        let messages = [];
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed))
                    messages = parsed;
            }
            catch (_13) { }
        }
        const actor = yield resolveActorProfile(req.firebaseUser);
        const msg = {
            id: Date.now(),
            text: text.slice(0, 2000),
            author: actor.name || actor.email || actor.uid || "Unbekannt",
            authorUid: actor.uid || null,
            createdAt: new Date().toISOString(),
        };
        messages.unshift(msg);
        if (messages.length > 200)
            messages = messages.slice(0, 200);
        yield settingsRepo.setSetting("dashboard_chat", JSON.stringify(messages));
        res.status(201).json(msg);
    }
    catch (err) {
        console.error("Error saving dashboard chat", err);
        res.status(500).json({ error: "Konnte Chat nicht speichern" });
    }
}));
app.put("/api/settings", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const body = req.body || {};
        if (body.bestellnummer_prefix !== undefined) {
            yield settingsRepo.setSetting("bestellnummer_prefix", String(body.bestellnummer_prefix));
        }
        if (body.bestellnummer_seq_digits !== undefined) {
            yield settingsRepo.setSetting("bestellnummer_seq_digits", String(body.bestellnummer_seq_digits));
        }
        // SMTP / Mail settings and templates
        if (body.mail_host !== undefined)
            yield settingsRepo.setSetting("mail_host", String(body.mail_host));
        if (body.mail_port !== undefined)
            yield settingsRepo.setSetting("mail_port", String(body.mail_port));
        if (body.mail_user !== undefined)
            yield settingsRepo.setSetting("mail_user", String(body.mail_user));
        if (body.mail_pass !== undefined)
            yield settingsRepo.setSetting("mail_pass", String(body.mail_pass));
        if (body.mail_from !== undefined)
            yield settingsRepo.setSetting("mail_from", String(body.mail_from));
        if (body.mail_to !== undefined)
            yield settingsRepo.setSetting("mail_to", String(body.mail_to));
        if (body.email_subject !== undefined)
            yield settingsRepo.setSetting("email_subject", String(body.email_subject));
        if (body.email_body !== undefined)
            yield settingsRepo.setSetting("email_body", String(body.email_body));
        if (body.email_signature !== undefined)
            yield settingsRepo.setSetting("email_signature", String(body.email_signature));
        if (body.email_recipient !== undefined)
            yield settingsRepo.setSetting("email_recipient", String(body.email_recipient));
        // Reminder templates (separate from order templates)
        if (body.reminder_subject !== undefined)
            yield settingsRepo.setSetting("reminder_subject", String(body.reminder_subject));
        if (body.reminder_body !== undefined)
            yield settingsRepo.setSetting("reminder_body", String(body.reminder_body));
        res.status(204).send();
    }
    catch (error) {
        console.error(error);
        res.status(500).send("error");
    }
}));
app.put("/api/settings/sequence", express_1.default.json(), requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _14, _15, _16;
    try {
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const db = yield Promise.resolve(require("./db"));
        const prefixSetting = yield settingsRepo.getSetting("bestellnummer_prefix");
        const seqDigitsSetting = yield settingsRepo.getSetting("bestellnummer_seq_digits");
        if (!prefixSetting || !seqDigitsSetting) {
            res
                .status(400)
                .json({ error: "Prefix oder Anzahl Ziffern nicht konfiguriert." });
            return;
        }
        const prefix = String(prefixSetting);
        const seqDigits = Number(seqDigitsSetting);
        const lastDigits = Number((_14 = req.body) === null || _14 === void 0 ? void 0 : _14.lastDigits);
        if (!Number.isInteger(lastDigits) ||
            lastDigits < 0 ||
            lastDigits >= Math.pow(10, seqDigits)) {
            res.status(400).json({ error: "ungueltige lastDigits" });
            return;
        }
        const multiplier = Math.pow(10, seqDigits);
        const lower = Number(prefix) * multiplier;
        const upper = (Number(prefix) + 1) * multiplier - 1;
        // we store the full next number; choose next = prefix*multiplier + lastDigits + 1
        const desiredNext = Number(prefix) * multiplier + lastDigits + 1;
        const maxRes = yield db.query("select max(bestellnummer) as mx from bestellungen where bestellnummer between $1 and $2", [lower, upper]);
        const mx = (_16 = (_15 = maxRes.rows[0]) === null || _15 === void 0 ? void 0 : _15.mx) !== null && _16 !== void 0 ? _16 : null;
        if (mx && Number(mx) >= desiredNext) {
            res.status(400).json({
                error: "Gewuenschte Zahl ist kleiner oder gleich bestehender Maximalnummer.",
            });
            return;
        }
        const overrideKey = `bestellnummer_next_${prefix}`;
        yield settingsRepo.setSetting(overrideKey, String(desiredNext));
        res.status(204).send();
    }
    catch (error) {
        console.error(error);
        res.status(500).send("error");
    }
}));
app.get("/api/bestellungen/next-number", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getNextBestellnummer } = yield Promise.resolve(require("./repositories/bestellungen"));
        const date = req.query.date ? String(req.query.date) : undefined;
        const next = yield getNextBestellnummer(date);
        res.json({ next });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("error");
    }
}));
// Export endpoint (JSON or CSV)
app.get("/api/export/:entity", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const entity = String(req.params.entity || "").toLowerCase();
    const format = String(req.query.format || "json").toLowerCase();
    try {
        let items = [];
        if (entity === "lieferanten") {
            const { listLieferanten } = yield Promise.resolve(require("./repositories/lieferanten"));
            items = yield listLieferanten();
        }
        else if (entity === "artikel") {
            const { listArtikel } = yield Promise.resolve(require("./repositories/artikel"));
            items = yield listArtikel();
        }
        else if (entity === "bestellungen") {
            const { listBestellungen } = yield Promise.resolve(require("./repositories/bestellungen"));
            items = yield listBestellungen();
        }
        else if (entity === "settings") {
            const { listSettings } = yield Promise.resolve(require("./repositories/settings"));
            items = yield listSettings();
        }
        else {
            res.status(404).json({ error: "unknown entity" });
            return;
        }
        if (format === "csv") {
            // simple CSV serialization
            const escapeCsv = (v) => {
                if (v === null || v === undefined)
                    return "";
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
                res.setHeader("Content-Disposition", `attachment; filename="${entity}.csv"`);
                res.send(csv);
                return;
            }
            const headerKeys = Array.isArray(items) && items.length ? Object.keys(items[0]) : [];
            const rows = [headerKeys.join(",")];
            for (const it of Array.isArray(items) ? items : []) {
                const vals = headerKeys.map((k) => escapeCsv(it[k]));
                rows.push(vals.join(","));
            }
            const csv = rows.join("\n");
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${entity}.csv"`);
            res.send(csv);
            return;
        }
        res.json(items);
    }
    catch (error) {
        const errAny = error;
        console.error("Export error", errAny && (errAny.stack || errAny));
        res.status(500).json({
            error: "Export fehlgeschlagen",
            detail: String(errAny && (errAny.stack || errAny)).slice(0, 1000),
        });
    }
}));
// One-click backup: return combined JSON of main entities
app.get("/api/backup", requireAdminApi, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [{ listLieferanten }, { listArtikel }, { listBestellungen }, { listSettings },] = yield Promise.all([
            Promise.resolve(require("./repositories/lieferanten")),
            Promise.resolve(require("./repositories/artikel")),
            Promise.resolve(require("./repositories/bestellungen")),
            Promise.resolve(require("./repositories/settings")),
        ]);
        const [lieferanten, artikel, bestellungen, settings] = yield Promise.all([
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
    }
    catch (error) {
        console.error("Backup error", error);
        res.status(500).json({ error: "Backup fehlgeschlagen" });
    }
}));
const normText = (v) => String(v !== null && v !== void 0 ? v : "")
    .trim()
    .toLowerCase();
const nonEmptyOrNull = (v) => {
    const s = String(v !== null && v !== void 0 ? v : "").trim();
    return s ? s : null;
};
const upsertLieferantByName = (db, item) => __awaiter(void 0, void 0, void 0, function* () {
    var _17, _18, _19;
    const name = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.name);
    if (!name)
        return { id: 0, action: "skipped" };
    const existing = yield db.query("select id from lieferanten where lower(trim(name)) = lower(trim($1)) limit 1", [name]);
    const kontakt = nonEmptyOrNull((_17 = item === null || item === void 0 ? void 0 : item.kontaktPerson) !== null && _17 !== void 0 ? _17 : item === null || item === void 0 ? void 0 : item.kontakt_person);
    const email = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.email);
    const telefon = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.telefon);
    const strasse = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.strasse);
    const plz = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.plz);
    const stadt = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.stadt);
    const land = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.land);
    if ((_18 = existing.rows[0]) === null || _18 === void 0 ? void 0 : _18.id) {
        const id = Number(existing.rows[0].id);
        const updated = yield db.query(`update lieferanten
          set kontakt_person = coalesce($2, kontakt_person),
              email = coalesce($3, email),
              telefon = coalesce($4, telefon),
              strasse = coalesce($5, strasse),
              plz = coalesce($6, plz),
              stadt = coalesce($7, stadt),
              land = coalesce($8, land)
        where id = $1`, [id, kontakt, email, telefon, strasse, plz, stadt, land]);
        return {
            id,
            action: ((_19 = updated.rowCount) !== null && _19 !== void 0 ? _19 : 0) > 0 ? "updated" : "skipped",
        };
    }
    const inserted = yield db.query(`insert into lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning id`, [name, kontakt, email, telefon, strasse, plz, stadt, land]);
    return { id: Number(inserted.rows[0].id), action: "created" };
});
const upsertArtikelForLieferant = (db, lieferantId, item) => __awaiter(void 0, void 0, void 0, function* () {
    var _20, _21, _22, _23;
    const name = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.name);
    const preisNum = Number(item === null || item === void 0 ? void 0 : item.preis);
    if (!lieferantId || !name || !Number.isFinite(preisNum)) {
        return { id: 0, action: "skipped" };
    }
    const artikelnummer = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.artikelnummer);
    let existing = { rows: [] };
    if (artikelnummer) {
        existing = yield db.query(`select id from artikel
        where lieferant_id = $1
          and lower(trim(coalesce(artikelnummer,''))) = lower(trim($2))
        limit 1`, [lieferantId, artikelnummer]);
    }
    if (!((_20 = existing.rows[0]) === null || _20 === void 0 ? void 0 : _20.id)) {
        existing = yield db.query(`select id from artikel
        where lieferant_id = $1
          and lower(trim(name)) = lower(trim($2))
        limit 1`, [lieferantId, name]);
    }
    const beschreibung = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.beschreibung);
    const einheit = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.einheit);
    const ve = nonEmptyOrNull(item === null || item === void 0 ? void 0 : item.verpackungseinheit);
    const standardBestellwertRaw = Number(item === null || item === void 0 ? void 0 : item.standardBestellwert);
    const standardBestellwert = Number.isFinite(standardBestellwertRaw)
        ? Math.max(1, Math.trunc(standardBestellwertRaw))
        : null;
    const fotoUrl = nonEmptyOrNull((_21 = item === null || item === void 0 ? void 0 : item.fotoUrl) !== null && _21 !== void 0 ? _21 : item === null || item === void 0 ? void 0 : item.foto_url);
    if ((_22 = existing.rows[0]) === null || _22 === void 0 ? void 0 : _22.id) {
        const id = Number(existing.rows[0].id);
        const updated = yield db.query(`update artikel
          set name = $2,
              beschreibung = coalesce($3, beschreibung),
              artikelnummer = coalesce($4, artikelnummer),
              einheit = coalesce($5, einheit),
              verpackungseinheit = coalesce($6, verpackungseinheit),
              standard_bestellwert = coalesce($7, standard_bestellwert),
              foto_url = coalesce($8, foto_url),
              preis = $9
        where id = $1`, [
            id,
            name,
            beschreibung,
            artikelnummer,
            einheit,
            ve,
            standardBestellwert,
            fotoUrl,
            preisNum,
        ]);
        return {
            id,
            action: ((_23 = updated.rowCount) !== null && _23 !== void 0 ? _23 : 0) > 0 ? "updated" : "skipped",
        };
    }
    const inserted = yield db.query(`insert into artikel
      (lieferant_id, name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert, foto_url, preis)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     returning id`, [
        lieferantId,
        name,
        beschreibung,
        artikelnummer,
        einheit,
        ve,
        standardBestellwert,
        fotoUrl,
        preisNum,
    ]);
    return { id: Number(inserted.rows[0].id), action: "created" };
});
app.post("/api/import/catalog", requireAdminApi, express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _24, _25, _26, _27;
    try {
        const db = yield Promise.resolve(require("./db"));
        const lieferanten = Array.isArray((_24 = req.body) === null || _24 === void 0 ? void 0 : _24.lieferanten)
            ? req.body.lieferanten
            : [];
        const artikel = Array.isArray((_25 = req.body) === null || _25 === void 0 ? void 0 : _25.artikel) ? req.body.artikel : [];
        const lieferantenStats = { created: 0, updated: 0, skipped: 0 };
        const lieferantenIdMap = new Map();
        const lieferantenNameMap = new Map();
        for (const l of lieferanten) {
            const out = yield upsertLieferantByName(db, l);
            if (Number.isFinite(Number(l === null || l === void 0 ? void 0 : l.id)) && out.id) {
                lieferantenIdMap.set(Number(l.id), out.id);
            }
            if ((l === null || l === void 0 ? void 0 : l.name) && out.id) {
                lieferantenNameMap.set(normText(l.name), out.id);
            }
            if (out.action === "created")
                lieferantenStats.created++;
            else if (out.action === "updated")
                lieferantenStats.updated++;
            else
                lieferantenStats.skipped++;
        }
        const artikelStats = { created: 0, updated: 0, skipped: 0 };
        for (const a of artikel) {
            let lid = Number((_27 = (_26 = a === null || a === void 0 ? void 0 : a.lieferantId) !== null && _26 !== void 0 ? _26 : a === null || a === void 0 ? void 0 : a.lieferant_id) !== null && _27 !== void 0 ? _27 : 0);
            if (lieferantenIdMap.has(lid))
                lid = Number(lieferantenIdMap.get(lid));
            if (!lid && (a === null || a === void 0 ? void 0 : a.lieferantName)) {
                lid = Number(lieferantenNameMap.get(normText(a.lieferantName)) || 0);
            }
            const out = yield upsertArtikelForLieferant(db, lid, a);
            if (out.action === "created")
                artikelStats.created++;
            else if (out.action === "updated")
                artikelStats.updated++;
            else
                artikelStats.skipped++;
        }
        res.json({ success: true, lieferantenStats, artikelStats });
    }
    catch (error) {
        console.error("Import catalog error", error);
        res.status(500).json({ error: "Katalog-Import fehlgeschlagen" });
    }
}));
app.post("/api/backup/restore", requireAdminApi, express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _28, _29, _30, _31;
    try {
        const backup = req.body || {};
        const db = yield Promise.resolve(require("./db"));
        const lieferanten = Array.isArray(backup.lieferanten) ? backup.lieferanten : [];
        const artikel = Array.isArray(backup.artikel) ? backup.artikel : [];
        const bestellungen = Array.isArray(backup.bestellungen)
            ? backup.bestellungen
            : [];
        const settings = backup.settings && typeof backup.settings === "object"
            ? backup.settings
            : {};
        const lieferantenIdMap = new Map();
        const lieferantenNameMap = new Map();
        const lieferantenStats = { created: 0, updated: 0, skipped: 0 };
        for (const l of lieferanten) {
            const out = yield upsertLieferantByName(db, l);
            if (Number.isFinite(Number(l === null || l === void 0 ? void 0 : l.id)) && out.id) {
                lieferantenIdMap.set(Number(l.id), out.id);
            }
            if ((l === null || l === void 0 ? void 0 : l.name) && out.id) {
                lieferantenNameMap.set(normText(l.name), out.id);
            }
            if (out.action === "created")
                lieferantenStats.created++;
            else if (out.action === "updated")
                lieferantenStats.updated++;
            else
                lieferantenStats.skipped++;
        }
        const artikelIdMap = new Map();
        const artikelStats = { created: 0, updated: 0, skipped: 0 };
        for (const a of artikel) {
            let lid = Number((_29 = (_28 = a === null || a === void 0 ? void 0 : a.lieferantId) !== null && _28 !== void 0 ? _28 : a === null || a === void 0 ? void 0 : a.lieferant_id) !== null && _29 !== void 0 ? _29 : 0);
            if (lieferantenIdMap.has(lid))
                lid = Number(lieferantenIdMap.get(lid));
            if (!lid && (a === null || a === void 0 ? void 0 : a.lieferantName)) {
                lid = Number(lieferantenNameMap.get(normText(a.lieferantName)) || 0);
            }
            const out = yield upsertArtikelForLieferant(db, lid, a);
            if (Number.isFinite(Number(a === null || a === void 0 ? void 0 : a.id)) && out.id) {
                artikelIdMap.set(Number(a.id), out.id);
            }
            if (out.action === "created")
                artikelStats.created++;
            else if (out.action === "updated")
                artikelStats.updated++;
            else
                artikelStats.skipped++;
        }
        let ordersCreated = 0;
        let ordersSkipped = 0;
        let orderErrors = 0;
        let orderWarning = "";
        const bestellungColsRes = yield db.query(`select column_name
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'bestellungen'`);
        const bestellungCols = new Set((bestellungColsRes.rows || []).map((r) => String(r.column_name)));
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
                const bestellnummer = Number(b === null || b === void 0 ? void 0 : b.bestellnummer);
                const positionenRaw = Array.isArray(b === null || b === void 0 ? void 0 : b.positionen) ? b.positionen : [];
                if (!Number.isFinite(bestellnummer) || !positionenRaw.length) {
                    ordersSkipped++;
                    continue;
                }
                const exists = yield db.query("select id from bestellungen where bestellnummer = $1 limit 1", [bestellnummer]);
                if ((_30 = exists.rows[0]) === null || _30 === void 0 ? void 0 : _30.id) {
                    ordersSkipped++;
                    continue;
                }
                const mappedPos = positionenRaw
                    .map((p) => {
                    const oldAid = Number(p === null || p === void 0 ? void 0 : p.artikelId);
                    const oldLid = Number(p === null || p === void 0 ? void 0 : p.lieferantId);
                    let newAid = Number(artikelIdMap.get(oldAid) || oldAid);
                    let newLid = Number(lieferantenIdMap.get(oldLid) || oldLid);
                    if (!newLid && (p === null || p === void 0 ? void 0 : p.lieferantName)) {
                        newLid = Number(lieferantenNameMap.get(normText(p.lieferantName)) || 0);
                    }
                    return {
                        artikelId: newAid,
                        lieferantId: newLid,
                        menge: Number((p === null || p === void 0 ? void 0 : p.menge) || 0),
                        notiz: nonEmptyOrNull(p === null || p === void 0 ? void 0 : p.notiz),
                    };
                })
                    .filter((p) => p.artikelId && p.lieferantId && p.menge > 0);
                if (!mappedPos.length) {
                    ordersSkipped++;
                    continue;
                }
                const statusCandidate = String((b === null || b === void 0 ? void 0 : b.status) || "offen");
                const status = statusCandidate === "offen" ||
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
                const insertVals = [
                    bestellnummer,
                    first.artikelId,
                    first.lieferantId,
                    first.menge,
                    status,
                    (b === null || b === void 0 ? void 0 : b.bestellDatum) || null,
                ];
                if (hasCreatedByUid) {
                    insertCols.splice(1, 0, "created_by_uid");
                    insertVals.splice(1, 0, nonEmptyOrNull(b === null || b === void 0 ? void 0 : b.createdByUid));
                }
                if (hasCreatedByName) {
                    const idx = hasCreatedByUid ? 2 : 1;
                    insertCols.splice(idx, 0, "created_by_name");
                    insertVals.splice(idx, 0, nonEmptyOrNull(b === null || b === void 0 ? void 0 : b.createdByName));
                }
                if (hasCreatedByEmail) {
                    const idx = hasCreatedByUid && hasCreatedByName ? 3 : hasCreatedByUid || hasCreatedByName ? 2 : 1;
                    insertCols.splice(idx, 0, "created_by_email");
                    insertVals.splice(idx, 0, nonEmptyOrNull(b === null || b === void 0 ? void 0 : b.createdByEmail));
                }
                const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(",");
                const inserted = yield db.query(`insert into bestellungen (${insertCols.join(",")})
         values (${placeholders})
         returning id`, insertVals);
                const newId = Number(inserted.rows[0].id);
                for (const p of mappedPos) {
                    yield db.query(`insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge, notiz)
           values ($1,$2,$3,$4,$5)`, [newId, p.artikelId, p.lieferantId, p.menge, p.notiz]);
                }
                ordersCreated++;
            }
            catch (err) {
                orderErrors++;
                ordersSkipped++;
            }
        }
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const settingKeys = Object.keys(settings || {});
        for (const key of settingKeys) {
            yield settingsRepo.setSetting(key, String((_31 = settings[key]) !== null && _31 !== void 0 ? _31 : ""));
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
    }
    catch (error) {
        console.error("Backup restore error", error);
        res.status(500).json({ error: "Backup-Import fehlgeschlagen" });
    }
}));
// Send order by email and set status to 'bestellt'
const buildOpenOrderGroups = () => __awaiter(void 0, void 0, void 0, function* () {
    var _32, _33, _34, _35, _36;
    const { listBestellungen } = yield Promise.resolve(require("./repositories/bestellungen"));
    const db = yield Promise.resolve(require("./db"));
    const allBestellungen = yield listBestellungen();
    const offene = (Array.isArray(allBestellungen) ? allBestellungen : []).filter((b) => String(b.status || "offen") === "offen");
    const orderMetaById = new Map(offene.map((b) => [
        Number(b.id),
        {
            bestellDatum: (b === null || b === void 0 ? void 0 : b.bestellDatum)
                ? new Date(b.bestellDatum).toISOString()
                : undefined,
            createdByName: String((b === null || b === void 0 ? void 0 : b.createdByName) || (b === null || b === void 0 ? void 0 : b.createdByEmail) || (b === null || b === void 0 ? void 0 : b.createdByUid) || "").trim() || undefined,
        },
    ]));
    const artikelIds = Array.from(new Set(offene.flatMap((b) => Array.isArray(b.positionen) ? b.positionen.map((p) => p.artikelId) : [])));
    const lieferantIds = Array.from(new Set(offene.flatMap((b) => Array.isArray(b.positionen)
        ? b.positionen.map((p) => p.lieferantId)
        : [])));
    let artikelRows = [];
    if (artikelIds.length) {
        const res = yield db.query("select id, name, preis from artikel where id = ANY($1)", [artikelIds]);
        artikelRows = res.rows || [];
    }
    let lieferantRows = [];
    if (lieferantIds.length) {
        const res = yield db.query("select id, name from lieferanten where id = ANY($1)", [lieferantIds]);
        lieferantRows = res.rows || [];
    }
    const artikelMap = {};
    artikelRows.forEach((r) => {
        artikelMap[Number(r.id)] = r;
    });
    const lieferantMap = {};
    lieferantRows.forEach((r) => {
        lieferantMap[Number(r.id)] = r;
    });
    const groups = new Map();
    for (const b of offene) {
        const orderId = Number(b.id);
        const nr = String((_33 = (_32 = b.bestellnummer) !== null && _32 !== void 0 ? _32 : b.id) !== null && _33 !== void 0 ? _33 : "");
        const pos = Array.isArray(b.positionen) ? b.positionen : [];
        for (const p of pos) {
            const lid = Number(p.lieferantId);
            if (!Number.isFinite(lid))
                continue;
            const group = groups.get(lid) ||
                {
                    lieferantId: lid,
                    lieferantName: ((_34 = lieferantMap[lid]) === null || _34 === void 0 ? void 0 : _34.name) || `Lieferant #${lid}`,
                    orderIds: new Set(),
                    bestellnummern: new Set(),
                    positionen: [],
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
                menge,
                preis,
                notiz: p.notiz ? String(p.notiz) : undefined,
                bestellDatum: (_35 = orderMetaById.get(orderId)) === null || _35 === void 0 ? void 0 : _35.bestellDatum,
                createdByName: (_36 = orderMetaById.get(orderId)) === null || _36 === void 0 ? void 0 : _36.createdByName,
            });
            group.gesamt += menge * preis;
            groups.set(lid, group);
        }
    }
    return Array.from(groups.values()).sort((a, b) => a.lieferantName.localeCompare(b.lieferantName, "de"));
});
const buildSammelDraftForGroup = (settingsRepo, group, baseTo) => __awaiter(void 0, void 0, void 0, function* () {
    const subjTemplate = (yield settingsRepo.getSetting("email_subject")) ||
        "Sammelbestellung {{lieferant}}";
    const bodyTemplate = (yield settingsRepo.getSetting("email_body")) ||
        "<h2>Sammelbestellung {{lieferant}}</h2>{{artikel_liste}}";
    const signature = (yield settingsRepo.getSetting("email_signature")) || "";
    let artikelHtml = `<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr style="text-align:left"><th>Bestellung</th><th>Artikel</th><th>Menge</th><th>Preis</th><th>Gesamt</th><th>Notiz</th></tr></thead><tbody>`;
    let artikelText = "";
    for (const p of group.positionen || []) {
        const gesamt = (Number(p.preis) * Number(p.menge)).toFixed(2);
        const notiz = p.notiz ? String(p.notiz) : "";
        artikelHtml += `<tr><td>#${p.bestellnummer}</td><td>${p.artikelName}</td><td>${p.menge}</td><td>${Number(p.preis).toFixed(2)} €</td><td>${gesamt} €</td><td>${notiz}</td></tr>`;
        artikelText += `- #${p.bestellnummer} | ${p.artikelName} | Menge: ${p.menge} | Preis: ${Number(p.preis).toFixed(2)}€ | Gesamt: ${gesamt}€${notiz ? ` | Notiz: ${notiz}` : ""}\n`;
    }
    artikelHtml += "</tbody></table>";
    const replacements = {
        "{{bestellnummer}}": Array.from(group.bestellnummern || []).join(", "),
        "{{datum}}": new Date().toLocaleDateString("de-DE"),
        "{{lieferant}}": String(group.lieferantName || ""),
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
    if (signature) {
        html += `<div>${signature}</div>`;
        text += `\n${signature}`;
    }
    const to = String(baseTo || "").trim();
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
});
app.get("/api/bestellungen/sammel/preview", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const role = getUserRole(req.firebaseUser);
        if (!(role === "admin" || role === "buero")) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        const groups = yield buildOpenOrderGroups();
        res.json({
            groups: groups.map((g) => ({
                lieferantId: g.lieferantId,
                lieferantName: g.lieferantName,
                anzahlBestellungen: g.orderIds.size,
                orderIds: Array.from(g.orderIds),
                bestellnummern: Array.from(g.bestellnummern),
                orders: Object.values(g.positionen.reduce((acc, p) => {
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
                }, {})).map((o) => (Object.assign(Object.assign({}, o), { summe: Number(o.summe.toFixed(2)) }))),
                anzahlPositionen: g.positionen.length,
                gesamt: Number(g.gesamt.toFixed(2)),
            })),
            totalGroups: groups.length,
            totalOrders: groups.reduce((sum, g) => sum + g.orderIds.size, 0),
        });
    }
    catch (error) {
        console.error("Fehler bei Sammelbestellung-Vorschau", error);
        res.status(500).json({ error: "Sammelvorschau fehlgeschlagen" });
    }
}));
app.post("/api/bestellungen/sammel/send/preview", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _37;
    try {
        const role = getUserRole(req.firebaseUser);
        if (!(role === "admin" || role === "buero")) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        const requestedOrderIdsRaw = Array.isArray((_37 = req.body) === null || _37 === void 0 ? void 0 : _37.orderIds)
            ? req.body.orderIds
            : [];
        const requestedOrderIds = new Set(requestedOrderIdsRaw
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v) && v > 0));
        const allGroups = yield buildOpenOrderGroups();
        const groups = requestedOrderIds.size
            ? allGroups
                .map((g) => {
                const filteredPos = g.positionen.filter((p) => requestedOrderIds.has(Number(p.orderId)));
                const filteredOrderIds = new Set(filteredPos.map((p) => Number(p.orderId)));
                const filteredBestellnummern = new Set(filteredPos.map((p) => String(p.bestellnummer)));
                return Object.assign(Object.assign({}, g), { positionen: filteredPos, orderIds: filteredOrderIds, bestellnummern: filteredBestellnummern, gesamt: filteredPos.reduce((sum, p) => sum + Number(p.menge || 0) * Number(p.preis || 0), 0) });
            })
                .filter((g) => g.orderIds.size > 0)
            : allGroups;
        if (!groups.length) {
            res.json({ drafts: [], totalGroups: 0, totalOrders: 0 });
            return;
        }
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const to = yield resolveConfiguredMailRecipient(settingsRepo);
        if (!to) {
            res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
            return;
        }
        const drafts = [];
        for (const g of groups) {
            drafts.push(yield buildSammelDraftForGroup(settingsRepo, g, to));
        }
        res.json({
            drafts,
            totalGroups: drafts.length,
            totalOrders: drafts.reduce((sum, d) => sum + (Array.isArray(d.orderIds) ? d.orderIds.length : 0), 0),
        });
    }
    catch (error) {
        console.error("Fehler bei Sammelbestellung-Entwurf", error);
        res.status(500).json({
            error: "Sammel-Entwurf fehlgeschlagen",
            detail: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 1000),
        });
    }
}));
app.post("/api/bestellungen/sammel/send", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _38, _39;
    try {
        const role = getUserRole(req.firebaseUser);
        if (!(role === "admin" || role === "buero")) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        const requestedOrderIdsRaw = Array.isArray((_38 = req.body) === null || _38 === void 0 ? void 0 : _38.orderIds)
            ? req.body.orderIds
            : [];
        const requestedOrderIds = new Set(requestedOrderIdsRaw
            .map((v) => Number(v))
            .filter((v) => Number.isFinite(v) && v > 0));
        const allGroups = yield buildOpenOrderGroups();
        const groups = requestedOrderIds.size
            ? allGroups
                .map((g) => {
                const filteredPos = g.positionen.filter((p) => requestedOrderIds.has(Number(p.orderId)));
                const filteredOrderIds = new Set(filteredPos.map((p) => Number(p.orderId)));
                const filteredBestellnummern = new Set(filteredPos.map((p) => String(p.bestellnummer)));
                return Object.assign(Object.assign({}, g), { positionen: filteredPos, orderIds: filteredOrderIds, bestellnummern: filteredBestellnummern, gesamt: filteredPos.reduce((sum, p) => sum + Number(p.menge || 0) * Number(p.preis || 0), 0) });
            })
                .filter((g) => g.orderIds.size > 0)
            : allGroups;
        if (!groups.length) {
            res.json({ success: true, sentGroups: 0, updatedOrders: 0 });
            return;
        }
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const to = yield resolveConfiguredMailRecipient(settingsRepo);
        if (!to) {
            res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
            return;
        }
        const overridesRaw = Array.isArray((_39 = req.body) === null || _39 === void 0 ? void 0 : _39.overrides) ? req.body.overrides : [];
        const overridesByLieferantId = new Map();
        overridesRaw.forEach((o) => {
            const lid = Number(o === null || o === void 0 ? void 0 : o.lieferantId);
            if (!Number.isFinite(lid) || lid <= 0)
                return;
            overridesByLieferantId.set(lid, {
                to: parseString(o === null || o === void 0 ? void 0 : o.to) || parseString(o === null || o === void 0 ? void 0 : o.recipient) || "",
                subject: parseString(o === null || o === void 0 ? void 0 : o.subject) || "",
                html: parseString(o === null || o === void 0 ? void 0 : o.html) || "",
                text: parseString(o === null || o === void 0 ? void 0 : o.text) || "",
            });
        });
        const db = yield Promise.resolve(require("./db"));
        const sentOrderIds = new Set();
        const sentGroupNames = [];
        for (const g of groups) {
            const baseDraft = yield buildSammelDraftForGroup(settingsRepo, g, to);
            const override = overridesByLieferantId.get(Number(g.lieferantId)) || null;
            const finalTo = ((override === null || override === void 0 ? void 0 : override.to) && String(override.to).trim()) || String(baseDraft.to || "").trim();
            const finalSubject = ((override === null || override === void 0 ? void 0 : override.subject) && String(override.subject).trim()) || baseDraft.subject;
            const finalHtml = ((override === null || override === void 0 ? void 0 : override.html) && String(override.html)) || baseDraft.html;
            const finalText = ((override === null || override === void 0 ? void 0 : override.text) && String(override.text)) ||
                (finalHtml ? stripHtmlToText(finalHtml) : "") ||
                baseDraft.text;
            yield sendMailUsingConfiguredSmtp(settingsRepo, finalTo, finalSubject, finalText, finalHtml);
            const ids = Array.from(g.orderIds);
            if (ids.length) {
                yield db.query("update bestellungen set status = 'bestellt', auftrags_bestaetigt = false where id = ANY($1::int[]) and status = 'offen'", [ids]);
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
    }
    catch (error) {
        console.error("Fehler bei Sammelbestellung-Ausfuehrung", error);
        res.status(500).json({
            error: "Sammelbestellung fehlgeschlagen",
            detail: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 1000),
        });
    }
}));
app.put("/api/bestellungen/:id/send", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _40, _41, _42, _43, _44;
    const id = parseInteger(req.params.id);
    if (!id) {
        res.status(400).json({ error: "ungueltige id" });
        return;
    }
    try {
        const role = getUserRole(req.firebaseUser);
        if (!(role === "admin" || role === "buero")) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        const draft = yield buildOrderMailDraft(id);
        const settingsRepo = draft.settingsRepo;
        const to = parseString((_40 = req.body) === null || _40 === void 0 ? void 0 : _40.to) || parseString((_41 = req.body) === null || _41 === void 0 ? void 0 : _41.recipient) || draft.to;
        const subject = parseString((_42 = req.body) === null || _42 === void 0 ? void 0 : _42.subject) || draft.subject;
        const html = parseString((_43 = req.body) === null || _43 === void 0 ? void 0 : _43.html) || draft.html;
        const text = parseString((_44 = req.body) === null || _44 === void 0 ? void 0 : _44.text) ||
            (html ? stripHtmlToText(html) : "") ||
            draft.text;
        if (!to) {
            res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
            return;
        }
        // send email
        try {
            yield sendMailUsingConfiguredSmtp(settingsRepo, to, subject, text, html);
        }
        catch (err) {
            const e = err;
            console.error("Error during sendOrderEmail", e && (e.stack || e));
            res.status(500).json({
                error: "E-Mail Versand fehlgeschlagen",
                detail: String(e && (e.message || e)).slice(0, 1000),
            });
            return;
        }
        // mark as bestellt
        const db = yield Promise.resolve(require("./db"));
        yield db.query("update bestellungen set status = $1, auftrags_bestaetigt = false where id = $2", ["bestellt", id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).send("error");
    }
}));
app.get("/api/bestellungen/:id/send/preview", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _45, _46, _47, _48;
    const id = parseInteger(req.params.id);
    if (!id) {
        res.status(400).json({ error: "ungueltige id" });
        return;
    }
    try {
        const role = getUserRole(req.firebaseUser);
        if (!(role === "admin" || role === "buero")) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        const draft = yield buildOrderMailDraft(id);
        res.json({
            to: draft.to,
            subject: draft.subject,
            html: draft.html,
            text: draft.text,
            lieferantName: draft.lieferantName,
            lieferantEmail: draft.lieferantEmail,
            fallbackTo: draft.fallbackTo,
            bestellnummer: (_46 = (_45 = draft.bestellung) === null || _45 === void 0 ? void 0 : _45.bestellnummer) !== null && _46 !== void 0 ? _46 : null,
            status: (_48 = (_47 = draft.bestellung) === null || _47 === void 0 ? void 0 : _47.status) !== null && _48 !== void 0 ? _48 : null,
        });
    }
    catch (e) {
        const status = Number(e === null || e === void 0 ? void 0 : e.statusCode) || 500;
        res.status(status).json({ error: String((e === null || e === void 0 ? void 0 : e.message) || e || "error") });
    }
}));
// Send reminder mail to supplier for a given order (no status change)
app.post("/api/bestellungen/:id/reminder/send", express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _49, _50, _51, _52, _53, _54, _55;
    const id = parseInteger(req.params.id);
    if (!id) {
        res.status(400).json({ error: "ungueltige id" });
        return;
    }
    try {
        const role = getUserRole(req.firebaseUser);
        if (!(role === "admin" || role === "buero")) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        const { getBestellungById } = yield Promise.resolve(require("./repositories/bestellungen"));
        const bestellung = yield getBestellungById(id);
        if (!bestellung) {
            res.status(404).json({ error: "Bestellung nicht gefunden" });
            return;
        }
        if (!Array.isArray(bestellung.positionen) ||
            !bestellung.positionen.length) {
            res.status(400).json({ error: "Bestellung ohne Positionen" });
            return;
        }
        const firstPos = bestellung.positionen[0];
        const lieferantId = Number(firstPos.lieferantId);
        if (!Number.isFinite(lieferantId) || lieferantId <= 0) {
            res.status(400).json({ error: "Lieferant nicht bestimmt" });
            return;
        }
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const subjTemplate = (yield settingsRepo.getSetting("reminder_subject")) ||
            "Nachfassen Bestellung {{bestellnummer}} bei {{lieferant}}";
        const bodyTemplate = (yield settingsRepo.getSetting("reminder_body")) ||
            "<h2>Nachfassen zur Bestellung {{bestellnummer}}</h2><p>Bitte um Rückmeldung zum Liefertermin.</p>{{artikel_liste}}";
        const signature = (yield settingsRepo.getSetting("email_signature")) || "";
        const db = yield Promise.resolve(require("./db"));
        const artikelIds = Array.from(new Set((bestellung.positionen || []).map((p) => p.artikelId)));
        let artikelRows = [];
        if (artikelIds.length) {
            const aRes = yield db.query("select id, name, preis from artikel where id = ANY($1)", [artikelIds]);
            artikelRows = aRes.rows || [];
        }
        const artikelMap = {};
        artikelRows.forEach((r) => {
            artikelMap[Number(r.id)] = r;
        });
        const lieferantRes = yield db.query("select id, name, email from lieferanten where id = $1", [lieferantId]);
        const lieferantRow = lieferantRes.rows[0] || null;
        const lieferantName = (lieferantRow === null || lieferantRow === void 0 ? void 0 : lieferantRow.name) || `Lieferant #${lieferantId}`;
        const supplierEmail = (lieferantRow === null || lieferantRow === void 0 ? void 0 : lieferantRow.email)
            ? String(lieferantRow.email)
            : "";
        // Use supplier email if present, otherwise fallback to configured recipient
        const fallbackTo = yield resolveConfiguredMailRecipient(settingsRepo);
        const to = supplierEmail || fallbackTo;
        if (!to) {
            res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
            return;
        }
        let artikelHtml = `<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">` +
            `<thead><tr style="text-align:left"><th>Artikel</th><th>Menge</th><th>Preis</th><th>Gesamt</th><th>Notiz</th></tr></thead><tbody>`;
        let artikelText = "";
        for (const pos of bestellung.positionen) {
            const a = artikelMap[Number(pos.artikelId)] || {
                name: `Artikel #${pos.artikelId}`,
                preis: 0,
            };
            const menge = Number(pos.menge) || 0;
            const preis = Number(a.preis) || 0;
            const gesamt = (preis * menge).toFixed(2);
            const notiz = pos.notiz ? String(pos.notiz).trim() : "";
            artikelHtml +=
                `<tr><td>${a.name}</td><td>${menge}</td><td>${preis.toFixed(2)} €</td>` +
                    `<td>${gesamt} €</td><td>${notiz}</td></tr>`;
            artikelText += `- ${a.name} | Menge: ${menge} | Preis: ${preis.toFixed(2)}€ | Gesamt: ${gesamt}€${notiz ? ` | Notiz: ${notiz}` : ""}\n`;
        }
        artikelHtml += "</tbody></table>";
        const replacements = {
            "{{bestellnummer}}": String((_49 = bestellung.bestellnummer) !== null && _49 !== void 0 ? _49 : ""),
            "{{datum}}": new Date(bestellung.bestellDatum).toLocaleDateString("de-DE"),
            "{{lieferant}}": lieferantName,
            "{{artikel_liste}}": artikelHtml,
            "{{artikel_text}}": artikelText,
        };
        let subject = parseString((_50 = req.body) === null || _50 === void 0 ? void 0 : _50.subject) || subjTemplate;
        let html = parseString((_51 = req.body) === null || _51 === void 0 ? void 0 : _51.html) || bodyTemplate;
        let text = parseString((_52 = req.body) === null || _52 === void 0 ? void 0 : _52.text) ||
            (html ? stripHtmlToText(html) : "") ||
            `Nachfassen Bestellung ${(_53 = bestellung.bestellnummer) !== null && _53 !== void 0 ? _53 : ""}\nDatum: ${replacements["{{datum}}"]}\n\n${artikelText}`;
        for (const key of Object.keys(replacements)) {
            const val = replacements[key];
            const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
            subject = subject.replace(re, val);
            html = html.replace(re, val);
            text = text.replace(re, val);
        }
        if (signature) {
            html += `<div>${signature}</div>`;
            text += `\n${signature}`;
        }
        const toOverride = parseString((_54 = req.body) === null || _54 === void 0 ? void 0 : _54.to) || parseString((_55 = req.body) === null || _55 === void 0 ? void 0 : _55.recipient) || to;
        if (!toOverride) {
            res.status(400).json({ error: "Kein E-Mail-Empfaenger konfiguriert." });
            return;
        }
        yield sendMailUsingConfiguredSmtp(settingsRepo, toOverride, subject, text, html);
        res.json({ success: true });
    }
    catch (error) {
        console.error("Fehler bei Reminder-Mail", error);
        res.status(500).json({
            error: "Reminder-Mail fehlgeschlagen",
            detail: String((error === null || error === void 0 ? void 0 : error.message) || error).slice(0, 1000),
        });
    }
}));
app.get("/api/bestellungen/:id/reminder/send/preview", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _56, _57, _58, _59;
    const id = parseInteger(req.params.id);
    if (!id) {
        res.status(400).json({ error: "ungueltige id" });
        return;
    }
    try {
        const role = getUserRole(req.firebaseUser);
        if (!(role === "admin" || role === "buero")) {
            res.status(403).json({ error: "forbidden" });
            return;
        }
        const { getBestellungById } = yield Promise.resolve(require("./repositories/bestellungen"));
        const bestellung = yield getBestellungById(id);
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
        const settingsRepo = yield Promise.resolve(require("./repositories/settings"));
        const subjTemplate = (yield settingsRepo.getSetting("reminder_subject")) ||
            "Nachfassen Bestellung {{bestellnummer}} bei {{lieferant}}";
        const bodyTemplate = (yield settingsRepo.getSetting("reminder_body")) ||
            "<h2>Nachfassen zur Bestellung {{bestellnummer}}</h2><p>Bitte um Rückmeldung zum Liefertermin.</p>{{artikel_liste}}";
        const signature = (yield settingsRepo.getSetting("email_signature")) || "";
        const db = yield Promise.resolve(require("./db"));
        const artikelIds = Array.from(new Set((bestellung.positionen || []).map((p) => p.artikelId)));
        let artikelRows = [];
        if (artikelIds.length) {
            const aRes = yield db.query("select id, name, preis from artikel where id = ANY($1)", [artikelIds]);
            artikelRows = aRes.rows || [];
        }
        const artikelMap = {};
        artikelRows.forEach((r) => {
            artikelMap[Number(r.id)] = r;
        });
        const lieferantRes = yield db.query("select id, name, email from lieferanten where id = $1", [lieferantId]);
        const lieferantRow = lieferantRes.rows[0] || null;
        const lieferantName = (lieferantRow === null || lieferantRow === void 0 ? void 0 : lieferantRow.name) || `Lieferant #${lieferantId}`;
        const supplierEmail = (lieferantRow === null || lieferantRow === void 0 ? void 0 : lieferantRow.email) ? String(lieferantRow.email) : "";
        const fallbackTo = yield resolveConfiguredMailRecipient(settingsRepo);
        const to = String(supplierEmail || "").trim() || String(fallbackTo || "").trim();
        let artikelHtml = `<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%">` +
            `<thead><tr style="text-align:left"><th>Artikel</th><th>Menge</th><th>Preis</th><th>Gesamt</th><th>Notiz</th></tr></thead><tbody>`;
        let artikelText = "";
        for (const pos of bestellung.positionen) {
            const a = artikelMap[Number(pos.artikelId)] || {
                name: `Artikel #${pos.artikelId}`,
                preis: 0,
            };
            const menge = Number(pos.menge) || 0;
            const preis = Number(a.preis) || 0;
            const gesamt = (preis * menge).toFixed(2);
            const notiz = pos.notiz ? String(pos.notiz).trim() : "";
            artikelHtml +=
                `<tr><td>${a.name}</td><td>${menge}</td><td>${preis.toFixed(2)} €</td>` +
                    `<td>${gesamt} €</td><td>${notiz}</td></tr>`;
            artikelText += `- ${a.name} | Menge: ${menge} | Preis: ${preis.toFixed(2)}€ | Gesamt: ${gesamt}€${notiz ? ` | Notiz: ${notiz}` : ""}\n`;
        }
        artikelHtml += "</tbody></table>";
        const replacements = {
            "{{bestellnummer}}": String((_56 = bestellung.bestellnummer) !== null && _56 !== void 0 ? _56 : ""),
            "{{datum}}": new Date(bestellung.bestellDatum).toLocaleDateString("de-DE"),
            "{{lieferant}}": lieferantName,
            "{{artikel_liste}}": artikelHtml,
            "{{artikel_text}}": artikelText,
        };
        let subject = subjTemplate;
        let html = bodyTemplate;
        let text = `Nachfassen Bestellung ${(_57 = bestellung.bestellnummer) !== null && _57 !== void 0 ? _57 : ""}\nDatum: ${replacements["{{datum}}"]}\n\n${artikelText}`;
        for (const key of Object.keys(replacements)) {
            const val = replacements[key];
            const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
            subject = subject.replace(re, val);
            html = html.replace(re, val);
            text = text.replace(re, val);
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
            bestellnummer: (_58 = bestellung === null || bestellung === void 0 ? void 0 : bestellung.bestellnummer) !== null && _58 !== void 0 ? _58 : null,
            status: (_59 = bestellung === null || bestellung === void 0 ? void 0 : bestellung.status) !== null && _59 !== void 0 ? _59 : null,
        });
    }
    catch (e) {
        res.status(500).json({ error: String((e === null || e === void 0 ? void 0 : e.message) || e || "error") });
    }
}));
app.get("/lieferanten", requireUserPage, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "lieferanten.html"));
});
app.get("/lieferanten/:id", requireUserPage, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "lieferant-detail.html"));
});
app.get("/artikel", requireUserPage, (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "artikel.html"));
});
app.get("/", (req, res) => {
    res.redirect("/uebersicht");
});
// Debug: list registered routes
app.get("/__routes", (req, res) => {
    var _a;
    const routes = [];
    const stack = ((_a = app._router) === null || _a === void 0 ? void 0 : _a.stack) || [];
    stack.forEach((layer) => {
        if (layer.route && layer.route.path) {
            const methods = Object.keys(layer.route.methods).join(",").toUpperCase();
            routes.push(`${methods} ${layer.route.path}`);
        }
        else if (layer.name === "router" && layer.handle && layer.handle.stack) {
            layer.handle.stack.forEach((l) => {
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
app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
