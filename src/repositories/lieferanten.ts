import { query } from '../db';
import { Lieferant } from '../types';

export interface CreateLieferantInput {
    name: string;
    kontaktPerson?: string;
    email?: string;
    telefon?: string;
}

export const listLieferanten = async (): Promise<Lieferant[]> => {
    const result = await query(
        'select id, name, kontakt_person as "kontaktPerson", email, telefon from lieferanten order by name'
    );

    return result.rows;
};

export const createLieferant = async (input: CreateLieferantInput): Promise<Lieferant> => {
    const result = await query(
        'insert into lieferanten (name, kontakt_person, email, telefon) values ($1, $2, $3, $4) returning id, name, kontakt_person as "kontaktPerson", email, telefon',
        [input.name, input.kontaktPerson ?? null, input.email ?? null, input.telefon ?? null]
    );

    return result.rows[0];
};
