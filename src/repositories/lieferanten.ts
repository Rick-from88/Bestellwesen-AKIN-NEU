import { query } from "../db";
import { Artikel, Lieferant } from "../types";

export interface CreateLieferantInput {
  name: string;
  kontaktPerson?: string;
  email?: string;
  telefon?: string;
  strasse?: string;
  plz?: string;
  stadt?: string;
  land?: string;
}

export const listLieferanten = async (): Promise<Lieferant[]> => {
  const result = await query(
    'select id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land from lieferanten order by name',
  );

  return result.rows;
};

export const getLieferantById = async (
  id: number,
): Promise<Lieferant | null> => {
  const result = await query(
    'select id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land from lieferanten where id = $1',
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
    'insert into lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land',
    [
      input.name,
      input.kontaktPerson ?? null,
      input.email ?? null,
      input.telefon ?? null,
      input.strasse ?? null,
      input.plz ?? null,
      input.stadt ?? null,
      input.land ?? null,
    ],
  );

  return result.rows[0];
};

export const updateLieferant = async (
  id: number,
  input: CreateLieferantInput,
): Promise<Lieferant | null> => {
  const result = await query(
    'update lieferanten set name = $1, kontakt_person = $2, email = $3, telefon = $4, strasse = $5, plz = $6, stadt = $7, land = $8 where id = $9 returning id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land',
    [
      input.name,
      input.kontaktPerson ?? null,
      input.email ?? null,
      input.telefon ?? null,
      input.strasse ?? null,
      input.plz ?? null,
      input.stadt ?? null,
      input.land ?? null,
      id,
    ],
  );

  return result.rows[0] ?? null;
};

export const deleteLieferant = async (id: number): Promise<boolean> => {
  const result = await query('delete from lieferanten where id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
};
