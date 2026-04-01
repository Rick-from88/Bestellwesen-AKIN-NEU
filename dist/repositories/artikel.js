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
exports.deleteArtikel = exports.updateArtikel = exports.createArtikel = exports.listArtikel = void 0;
const db_1 = require("../db");
const listArtikel = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)('select id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert as "standardBestellwert", foto_url as "fotoUrl", preis from artikel order by name');
    return result.rows;
});
exports.listArtikel = listArtikel;
const createArtikel = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    const result = yield (0, db_1.query)('insert into artikel (lieferant_id, name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert, foto_url, preis) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert as "standardBestellwert", foto_url as "fotoUrl", preis', [
        input.lieferantId,
        input.name,
        (_a = input.beschreibung) !== null && _a !== void 0 ? _a : null,
        (_b = input.artikelnummer) !== null && _b !== void 0 ? _b : null,
        (_c = input.einheit) !== null && _c !== void 0 ? _c : null,
        (_d = input.verpackungseinheit) !== null && _d !== void 0 ? _d : null,
        (_e = input.standardBestellwert) !== null && _e !== void 0 ? _e : null,
        (_f = input.fotoUrl) !== null && _f !== void 0 ? _f : null,
        input.preis,
    ]);
    return result.rows[0];
});
exports.createArtikel = createArtikel;
const updateArtikel = (id, input) => __awaiter(void 0, void 0, void 0, function* () {
    var _g, _h, _j, _k, _l, _m, _o;
    const result = yield (0, db_1.query)('update artikel set lieferant_id = $1, name = $2, beschreibung = $3, artikelnummer = $4, einheit = $5, verpackungseinheit = $6, standard_bestellwert = $7, foto_url = $8, preis = $9 where id = $10 returning id, lieferant_id as "lieferantId", name, beschreibung, artikelnummer, einheit, verpackungseinheit, standard_bestellwert as "standardBestellwert", foto_url as "fotoUrl", preis', [
        input.lieferantId,
        input.name,
        (_g = input.beschreibung) !== null && _g !== void 0 ? _g : null,
        (_h = input.artikelnummer) !== null && _h !== void 0 ? _h : null,
        (_j = input.einheit) !== null && _j !== void 0 ? _j : null,
        (_k = input.verpackungseinheit) !== null && _k !== void 0 ? _k : null,
        (_l = input.standardBestellwert) !== null && _l !== void 0 ? _l : null,
        (_m = input.fotoUrl) !== null && _m !== void 0 ? _m : null,
        input.preis,
        id,
    ]);
    return (_o = result.rows[0]) !== null && _o !== void 0 ? _o : null;
});
exports.updateArtikel = updateArtikel;
const deleteArtikel = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _p;
    const result = yield (0, db_1.query)("delete from artikel where id = $1", [id]);
    return ((_p = result.rowCount) !== null && _p !== void 0 ? _p : 0) > 0;
});
exports.deleteArtikel = deleteArtikel;
