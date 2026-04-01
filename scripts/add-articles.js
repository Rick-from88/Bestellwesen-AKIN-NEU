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

async function run() {
  const client = await pool.connect();
  try {
    const lres = await client.query(
      "select id, name from lieferanten order by id",
    );
    const lieferanten = lres.rows;
    if (!lieferanten.length) {
      console.log("no suppliers found");
      return;
    }

    const samples = [
      {
        name: "Schraube M6",
        beschreibung: "Edelstahlschraube",
        artikelnummer: "SCH-M6",
        einheit: "Stk",
        verpackungseinheit: "100",
        preis: 0.12,
      },
      {
        name: "Muttern M6",
        beschreibung: "Sechskantmutter verzinkt",
        preis: 0.05,
      },
      {
        name: "Grundierung Spray",
        beschreibung: "Schnelltrocknende Grundierung 400ml",
        preis: 6.5,
      },
      {
        name: "Pulverlack RAL7016",
        beschreibung: "Pulverlack RAL7016 anthrazit 1kg",
        preis: 18.0,
      },
      {
        name: "Reiniger 1L",
        beschreibung: "Lösungsmittel-freier Reiniger",
        preis: 9.99,
      },
      {
        name: "Klebeband 50mm",
        beschreibung: "Hitzebeständiges Klebeband",
        preis: 3.2,
      },
      {
        name: "Schutzbrille",
        beschreibung: "Norm EN166 Schutzbrille",
        preis: 4.5,
      },
      {
        name: "Handschuhe Nitril",
        beschreibung: "Einweghandschuhe, 100er Box",
        preis: 7.5,
      },
      {
        name: "Dübel 8mm",
        beschreibung: "Universaldübel 8x50",
        preis: 0.09,
      },
      {
        name: "Lagerrolle",
        beschreibung: "Industrierolle 50mm",
        preis: 12.0,
      },
    ];

    let total = 0;
    for (const sup of lieferanten) {
      // insert 5 varied items per supplier, offset into samples
      for (let i = 0; i < 5; i++) {
        const s = samples[(i + sup.id) % samples.length];
        const name = `${s.name} (${sup.name})`;
        const r = await client.query(
          "insert into artikel (lieferant_id, name, beschreibung, artikelnummer, einheit, verpackungseinheit, preis) values ($1,$2,$3,$4,$5,$6,$7) returning id",
          [
            sup.id,
            name,
            s.beschreibung,
            s.artikelnummer ?? null,
            s.einheit ?? null,
            s.verpackungseinheit ?? null,
            s.preis,
          ],
        );
        total++;
      }
    }

    console.log(JSON.stringify({ ok: true, inserted: total }));
  } catch (err) {
    console.error("error", err && (err.stack || err));
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
