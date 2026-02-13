import { query } from "../db";

export const getSetting = async (key: string): Promise<string | null> => {
  const result = await query('select value from settings where key = $1', [key]);
  return result.rows[0]?.value ?? null;
};

export const setSetting = async (key: string, value: string): Promise<void> => {
  await query(
    'insert into settings(key, value) values ($1, $2) on conflict (key) do update set value = excluded.value',
    [key, value],
  );
};

export const listSettings = async (): Promise<Record<string, string>> => {
  const result = await query('select key, value from settings');
  return result.rows.reduce((acc: Record<string, string>, row: any) => {
    acc[row.key] = row.value;
    return acc;
  }, {});
};
