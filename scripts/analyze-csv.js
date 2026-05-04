const fs = require("fs");

const suppliersPath =
  "c:/Users/PBildhoff/OneDrive - Akin-Metallbau GmbH & Co. KG/Desktop/Inventar Liste 2.0 Lieferanten.CSV";
const articlesPath =
  "c:/Users/PBildhoff/OneDrive - Akin-Metallbau GmbH & Co. KG/Desktop/Inventar Liste 2.0.CSV";

const clean = (value) => String(value ?? "").trim();
const norm = (value) => clean(value).toLowerCase().replace(/\s+/g, " ");
const parseRows = (filePath) =>
  fs
    .readFileSync(filePath, "latin1")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.split(";"));

const toNumber = (value) => {
  const text = clean(value)
    .replace(/€/g, "")
    .replace(/\u0080/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
};

const supplierRows = parseRows(suppliersPath);
const suppliers = [];
for (let i = 0; i < supplierRows.length; i++) {
  const row = supplierRows[i];
  while (row.length < 12) row.push("");
  if (i < 3) continue;
  if (!row.some((cell) => clean(cell))) continue;
  if (norm(row[0]) === "lieferant") continue;
  const name = clean(row[2]);
  if (!name) continue;
  suppliers.push({
    alias: clean(row[0]),
    name,
    kundennummer: clean(row[3]) || null,
    kontaktPerson: clean(row[4]) || null,
    email: clean(row[5]) || null,
    telefon: clean(row[6]) || null,
    strasse: clean(row[7]) || null,
    plz: clean(row[8]) || null,
    stadt: clean(row[9]) || null,
    land: clean(row[10]) || null,
  });
}

const byAlias = new Map();
const byName = new Map();
const byKundennummer = new Map();
for (const supplier of suppliers) {
  if (supplier.alias) byAlias.set(norm(supplier.alias), supplier.name);
  byName.set(norm(supplier.name), supplier.name);
  if (supplier.kundennummer) {
    byKundennummer.set(norm(supplier.kundennummer), supplier.name);
  }
}

const articleRows = parseRows(articlesPath);
const articles = [];
const unmatched = [];
let currentAlias = "";
let currentKundennummer = "";
for (let i = 1; i < articleRows.length; i++) {
  const row = articleRows[i];
  while (row.length < 12) row.push("");
  if (!row.some((cell) => clean(cell))) continue;

  const alias = clean(row[2]);
  const kundennummer = clean(row[3]);
  if (alias) currentAlias = alias;
  if (kundennummer) currentKundennummer = kundennummer;

  const name = clean(row[4]);
  if (!name) continue;

  let supplierName = "";
  if (currentAlias && byAlias.has(norm(currentAlias))) {
    supplierName = byAlias.get(norm(currentAlias));
  } else if (currentAlias && byName.has(norm(currentAlias))) {
    supplierName = byName.get(norm(currentAlias));
  } else if (currentKundennummer && byKundennummer.has(norm(currentKundennummer))) {
    supplierName = byKundennummer.get(norm(currentKundennummer));
  }

  if (!supplierName) {
    unmatched.push({
      line: i + 1,
      alias: currentAlias,
      kundennummer: currentKundennummer,
      article: name,
      reason: "supplier not found",
    });
    continue;
  }

  const preis = toNumber(row[11]);
  if (preis === null) {
    unmatched.push({
      line: i + 1,
      alias: currentAlias,
      kundennummer: currentKundennummer,
      article: name,
      reason: "invalid price",
    });
    continue;
  }

  const standardBestellwert = toNumber(row[10]);
  articles.push({
    lieferantName: supplierName,
    name,
    artikelnummer: clean(row[5]) || undefined,
    einheit: clean(row[6]) || undefined,
    beschreibung: clean(row[8]) || undefined,
    verpackungseinheit: clean(row[9]) || undefined,
    standardBestellwert:
      standardBestellwert === null
        ? undefined
        : Math.max(1, Math.trunc(standardBestellwert)),
    preis,
  });
}

console.log(
  JSON.stringify(
    {
      suppliers: suppliers.length,
      articles: articles.length,
      unmatched: unmatched.length,
      unmatchedSample: unmatched.slice(0, 25),
    },
    null,
    2,
  ),
);

const payload = {
  lieferanten: suppliers.map(({ alias, ...rest }) => rest),
  artikel: articles,
};

fs.writeFileSync(
  "tmp_catalog_import_payload.json",
  JSON.stringify(payload, null, 2),
  "utf8",
);
fs.writeFileSync(
  "tmp_catalog_import_unmatched.json",
  JSON.stringify(unmatched, null, 2),
  "utf8",
);
