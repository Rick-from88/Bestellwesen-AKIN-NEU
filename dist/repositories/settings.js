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
exports.listSettings = exports.setSetting = exports.getSetting = void 0;
const db_1 = require("../db");
const getSetting = (key) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const result = yield (0, db_1.query)('select value from settings where key = $1', [key]);
    return (_b = (_a = result.rows[0]) === null || _a === void 0 ? void 0 : _a.value) !== null && _b !== void 0 ? _b : null;
});
exports.getSetting = getSetting;
const setSetting = (key, value) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.query)('insert into settings(key, value) values ($1, $2) on conflict (key) do update set value = excluded.value', [key, value]);
});
exports.setSetting = setSetting;
const listSettings = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield (0, db_1.query)('select key, value from settings');
    return result.rows.reduce((acc, row) => {
        acc[row.key] = row.value;
        return acc;
    }, {});
});
exports.listSettings = listSettings;
