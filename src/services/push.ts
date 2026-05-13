import * as admin from "firebase-admin";
import {
  deletePushTokenByValue,
  listPushTokensForAudience,
  PushAudience,
} from "../repositories/pushTokens";

const INVALID_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export type SendPushOptions = {
  audience: PushAudience;
  excludeUid?: string | null;
  title: string;
  body: string;
  data?: Record<string, string>;
};

export const sendPushNotification = async (
  opts: SendPushOptions,
): Promise<void> => {
  if (!admin.apps.length) return;
  let messaging: admin.messaging.Messaging;
  try {
    messaging = admin.messaging();
  } catch {
    return;
  }

  const rows = await listPushTokensForAudience({
    audience: opts.audience,
    excludeUid: opts.excludeUid,
  });
  if (!rows.length) return;

  const data =
    opts.data && Object.keys(opts.data).length
      ? Object.fromEntries(
          Object.entries(opts.data).map(([k, v]) => [k, String(v ?? "")]),
        )
      : undefined;

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const messages: admin.messaging.Message[] = slice.map((row) => ({
      token: row.fcm_token,
      notification: {
        title: opts.title,
        body: opts.body,
      },
      data,
    }));
    try {
      const result = await messaging.sendEach(messages);
      for (let j = 0; j < result.responses.length; j++) {
        const r = result.responses[j];
        if (r.success) continue;
        const code = String(r.error?.code || "");
        if (INVALID_TOKEN_CODES.has(code)) {
          const tok = slice[j]?.fcm_token;
          if (tok) {
            try {
              await deletePushTokenByValue(tok);
            } catch {
              /* ignore */
            }
          }
        }
      }
    } catch (e) {
      console.error("[push] sendEach failed", e);
    }
  }
};
