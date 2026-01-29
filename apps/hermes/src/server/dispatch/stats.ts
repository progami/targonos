import { getPgPool } from "@/server/db/pool";

export type DispatchStats = {
  liveCampaigns: number;
  queued: number;
  sent: number;
  failed: number;
};

export async function getDispatchStats(): Promise<DispatchStats> {
  const pool = getPgPool();

  const [campaignRes, dispatchRes] = await Promise.all([
    pool.query(`SELECT count(*) as c FROM hermes_campaigns WHERE status = 'live'`),
    pool.query(`
      SELECT
        count(*) FILTER (WHERE state = 'queued') AS queued,
        count(*) FILTER (WHERE state = 'sent') AS sent,
        count(*) FILTER (WHERE state = 'failed') AS failed
      FROM hermes_dispatches
    `),
  ]);

  return {
    liveCampaigns: Number(campaignRes.rows[0].c),
    queued: Number(dispatchRes.rows[0].queued),
    sent: Number(dispatchRes.rows[0].sent),
    failed: Number(dispatchRes.rows[0].failed),
  };
}

export type RecentDispatch = {
  id: string;
  orderId: string;
  marketplaceId: string;
  state: string;
  campaignId: string | null;
  lastError: string | null;
  createdAt: string;
};

export async function listRecentDispatches(limit = 10): Promise<RecentDispatch[]> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    `SELECT id, order_id, marketplace_id, state, campaign_id, last_error, created_at
     FROM hermes_dispatches
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    orderId: r.order_id,
    marketplaceId: r.marketplace_id,
    state: r.state,
    campaignId: r.campaign_id,
    lastError: r.last_error,
    createdAt: r.created_at.toISOString(),
  }));
}
