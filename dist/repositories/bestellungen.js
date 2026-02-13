"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteBestellung = exports.updateBestellung = exports.createBestellung = exports.listBestellungen = void 0;
const db_1 = require("../db");
const listBestellungen = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)(`select b.id,
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
          order by "bestellDatum" desc, id desc`);
    const bestellungen = new Map();
    result.rows.forEach((row) => {
        var _a;
        const id = row.id;
        const existing = bestellungen.get(id);
        if (!existing) {
            bestellungen.set(id, {
                id,
                status: row.status,
                bestellDatum: row.bestellDatum,
                positionen: [],
            });
        }
        if (row.artikelId && row.lieferantId && row.menge) {
            const position = {
                artikelId: row.artikelId,
                lieferantId: row.lieferantId,
                menge: row.menge,
            };
            (_a = bestellungen.get(id)) === null || _a === void 0 ? void 0 : _a.positionen.push(position);
        }
    });
    return Array.from(bestellungen.values());
});
exports.listBestellungen = listBestellungen;
const createBestellung = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const client = yield (0, db_1.getClient)();
    try {
        yield client.query('begin');
        const firstPosition = input.positionen[0];
        const bestellungResult = yield client.query('insert into bestellungen (artikel_id, lieferant_id, menge, status, bestell_datum) values ($1, $2, $3, $4, coalesce($5::timestamp, now())) returning id, status, bestell_datum as "bestellDatum"', [
            firstPosition.artikelId,
            firstPosition.lieferantId,
            firstPosition.menge,
            (_a = input.status) !== null && _a !== void 0 ? _a : 'offen',
            (_b = input.bestellDatum) !== null && _b !== void 0 ? _b : null,
        ]);
        const bestellung = bestellungResult.rows[0];
        for (const position of input.positionen) {
            yield client.query('insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)', [bestellung.id, position.artikelId, position.lieferantId, position.menge]);
        }
        yield client.query('commit');
        return {
            id: bestellung.id,
            status: bestellung.status,
            bestellDatum: bestellung.bestellDatum,
            positionen: input.positionen,
        };
    }
    catch (error) {
        yield client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
});
exports.createBestellung = createBestellung;
const updateBestellung = (id, input) => __awaiter(void 0, void 0, void 0, function* () {
    var _c, _d;
    const client = yield (0, db_1.getClient)();
    try {
        yield client.query('begin');
        const firstPosition = input.positionen[0];
        const bestellungResult = yield client.query('update bestellungen set artikel_id = $1, lieferant_id = $2, menge = $3, status = $4, bestell_datum = coalesce($5::timestamp, bestell_datum) where id = $6 returning id, status, bestell_datum as "bestellDatum"', [
            firstPosition.artikelId,
            firstPosition.lieferantId,
            firstPosition.menge,
            (_c = input.status) !== null && _c !== void 0 ? _c : 'offen',
            (_d = input.bestellDatum) !== null && _d !== void 0 ? _d : null,
            id,
        ]);
        if (!bestellungResult.rows.length) {
            throw new Error('Bestellung nicht gefunden');
        }
        yield client.query('delete from bestellpositionen where bestellung_id = $1', [id]);
        for (const position of input.positionen) {
            yield client.query('insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)', [id, position.artikelId, position.lieferantId, position.menge]);
        }
        yield client.query('commit');
        const bestellung = bestellungResult.rows[0];
        return {
            id: bestellung.id,
            status: bestellung.status,
            bestellDatum: bestellung.bestellDatum,
            positionen: input.positionen,
        };
    }
    catch (error) {
        yield client.query('rollback');
        throw error;
    }
    finally {
        client.release();
    }
});
exports.updateBestellung = updateBestellung;
const deleteBestellung = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.query)('delete from bestellungen where id = $1', [id]);
});
exports.deleteBestellung = deleteBestellung;
