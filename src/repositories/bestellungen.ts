import { query } from '../db';
import { Bestellung } from '../types';

export type BestellungStatus = 'offen' | 'geliefert' | 'storniert';

export interface CreateBestellungInput {
    artikelId: number;
    lieferantId: number;
    menge: number;
    status?: BestellungStatus;
    bestellDatum?: string;
}

export const listBestellungen = async (): Promise<Bestellung[]> => {
    const result = await query(
        'select id, artikel_id as "artikelId", lieferant_id as "lieferantId", menge, status, bestell_datum as "bestellDatum" from bestellungen order by bestell_datum desc'
    );

    return result.rows;
};

export const createBestellung = async (input: CreateBestellungInput): Promise<Bestellung> => {
    const result = await query(
        'insert into bestellungen (artikel_id, lieferant_id, menge, status, bestell_datum) values ($1, $2, $3, $4, coalesce($5::timestamp, now())) returning id, artikel_id as "artikelId", lieferant_id as "lieferantId", menge, status, bestell_datum as "bestellDatum"',
        [input.artikelId, input.lieferantId, input.menge, input.status ?? 'offen', input.bestellDatum ?? null]
    );

    return result.rows[0];
};
