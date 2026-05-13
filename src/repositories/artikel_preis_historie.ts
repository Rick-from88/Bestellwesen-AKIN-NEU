import { query } from "../db";

export type ArtikelPreisHistorieRow = {
  id: number;
  artikelId: number;
  preisAlt: number | null;
  preisNeu: number;
  geaendertAm: string;
};

/** Wird bei geändertem Katalogpreis aufgerufen (append-only). */
export const insertArtikelPreisHistorie = async (input: {
  artikelId: number;
  preisAlt: number | null;
  preisNeu: number;
}): Promise<void> => {
  await query(
    `insert into artikel_preis_historie (artikel_id, preis_alt, preis_neu)
     values ($1, $2, $3)`,
    [input.artikelId, input.preisAlt, input.preisNeu],
  );
};

export const listArtikelPreisHistorie = async (
  artikelId: number,
): Promise<ArtikelPreisHistorieRow[]> => {
  const res = await query(
    `select id,
            artikel_id as "artikelId",
            preis_alt as "preisAlt",
            preis_neu as "preisNeu",
            geaendert_am as "geaendertAm"
       from artikel_preis_historie
      where artikel_id = $1
      order by geaendert_am desc, id desc`,
    [artikelId],
  );
  return res.rows;
};
