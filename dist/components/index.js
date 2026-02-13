"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bestellungen = exports.Artikel = exports.Lieferanten = void 0;
var lieferanten_1 = require("../features/lieferanten");
Object.defineProperty(exports, "Lieferanten", { enumerable: true, get: function () { return __importDefault(lieferanten_1).default; } });
var artikel_1 = require("../features/artikel");
Object.defineProperty(exports, "Artikel", { enumerable: true, get: function () { return __importDefault(artikel_1).default; } });
var bestellungen_1 = require("../features/bestellungen");
Object.defineProperty(exports, "Bestellungen", { enumerable: true, get: function () { return __importDefault(bestellungen_1).default; } });
