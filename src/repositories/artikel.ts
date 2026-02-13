import { query } from "../db";
import { Artikel } from "../types";

export interface CreateArtikelInput {
  name: string;
  beschreibung?: string;
  preis: number;
  lagerbestand: number;
  minBestand?: number;
}

export const listArtikel = async (): Promise<Artikel[]> => {
  const result = await query(
    'select id, name, beschreibung, preis, lagerbestand, min_bestand as "minBestand" from artikel order by name',
  );

  return result.rows;
};

export const createArtikel = async (
  input: CreateArtikelInput,
): Promise<Artikel> => {
  const result = await query(
    'insert into artikel (name, beschreibung, preis, lagerbestand, min_bestand) values ($1, $2, $3, $4, $5) returning id, name, beschreibung, preis, lagerbestand, min_bestand as "minBestand"',
    [
      input.name,
      input.beschreibung ?? null,
      input.preis,
      input.lagerbestand,
      input.minBestand ?? 0,
    ],
  );

  return result.rows[0];
};
