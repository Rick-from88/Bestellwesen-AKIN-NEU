import { getClient, query } from "../db";
import { getSetting, setSetting } from "./settings";
import { Bestellung, BestellungPosition } from "../types";

export type BestellungStatus =
  | "offen"
  | "bestellt"
  | "teilgeliefert"
  | "geliefert"
  | "teilstorniert"
  | "storniert";

export interface BestellungPositionInput {
  artikelId: number;
  lieferantId: number;
  menge: number;
  geliefertMenge?: number;
  storniertMenge?: number;
  notiz?: string;
}

export interface CreateBestellungInput {
  status?: BestellungStatus;
  bestellDatum?: string;
  auftragsBestaetigt?: boolean;
  createdByUid?: string;
  createdByName?: string;
  createdByEmail?: string;
  positionen: BestellungPositionInput[];
}

export interface UpdateBestellungInput {
  status?: BestellungStatus;
  bestellDatum?: string;
  auftragsBestaetigt?: boolean;
  positionen: BestellungPositionInput[];
}

async function loadArtikelPreisMap(
  client: { query: (t: string, p?: unknown[]) => Promise<{ rows: any[] }> },
  artikelIds: number[],
): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  const ids = [...new Set(artikelIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return map;
  const res = await client.query("select id, preis from artikel where id = any($1::int[])", [
    ids,
  ]);
  for (const row of res.rows || []) {
    map.set(Number(row.id), Number(row.preis) || 0);
  }
  return map;
}

/** Aktualisiert gespeicherte Einzelpreise aller Positionen (und Legacy-Zeile) aus dem Katalog. */
export const snapshotEinzelpreiseFromArtikelForOrders = async (
  orderIds: number[],
): Promise<void> => {
  const ids = [...new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0))];
  if (!ids.length) return;
  await query(
    `update bestellpositionen p
        set einzelpreis = a.preis
       from artikel a
      where p.artikel_id = a.id
        and p.bestellung_id = any($1::int[])`,
    [ids],
  );
  await query(
    `update bestellungen b
        set einzelpreis = a.preis
       from artikel a
      where b.artikel_id = a.id
        and b.id = any($1::int[])`,
    [ids],
  );
};

export const listBestellungen = async (): Promise<Bestellung[]> => {
  const result = await query(
    `select b.id,
                    b.bestellnummer as "bestellnummer",
                    b.created_by_uid as "createdByUid",
                    b.created_by_name as "createdByName",
                    b.created_by_email as "createdByEmail",
                    b.status,
                    b.auftrags_bestaetigt as "auftragsBestaetigt",
                    b.bestell_datum as "bestellDatum",
                    p.artikel_id as "artikelId",
                    p.lieferant_id as "lieferantId",
                    p.menge,
                    p.geliefert_menge as "geliefertMenge",
                    p.storniert_menge as "storniertMenge",
                    p.notiz,
                    p.einzelpreis as "einzelpreis"
                 from bestellungen b
                 join bestellpositionen p on p.bestellung_id = b.id
                union all
               select b.id,
                    b.bestellnummer as "bestellnummer",
                    b.created_by_uid as "createdByUid",
                    b.created_by_name as "createdByName",
                    b.created_by_email as "createdByEmail",
                    b.status,
                    b.auftrags_bestaetigt as "auftragsBestaetigt",
                    b.bestell_datum as "bestellDatum",
                    b.artikel_id as "artikelId",
                    b.lieferant_id as "lieferantId",
                    b.menge,
                    0::int as "geliefertMenge",
                    0::int as "storniertMenge",
                    null::text as notiz,
                    b.einzelpreis as "einzelpreis"
                 from bestellungen b
                where not exists (
                    select 1 from bestellpositionen p where p.bestellung_id = b.id
                )
                order by "bestellDatum" desc, id desc`,
  );

  const bestellungen = new Map<number, Bestellung>();

  result.rows.forEach((row) => {
    const id = row.id as number;
    const existing = bestellungen.get(id);

    if (!existing) {
      bestellungen.set(id, {
        id,
        bestellnummer: row.bestellnummer ?? undefined,
        createdByUid: row.createdByUid ?? undefined,
        createdByName: row.createdByName ?? undefined,
        createdByEmail: row.createdByEmail ?? undefined,
        status: row.status as BestellungStatus,
        auftragsBestaetigt: row.auftragsBestaetigt ?? false,
        bestellDatum: row.bestellDatum,
        positionen: [],
      });
    }

    if (row.artikelId && row.lieferantId && row.menge) {
      const position: BestellungPosition = {
        artikelId: row.artikelId,
        lieferantId: row.lieferantId,
        menge: row.menge,
        notiz: row.notiz ?? undefined,
        geliefertMenge: row.geliefertMenge ?? 0,
        storniertMenge: row.storniertMenge ?? 0,
        einzelpreis:
          row.einzelpreis !== null && row.einzelpreis !== undefined
            ? Number(row.einzelpreis)
            : undefined,
      };
      bestellungen.get(id)?.positionen.push(position);
    }
  });

  const resultArray = Array.from(bestellungen.values());
  resultArray.sort((a, b) => {
    const da = a.bestellDatum ? new Date(a.bestellDatum).getTime() : 0;
    const db = b.bestellDatum ? new Date(b.bestellDatum).getTime() : 0;
    if (da !== db) return db - da; // newest first
    return (b.id ?? 0) - (a.id ?? 0);
  });
  return resultArray;
};

