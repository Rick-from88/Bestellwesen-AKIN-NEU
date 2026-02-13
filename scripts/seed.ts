import { getClient } from "../src/db";

async function seed() {
  const client = await getClient();
  try {
    await client.query("BEGIN");

    // Lieferanten
    await client.query(
      `INSERT INTO lieferanten (id, name, kontakt_person, email, telefon, strasse, plz, stadt, land) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        1,
        "Meyer GmbH",
        "Anna Meyer",
        "anna.meyer@meyer-gmbh.de",
        "+49 30 111222",
        "Hauptstrasse 1",
        "10115",
        "Berlin",
        "Deutschland",
      ],
    );

    await client.query(
      `INSERT INTO lieferanten (id, name, kontakt_person, email, telefon, strasse, plz, stadt, land) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        2,
        "Schulz AG",
        "Markus Schulz",
        "m.schulz@schulz-ag.de",
        "+49 40 333444",
        "Marktweg 5",
        "20095",
        "Hamburg",
        "Deutschland",
      ],
    );

    await client.query(
      `INSERT INTO lieferanten (id, name, kontakt_person, email, telefon, strasse, plz, stadt, land) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        3,
        "Bauer Handels",
        "Clara Bauer",
        "clara.bauer@bauerhandels.de",
        "+49 89 555666",
        "Industriestr. 12",
        "80331",
        "München",
        "Deutschland",
      ],
    );

    await client.query(
      `INSERT INTO lieferanten (id, name, kontakt_person, email, telefon, strasse, plz, stadt, land) VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [
        4,
        "Klein & Co",
        "Peter Klein",
        "p.klein@klein-co.de",
        "+49 221 777888",
        "Luisenstr. 8",
        "50667",
        "Köln",
        "Deutschland",
      ],
    );

    // Artikel
    await client.query(
      `INSERT INTO artikel (id, lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand) VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [
        1,
        1,
        "Bürostuhl Comfort",
        "Ergonomischer Bürostuhl mit Höhenverstellung",
        149.9,
        25,
        5,
      ],
    );

    await client.query(
      `INSERT INTO artikel (id, lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand) VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [
        2,
        2,
        "Schreibtisch Classic",
        "Robuster Schreibtisch 160x80 cm, Eichenoptik",
        249.0,
        10,
        2,
      ],
    );

    await client.query(
      `INSERT INTO artikel (id, lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand) VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [
        3,
        3,
        "Tintenpatrone Schwarz",
        "Original Tintenpatrone, 50ml",
        19.5,
        200,
        20,
      ],
    );

    await client.query(
      `INSERT INTO artikel (id, lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand) VALUES
      ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [
        4,
        4,
        "Konferenzlampe LED",
        "Dimmbar, 3000–6500K, energiesparend",
        89.95,
        15,
        3,
      ],
    );

    // Bestellungen (bestellungen + bestellpositionen)
    // Bestellung 1
    await client.query(
      `INSERT INTO bestellungen (id, artikel_id, lieferant_id, menge, status, bestell_datum) VALUES
      ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO NOTHING`,
      [1, 1, 1, 5, "offen", "2026-01-10T08:00:00Z"],
    );
    await client.query(
      `INSERT INTO bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) VALUES
      ($1,$2,$3,$4)
      ON CONFLICT DO NOTHING`,
      [1, 1, 1, 5],
    );

    // Bestellung 2
    await client.query(
      `INSERT INTO bestellungen (id, artikel_id, lieferant_id, menge, status, bestell_datum) VALUES
      ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO NOTHING`,
      [2, 2, 2, 3, "offen", "2026-01-20T10:30:00Z"],
    );
    await client.query(
      `INSERT INTO bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) VALUES
      ($1,$2,$3,$4),($5,$6,$7,$8)
      ON CONFLICT DO NOTHING`,
      [2, 2, 2, 3, 2, 1, 1, 2],
    );

    // Bestellung 3
    await client.query(
      `INSERT INTO bestellungen (id, artikel_id, lieferant_id, menge, status, bestell_datum) VALUES
      ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO NOTHING`,
      [3, 3, 3, 10, "geliefert", "2026-01-05T14:15:00Z"],
    );
    await client.query(
      `INSERT INTO bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) VALUES
      ($1,$2,$3,$4)
      ON CONFLICT DO NOTHING`,
      [3, 3, 3, 10],
    );

    // Bestellung 4
    await client.query(
      `INSERT INTO bestellungen (id, artikel_id, lieferant_id, menge, status, bestell_datum) VALUES
      ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO NOTHING`,
      [4, 4, 4, 1, "storniert", "2026-02-01T09:45:00Z"],
    );
    await client.query(
      `INSERT INTO bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) VALUES
      ($1,$2,$3,$4),($5,$6,$7,$8),($9,$10,$11,$12)
      ON CONFLICT DO NOTHING`,
      [4, 4, 4, 1, 4, 1, 1, 4, 4, 3, 3, 6],
    );

    await client.query("COMMIT");
    console.log("Seed-Daten erfolgreich eingespielt.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Fehler beim Einspielen der Seed-Daten:", error);
    process.exit(1);
  } finally {
    client.release();
  }
}

seed();
