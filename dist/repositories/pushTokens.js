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
exports.listPushTokensForAudience = exports.deletePushTokenByValue = exports.deletePushToken = exports.upsertPushToken = void 0;
const db_1 = require("../db");
const upsertPushToken = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const ua = params.userAgent ? String(params.userAgent).slice(0, 512) : null;
    yield (0, db_1.query)(`insert into user_push_tokens (firebase_uid, fcm_token, app_role, user_agent)
     values ($1, $2, $3, $4)
     on conflict (fcm_token) do update set
       firebase_uid = excluded.firebase_uid,
       app_role = excluded.app_role,
       user_agent = excluded.user_agent,
       updated_at = now()`, [params.firebaseUid, params.fcmToken, params.appRole, ua]);
});
exports.upsertPushToken = upsertPushToken;
const deletePushToken = (params) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.query)("delete from user_push_tokens where firebase_uid = $1 and fcm_token = $2", [params.firebaseUid, params.fcmToken]);
});
exports.deletePushToken = deletePushToken;
const deletePushTokenByValue = (fcmToken) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.query)("delete from user_push_tokens where fcm_token = $1", [fcmToken]);
});
exports.deletePushTokenByValue = deletePushTokenByValue;
const listPushTokensForAudience = (params) => __awaiter(void 0, void 0, void 0, function* () {
    const exclude = params.excludeUid ? String(params.excludeUid).trim() : "";
    if (params.audience === "order_subscribers") {
        const res = yield (0, db_1.query)(`select fcm_token, firebase_uid from user_push_tokens
       where app_role in ('admin', 'buero')
       and ($1::text = '' or firebase_uid <> $1)`, [exclude]);
        return res.rows;
    }
    const res = yield (0, db_1.query)(`select fcm_token, firebase_uid from user_push_tokens
     where ($1::text = '' or firebase_uid <> $1)`, [exclude]);
    return res.rows;
});
exports.listPushTokensForAudience = listPushTokensForAudience;
