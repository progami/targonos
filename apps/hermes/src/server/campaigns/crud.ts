import { getPgPool } from "@/server/db/pool";
import type { Campaign } from "@/lib/types";

function rowToCampaign(r: any): Campaign {
  return {
    id: r.id,
    name: r.name,
    channel: r.channel,
    status: r.status,
    connectionId: r.connection_id,
    schedule: r.schedule,
    controlHoldoutPct: r.control_holdout_pct,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

export async function listCampaigns(): Promise<Campaign[]> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM hermes_campaigns ORDER BY created_at DESC`
  );
  return rows.map(rowToCampaign);
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM hermes_campaigns WHERE id = $1`,
    [id]
  );
  if (rows.length === 0) return null;
  return rowToCampaign(rows[0]);
}

export async function createCampaign(data: {
  id: string;
  name: string;
  channel: string;
  status: string;
  connectionId: string;
  schedule: Record<string, unknown>;
  controlHoldoutPct: number;
}): Promise<Campaign> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `INSERT INTO hermes_campaigns (id, name, channel, status, connection_id, schedule, control_holdout_pct)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      data.id,
      data.name,
      data.channel,
      data.status,
      data.connectionId,
      JSON.stringify(data.schedule),
      data.controlHoldoutPct,
    ]
  );
  return rowToCampaign(rows[0]);
}

export async function updateCampaign(
  id: string,
  data: {
    name?: string;
    status?: string;
    schedule?: Record<string, unknown>;
    controlHoldoutPct?: number;
  }
): Promise<Campaign | null> {
  const pool = getPgPool();
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;

  if (data.name !== undefined) {
    sets.push(`name = $${idx++}`);
    vals.push(data.name);
  }
  if (data.status !== undefined) {
    sets.push(`status = $${idx++}`);
    vals.push(data.status);
  }
  if (data.schedule !== undefined) {
    sets.push(`schedule = $${idx++}`);
    vals.push(JSON.stringify(data.schedule));
  }
  if (data.controlHoldoutPct !== undefined) {
    sets.push(`control_holdout_pct = $${idx++}`);
    vals.push(data.controlHoldoutPct);
  }

  if (sets.length === 0) return getCampaign(id);

  sets.push(`updated_at = NOW()`);
  vals.push(id);

  const { rows } = await pool.query(
    `UPDATE hermes_campaigns SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
    vals
  );
  if (rows.length === 0) return null;
  return rowToCampaign(rows[0]);
}
