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
exports.deleteLieferant = exports.updateLieferant = exports.createLieferant = exports.listLieferantArtikel = exports.getLieferantById = exports.listLieferanten = void 0;
const db_1 = require("../db");
const listLieferanten = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)('select id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land from lieferanten order by name');
    return result.rows;
});
exports.listLieferanten = listLieferanten;
const getLieferantById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield (0, db_1.query)('select id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land from lieferanten where id = $1', [id]);
    return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
});
exports.getLieferantById = getLieferantById;
const listLieferantArtikel = (lieferantId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)(`select a.id,
                a.lieferant_id as "lieferantId",
                a.name,
                a.beschreibung,
                a.preis,
                a.lagerbestand,
                a.min_bestand as "minBestand"
           from artikel a
          where a.lieferant_id = $1
          order by a.name`, [lieferantId]);
    return result.rows;
});
exports.listLieferantArtikel = listLieferantArtikel;
const createLieferant = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d, _e, _f, _g, _h;
    const result = yield (0, db_1.query)('insert into lieferanten (name, kontakt_person, email, telefon, strasse, plz, stadt, land) values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land', [
        input.name,
        (_b = input.kontaktPerson) !== null && _b !== void 0 ? _b : null,
        (_c = input.email) !== null && _c !== void 0 ? _c : null,
        (_d = input.telefon) !== null && _d !== void 0 ? _d : null,
        (_e = input.strasse) !== null && _e !== void 0 ? _e : null,
        (_f = input.plz) !== null && _f !== void 0 ? _f : null,
        (_g = input.stadt) !== null && _g !== void 0 ? _g : null,
        (_h = input.land) !== null && _h !== void 0 ? _h : null,
    ]);
    return result.rows[0];
});
exports.createLieferant = createLieferant;
const updateLieferant = (id, input) => __awaiter(void 0, void 0, void 0, function* () {
    var _j, _k, _l, _m, _o, _p, _q, _r;
    const result = yield (0, db_1.query)('update lieferanten set name = $1, kontakt_person = $2, email = $3, telefon = $4, strasse = $5, plz = $6, stadt = $7, land = $8 where id = $9 returning id, name, kontakt_person as "kontaktPerson", email, telefon, strasse, plz, stadt, land', [
        input.name,
        (_j = input.kontaktPerson) !== null && _j !== void 0 ? _j : null,
        (_k = input.email) !== null && _k !== void 0 ? _k : null,
        (_l = input.telefon) !== null && _l !== void 0 ? _l : null,
        (_m = input.strasse) !== null && _m !== void 0 ? _m : null,
        (_o = input.plz) !== null && _o !== void 0 ? _o : null,
        (_p = input.stadt) !== null && _p !== void 0 ? _p : null,
        (_q = input.land) !== null && _q !== void 0 ? _q : null,
        id,
    ]);
    return (_r = result.rows[0]) !== null && _r !== void 0 ? _r : null;
});
exports.updateLieferant = updateLieferant;
const deleteLieferant = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _s;
    const result = yield (0, db_1.query)('delete from lieferanten where id = $1', [id]);
    return ((_s = result.rowCount) !== null && _s !== void 0 ? _s : 0) > 0;
});
exports.deleteLieferant = deleteLieferant;
