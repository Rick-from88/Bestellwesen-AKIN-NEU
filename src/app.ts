import express from "express";
import bodyParser from "body-parser";
import path from "path";
import {
  createBestellung,
  listBestellungen,
  BestellungStatus,
} from "./repositories/bestellungen";
import {
  createLieferant,
  getLieferantById,
  listLieferantArtikel,
  listLieferanten,
} from "./repositories/lieferanten";
import { createArtikel, listArtikel } from "./repositories/artikel";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use("/static", express.static(path.join(__dirname, "..", "public")));

const parseNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseInteger = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};

const parseStatus = (value: unknown): BestellungStatus | null => {
  if (value === "offen" || value === "geliefert" || value === "storniert") {
    return value;
  }
  return null;
};

type BestellungPositionBody = {
  artikelId?: unknown;
  lieferantId?: unknown;
  menge?: unknown;
};

type BestellungPositionParsed = {
  artikelId: number | null;
  lieferantId: number | null;
  menge: number | null;
};

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
  const bestellDatum =
    typeof req.body.bestellDatum === "string"
      ? req.body.bestellDatum
      : undefined;

  const positionenInput: BestellungPositionBody[] = Array.isArray(
    req.body.positionen,
  )
    ? req.body.positionen
    : [];
  const positionen = positionenInput
    .map((position: BestellungPositionBody): BestellungPositionParsed => {
      const artikelId = parseInteger(position?.artikelId);
      const lieferantId = parseInteger(position?.lieferantId);
      const menge = parseInteger(position?.menge);
      return { artikelId, lieferantId, menge };
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
    }));

  if (!positionen.length || positionen.length !== positionenInput.length) {
    res.status(400).json({ error: "Alle Positionen muessen Artikel, Lieferant und Menge enthalten." });
    return;
  }

  try {
    const bestellung = await createBestellung({
      status,
      bestellDatum,
      positionen,
    });
    res.status(201).json(bestellung);
  } catch (error) {
    console.error("Fehler beim Erstellen der Bestellung", error);
    res.status(500).json({ error: "Bestellung konnte nicht erstellt werden." });
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
  const kontaktPerson =
    typeof req.body.kontaktPerson === "string"
      ? req.body.kontaktPerson.trim()
      : undefined;
  const email =
    typeof req.body.email === "string" ? req.body.email.trim() : undefined;
  const telefon =
    typeof req.body.telefon === "string" ? req.body.telefon.trim() : undefined;

  if (!name) {
    res.status(400).json({ error: "name ist ein Pflichtfeld." });
    return;
  }

  try {
    const lieferant = await createLieferant({
      name,
      kontaktPerson,
      email,
      telefon,
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
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const beschreibung =
    typeof req.body.beschreibung === "string"
      ? req.body.beschreibung.trim()
      : undefined;
  const preis = parseNumber(req.body.preis);
  const lagerbestand = parseInteger(req.body.lagerbestand);
  const minBestand = parseInteger(req.body.minBestand);

  if (
    !name ||
    preis === null ||
    preis < 0 ||
    lagerbestand === null ||
    lagerbestand < 0
  ) {
    res
      .status(400)
      .json({ error: "name, preis und lagerbestand sind Pflichtfelder." });
    return;
  }

  if (minBestand !== null && minBestand < 0) {
    res.status(400).json({ error: "minBestand muss 0 oder groesser sein." });
    return;
  }

  try {
    const artikel = await createArtikel({
      name,
      beschreibung,
      preis,
      lagerbestand,
      minBestand: minBestand ?? 0,
    });
    res.status(201).json(artikel);
  } catch (error) {
    console.error("Fehler beim Erstellen des Artikels", error);
    res.status(500).json({ error: "Artikel konnte nicht erstellt werden." });
  }
});

app.get("/uebersicht", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "uebersicht.html"));
});

app.get("/bestellungen", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "bestellungen.html"));
});

app.get("/bestellung-neu", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "bestellung-neu.html"));
});
app.get("/lieferanten", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "lieferanten.html"));
});
app.get("/lieferanten/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "lieferant-detail.html"));
});

app.get("/", (req, res) => {
  res.redirect("/uebersicht");
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
