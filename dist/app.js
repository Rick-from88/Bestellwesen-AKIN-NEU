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
    if (value === "offen" || value === "geliefert" || value === "storniert") {
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
    var _b;
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
        const bestellung = yield (0, bestellungen_1.updateBestellung)(bestellungId, {
            status,
            bestellDatum,
            positionen,
        });
        res.json(bestellung);
    }
    catch (error) {
        console.error("Fehler beim Aktualisieren der Bestellung", error);
        res.status(500).json({ error: "Bestellung konnte nicht aktualisiert werden." });
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
    var _c;
    const artikelId = parseInteger(req.params.id);
    const lieferantId = parseInteger(req.body.lieferantId);
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    const beschreibung = typeof req.body.beschreibung === "string"
        ? req.body.beschreibung.trim()
        : undefined;
    const preis = parseNumber(req.body.preis);
    const lagerbestand = parseInteger(req.body.lagerbestand);
    const minBestand = (_c = parseInteger(req.body.minBestand)) !== null && _c !== void 0 ? _c : 0;
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
