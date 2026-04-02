import { query } from "../db";
import { Artikel, Lieferant } from "../types";

export interface CreateLieferantInput {
  name: string;
  kundenNummer?: string;
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
    'select id, name, kundennummer as "kundenNummer", kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land from lieferanten order by name',
  );

  return result.rows;
};

export const getLieferantById = async (
  id: number,
): Promise<Lieferant | null> => {
  const result = await query(
    'select id, name, kundennummer as "kundenNummer", kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land from lieferanten where id = $1',
    [id],
  );

  return result.rows[0] ?? null;
};

export const listLieferantArtikel = async (
  lieferantId: number,
): Promise<Artikel[]> => {
  const result = await query(
    `select a.id,
                a.lieferant_id as "lieferantId",
                a.name,
                a.beschreibung,
                a.artikelnummer,
                a.einheit,
                a.verpackungseinheit,
                a.standard_bestellwert as "standardBestellwert",
                a.foto_url as "fotoUrl",
                a.preis
           from artikel a
          where a.lieferant_id = $1
          order by a.name`,
    [lieferantId],
  );

  return result.rows;
};

export interface LieferantBestellverlaufEintrag {
  id: number;
  bestellnummer?: number;
  status:
    | "offen"
    | "bestellt"
    | "teilgeliefert"
    | "geliefert"
    | "teilstorniert"
    | "storniert";
  bestellDatum: string;
  createdByName?: string;
  createdByEmail?: string;
  positionenAnzahl: number;
}

export const listLieferantBestellungen = async (
  lieferantId: number,
): Promise<LieferantBestellverlaufEintrag[]> => {
  const result = await query(
    `select b.id,
                b.bestellnummer as "bestellnummer",
                b.status,
                b.bestell_datum as "bestellDatum",
                b.created_by_name as "createdByName",
                b.created_by_email as "createdByEmail",
                coalesce(pos.positionen_anzahl, 1) as "positionenAnzahl"
           from bestellungen b
           left join (
             select p.bestellung_id, count(*)::int as positionen_anzahl
               from bestellpositionen p
              group by p.bestellung_id
           ) pos on pos.bestellung_id = b.id
          where (
            b.lieferant_id = $1
            or exists (
              select 1
                from bestellpositionen p2
               where p2.bestellung_id = b.id
                 and p2.lieferant_id = $1
            )
          )
          order by b.bestell_datum desc, b.id desc`,
    [lieferantId],
  );

  return result.rows;
};

export const createLieferant = async (
  input: CreateLieferantInput,
): Promise<Lieferant> => {
  const result = await query(
    'insert into lieferanten (name, kundennummer, kontakt_person, email, telefon, strasse, plz, stadt, land) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, name, kundennummer as "kundenNummer", kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land',
    [
      input.name,
      input.kundenNummer ?? null,
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
    'update lieferanten set name = $1, kundennummer = $2, kontakt_person = $3, email = $4, telefon = $5, strasse = $6, plz = $7, stadt = $8, land = $9 where id = $10 returning id, name, kundennummer as "kundenNummer", kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land',
    [
      input.name,
      input.kundenNummer ?? null,
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
