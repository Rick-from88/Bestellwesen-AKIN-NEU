import express from "express";
import bodyParser from "body-parser";
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
  listLieferanten,
  updateLieferant,
} from "./repositories/lieferanten";
import { createArtikel, deleteArtikel, listArtikel, updateArtikel } from "./repositories/artikel";

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

const parseString = (value: unknown): string | undefined => {
  return typeof value === "string" ? value.trim() : undefined;
};

const parseStatus = (value: unknown): BestellungStatus | null => {
  if (
    value === "offen" ||
    value === "bestellt" ||
    value === "geliefert" ||
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
};

type BestellungPositionParsed = {
  artikelId: number | null;
  lieferantId: number | null;
  menge: number | null;
};

type BestellungPositionValid = {
  artikelId: number;
  lieferantId: number;
  menge: number;
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
    return null;
  }

  return positionen;
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
    const positionenNachLieferant = new Map<number, BestellungPositionValid[]>();
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
  const status = parseStatus(req.body.status) ?? "offen";
  const bestellDatum =
    typeof req.body.bestellDatum === "string"
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
    const { query } = await Promise.resolve(require('./db'));
    const cur = await query('select status from bestellungen where id = $1', [bestellungId]);
    const curStatus = cur.rows[0]?.status;
    if (curStatus === 'geliefert' || curStatus === 'storniert') {
      res.status(409).json({ error: 'Bestellung ist abgeschlossen und kann nicht mehr bearbeitet werden.' });
      return;
    }

    const bestellung = await updateBestellung(bestellungId, {
      status,
      bestellDatum,
      positionen,
    });
    res.json(bestellung);
  } catch (error) {
    console.error("Fehler beim Aktualisieren der Bestellung", error);
    res.status(500).json({ error: "Bestellung konnte nicht aktualisiert werden." });
  }
});

// change status only (allows changing status even when positions are locked)
app.put('/api/bestellungen/:id/status', express.json(), async (req, res) => {
  const id = parseInteger(req.params.id);
  const status = parseStatus(req.body?.status);
  if (!id || !status) {
    res.status(400).json({ error: 'ungueltige anfrage' });
    return;
  }
  try {
    const { query } = await Promise.resolve(require('./db'));
    const cur = await query('select status from bestellungen where id = $1', [id]);
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

    await query('update bestellungen set status = $1 where id = $2', [status, id]);
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).send('error');
  }
});

app.delete("/api/bestellungen/:id", async (req, res) => {
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
    res.status(500).json({ error: "Bestellung konnte nicht geloescht werden." });
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
    res.status(500).json({ error: "Lieferant konnte nicht aktualisiert werden." });
  }
});

app.delete("/api/lieferanten/:id", async (req, res) => {
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
  const preis = parseNumber(req.body.preis);
  const lagerbestand = parseInteger(req.body.lagerbestand);
  const minBestand = parseInteger(req.body.minBestand);

  if (
    !lieferantId ||
    !name ||
    preis === null ||
    preis < 0 ||
    lagerbestand === null ||
    lagerbestand < 0
  ) {
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
    const artikel = await createArtikel({
      lieferantId,
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

app.put("/api/artikel/:id", async (req, res) => {
  const artikelId = parseInteger(req.params.id);
  const lieferantId = parseInteger(req.body.lieferantId);
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  const beschreibung =
    typeof req.body.beschreibung === "string"
      ? req.body.beschreibung.trim()
      : undefined;
  const preis = parseNumber(req.body.preis);
  const lagerbestand = parseInteger(req.body.lagerbestand);
  const minBestand = parseInteger(req.body.minBestand) ?? 0;

  if (!artikelId) {
    res.status(400).json({ error: "Ungueltige Artikel-ID." });
    return;
  }

  if (!lieferantId || !name || preis === null || lagerbestand === null) {
    res.status(400).json({ error: "Lieferant, Name, Preis und Lagerbestand sind Pflichtfelder." });
    return;
  }

  try {
    const artikel = await updateArtikel(artikelId, {
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
  } catch (error) {
    console.error("Fehler beim Aktualisieren des Artikels", error);
    res.status(500).json({ error: "Artikel konnte nicht aktualisiert werden." });
  }
});

app.delete("/api/artikel/:id", async (req, res) => {
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

app.get("/uebersicht", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "uebersicht.html"));
});

app.get("/bestellungen", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "bestellungen.html"));
});

app.get("/einstellungen", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "einstellungen.html"));
});

app.get("/bestellung-neu", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "bestellung-neu.html"));
});
app.get('/api/settings', async (req, res) => {
  try {
    const { listSettings } = await Promise.resolve(require('./repositories/settings'));
    const settings = await listSettings();
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).send('error');
  }
});

app.put('/api/settings', express.json(), async (req, res) => {
  try {
    const { setSetting } = await Promise.resolve(require('./repositories/settings'));
    const body = req.body || {};
    if (body.bestellnummer_prefix !== undefined) {
      await setSetting('bestellnummer_prefix', String(body.bestellnummer_prefix));
    }
    if (body.bestellnummer_seq_digits !== undefined) {
      await setSetting('bestellnummer_seq_digits', String(body.bestellnummer_seq_digits));
    }
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).send('error');
  }
});

app.put('/api/settings/sequence', express.json(), async (req, res) => {
  try {
    const { getSetting, setSetting } = await Promise.resolve(require('./repositories/settings'));
    const { query } = await Promise.resolve(require('./db'));

    const prefixSetting = await getSetting('bestellnummer_prefix');
    const seqDigitsSetting = await getSetting('bestellnummer_seq_digits');

    if (!prefixSetting || !seqDigitsSetting) {
      res.status(400).json({ error: 'Prefix oder Anzahl Ziffern nicht konfiguriert.' });
      return;
    }

    const prefix = String(prefixSetting);
    const seqDigits = Number(seqDigitsSetting);
    const lastDigits = Number(req.body?.lastDigits);
    if (!Number.isInteger(lastDigits) || lastDigits < 0 || lastDigits >= Math.pow(10, seqDigits)) {
      res.status(400).json({ error: 'ungueltige lastDigits' });
      return;
    }

    const multiplier = Math.pow(10, seqDigits);
    const lower = Number(prefix) * multiplier;
    const upper = (Number(prefix) + 1) * multiplier - 1;

    // we store the full next number; choose next = prefix*multiplier + lastDigits + 1
    const desiredNext = Number(prefix) * multiplier + lastDigits + 1;

    const maxRes = await query('select max(bestellnummer) as mx from bestellungen where bestellnummer between $1 and $2', [lower, upper]);
    const mx = maxRes.rows[0]?.mx ?? null;
    if (mx && Number(mx) >= desiredNext) {
      res.status(400).json({ error: 'Gewuenschte Zahl ist kleiner oder gleich bestehender Maximalnummer.' });
      return;
    }

    const overrideKey = `bestellnummer_next_${prefix}`;
    await setSetting(overrideKey, String(desiredNext));
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).send('error');
  }
});

app.get('/api/bestellungen/next-number', async (req, res) => {
  try {
    const { getNextBestellnummer } = await Promise.resolve(require('./repositories/bestellungen'));
    const date = req.query.date ? String(req.query.date) : undefined;
    const next = await getNextBestellnummer(date);
    res.json({ next });
  } catch (error) {
    console.error(error);
    res.status(500).send('error');
  }
});
app.get("/lieferanten", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "lieferanten.html"));
});
app.get("/lieferanten/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "lieferant-detail.html"));
});

app.get("/artikel", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "artikel.html"));
});

app.get("/", (req, res) => {
  res.redirect("/uebersicht");
});

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
