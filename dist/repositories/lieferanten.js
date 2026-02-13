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
exports.createLieferant = exports.listLieferantArtikel = exports.getLieferantById = exports.listLieferanten = void 0;
const db_1 = require("../db");
const listLieferanten = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)('select id, name, kontakt_person as "kontaktPerson", email, telefon from lieferanten order by name');
    return result.rows;
});
exports.listLieferanten = listLieferanten;
const getLieferantById = (id) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const result = yield (0, db_1.query)('select id, name, kontakt_person as "kontaktPerson", email, telefon from lieferanten where id = $1', [id]);
    return (_a = result.rows[0]) !== null && _a !== void 0 ? _a : null;
});
exports.getLieferantById = getLieferantById;
const listLieferantArtikel = (lieferantId) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)(`select a.id,
                a.name,
                a.beschreibung,
                a.preis,
                a.lagerbestand,
                a.min_bestand as "minBestand"
           from bestellungen b
           join artikel a on a.id = b.artikel_id
          where b.lieferant_id = $1
          group by a.id, a.name, a.beschreibung, a.preis, a.lagerbestand, a.min_bestand
          order by a.name`, [lieferantId]);
    return result.rows;
});
exports.listLieferantArtikel = listLieferantArtikel;
const createLieferant = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _b, _c, _d;
    const result = yield (0, db_1.query)('insert into lieferanten (name, kontakt_person, email, telefon) values ($1, $2, $3, $4) returning id, name, kontakt_person as "kontaktPerson", email, telefon', [
        input.name,
        (_b = input.kontaktPerson) !== null && _b !== void 0 ? _b : null,
        (_c = input.email) !== null && _c !== void 0 ? _c : null,
        (_d = input.telefon) !== null && _d !== void 0 ? _d : null,
    ]);
    return result.rows[0];
});
exports.createLieferant = createLieferant;
