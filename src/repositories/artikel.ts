import { query } from "../db";
import { Artikel } from "../types";
import { insertArtikelPreisHistorie } from "./artikel_preis_historie";

export interface CreateArtikelInput {
  lieferantId: number;
  name: string;
  beschreibung?: string;
  artikelnummer?: string;
  einheit?: string;
  verpackungseinheit?: string;
  standardBestellwert?: number;
  fotoUrl?: string;
  preis: number;
}

export const listArtikel = async (): Promise<Artikel[]> => {
  const result = await query(
    'select id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert as "standardBestellwert", foto_url as "fotoUrl", preis from artikel order by name',
  );

  return result.rows;
};

export const createArtikel = async (
  input: CreateArtikelInput,
): Promise<Artikel> => {
  const result = await query(
    'insert into artikel (lieferant_id, name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert, foto_url, preis) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert as "standardBestellwert", foto_url as "fotoUrl", preis',
    [
      input.lieferantId,
      input.name,
      input.beschreibung ?? null,
      input.artikelnummer ?? null,
      input.einheit ?? null,
      input.verpackungseinheit ?? null,
      input.standardBestellwert ?? null,
      input.fotoUrl ?? null,
      input.preis,
    ],
  );

  return result.rows[0];
};

export const updateArtikel = async (
  id: number,
  input: CreateArtikelInput,
): Promise<Artikel | null> => {
  const prev = await query("select preis from artikel where id = $1", [id]);
  const oldPreisRaw = prev.rows[0]?.preis;
  const oldPreis =
    oldPreisRaw !== undefined && oldPreisRaw !== null
      ? Number(oldPreisRaw)
      : null;

  const result = await query(
    'update artikel set lieferant_id = $1, name = $2, beschreibung = $3, artikelnummer = $4, einheit = $5, verpackungseinheit = $6, standard_bestellwert = $7, foto_url = $8, preis = $9 where id = $10 returning id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert as "standardBestellwert", foto_url as "fotoUrl", preis',
    [
      input.lieferantId,
      input.name,
      input.beschreibung ?? null,
      input.artikelnummer ?? null,
      input.einheit ?? null,
      input.verpackungseinheit ?? null,
      input.standardBestellwert ?? null,
      input.fotoUrl ?? null,
      input.preis,
      id,
    ],
  );

  const row = result.rows[0] ?? null;
  if (
    row &&
    oldPreis !== null &&
    Number.isFinite(oldPreis) &&
    Number.isFinite(input.preis) &&
    oldPreis !== Number(input.preis)
  ) {
    await insertArtikelPreisHistorie({
      artikelId: id,
      preisAlt: oldPreis,
      preisNeu: Number(input.preis),
    });
  }

  return row;
};

export const deleteArtikel = async (id: number): Promise<boolean> => {
  const result = await query("delete from artikel where id = $1", [id]);
  return (result.rowCount ?? 0) > 0;
};