export const getNextBestellnummer = async (
  dateIso?: string,
): Promise<number> => {
  const client = await getClient();
  try {
    const dateForNr = dateIso ? new Date(dateIso) : new Date();
    const year = Number(dateForNr.getFullYear());

    // settings: prefix (string) and seq_digits (number)
    const prefixSetting = await getSetting("bestellnummer_prefix");
    const seqDigitsSetting = await getSetting("bestellnummer_seq_digits");

    let prefixStr: string;
    if (prefixSetting) {
      prefixStr = prefixSetting;
    } else {
      prefixStr = String(year % 100).padStart(2, "0");
    }

    const seqDigits = seqDigitsSetting ? Number(seqDigitsSetting) : 3;
    const multiplier = Math.pow(10, seqDigits);
    const lower = Number(prefixStr) * multiplier;
    const upper = (Number(prefixStr) + 1) * multiplier - 1;

    // check for an override setting for the next number for this prefix
    const overrideKey = `bestellnummer_next_${prefixStr}`;
    const override = await getSetting(overrideKey);
    if (override) {
      const ov = Number(override);
      if (!Number.isNaN(ov) && ov >= lower && ov <= upper) {
        return ov;
      }
    }

    const maxRes = await client.query(
      "select max(bestellnummer) as mx from bestellungen where bestellnummer between $1 and $2",
      [lower, upper],
    );
    const mx = maxRes.rows[0]?.mx ?? null;
    let next = lower;
    if (mx && Number(mx) >= lower) {
      next = Number(mx) + 1;
    }
    return next;
  } finally {
    client.release();
  }
};

