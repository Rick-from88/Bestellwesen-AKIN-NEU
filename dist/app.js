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
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const path_1 = __importDefault(require("path"));
const bestellungen_1 = require("./repositories/bestellungen");
const lieferanten_1 = require("./repositories/lieferanten");
const email_1 = require("./services/email");
const artikel_1 = require("./repositories/artikel");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
app.use(body_parser_1.default.json());
app.use(body_parser_1.default.urlencoded({ extended: true }));
app.use("/static", express_1.default.static(path_1.default.join(__dirname, "..", "public")));
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
        value === "geliefert" ||
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
        return { artikelId, lieferantId, menge };
    })
        .filter((position) => position.artikelId &&
        position.lieferantId &&
        position.menge &&
        position.menge > 0)
        .map((position) => ({
        artikelId: position.artikelId,
        lieferantId: position.lieferantId,
        menge: position.menge,
    }));
    if (!positionen.length || positionen.length !== positionenInput.length) {
        return null;
    }
    return positionen;
};
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
    var _a;
    const status = (_a = parseStatus(req.body.status)) !== null && _a !== void 0 ? _a : "offen";
    const bestellDatum = typeof req.body.bestellDatum === "string"
        ? req.body.bestellDatum
        : undefined;
    const positionen = parsePositionen(req.body.positionen);
    if (!positionen) {
        res
            .status(400)
            .json({
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
    var _b, _c;
    const bestellungId = parseInteger(req.params.id);
    const status = (_b = parseStatus(req.body.status)) !== null && _b !== void 0 ? _b : "offen";
    const bestellDatum = typeof req.body.bestellDatum === "string"
        ? req.body.bestellDatum
        : undefined;
    if (!bestellungId) {
        res.status(400).json({ error: "Ungueltige Bestellungs-ID." });
        return;
    }
    const positionen = parsePositionen(req.body.positionen);
    if (!positionen) {
        res
            .status(400)
            .json({
            error: "Alle Positionen muessen Artikel, Lieferant und Menge enthalten.",
        });
        return;
    }
    try {
        // prevent editing positions if order is delivered or cancelled
        const db = yield Promise.resolve(require('./db'));
        const cur = yield db.query('select status from bestellungen where id = $1', [bestellungId]);
        const curStatus = (_c = cur.rows[0]) === null || _c === void 0 ? void 0 : _c.status;
        if (curStatus === 'geliefert' || curStatus === 'storniert') {
            res.status(409).json({ error: 'Bestellung ist abgeschlossen und kann nicht mehr bearbeitet werden.' });
            return;
        }
        // determine existing supplier ids for this order
        const existingRows = yield db.query('select lieferant_id from bestellpositionen where bestellung_id = $1', [bestellungId]);
        const existingSupplierIds = new Set();
        for (const r of existingRows.rows) {
            if (r.lieferant_id)
                existingSupplierIds.add(Number(r.lieferant_id));
        }
        if (!existingSupplierIds.size) {
            // fallback: single-position stored on bestellungen table
            const mainRow = yield db.query('select lieferant_id from bestellungen where id = $1 and lieferant_id is not null', [bestellungId]);
            if (mainRow.rows[0] && mainRow.rows[0].lieferant_id)
                existingSupplierIds.add(Number(mainRow.rows[0].lieferant_id));
        }
        // group incoming positions by supplier
        const bySupplier = {};
        for (const pos of positionen) {
            const lid = Number(pos.lieferantId);
            if (!bySupplier[lid])
                bySupplier[lid] = [];
            bySupplier[lid].push({ artikelId: Number(pos.artikelId), lieferantId: lid, menge: Number(pos.menge) });
        }
        // positions to keep on the original order (suppliers that were already present)
        const positionsForOriginal = [];
        // new suppliers -> create separate orders
        const { createBestellung } = yield Promise.resolve(require('./repositories/bestellungen'));
        for (const [lidStr, poses] of Object.entries(bySupplier)) {
            const lid = Number(lidStr);
            if (existingSupplierIds.has(lid)) {
                positionsForOriginal.push(...poses);
            }
            else {
                // create a new order for this supplier
                try {
                    yield createBestellung({ status, bestellDatum, positionen: poses });
                }
                catch (e) {
                    console.error('Fehler beim Erstellen der neuen Bestellung fuer Lieferant', lid, e);
                    res.status(500).json({ error: 'Fehler beim Anlegen neuer Bestellung(en)' });
                    return;
                }
            }
        }
        if (positionsForOriginal.length) {
            const bestellung = yield (0, bestellungen_1.updateBestellung)(bestellungId, {
                status,
                bestellDatum,
                positionen: positionsForOriginal,
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
                console.error('Fehler beim Loeschen leerer Bestellung', e);
                res.status(500).json({ error: 'Fehler beim Loeschen der Bestellung' });
                return;
            }
        }
    }
    catch (error) {
        console.error("Fehler beim Aktualisieren der Bestellung", error);
        res.status(500).json({ error: "Bestellung konnte nicht aktualisiert werden." });
    }
}));
// change status only (allows changing status even when positions are locked)
app.put('/api/bestellungen/:id/status', express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _d;
    const id = parseInteger(req.params.id);
    const status = parseStatus((_d = req.body) === null || _d === void 0 ? void 0 : _d.status);
    if (!id || !status) {
        res.status(400).json({ error: 'ungueltige anfrage' });
        return;
    }
    try {
        const db = yield Promise.resolve(require('./db'));
        const cur = yield db.query('select status from bestellungen where id = $1', [id]);
        if (!cur.rows.length) {
            res.status(404).json({ error: 'Bestellung nicht gefunden' });
            return;
        }
        const curStatus = cur.rows[0].status;
        // simple transition rules: delivered is final except it can be set to 'storniert'
        if (curStatus === 'geliefert' && status !== 'storniert') {
            res.status(409).json({ error: 'Gelieferte Bestellungen koennen nur storniert werden.' });
            return;
        }
        yield db.query('update bestellungen set status = $1 where id = $2', [status, id]);
        res.status(204).send();
    }
    catch (error) {
        console.error(error);
        res.status(500).send('error');
    }
}));
// Test SMTP connection (used by settings UI)
app.post('/api/mail/test', express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // build effective SMTP config from DB settings + env
        const settings = yield Promise.resolve(require('./repositories/settings'));
        const dbSettings = yield settings.listSettings();
        const cfg = {};
        cfg.host = dbSettings.mail_host || process.env.MAIL_HOST || process.env.SMTP_HOST || null;
        cfg.port = dbSettings.mail_port || process.env.MAIL_PORT || process.env.SMTP_PORT || null;
        cfg.user = dbSettings.mail_user || process.env.MAIL_USER || process.env.SMTP_USER || null;
        cfg.pass = dbSettings.mail_pass || process.env.MAIL_PASS || process.env.SMTP_PASS || null;
        cfg.from = dbSettings.mail_from || process.env.MAIL_FROM || cfg.user || null;
        const result = yield (0, email_1.testSmtpConnection)(cfg);
        if (result.ok) {
            res.json({ ok: true, message: 'SMTP Verbindung OK', used: result.used });
        }
        else {
            res.status(502).json({ ok: false, error: String(result.error || 'unknown'), used: result.used });
        }
    }
    catch (err) {
        console.error('SMTP test error', err);
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
        res.status(500).json({ error: "Bestellung konnte nicht geloescht werden." });
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
        res.status(500).json({ error: "Lieferant konnte nicht aktualisiert werden." });
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
    const preis = parseNumber(req.body.preis);
    const lagerbestand = parseInteger(req.body.lagerbestand);
    const minBestand = parseInteger(req.body.minBestand);
    if (!lieferantId ||
        !name ||
        preis === null ||
        preis < 0 ||
        lagerbestand === null ||
        lagerbestand < 0) {
        res
            .status(400)
            .json({ error: "lieferant, name, preis und lagerbestand sind Pflichtfelder." });
        return;
    }
    if (minBestand !== null && minBestand < 0) {
        res.status(400).json({ error: "minBestand muss 0 oder groesser sein." });
        return;
    }
    try {
        const artikel = yield (0, artikel_1.createArtikel)({
            lieferantId,
            name,
            beschreibung,
            preis,
            lagerbestand,
            minBestand: minBestand !== null && minBestand !== void 0 ? minBestand : 0,
        });
        res.status(201).json(artikel);
    }
    catch (error) {
        console.error("Fehler beim Erstellen des Artikels", error);
        res.status(500).json({ error: "Artikel konnte nicht erstellt werden." });
    }
}));
app.put("/api/artikel/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _e;
    const artikelId = parseInteger(req.params.id);
    const lieferantId = parseInteger(req.body.lieferantId);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const beschreibung = typeof req.body.beschreibung === "string"
        ? req.body.beschreibung.trim()
        : undefined;
    const preis = parseNumber(req.body.preis);
    const lagerbestand = parseInteger(req.body.lagerbestand);
    const minBestand = (_e = parseInteger(req.body.minBestand)) !== null && _e !== void 0 ? _e : 0;
    if (!artikelId) {
        res.status(400).json({ error: "Ungueltige Artikel-ID." });
        return;
    }
    if (!lieferantId || !name || preis === null || lagerbestand === null) {
        res.status(400).json({ error: "Lieferant, Name, Preis und Lagerbestand sind Pflichtfelder." });
        return;
    }
    try {
        const artikel = yield (0, artikel_1.updateArtikel)(artikelId, {
            lieferantId,
            name,
            beschreibung,
            preis,
            lagerbestand,
            minBestand,
        });
        if (!artikel) {
            res.status(404).json({ error: "Artikel nicht gefunden." });
            return;
        }
        res.json(artikel);
    }
    catch (error) {
        console.error("Fehler beim Aktualisieren des Artikels", error);
        res.status(500).json({ error: "Artikel konnte nicht aktualisiert werden." });
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
app.get("/uebersicht", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "uebersicht.html"));
});
app.get("/bestellungen", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "bestellungen.html"));
});
app.get("/einstellungen", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "einstellungen.html"));
});
app.get("/bestellung-neu", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "bestellung-neu.html"));
});
app.get('/api/settings', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listSettings } = yield Promise.resolve(require('./repositories/settings'));
        const settings = yield listSettings();
        res.json(settings);
    }
    catch (error) {
        console.error(error);
        res.status(500).send('error');
    }
}));
// Return effective settings (DB + environment overrides) for frontend display
app.get('/api/settings/effective', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { listSettings } = yield Promise.resolve(require('./repositories/settings'));
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
        console.error('effective settings error', err);
        res.status(500).json({ error: 'error' });
    }
}));
// Dashboard notes endpoints: persist simple notes in settings table
app.get('/api/dashboard/notes', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settingsRepo = yield Promise.resolve(require('./repositories/settings'));
        const notesRaw = yield settingsRepo.getSetting('dashboard_notes');
        // normalize legacy empty-string value to JSON array in DB
        if (notesRaw === "") {
            try {
                yield settingsRepo.setSetting('dashboard_notes', '[]');
            }
            catch (e) { /* ignore */ }
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
                notesArr = [{ id: Date.now(), text: String(notesRaw), done: false, createdAt: new Date().toISOString() }];
            }
        }
        res.json({ notes: notesArr });
    }
    catch (err) {
        console.error('Error loading dashboard notes', err);
        res.status(500).json({ error: 'Konnte Notizen nicht laden' });
    }
}));
app.put('/api/dashboard/notes', express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _f, _g;
    try {
        const settingsRepo = yield Promise.resolve(require('./repositories/settings'));
        // Accept either a single new note via { note: 'text' }
        // or a full replacement via { notes: [...] }
        if (Array.isArray((_f = req.body) === null || _f === void 0 ? void 0 : _f.notes)) {
            const notesArr = req.body.notes;
            yield settingsRepo.setSetting('dashboard_notes', JSON.stringify(notesArr));
            res.status(204).send();
            return;
        }
        if (typeof ((_g = req.body) === null || _g === void 0 ? void 0 : _g.note) === 'string' && req.body.note.trim()) {
            const noteText = req.body.note.trim();
            const existingRaw = yield settingsRepo.getSetting('dashboard_notes');
            let notesArr = [];
            if (existingRaw) {
                try {
                    const parsed = JSON.parse(existingRaw);
                    if (Array.isArray(parsed))
                        notesArr = parsed;
                }
                catch (e) { }
            }
            const newNote = { id: Date.now(), text: noteText, done: false, createdAt: new Date().toISOString() };
            notesArr.unshift(newNote);
            yield settingsRepo.setSetting('dashboard_notes', JSON.stringify(notesArr));
            res.status(201).json(newNote);
            return;
        }
        res.status(400).json({ error: 'ungueltige anfrage' });
    }
    catch (err) {
        console.error('Error saving dashboard notes', err);
        res.status(500).json({ error: 'Konnte Notizen nicht speichern' });
    }
}));
app.put('/api/settings', express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const settingsRepo = yield Promise.resolve(require('./repositories/settings'));
        const body = req.body || {};
        if (body.bestellnummer_prefix !== undefined) {
            yield settingsRepo.setSetting('bestellnummer_prefix', String(body.bestellnummer_prefix));
        }
        if (body.bestellnummer_seq_digits !== undefined) {
            yield settingsRepo.setSetting('bestellnummer_seq_digits', String(body.bestellnummer_seq_digits));
        }
        // SMTP / Mail settings and templates
        if (body.mail_host !== undefined)
            yield settingsRepo.setSetting('mail_host', String(body.mail_host));
        if (body.mail_port !== undefined)
            yield settingsRepo.setSetting('mail_port', String(body.mail_port));
        if (body.mail_user !== undefined)
            yield settingsRepo.setSetting('mail_user', String(body.mail_user));
        if (body.mail_pass !== undefined)
            yield settingsRepo.setSetting('mail_pass', String(body.mail_pass));
        if (body.mail_from !== undefined)
            yield settingsRepo.setSetting('mail_from', String(body.mail_from));
        if (body.mail_to !== undefined)
            yield settingsRepo.setSetting('mail_to', String(body.mail_to));
        if (body.email_subject !== undefined)
            yield settingsRepo.setSetting('email_subject', String(body.email_subject));
        if (body.email_body !== undefined)
            yield settingsRepo.setSetting('email_body', String(body.email_body));
        if (body.email_signature !== undefined)
            yield settingsRepo.setSetting('email_signature', String(body.email_signature));
        if (body.email_recipient !== undefined)
            yield settingsRepo.setSetting('email_recipient', String(body.email_recipient));
        res.status(204).send();
    }
    catch (error) {
        console.error(error);
        res.status(500).send('error');
    }
}));
app.put('/api/settings/sequence', express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _h, _j, _k;
    try {
        const settingsRepo = yield Promise.resolve(require('./repositories/settings'));
        const db = yield Promise.resolve(require('./db'));
        const prefixSetting = yield settingsRepo.getSetting('bestellnummer_prefix');
        const seqDigitsSetting = yield settingsRepo.getSetting('bestellnummer_seq_digits');
        if (!prefixSetting || !seqDigitsSetting) {
            res.status(400).json({ error: 'Prefix oder Anzahl Ziffern nicht konfiguriert.' });
            return;
        }
        const prefix = String(prefixSetting);
        const seqDigits = Number(seqDigitsSetting);
        const lastDigits = Number((_h = req.body) === null || _h === void 0 ? void 0 : _h.lastDigits);
        if (!Number.isInteger(lastDigits) || lastDigits < 0 || lastDigits >= Math.pow(10, seqDigits)) {
            res.status(400).json({ error: 'ungueltige lastDigits' });
            return;
        }
        const multiplier = Math.pow(10, seqDigits);
        const lower = Number(prefix) * multiplier;
        const upper = (Number(prefix) + 1) * multiplier - 1;
        // we store the full next number; choose next = prefix*multiplier + lastDigits + 1
        const desiredNext = Number(prefix) * multiplier + lastDigits + 1;
        const maxRes = yield db.query('select max(bestellnummer) as mx from bestellungen where bestellnummer between $1 and $2', [lower, upper]);
        const mx = (_k = (_j = maxRes.rows[0]) === null || _j === void 0 ? void 0 : _j.mx) !== null && _k !== void 0 ? _k : null;
        if (mx && Number(mx) >= desiredNext) {
            res.status(400).json({ error: 'Gewuenschte Zahl ist kleiner oder gleich bestehender Maximalnummer.' });
            return;
        }
        const overrideKey = `bestellnummer_next_${prefix}`;
        yield settingsRepo.setSetting(overrideKey, String(desiredNext));
        res.status(204).send();
    }
    catch (error) {
        console.error(error);
        res.status(500).send('error');
    }
}));
app.get('/api/bestellungen/next-number', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { getNextBestellnummer } = yield Promise.resolve(require('./repositories/bestellungen'));
        const date = req.query.date ? String(req.query.date) : undefined;
        const next = yield getNextBestellnummer(date);
        res.json({ next });
    }
    catch (error) {
        console.error(error);
        res.status(500).send('error');
    }
}));
// Export endpoint (JSON or CSV)
app.get('/api/export/:entity', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const entity = String(req.params.entity || '').toLowerCase();
    const format = String(req.query.format || 'json').toLowerCase();
    try {
        let items = [];
        if (entity === 'lieferanten') {
            const { listLieferanten } = yield Promise.resolve(require('./repositories/lieferanten'));
            items = yield listLieferanten();
        }
        else if (entity === 'artikel') {
            const { listArtikel } = yield Promise.resolve(require('./repositories/artikel'));
            items = yield listArtikel();
        }
        else if (entity === 'bestellungen') {
            const { listBestellungen } = yield Promise.resolve(require('./repositories/bestellungen'));
            items = yield listBestellungen();
        }
        else if (entity === 'settings') {
            const { listSettings } = yield Promise.resolve(require('./repositories/settings'));
            items = yield listSettings();
        }
        else {
            res.status(404).json({ error: 'unknown entity' });
            return;
        }
        if (format === 'csv') {
            // simple CSV serialization
            const escapeCsv = (v) => {
                if (v === null || v === undefined)
                    return '';
                const s = String(v);
                if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                    return '"' + s.replace(/"/g, '""') + '"';
                }
                return s;
            };
            // special-case settings: listSettings returns an object map
            if (entity === 'settings' && items && !Array.isArray(items)) {
                const rows = ['key,value'];
                for (const [k, v] of Object.entries(items)) {
                    rows.push(`${escapeCsv(k)},${escapeCsv(v)}`);
                }
                const csv = rows.join('\n');
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="${entity}.csv"`);
                res.send(csv);
                return;
            }
            const headerKeys = Array.isArray(items) && items.length ? Object.keys(items[0]) : [];
            const rows = [headerKeys.join(',')];
            for (const it of (Array.isArray(items) ? items : [])) {
                const vals = headerKeys.map((k) => escapeCsv(it[k]));
                rows.push(vals.join(','));
            }
            const csv = rows.join('\n');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${entity}.csv"`);
            res.send(csv);
            return;
        }
        res.json(items);
    }
    catch (error) {
        const errAny = error;
        console.error('Export error', errAny && (errAny.stack || errAny));
        res.status(500).json({ error: 'Export fehlgeschlagen', detail: String(errAny && (errAny.stack || errAny)).slice(0, 1000) });
    }
}));
// One-click backup: return combined JSON of main entities
app.get('/api/backup', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const [{ listLieferanten }, { listArtikel }, { listBestellungen }, { listSettings }] = yield Promise.all([
            Promise.resolve(require('./repositories/lieferanten')),
            Promise.resolve(require('./repositories/artikel')),
            Promise.resolve(require('./repositories/bestellungen')),
            Promise.resolve(require('./repositories/settings')),
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
        console.error('Backup error', error);
        res.status(500).json({ error: 'Backup fehlgeschlagen' });
    }
}));
// Send order by email and set status to 'bestellt'
app.put('/api/bestellungen/:id/send', express_1.default.json(), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _l, _m, _o, _p, _q, _r, _s, _t, _u, _v;
    const id = parseInteger(req.params.id);
    if (!id) {
        res.status(400).json({ error: 'ungueltige id' });
        return;
    }
    try {
        const { getBestellungById } = yield Promise.resolve(require('./repositories/bestellungen'));
        const bestellung = yield getBestellungById(id);
        if (!bestellung) {
            res.status(404).json({ error: 'Bestellung nicht gefunden' });
            return;
        }
        // prepare article and supplier data for templates
        const db = yield Promise.resolve(require('./db'));
        const artikelIds = Array.from(new Set((bestellung.positionen || []).map((p) => p.artikelId)));
        let artikelRows = [];
        if (artikelIds.length) {
            const aRes = yield db.query('select id, name, preis from artikel where id = ANY($1)', [artikelIds]);
            artikelRows = aRes.rows || [];
        }
        const lieferantIds = Array.from(new Set((bestellung.positionen || []).map((p) => p.lieferantId)));
        let lieferantRows = [];
        if (lieferantIds.length) {
            const lRes = yield db.query('select id, name from lieferanten where id = ANY($1)', [lieferantIds]);
            lieferantRows = lRes.rows || [];
        }
        const artikelMap = {};
        artikelRows.forEach(r => { artikelMap[r.id] = r; });
        const lieferantMap = {};
        lieferantRows.forEach(r => { lieferantMap[r.id] = r; });
        // build HTML and text representations of the article list
        let artikelHtml = `<table border="0" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%"><thead><tr style="text-align:left"><th>Artikel</th><th>Menge</th><th>Preis</th><th>Gesamt</th></tr></thead><tbody>`;
        let artikelText = '';
        for (const pos of bestellung.positionen) {
            const a = artikelMap[pos.artikelId] || { name: `Artikel #${pos.artikelId}`, preis: 0 };
            const menge = Number(pos.menge) || 0;
            const preis = Number(a.preis) || 0;
            const gesamt = (preis * menge).toFixed(2);
            artikelHtml += `<tr><td>${a.name}</td><td>${menge}</td><td>${preis.toFixed(2)} €</td><td>${gesamt} €</td></tr>`;
            artikelText += `- ${a.name} | Menge: ${menge} | Preis: ${preis.toFixed(2)}€ | Gesamt: ${gesamt}€\n`;
        }
        artikelHtml += '</tbody></table>';
        // prepare placeholder replacements
        const firstLieferantName = ((_o = lieferantMap[(_m = (_l = bestellung.positionen) === null || _l === void 0 ? void 0 : _l[0]) === null || _m === void 0 ? void 0 : _m.lieferantId]) === null || _o === void 0 ? void 0 : _o.name) || '';
        const replacements = {
            '{{bestellnummer}}': String((_p = bestellung.bestellnummer) !== null && _p !== void 0 ? _p : ''),
            '{{datum}}': String((_q = bestellung.bestellDatum) !== null && _q !== void 0 ? _q : ''),
            '{{lieferant}}': firstLieferantName,
            '{{artikel_liste}}': artikelHtml,
            '{{artikel_text}}': artikelText,
        };
        // load templates from settings if present
        const settingsRepo = yield Promise.resolve(require('./repositories/settings'));
        const subjTemplate = (yield settingsRepo.getSetting('email_subject')) || `Bestellung ${(_r = bestellung.bestellnummer) !== null && _r !== void 0 ? _r : ''}`;
        let bodyTemplate = (yield settingsRepo.getSetting('email_body')) || `<h2>Bestellung ${(_s = bestellung.bestellnummer) !== null && _s !== void 0 ? _s : ''}</h2><p>Datum: ${(_t = bestellung.bestellDatum) !== null && _t !== void 0 ? _t : ''}</p>{{artikel_liste}}`;
        const signature = (yield settingsRepo.getSetting('email_signature')) || '';
        // apply replacements in subject and body
        let subject = subjTemplate;
        let html = bodyTemplate;
        let text = `Bestellung ${(_u = bestellung.bestellnummer) !== null && _u !== void 0 ? _u : ''}\nDatum: ${(_v = bestellung.bestellDatum) !== null && _v !== void 0 ? _v : ''}\n\n${artikelText}`;
        for (const key of Object.keys(replacements)) {
            const val = replacements[key];
            const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
            subject = subject.replace(re, val);
            html = html.replace(re, val);
            text = text.replace(re, val);
        }
        if (signature) {
            html += `<div>${signature}</div>`;
            text += `\n${signature}`;
        }
        const { sendOrderEmail } = yield Promise.resolve(require('./services/email'));
        // determine recipient(s): try settings or default MAIL_TO env
        const toSetting = yield settingsRepo.getSetting('email_recipient');
        const to = toSetting || process.env.MAIL_TO || process.env.MAIL_USER || '';
        if (!to) {
            res.status(400).json({ error: 'Kein E-Mail-Empfaenger konfiguriert.' });
            return;
        }
        // send email
        try {
            yield sendOrderEmail(to, subject, `Bestellung ${bestellung.bestellnummer}\n+\nDatum: ${bestellung.bestellDatum}`, html);
        }
        catch (err) {
            const e = err;
            console.error('Error during sendOrderEmail', e && (e.stack || e));
            res.status(500).json({ error: 'E-Mail Versand fehlgeschlagen', detail: String(e && (e.message || e)).slice(0, 1000) });
            return;
        }
        // mark as bestellt
        yield db.query('update bestellungen set status = $1 where id = $2', ['bestellt', id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).send('error');
    }
}));
app.get("/lieferanten", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "lieferanten.html"));
});
app.get("/lieferanten/:id", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "lieferant-detail.html"));
});
app.get("/artikel", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "..", "public", "artikel.html"));
});
app.get("/", (req, res) => {
    res.redirect("/uebersicht");
});
app.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
});
