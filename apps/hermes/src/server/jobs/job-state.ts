// Lightweight KV for Hermes background jobs.
// This is intentionally tiny so you can swap it with your own config/state store later.

import { getPgPool } from "../db/pool";

export async function getJobState(params: {
  connectionId: string;
  key: string;
}): Promise<string | null> {
  const pool = getPgPool();
  const res = await pool.query<{ value: string }>(
    `SELECT value FROM hermes_job_state WHERE connection_id = $1 AND key = $2 LIMIT 1;`,
    [params.connectionId, params.key]
  );
  return res.rows[0]?.value ?? null;
}

export async function setJobState(params: {
  connectionId: string;
  key: string;
  value: string;
}): Promise<void> {
  const pool = getPgPool();
  await pool.query(
    `
    INSERT INTO hermes_job_state (connection_id, key, value, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (connection_id, key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = NOW();
    `,
    [params.connectionId, params.key, params.value]
  );
}

export async function deleteJobState(params: {
  connectionId: string;
  key: string;
}): Promise<void> {
  const pool = getPgPool();
  await pool.query(`DELETE FROM hermes_job_state WHERE connection_id = $1 AND key = $2;`, [
    params.connectionId,
    params.key,
  ]);
}

export async function getJobStateJson<T>(params: {
  connectionId: string;
  key: string;
}): Promise<T | null> {
  const raw = await getJobState(params);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJobStateJson(params: {
  connectionId: string;
  key: string;
  value: unknown;
}): Promise<void> {
  await setJobState({
    connectionId: params.connectionId,
    key: params.key,
    value: JSON.stringify(params.value),
  });
}
