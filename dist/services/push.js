"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.sendPushNotification = void 0;
const admin = __importStar(require("firebase-admin"));
const pushTokens_1 = require("../repositories/pushTokens");
const INVALID_TOKEN_CODES = new Set([
    "messaging/registration-token-not-registered",
    "messaging/invalid-registration-token",
]);
const sendPushNotification = (opts) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    if (!admin.apps.length)
        return;
    let messaging;
    try {
        messaging = admin.messaging();
    }
    catch (_c) {
        return;
    }
    const rows = yield (0, pushTokens_1.listPushTokensForAudience)({
        audience: opts.audience,
        excludeUid: opts.excludeUid,
    });
    if (!rows.length)
        return;
    const data = opts.data && Object.keys(opts.data).length
        ? Object.fromEntries(Object.entries(opts.data).map(([k, v]) => [k, String(v !== null && v !== void 0 ? v : "")]))
        : undefined;
    const chunkSize = 500;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const slice = rows.slice(i, i + chunkSize);
        const messages = slice.map((row) => ({
            token: row.fcm_token,
            notification: {
                title: opts.title,
                body: opts.body,
            },
            data,
        }));
        try {
            const result = yield messaging.sendEach(messages);
            for (let j = 0; j < result.responses.length; j++) {
                const r = result.responses[j];
                if (r.success)
                    continue;
                const code = String(((_a = r.error) === null || _a === void 0 ? void 0 : _a.code) || "");
                if (INVALID_TOKEN_CODES.has(code)) {
                    const tok = (_b = slice[j]) === null || _b === void 0 ? void 0 : _b.fcm_token;
                    if (tok) {
                        try {
                            yield (0, pushTokens_1.deletePushTokenByValue)(tok);
                        }
                        catch (_d) {
                            /* ignore */
                        }
                    }
                }
            }
        }
        catch (e) {
            console.error("[push] sendEach failed", e);
        }
    }
});
exports.sendPushNotification = sendPushNotification;
