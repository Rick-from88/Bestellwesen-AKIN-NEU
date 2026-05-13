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
exports.listArtikelPreisHistorie = exports.insertArtikelPreisHistorie = void 0;
const db_1 = require("../db");
/** Wird bei geändertem Katalogpreis aufgerufen (append-only). */
const insertArtikelPreisHistorie = (input) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.query)(`insert into artikel_preis_historie (artikel_id, preis_alt, preis_neu)
     values ($1, $2, $3)`, [input.artikelId, input.preisAlt, input.preisNeu]);
});
exports.insertArtikelPreisHistorie = insertArtikelPreisHistorie;
const listArtikelPreisHistorie = (artikelId) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield (0, db_1.query)(`select id,
            artikel_id as "artikelId",
            preis_alt as "preisAlt",
            preis_neu as "preisNeu",
            geaendert_am as "geaendertAm"
       from artikel_preis_historie
      where artikel_id = $1
      order by geaendert_am desc, id desc`, [artikelId]);
    return res.rows;
});
exports.listArtikelPreisHistorie = listArtikelPreisHistorie;
