import { getClient, query } from "../db";
import { getSetting, setSetting } from "./settings";
import { Bestellung, BestellungPosition } from "../types";

export type BestellungStatus = "offen" | "bestellt" | "geliefert" | "storniert";

export interface BestellungPositionInput {
  artikelId: number;
  lieferantId: number;
  menge: number;
}

export interface CreateBestellungInput {
  status?: BestellungStatus;
  bestellDatum?: string;
  positionen: BestellungPositionInput[];
}

export interface UpdateBestellungInput {
  status?: BestellungStatus;
  bestellDatum?: string;
  positionen: BestellungPositionInput[];
}

export const listBestellungen = async (): Promise<Bestellung[]> => {
  const result = await query(
    `select b.id,
                    b.bestellnummer as "bestellnummer",
                    b.status,
                    b.bestell_datum as "bestellDatum",
                    p.artikel_id as "artikelId",
                    p.lieferant_id as "lieferantId",
                    p.menge
                 from bestellungen b
                 join bestellpositionen p on p.bestellung_id = b.id
                union all
               select b.id,
                    b.bestellnummer as "bestellnummer",
                    b.status,
                    b.bestell_datum as "bestellDatum",
                    b.artikel_id as "artikelId",
                    b.lieferant_id as "lieferantId",
                    b.menge
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
        status: row.status as BestellungStatus,
        bestellDatum: row.bestellDatum,
        positionen: [],
      });
    }

    if (row.artikelId && row.lieferantId && row.menge) {
      const position: BestellungPosition = {
        artikelId: row.artikelId,
        lieferantId: row.lieferantId,
        menge: row.menge,
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
      'insert into bestellungen (bestellnummer, artikel_id, lieferant_id, menge, status, bestell_datum) values ($1, $2, $3, $4, $5, coalesce($6::timestamp, now())) returning id, bestellnummer, status, bestell_datum as "bestellDatum"',
      [
        nextNr,
        firstPosition.artikelId,
        firstPosition.lieferantId,
        firstPosition.menge,
        input.status ?? "offen",
        input.bestellDatum ?? null,
      ],
    );

    const bestellung = bestellungResult.rows[0];

    for (const position of input.positionen) {
      await client.query(
        "insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)",
        [
          bestellung.id,
          position.artikelId,
          position.lieferantId,
          position.menge,
        ],
      );
    }

    await client.query("commit");

    return {
      id: bestellung.id,
      bestellnummer: bestellung.bestellnummer ?? undefined,
      status: bestellung.status as BestellungStatus,
      bestellDatum: bestellung.bestellDatum,
      positionen: input.positionen,
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
    const bestellungResult = await client.query(
      'update bestellungen set artikel_id = $1, lieferant_id = $2, menge = $3, status = $4, bestell_datum = coalesce($5::timestamp, bestell_datum) where id = $6 returning id, status, bestell_datum as "bestellDatum"',
      [
        firstPosition.artikelId,
        firstPosition.lieferantId,
        firstPosition.menge,
        input.status ?? "offen",
        input.bestellDatum ?? null,
        id,
      ],
    );

    if (!bestellungResult.rows.length) {
      throw new Error("Bestellung nicht gefunden");
    }

    await client.query(
      "delete from bestellpositionen where bestellung_id = $1",
      [id],
    );

    for (const position of input.positionen) {
      await client.query(
        "insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)",
        [id, position.artikelId, position.lieferantId, position.menge],
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
      bestellDatum: bestellung.bestellDatum,
      positionen: input.positionen,
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
                b.status,
                b.bestell_datum as "bestellDatum",
                p.artikel_id as "artikelId",
                p.lieferant_id as "lieferantId",
                p.menge
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
        status: row.status as BestellungStatus,
        bestellDatum: row.bestellDatum,
        positionen: [],
      });
    }
    if (row.artikelId && row.lieferantId && row.menge) {
      bestellungenMap.get(bid)?.positionen.push({
        artikelId: row.artikelId,
        lieferantId: row.lieferantId,
        menge: row.menge,
      });
    }
  });

  return bestellungenMap.values().next().value || null;
};
