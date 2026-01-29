import { getPgPool } from "@/server/db/pool";
import type { Experiment } from "@/lib/types";

function rowToExperiment(r: any): Experiment {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    campaignId: r.campaign_id,
    allocations: r.allocations,
    primaryMetric: r.primary_metric,
    startedAt: r.started_at?.toISOString(),
    endedAt: r.ended_at?.toISOString(),
  };
}

export async function listExperiments(): Promise<Experiment[]> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM hermes_experiments ORDER BY created_at DESC`
  );
  return rows.map(rowToExperiment);
}

export async function listExperimentsByCampaign(campaignId: string): Promise<Experiment[]> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT * FROM hermes_experiments WHERE campaign_id = $1 ORDER BY created_at DESC`,
    [campaignId]
  );
  return rows.map(rowToExperiment);
}

export async function createExperiment(data: {
  id: string;
  name: string;
  campaignId: string;
  allocations: Array<{ variantId: string; pct: number }>;
  primaryMetric: string;
}): Promise<Experiment> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `INSERT INTO hermes_experiments (id, name, campaign_id, allocations, primary_metric)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [
      data.id,
      data.name,
      data.campaignId,
      JSON.stringify(data.allocations),
      data.primaryMetric,
    ]
  );
  return rowToExperiment(rows[0]);
}
