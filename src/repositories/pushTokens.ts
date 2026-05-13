import { query } from "../db";

export type PushAudience = "order_subscribers" | "dashboard_subscribers";

export type PushTokenRow = {
  fcm_token: string;
  firebase_uid: string;
};

export const upsertPushToken = async (params: {
  firebaseUid: string;
  fcmToken: string;
  appRole: string;
  userAgent?: string | null;
}): Promise<void> => {
  const ua = params.userAgent ? String(params.userAgent).slice(0, 512) : null;
  await query(
    `insert into user_push_tokens (firebase_uid, fcm_token, app_role, user_agent)
     values ($1, $2, $3, $4)
     on conflict (fcm_token) do update set
       firebase_uid = excluded.firebase_uid,
       app_role = excluded.app_role,
       user_agent = excluded.user_agent,
       updated_at = now()`,
    [params.firebaseUid, params.fcmToken, params.appRole, ua],
  );
};

export const deletePushToken = async (params: {
  firebaseUid: string;
  fcmToken: string;
}): Promise<void> => {
  await query(
    "delete from user_push_tokens where firebase_uid = $1 and fcm_token = $2",
    [params.firebaseUid, params.fcmToken],
  );
};

export const deletePushTokenByValue = async (
  fcmToken: string,
): Promise<void> => {
  await query("delete from user_push_tokens where fcm_token = $1", [fcmToken]);
};

export const listPushTokensForAudience = async (params: {
  audience: PushAudience;
  excludeUid?: string | null;
}): Promise<PushTokenRow[]> => {
  const exclude = params.excludeUid ? String(params.excludeUid).trim() : "";
  if (params.audience === "order_subscribers") {
    const res = await query(
      `select fcm_token, firebase_uid from user_push_tokens
       where app_role in ('admin', 'buero')
       and ($1::text = '' or firebase_uid <> $1)`,
      [exclude],
    );
    return res.rows as PushTokenRow[];
  }
  const res = await query(
    `select fcm_token, firebase_uid from user_push_tokens
     where ($1::text = '' or firebase_uid <> $1)`,
    [exclude],
  );
  return res.rows as PushTokenRow[];
};
