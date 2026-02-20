const { Pool } = require("pg");
const dotenv = require("dotenv");
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "akindb",
});

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert suppliers
    const suppliers = [
      {
        name: "Lieferant Test A",
        kontakt: "Anna Beispiel",
        email: "anna@example.com",
        telefon: "0123456789",
        strasse: "Musterstr. 1",
        plz: "12345",
        stadt: "Musterstadt",
        land: "Deutschland",
      },
      {
        name: "Lieferant Test B",
        kontakt: "Bernd Beispiel",
        email: "bernd@example.com",
        telefon: "0987654321",
        strasse: "Beispielweg 2",
        plz: "54321",
        stadt: "Beispielstadt",
        land: "Deutschland",
      },
    ];

    const supplierIds = [];
    for (const s of suppliers) {
      const r = await client.query(
        "insert into lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id",
        [
          s.name,
          s.kontakt,
          s.email,
          s.telefon,
          s.strasse,
          s.plz,
          s.stadt,
          s.land,
        ],
      );
      supplierIds.push(r.rows[0].id);
    }

    // Insert articles for first supplier
    const articles = [
      {
        name: "Artikel Alpha",
        beschreibung: "Testartikel Alpha",
        preis: 12.5,
        lager: 100,
        minBest: 5,
      },
      {
        name: "Artikel Beta",
        beschreibung: "Testartikel Beta",
        preis: 7.9,
        lager: 50,
        minBest: 2,
      },
    ];

    for (const a of articles) {
      await client.query(
        "insert into artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand) values ($1,$2,$3,$4,$5,$6)",
        [supplierIds[0], a.name, a.beschreibung, a.preis, a.lager, a.minBest],
      );
    }

    // Settings
    await client.query(
      "insert into settings(key, value) values ('currency','EUR') on conflict (key) do update set value = excluded.value",
    );
    await client.query(
      "insert into settings(key, value) values ('vatPercent','19') on conflict (key) do update set value = excluded.value",
    );

    // Dashboard notes sample
    await client.query(
      "insert into settings(key, value) values ('dashboard_notes', $1) on conflict (key) do update set value = excluded.value",
      [
        JSON.stringify([
          {
            id: 1,
            text: "Testnotiz",
            createdAt: new Date().toISOString(),
            done: false,
          },
        ]),
      ],
    );

    await client.query("COMMIT");

    console.log(JSON.stringify({ ok: true, suppliers: supplierIds }));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("seed error", err && (err.stack || err));
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
