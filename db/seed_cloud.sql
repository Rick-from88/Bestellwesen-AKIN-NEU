BEGIN;

-- Suppliers (only insert if not exists)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM lieferanten WHERE name = 'Lieferant Cloud A') THEN
    INSERT INTO lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land)
    VALUES ('Lieferant Cloud A', 'Alice Cloud', 'alice@cloud.example', '0123456789', 'Cloudweg 1', '10000', 'Cloudstadt', 'Deutschland');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lieferanten WHERE name = 'Lieferant Cloud B') THEN
    INSERT INTO lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land)
    VALUES ('Lieferant Cloud B', 'Boris Cloud', 'boris@cloud.example', '0987654321', 'Cloudstr. 2', '20000', 'Beispielstadt', 'Deutschland');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lieferanten WHERE name = 'Lieferant Cloud C') THEN
    INSERT INTO lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land)
    VALUES ('Lieferant Cloud C', 'Carla Cloud', 'carla@cloud.example', '01711223344', 'Musterallee 3', '30000', 'Teststadt', 'Deutschland');
  END IF;
END$$;

-- Articles for Cloud suppliers
INSERT INTO artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand)
SELECT id, 'Schraube M8', 'Edelstahlschraube M8', 0.15, 1500, 200 FROM lieferanten WHERE name = 'Lieferant Cloud A';
INSERT INTO artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand)
SELECT id, 'Muttern M8', 'Sechskantmutter verzinkt', 0.06, 2500, 300 FROM lieferanten WHERE name = 'Lieferant Cloud A';
INSERT INTO artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand)
SELECT id, 'Pulverlack RAL9010 1kg', 'Pulverlack weiss, 1kg', 16.5, 80, 10 FROM lieferanten WHERE name = 'Lieferant Cloud B';
INSERT INTO artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand)
SELECT id, 'Grundierung 400ml', 'Schnelltrocknende Grundierung', 5.9, 220, 20 FROM lieferanten WHERE name = 'Lieferant Cloud B';
INSERT INTO artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand)
SELECT id, 'Reiniger 5L', 'Industriereiniger 5 Liter', 24.0, 40, 5 FROM lieferanten WHERE name = 'Lieferant Cloud C';
INSERT INTO artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand)
SELECT id, 'Klebeband 75mm', 'Hitzebeständiges Klebeband 75mm', 4.5, 180, 15 FROM lieferanten WHERE name = 'Lieferant Cloud C';

-- Settings upsert
INSERT INTO settings(key, value) VALUES ('currency', 'EUR') ON CONFLICT (key) DO UPDATE SET value = excluded.value;
INSERT INTO settings(key, value) VALUES ('vatPercent', '19') ON CONFLICT (key) DO UPDATE SET value = excluded.value;

-- Dashboard notes
INSERT INTO settings(key, value) VALUES ('dashboard_notes', '[{"id":1,"text":"Cloud Testnotiz","createdAt":"2026-02-20T10:00:00Z","done":false}]') ON CONFLICT (key) DO UPDATE SET value = excluded.value;

COMMIT;
