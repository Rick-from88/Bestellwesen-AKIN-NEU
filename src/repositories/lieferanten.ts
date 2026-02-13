import { query } from "../db";
import { Artikel, Lieferant } from "../types";

export interface CreateLieferantInput {
  name: string;
  kontaktPerson?: string;
  email?: string;
  telefon?: string;
}

export const listLieferanten = async (): Promise<Lieferant[]> => {
  const result = await query(
    'select id, name, kontakt_person as "kontaktPerson", email, telefon from lieferanten order by name',
  );

  return result.rows;
};

export const getLieferantById = async (
  id: number,
): Promise<Lieferant | null> => {
  const result = await query(
    'select id, name, kontakt_person as "kontaktPerson", email, telefon from lieferanten where id = $1',
    [id],
  );

  return result.rows[0] ?? null;
};

export const listLieferantArtikel = async (
  lieferantId: number,
): Promise<Artikel[]> => {
  const result = await query(
    `select a.id,
                a.name,
                a.beschreibung,
                a.preis,
                a.lagerbestand,
                a.min_bestand as "minBestand"
           from bestellungen b
           join artikel a on a.id = b.artikel_id
          where b.lieferant_id = $1
          group by a.id, a.name, a.beschreibung, a.preis, a.lagerbestand, a.min_bestand
          order by a.name`,
    [lieferantId],
  );

  return result.rows;
};

export const createLieferant = async (
  input: CreateLieferantInput,
): Promise<Lieferant> => {
  const result = await query(
    'insert into lieferanten (name, kontakt_person, email, telefon) values ($1, $2, $3, $4) returning id, name, kontakt_person as "kontaktPerson", email, telefon',
    [
      input.name,
      input.kontaktPerson ?? null,
      input.email ?? null,
      input.telefon ?? null,
    ],
  );

  return result.rows[0];
};
