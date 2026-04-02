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
                    p.notiz
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
                    null::text as notiz
                 from bestellungen b
                where not exists (
                    select 1 from bestellpositionen p where p.bestellung_id = b.id
                )
                order by "bestellDatum" desc, id desc`);
    const bestellungen = new Map();
    result.rows.forEach((row) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const id = row.id;
        const existing = bestellungen.get(id);
        if (!existing) {
            bestellungen.set(id, {
                id,
                bestellnummer: (_a = row.bestellnummer) !== null && _a !== void 0 ? _a : undefined,
                createdByUid: (_b = row.createdByUid) !== null && _b !== void 0 ? _b : undefined,
                createdByName: (_c = row.createdByName) !== null && _c !== void 0 ? _c : undefined,
                createdByEmail: (_d = row.createdByEmail) !== null && _d !== void 0 ? _d : undefined,
                status: row.status,
                auftragsBestaetigt: (_e = row.auftragsBestaetigt) !== null && _e !== void 0 ? _e : false,
                bestellDatum: row.bestellDatum,
                positionen: [],
            });
        }
        if (row.artikelId && row.lieferantId && row.menge) {
            const position = {
                artikelId: row.artikelId,
                lieferantId: row.lieferantId,
                menge: row.menge,
                notiz: (_f = row.notiz) !== null && _f !== void 0 ? _f : undefined,
                geliefertMenge: (_g = row.geliefertMenge) !== null && _g !== void 0 ? _g : 0,
                storniertMenge: (_h = row.storniertMenge) !== null && _h !== void 0 ? _h : 0,
            };
            (_j = bestellungen.get(id)) === null || _j === void 0 ? void 0 : _j.positionen.push(position);
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
    var _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
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
        const bestellungResult = yield client.query('insert into bestellungen (bestellnummer, created_by_uid, created_by_name, created_by_email, artikel_id, lieferant_id, menge, auftrags_bestaetigt, status, bestell_datum) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::timestamp, now())) returning id, bestellnummer, created_by_uid as "createdByUid", created_by_name as "createdByName", created_by_email as "createdByEmail", status, auftrags_bestaetigt as "auftragsBestaetigt", bestell_datum as "bestellDatum"', [
            nextNr,
            (_c = input.createdByUid) !== null && _c !== void 0 ? _c : null,
            (_d = input.createdByName) !== null && _d !== void 0 ? _d : null,
            (_e = input.createdByEmail) !== null && _e !== void 0 ? _e : null,
            firstPosition.artikelId,
            firstPosition.lieferantId,
            firstPosition.menge,
            (_f = input.auftragsBestaetigt) !== null && _f !== void 0 ? _f : false,
            (_g = input.status) !== null && _g !== void 0 ? _g : "offen",
            (_h = input.bestellDatum) !== null && _h !== void 0 ? _h : null,
        ]);
        const bestellung = bestellungResult.rows[0];
        for (const position of input.positionen) {
            yield client.query("insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge, geliefert_menge, storniert_menge, notiz) values ($1, $2, $3, $4, $5, $6, $7)", [
                bestellung.id,
                position.artikelId,
                position.lieferantId,
                position.menge,
                (_j = position.geliefertMenge) !== null && _j !== void 0 ? _j : 0,
                (_k = position.storniertMenge) !== null && _k !== void 0 ? _k : 0,
                (_l = position.notiz) !== null && _l !== void 0 ? _l : null,
            ]);
        }
        yield client.query("commit");
        return {
            id: bestellung.id,
            bestellnummer: (_m = bestellung.bestellnummer) !== null && _m !== void 0 ? _m : undefined,
            createdByUid: (_o = bestellung.createdByUid) !== null && _o !== void 0 ? _o : undefined,
            createdByName: (_p = bestellung.createdByName) !== null && _p !== void 0 ? _p : undefined,
            createdByEmail: (_q = bestellung.createdByEmail) !== null && _q !== void 0 ? _q : undefined,
            status: bestellung.status,
            auftragsBestaetigt: (_r = bestellung.auftragsBestaetigt) !== null && _r !== void 0 ? _r : false,
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
    var _s, _t, _u, _v, _w, _x, _y, _z, _0;
    const client = yield (0, db_1.getClient)();
    try {
        yield client.query("begin");
        const firstPosition = input.positionen[0];
        const bestellungResult = yield client.query(`update bestellungen
         set artikel_id = $1,
             lieferant_id = $2,
             menge = $3,
             auftrags_bestaetigt = coalesce($4::boolean, auftrags_bestaetigt),
             status = $5,
             bestell_datum = coalesce($6::timestamp, bestell_datum)
       where id = $7
       returning id, status, auftrags_bestaetigt as "auftragsBestaetigt", bestell_datum as "bestellDatum"`, [
            firstPosition.artikelId,
            firstPosition.lieferantId,
            firstPosition.menge,
            (_s = input.auftragsBestaetigt) !== null && _s !== void 0 ? _s : null,
            (_t = input.status) !== null && _t !== void 0 ? _t : "offen",
            (_u = input.bestellDatum) !== null && _u !== void 0 ? _u : null,
            id,
        ]);
        if (!bestellungResult.rows.length) {
            throw new Error("Bestellung nicht gefunden");
        }
        yield client.query("delete from bestellpositionen where bestellung_id = $1", [id]);
        for (const position of input.positionen) {
            yield client.query("insert into bestellpositionen (bestellung_id, artikel_id, lieferant_id, menge, geliefert_menge, storniert_menge, notiz) values ($1, $2, $3, $4, $5, $6, $7)", [
                id,
                position.artikelId,
                position.lieferantId,
                position.menge,
                (_v = position.geliefertMenge) !== null && _v !== void 0 ? _v : 0,
                (_w = position.storniertMenge) !== null && _w !== void 0 ? _w : 0,
                (_x = position.notiz) !== null && _x !== void 0 ? _x : null,
            ]);
        }
        yield client.query("commit");
        const bestellung = bestellungResult.rows[0];
        // fetch bestellnummer (was not changed by update)
        const nrRes = yield client.query("select bestellnummer from bestellungen where id = $1", [id]);
        const bestellnummer = (_z = (_y = nrRes.rows[0]) === null || _y === void 0 ? void 0 : _y.bestellnummer) !== null && _z !== void 0 ? _z : undefined;
        return {
            id: bestellung.id,
            bestellnummer,
            status: bestellung.status,
            auftragsBestaetigt: (_0 = bestellung.auftragsBestaetigt) !== null && _0 !== void 0 ? _0 : false,
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
                p.notiz
             from bestellungen b
             left join bestellpositionen p on p.bestellung_id = b.id
             where b.id = $1`, [id]);
    if (!res.rows.length)
        return null;
    const bestellungenMap = new Map();
    res.rows.forEach((row) => {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        const bid = row.id;
        if (!bestellungenMap.has(bid)) {
            bestellungenMap.set(bid, {
                id: bid,
                bestellnummer: (_a = row.bestellnummer) !== null && _a !== void 0 ? _a : undefined,
                createdByUid: (_b = row.createdByUid) !== null && _b !== void 0 ? _b : undefined,
                createdByName: (_c = row.createdByName) !== null && _c !== void 0 ? _c : undefined,
                createdByEmail: (_d = row.createdByEmail) !== null && _d !== void 0 ? _d : undefined,
                status: row.status,
                auftragsBestaetigt: (_e = row.auftragsBestaetigt) !== null && _e !== void 0 ? _e : false,
                bestellDatum: row.bestellDatum,
                positionen: [],
            });
        }
        if (row.artikelId && row.lieferantId && row.menge) {
            (_f = bestellungenMap.get(bid)) === null || _f === void 0 ? void 0 : _f.positionen.push({
                artikelId: row.artikelId,
                lieferantId: row.lieferantId,
                menge: row.menge,
                geliefertMenge: (_g = row.geliefertMenge) !== null && _g !== void 0 ? _g : 0,
                storniertMenge: (_h = row.storniertMenge) !== null && _h !== void 0 ? _h : 0,
                notiz: (_j = row.notiz) !== null && _j !== void 0 ? _j : undefined,
            });
        }
    });
    return bestellungenMap.values().next().value || null;
});
exports.getBestellungById = getBestellungById;
