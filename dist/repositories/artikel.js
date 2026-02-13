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
exports.createArtikel = exports.listArtikel = void 0;
const db_1 = require("../db");
const listArtikel = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)('select id, name, beschreibung, preis, lagerbestand, min_bestand as "minBestand" from artikel order by name');
    return result.rows;
});
exports.listArtikel = listArtikel;
const createArtikel = (input) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const result = yield (0, db_1.query)('insert into artikel (name, beschreibung, preis, lagerbestand, min_bestand) values ($1, $2, $3, $4, $5) returning id, name, beschreibung, preis, lagerbestand, min_bestand as "minBestand"', [
        input.name,
        (_a = input.beschreibung) !== null && _a !== void 0 ? _a : null,
        input.preis,
        input.lagerbestand,
        (_b = input.minBestand) !== null && _b !== void 0 ? _b : 0,
    ]);
    return result.rows[0];
});
exports.createArtikel = createArtikel;
