import { getClient, query } from '../db';
import { Bestellung, BestellungPosition } from '../types';

export type BestellungStatus = 'offen' | 'geliefert' | 'storniert';

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
                b.status,
                b.bestell_datum as "bestellDatum",
                p.artikel_id as "artikelId",
                p.lieferant_id as "lieferantId",
                p.menge
           from bestellungen b
           join bestellpositionen p on p.bestellung_id = b.id
          union all
         select b.id,
                b.status,
                b.bestell_datum as "bestellDatum",
                b.artikel_id as "artikelId",
                b.lieferant_id as "lieferantId",
                b.menge
           from bestellungen b
          where not exists (
                select 1 from bestellpositionen p where p.bestellung_id = b.id
          )
          order by "bestellDatum" desc, id desc`
    );

    const bestellungen = new Map<number, Bestellung>();

    result.rows.forEach((row) => {
        const id = row.id as number;
        const existing = bestellungen.get(id);

        if (!existing) {
            bestellungen.set(id, {
                id,
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

    return Array.from(bestellungen.values());
};

export const createBestellung = async (input: CreateBestellungInput): Promise<Bestellung> => {
    const client = await getClient();

    try {
        await client.query('begin');

        const firstPosition = input.positionen[0];
        const bestellungResult = await client.query(
            'insert into bestellungen (artikel_id, lieferant_id, menge, status, bestell_datum) values ($1, $2, $3, $4, coalesce($5::timestamp, now())) returning id, status, bestell_datum as "bestellDatum"',
            [
                firstPosition.artikelId,
                firstPosition.lieferantId,
                firstPosition.menge,
                input.status ?? 'offen',
                input.bestellDatum ?? null,
            ]
        );

        const bestellung = bestellungResult.rows[0];

        for (const position of input.positionen) {
            await client.query(
                'insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)',
                [bestellung.id, position.artikelId, position.lieferantId, position.menge]
            );
        }

        await client.query('commit');

        return {
            id: bestellung.id,
            status: bestellung.status as BestellungStatus,
            bestellDatum: bestellung.bestellDatum,
            positionen: input.positionen,
        };
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
};

export const updateBestellung = async (
    id: number,
    input: UpdateBestellungInput
): Promise<Bestellung> => {
    const client = await getClient();

    try {
        await client.query('begin');

        const firstPosition = input.positionen[0];
        const bestellungResult = await client.query(
            'update bestellungen set artikel_id = $1, lieferant_id = $2, menge = $3, status = $4, bestell_datum = coalesce($5::timestamp, bestell_datum) where id = $6 returning id, status, bestell_datum as "bestellDatum"',
            [
                firstPosition.artikelId,
                firstPosition.lieferantId,
                firstPosition.menge,
                input.status ?? 'offen',
                input.bestellDatum ?? null,
                id,
            ]
        );

        if (!bestellungResult.rows.length) {
            throw new Error('Bestellung nicht gefunden');
        }

        await client.query('delete from bestellpositionen where bestellung_id = $1', [id]);

        for (const position of input.positionen) {
            await client.query(
                'insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)',
                [id, position.artikelId, position.lieferantId, position.menge]
            );
        }

        await client.query('commit');

        const bestellung = bestellungResult.rows[0];
        return {
            id: bestellung.id,
            status: bestellung.status as BestellungStatus,
            bestellDatum: bestellung.bestellDatum,
            positionen: input.positionen,
        };
    } catch (error) {
        await client.query('rollback');
        throw error;
    } finally {
        client.release();
    }
};

export const deleteBestellung = async (id: number): Promise<void> => {
    await query('delete from bestellungen where id = $1', [id]);
};