export const createBestellung = async (
  input: CreateBestellungInput,
): Promise<Bestellung> => {
  const client = await getClient();

  try {
    await client.query("begin");

    const firstPosition = input.positionen[0];
    const preisMap = await loadArtikelPreisMap(
      client,
      input.positionen.map((p) => p.artikelId),
    );
    const firstEinzelpreis = preisMap.get(firstPosition.artikelId) ?? 0;

    // compute bestellnummer: format YY + 3-digit sequence (YY * 1000 + seq)
    // determine next bestellnummer using shared logic (reads settings)
    const nextNr = await getNextBestellnummer(input.bestellDatum);

    // if there is an override setting for this prefix, advance it so next time counting continues
    try {
      const dateForNr = input.bestellDatum
        ? new Date(input.bestellDatum)
        : new Date();
      const year = Number(dateForNr.getFullYear());
      const prefixSetting = await getSetting("bestellnummer_prefix");
      let prefixStr: string;
      if (prefixSetting) {
        prefixStr = prefixSetting;
      } else {
        prefixStr = String(year % 100).padStart(2, "0");
      }
      const overrideKey = `bestellnummer_next_${prefixStr}`;
      const override = await getSetting(overrideKey);
      if (override) {
        // set to next + 1 so subsequent calls continue after the used number
        await setSetting(overrideKey, String(Number(nextNr) + 1));
      }
    } catch (e) {
      // non-fatal: if updating the override fails, continue without blocking the creation
      console.error(
        "Warnung: konnte Override-Einstellung nicht aktualisieren",
        e,
      );
    }

    const bestellungResult = await client.query(
      'insert into bestellungen (bestellnummer, created_by_uid, created_by_name, created_by_email, artikel_id, lieferant_id, menge, einzelpreis, auftrags_bestaetigt, status, bestell_datum) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, coalesce($11::timestamp, now())) returning id, bestellnummer, created_by_uid as "createdByUid", created_by_name as "createdByName", created_by_email as "createdByEmail", status, auftrags_bestaetigt as "auftragsBestaetigt", bestell_datum as "bestellDatum"',
      [
        nextNr,
        input.createdByUid ?? null,
        input.createdByName ?? null,
        input.createdByEmail ?? null,
        firstPosition.artikelId,
        firstPosition.lieferantId,
        firstPosition.menge,
        firstEinzelpreis,
        input.auftragsBestaetigt ?? false,
        input.status ?? "offen",
        input.bestellDatum ?? null,
      ],
    );

    const bestellung = bestellungResult.rows[0];

    for (const position of input.positionen) {
      const einzelpreis = preisMap.get(position.artikelId) ?? 0;
      await client.query(
        "insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge, geliefert_menge, storniert_menge, notiz, einzelpreis) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          bestellung.id,
          position.artikelId,
          position.lieferantId,
          position.menge,
          position.geliefertMenge ?? 0,
          position.storniertMenge ?? 0,
          position.notiz ?? null,
          einzelpreis,
        ],
      );
    }

    await client.query("commit");

    return {
      id: bestellung.id,
      bestellnummer: bestellung.bestellnummer ?? undefined,
      createdByUid: bestellung.createdByUid ?? undefined,
      createdByName: bestellung.createdByName ?? undefined,
      createdByEmail: bestellung.createdByEmail ?? undefined,
      status: bestellung.status as BestellungStatus,
      auftragsBestaetigt: bestellung.auftragsBestaetigt ?? false,
      bestellDatum: bestellung.bestellDatum,
      positionen: input.positionen.map((p) => ({
        ...p,
        einzelpreis: preisMap.get(p.artikelId) ?? 0,
      })),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export const updateBestellung = async (
  id: number,
  input: UpdateBestellungInput,
): Promise<Bestellung> => {
  const client = await getClient();

  try {
    await client.query("begin");

    const firstPosition = input.positionen[0];
    const preisMap = await loadArtikelPreisMap(
      client,
      input.positionen.map((p) => p.artikelId),
    );
    const firstEinzelpreis = preisMap.get(firstPosition.artikelId) ?? 0;

    const bestellungResult = await client.query(
      `update bestellungen
         set artikel_id = $1,
             lieferant_id = $2,
             menge = $3,
             einzelpreis = $4,
             auftrags_bestaetigt = coalesce($5::boolean, auftrags_bestaetigt),
             status = $6,
             bestell_datum = coalesce($7::timestamp, bestell_datum)
       where id = $8
       returning id, status, auftrags_bestaetigt as "auftragsBestaetigt", bestell_datum as "bestellDatum"`,
      [
        firstPosition.artikelId,
        firstPosition.lieferantId,
        firstPosition.menge,
        firstEinzelpreis,
        input.auftragsBestaetigt ?? null,
        input.status ?? "offen",
        input.bestellDatum ?? null,
        id,
      ],
    );

    if (!bestellungResult.rows.length) {
      throw new Error("Bestellung nicht gefunden");
    }

    await client.query("delete from bestellpositionen where bestellung_id = $1", [id]);

    for (const position of input.positionen) {
      const einzelpreis = preisMap.get(position.artikelId) ?? 0;
      await client.query(
        "insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge, geliefert_menge, storniert_menge, notiz, einzelpreis) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        [
          id,
          position.artikelId,
          position.lieferantId,
          position.menge,
          position.geliefertMenge ?? 0,
          position.storniertMenge ?? 0,
          position.notiz ?? null,
          einzelpreis,
        ],
      );
    }

    await client.query("commit");

    const bestellung = bestellungResult.rows[0];

    // fetch bestellnummer (was not changed by update)
    const nrRes = await client.query(
      "select bestellnummer from bestellungen where id = $1",
      [id],
    );
    const bestellnummer = nrRes.rows[0]?.bestellnummer ?? undefined;

    return {
      id: bestellung.id,
      bestellnummer,
      status: bestellung.status as BestellungStatus,
      auftragsBestaetigt: bestellung.auftragsBestaetigt ?? false,
      bestellDatum: bestellung.bestellDatum,
      positionen: input.positionen.map((p) => ({
        ...p,
        einzelpreis: preisMap.get(p.artikelId) ?? 0,
      })),
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
};

export const deleteBestellung = async (id: number): Promise<void> => {
  await query("delete from bestellungen where id = $1", [id]);
};

export const getBestellungById = async (
  id: number,
): Promise<Bestellung | null> => {
  const res = await query(
    `select b.id,
                b.bestellnummer as "bestellnummer",
                b.created_by_uid as "createdByUid",
                b.created_by_name as "createdByName",
                b.created_by_email as "createdByEmail",
                b.status,
                b.auftrags_bestaetigt as "auftragsBestaetigt",
                b.bestell_datum as "bestellDatum",
                p.artikel_id as "artikelId",
                p.lieferant_id as "lieferantId",
                p.menge,
                p.geliefert_menge as "geliefertMenge",
                p.storniert_menge as "storniertMenge",
                p.notiz,
                p.einzelpreis as "einzelpreis"
             from bestellungen b
             left join bestellpositionen p on p.bestellung_id = b.id
             where b.id = $1`,
    [id],
  );

  if (!res.rows.length) return null;

  const bestellungenMap = new Map<number, Bestellung>();
  res.rows.forEach((row) => {
    const bid = row.id as number;
    if (!bestellungenMap.has(bid)) {
      bestellungenMap.set(bid, {
        id: bid,
        bestellnummer: row.bestellnummer ?? undefined,
        createdByUid: row.createdByUid ?? undefined,
        createdByName: row.createdByName ?? undefined,
        createdByEmail: row.createdByEmail ?? undefined,
        status: row.status as BestellungStatus,
        auftragsBestaetigt: row.auftragsBestaetigt ?? false,
        bestellDatum: row.bestellDatum,
        positionen: [],
      });
    }
    if (row.artikelId && row.lieferantId && row.menge) {
      bestellungenMap.get(bid)?.positionen.push({
        artikelId: row.artikelId,
        lieferantId: row.lieferantId,
        menge: row.menge,
        geliefertMenge: row.geliefertMenge ?? 0,
        storniertMenge: row.storniertMenge ?? 0,
        notiz: row.notiz ?? undefined,
        einzelpreis:
          row.einzelpreis !== null && row.einzelpreis !== undefined
            ? Number(row.einzelpreis)
            : undefined,
      });
    }
  });

  return bestellungenMap.values().next().value || null;
};
