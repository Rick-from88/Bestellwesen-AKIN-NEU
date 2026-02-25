import { query } from "../db";
import { Artikel } from "../types";

export interface CreateArtikelInput {
  lieferantId: number;
  name: string;
  beschreibung?: string;
  artikelnummer?: string;
  einheit?: string;
  verpackungseinheit?: string;
  preis: number;
  lagerbestand: number;
  minBestand?: number;
}

export const listArtikel = async (): Promise<Artikel[]> => {
  const result = await query(
    'select id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, preis, lagerbestand, min_bestand as "minBestand" from artikel order by name',
  );

  return result.rows;
};

export const createArtikel = async (
  input: CreateArtikelInput,
): Promise<Artikel> => {
  const result = await query(
    'insert into artikel (lieferant_id, name, beschreibung, artikelnummer, einheit, verpackungseinheit, preis, lagerbestand, min_bestand) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, preis, lagerbestand, min_bestand as "minBestand"',
    [
      input.lieferantId,
      input.name,
      input.beschreibung ?? null,
      input.artikelnummer ?? null,
      input.einheit ?? null,
      input.verpackungseinheit ?? null,
      input.preis,
      input.lagerbestand,
      input.minBestand ?? 0,
    ],
  );

  return result.rows[0];
};

export const updateArtikel = async (
  id: number,
  input: CreateArtikelInput,
): Promise<Artikel | null> => {
  const result = await query(
    'update artikel set lieferant_id = $1, name = $2, beschreibung = $3, artikelnummer = $4, einheit = $5, verpackungseinheit = $6, preis = $7, lagerbestand = $8, min_bestand = $9 where id = $10 returning id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, preis, lagerbestand, min_bestand as "minBestand"',
    [
      input.lieferantId,
      input.name,
      input.beschreibung ?? null,
      input.artikelnummer ?? null,
      input.einheit ?? null,
      input.verpackungseinheit ?? null,
      input.preis,
      input.lagerbestand,
      input.minBestand ?? 0,
      id,
    ],
  );

  return result.rows[0] ?? null;
};

export const deleteArtikel = async (id: number): Promise<boolean> => {
  const result = await query('delete from artikel where id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
};
