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
    const result = yield (0, db_1.query)('select id, lieferant_id as "lieferantId", name, beschreibung, preis, lagerbestand, min_bestand as "minBestand" from artikel order by name');
    return result.rows;
});
exports.listArtikel = listArtikel;
const createArtikel = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const result = yield (0, db_1.query)('insert into artikel (lieferant_id, name, beschreibung, preis, lagerbestand, min_bestand) values ($1, $2, $3, $4, $5, $6) returning id, lieferant_id as "lieferantId", name, beschreibung, preis, lagerbestand, min_bestand as "minBestand"', [
        input.lieferantId,
        input.name,
        (_a = input.beschreibung) !== null && _a !== void 0 ? _a : null,
        input.preis,
        input.lagerbestand,
        (_b = input.minBestand) !== null && _b !== void 0 ? _b : 0,
    ]);
    return result.rows[0];
});
exports.createArtikel = createArtikel;
const updateArtikel = (id, input) => __awaiter(void 0, void 0, void 0, function* () {
    var _c, _d, _e;
    const result = yield (0, db_1.query)('update artikel set lieferant_id = $1, name = $2, beschreibung = $3, preis = $4, lagerbestand = $5, min_bestand = $6 where id = $7 returning id, lieferant_id as "lieferantId", name, beschreibung, preis, lagerbestand, min_bestand as "minBestand"', [
        input.lieferantId,
        input.name,
        (_c = input.beschreibung) !== null && _c !== void 0 ? _c : null,
        input.preis,
        input.lagerbestand,
        (_d = input.minBestand) !== null && _d !== void 0 ? _d : 0,
        id,
    ]);
    return (_e = result.rows[0]) !== null && _e !== void 0 ? _e : null;
});
exports.updateArtikel = updateArtikel;
const deleteArtikel = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _f;
    const result = yield (0, db_1.query)('delete from artikel where id = $1', [id]);
    return ((_f = result.rowCount) !== null && _f !== void 0 ? _f : 0) > 0;
});
exports.deleteArtikel = deleteArtikel;
