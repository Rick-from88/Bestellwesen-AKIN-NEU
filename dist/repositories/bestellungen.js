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
exports.getBestellungById = exports.deleteBestellung = exports.updateBestellung = exports.createBestellung = exports.getNextBestellnummer = exports.listBestellungen = void 0;
const db_1 = require("../db");
const settings_1 = require("./settings");
const listBestellungen = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)(`select b.id,
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
                order by "bestellDatum" desc, id desc`);
    const bestellungen = new Map();
    result.rows.forEach((row) => {
        var _a, _b;
        const id = row.id;
        const existing = bestellungen.get(id);
        if (!existing) {
            bestellungen.set(id, {
                id,
                bestellnummer: (_a = row.bestellnummer) !== null && _a !== void 0 ? _a : undefined,
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
            (_b = bestellungen.get(id)) === null || _b === void 0 ? void 0 : _b.positionen.push(position);
        }
    });
    const resultArray = Array.from(bestellungen.values());
    resultArray.sort((a, b) => {
        var _a, _b;
        const da = a.bestellDatum ? new Date(a.bestellDatum).getTime() : 0;
        const db = b.bestellDatum ? new Date(b.bestellDatum).getTime() : 0;
        if (da !== db)
            return db - da; // newest first
        return ((_a = b.id) !== null && _a !== void 0 ? _a : 0) - ((_b = a.id) !== null && _b !== void 0 ? _b : 0);
    });
    return resultArray;
});
exports.listBestellungen = listBestellungen;
const getNextBestellnummer = (dateIso) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const client = yield (0, db_1.getClient)();
    try {
        const dateForNr = dateIso ? new Date(dateIso) : new Date();
        const year = Number(dateForNr.getFullYear());
        // settings: prefix (string) and seq_digits (number)
        const prefixSetting = yield (0, settings_1.getSetting)("bestellnummer_prefix");
        const seqDigitsSetting = yield (0, settings_1.getSetting)("bestellnummer_seq_digits");
        let prefixStr;
        if (prefixSetting) {
            prefixStr = prefixSetting;
        }
        else {
            prefixStr = String(year % 100).padStart(2, "0");
        }
        const seqDigits = seqDigitsSetting ? Number(seqDigitsSetting) : 3;
        const multiplier = Math.pow(10, seqDigits);
        const lower = Number(prefixStr) * multiplier;
        const upper = (Number(prefixStr) + 1) * multiplier - 1;
        // check for an override setting for the next number for this prefix
        const overrideKey = `bestellnummer_next_${prefixStr}`;
        const override = yield (0, settings_1.getSetting)(overrideKey);
        if (override) {
            const ov = Number(override);
            if (!Number.isNaN(ov) && ov >= lower && ov <= upper) {
                return ov;
            }
        }
        const maxRes = yield client.query("select max(bestellnummer) as mx from bestellungen where bestellnummer between $1 and $2", [lower, upper]);
        const mx = (_b = (_a = maxRes.rows[0]) === null || _a === void 0 ? void 0 : _a.mx) !== null && _b !== void 0 ? _b : null;
        let next = lower;
        if (mx && Number(mx) >= lower) {
            next = Number(mx) + 1;
        }
        return next;
    }
    finally {
        client.release();
    }
});
exports.getNextBestellnummer = getNextBestellnummer;
const createBestellung = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _c, _d, _e;
    const client = yield (0, db_1.getClient)();
    try {
        yield client.query("begin");
        const firstPosition = input.positionen[0];
        // compute bestellnummer: format YY + 3-digit sequence (YY * 1000 + seq)
        // determine next bestellnummer using shared logic (reads settings)
        const nextNr = yield (0, exports.getNextBestellnummer)(input.bestellDatum);
        // if there is an override setting for this prefix, advance it so next time counting continues
        try {
            const dateForNr = input.bestellDatum
                ? new Date(input.bestellDatum)
                : new Date();
            const year = Number(dateForNr.getFullYear());
            const prefixSetting = yield (0, settings_1.getSetting)("bestellnummer_prefix");
            let prefixStr;
            if (prefixSetting) {
                prefixStr = prefixSetting;
            }
            else {
                prefixStr = String(year % 100).padStart(2, "0");
            }
            const overrideKey = `bestellnummer_next_${prefixStr}`;
            const override = yield (0, settings_1.getSetting)(overrideKey);
            if (override) {
                // set to next + 1 so subsequent calls continue after the used number
                yield (0, settings_1.setSetting)(overrideKey, String(Number(nextNr) + 1));
            }
        }
        catch (e) {
            // non-fatal: if updating the override fails, continue without blocking the creation
            console.error("Warnung: konnte Override-Einstellung nicht aktualisieren", e);
        }
        const bestellungResult = yield client.query('insert into bestellungen (bestellnummer, artikel_id, lieferant_id, menge, status, bestell_datum) values ($1, $2, $3, $4, $5, coalesce($6::timestamp, now())) returning id, bestellnummer, status, bestell_datum as "bestellDatum"', [
            nextNr,
            firstPosition.artikelId,
            firstPosition.lieferantId,
            firstPosition.menge,
            (_c = input.status) !== null && _c !== void 0 ? _c : "offen",
            (_d = input.bestellDatum) !== null && _d !== void 0 ? _d : null,
        ]);
        const bestellung = bestellungResult.rows[0];
        for (const position of input.positionen) {
            yield client.query("insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)", [
                bestellung.id,
                position.artikelId,
                position.lieferantId,
                position.menge,
            ]);
        }
        yield client.query("commit");
        return {
            id: bestellung.id,
            bestellnummer: (_e = bestellung.bestellnummer) !== null && _e !== void 0 ? _e : undefined,
            status: bestellung.status,
            bestellDatum: bestellung.bestellDatum,
            positionen: input.positionen,
        };
    }
    catch (error) {
        yield client.query("rollback");
        throw error;
    }
    finally {
        client.release();
    }
});
exports.createBestellung = createBestellung;
const updateBestellung = (id, input) => __awaiter(void 0, void 0, void 0, function* () {
    var _f, _g, _h, _j;
    const client = yield (0, db_1.getClient)();
    try {
        yield client.query("begin");
        const firstPosition = input.positionen[0];
        const bestellungResult = yield client.query('update bestellungen set artikel_id = $1, lieferant_id = $2, menge = $3, status = $4, bestell_datum = coalesce($5::timestamp, bestell_datum) where id = $6 returning id, status, bestell_datum as "bestellDatum"', [
            firstPosition.artikelId,
            firstPosition.lieferantId,
            firstPosition.menge,
            (_f = input.status) !== null && _f !== void 0 ? _f : "offen",
            (_g = input.bestellDatum) !== null && _g !== void 0 ? _g : null,
            id,
        ]);
        if (!bestellungResult.rows.length) {
            throw new Error("Bestellung nicht gefunden");
        }
        yield client.query("delete from bestellpositionen where bestellung_id = $1", [id]);
        for (const position of input.positionen) {
            yield client.query("insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge) values ($1, $2, $3, $4)", [id, position.artikelId, position.lieferantId, position.menge]);
        }
        yield client.query("commit");
        const bestellung = bestellungResult.rows[0];
        // fetch bestellnummer (was not changed by update)
        const nrRes = yield client.query("select bestellnummer from bestellungen where id = $1", [id]);
        const bestellnummer = (_j = (_h = nrRes.rows[0]) === null || _h === void 0 ? void 0 : _h.bestellnummer) !== null && _j !== void 0 ? _j : undefined;
        return {
            id: bestellung.id,
            bestellnummer,
            status: bestellung.status,
            bestellDatum: bestellung.bestellDatum,
            positionen: input.positionen,
        };
    }
    catch (error) {
        yield client.query("rollback");
        throw error;
    }
    finally {
        client.release();
    }
});
exports.updateBestellung = updateBestellung;
const deleteBestellung = (id) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.query)("delete from bestellungen where id = $1", [id]);
});
exports.deleteBestellung = deleteBestellung;
const getBestellungById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield (0, db_1.query)(`select b.id,
                b.bestellnummer as "bestellnummer",
                b.status,
                b.bestell_datum as "bestellDatum",
                p.artikel_id as "artikelId",
                p.lieferant_id as "lieferantId",
                p.menge
             from bestellungen b
             left join bestellpositionen p on p.bestellung_id = b.id
             where b.id = $1`, [id]);
    if (!res.rows.length)
        return null;
    const bestellungenMap = new Map();
    res.rows.forEach((row) => {
        var _a, _b;
        const bid = row.id;
        if (!bestellungenMap.has(bid)) {
            bestellungenMap.set(bid, {
                id: bid,
                bestellnummer: (_a = row.bestellnummer) !== null && _a !== void 0 ? _a : undefined,
                status: row.status,
                bestellDatum: row.bestellDatum,
                positionen: [],
            });
        }
        if (row.artikelId && row.lieferantId && row.menge) {
            (_b = bestellungenMap.get(bid)) === null || _b === void 0 ? void 0 : _b.positionen.push({
                artikelId: row.artikelId,
                lieferantId: row.lieferantId,
                menge: row.menge,
            });
        }
    });
    return bestellungenMap.values().next().value || null;
});
exports.getBestellungById = getBestellungById;
