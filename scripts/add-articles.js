const { Pool } = require('pg');
const dotenv = require('dotenv');
dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'akindb',
});

async function run() {
  const client = await pool.connect();
  try {
    const lres = await client.query('select id, name from lieferanten order by id');
    const lieferanten = lres.rows;
    if (!lieferanten.length) {
      console.log('no suppliers found');
      return;
    }

    const samples = [
      { name: 'Schraube M6', beschreibung: 'Edelstahlschraube', preis: 0.12, lager: 1000, minBest: 100 },
      { name: 'Muttern M6', beschreibung: 'Sechskantmutter verzinkt', preis: 0.05, lager: 2000, minBest: 200 },
      { name: 'Grundierung Spray', beschreibung: 'Schnelltrocknende Grundierung 400ml', preis: 6.5, lager: 150, minBest: 10 },
      { name: 'Pulverlack RAL7016', beschreibung: 'Pulverlack RAL7016 anthrazit 1kg', preis: 18.0, lager: 40, minBest: 5 },
      { name: 'Reiniger 1L', beschreibung: 'Lösungsmittel-freier Reiniger', preis: 9.99, lager: 60, minBest: 6 },
      { name: 'Klebeband 50mm', beschreibung: 'Hitzebeständiges Klebeband', preis: 3.2, lager: 300, minBest: 20 },
      { name: 'Schutzbrille', beschreibung: 'Norm EN166 Schutzbrille', preis: 4.5, lager: 120, minBest: 10 },
      { name: 'Handschuhe Nitril', beschreibung: 'Einweghandschuhe, 100er Box', preis: 7.5, lager: 80, minBest: 8 },
      { name: 'Dübel 8mm', beschreibung: 'Universaldübel 8x50', preis: 0.09, lager: 900, minBest: 100 },
      { name: 'Lagerrolle', beschreibung: 'Industrierolle 50mm', preis: 12.0, lager: 20, minBest: 2 },
    ];

    let total = 0;
    for (const sup of lieferanten) {
      // insert 5 varied items per supplier, offset into samples
      for (let i = 0; i < 5; i++) {
        const s = samples[(i + sup.id) % samples.length];
        const name = `${s.name} (${sup.name})`;
        const r = await client.query(
          'insert into artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand) values ($1,$2,$3,$4,$5,$6) returning id',
          [sup.id, name, s.beschreibung, s.preis, s.lager, s.minBest],
        );
        total++;
      }
    }

    console.log(JSON.stringify({ ok: true, inserted: total }));
  } catch (err) {
    console.error('error', err && (err.stack || err));
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
