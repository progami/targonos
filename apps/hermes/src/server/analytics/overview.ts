import { getPgPool } from "../db/pool";

export type AnalyticsOverview = {
  rangeDays: number;
  fromIso: string;
  toIso: string;
  queue: {
    nextDays: number;
    fromIso: string;
    toIso: string;
    queuedTotal: number;
    series: Array<{
      day: string; // YYYY-MM-DD (UTC)
      queued: number;
    }>;
  };
  summary: {
    sentInRange: number;
    attemptedDispatchesInRange: number;
    ineligibleDispatchesInRange: number;
    attemptsInRange: {
      sent: number;
      ineligible: number;
      throttled: number;
      failed: number;
    };
    dispatchStateNow: {
      queued: number;
      sending: number;
      sent: number;
      skipped: number;
      failed: number;
    };
    orders: {
      total: number;
      shipped: number;
      pending: number;
      canceled: number;
      oldestPurchaseIso: string | null;
      newestPurchaseIso: string | null;
      importedInRange: number;
      withAnyDispatch: number;
    };
  };
  series: Array<{
    day: string; // YYYY-MM-DD (UTC)
    sent: number;
    ineligible: number;
    ineligibleUnique: number;
    throttled: number;
    failed: number;
    attemptedUnique: number;
  }>;
};

function dayKeyUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addUtcDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + days);
  return x;
}

function intOr0(v: any): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? "0"), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function getAnalyticsOverview(params: {
  connectionId?: string;
  rangeDays: number;
}): Promise<AnalyticsOverview> {
  const pool = getPgPool();

  const to = new Date();

  let rangeDays: number;
  let from: Date;

  if (params.rangeDays <= 0) {
    // "All" mode: start from the earliest sent dispatch
    const earliestRow = params.connectionId
      ? await pool.query(
          `SELECT MIN(sent_at) AS earliest FROM hermes_dispatches WHERE connection_id = $1 AND type = 'request_review' AND sent_at IS NOT NULL;`,
          [params.connectionId]
        )
      : await pool.query(
          `SELECT MIN(sent_at) AS earliest FROM hermes_dispatches WHERE type = 'request_review' AND sent_at IS NOT NULL;`
        );

    const earliest = (earliestRow.rows[0] as any)?.earliest;
    if (earliest) {
      from = startOfUtcDay(new Date(earliest));
      rangeDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    } else {
      // No dispatches sent yet — fall back to 30 days
      rangeDays = 30;
      from = startOfUtcDay(addUtcDays(to, -(rangeDays - 1)));
    }
  } else {
    rangeDays = Math.max(1, Math.min(params.rangeDays, 3650));
    // Inclusive day range (e.g. 30d => today + previous 29 days)
    from = startOfUtcDay(addUtcDays(to, -(rangeDays - 1)));
  }

  const connectionId = params.connectionId;

  // ---- Dispatch state snapshot ("now")
  const dispatchStateRows = connectionId
    ? await pool.query(
        `SELECT state, COUNT(1)::int AS n FROM hermes_dispatches WHERE connection_id = $1 AND type = 'request_review' GROUP BY state;`,
        [connectionId]
      )
    : await pool.query(
        `SELECT state, COUNT(1)::int AS n FROM hermes_dispatches WHERE type = 'request_review' GROUP BY state;`
      );

  const stateNow = {
    queued: 0,
    sending: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
  };
  for (const r of dispatchStateRows.rows as any[]) {
    const s = String(r.state);
    const n = intOr0(r.n);
    if (s in stateNow) (stateNow as any)[s] = n;
  }

  // ---- Sent in range (dispatches)
  const sentInRangeRow = connectionId
    ? await pool.query(
        `SELECT COUNT(1)::int AS n FROM hermes_dispatches WHERE connection_id = $1 AND type = 'request_review' AND sent_at >= $2 AND sent_at <= $3;`,
        [connectionId, from, to]
      )
    : await pool.query(
        `SELECT COUNT(1)::int AS n FROM hermes_dispatches WHERE type = 'request_review' AND sent_at >= $1 AND sent_at <= $2;`,
        [from, to]
      );

  const sentInRange = intOr0((sentInRangeRow.rows[0] as any)?.n);

  // ---- Distinct dispatches attempted / ineligible in range
  const attemptedDispatchesInRangeRow = connectionId
    ? await pool.query(
        `
        SELECT COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.connection_id = $1
           AND d.type = 'request_review'
           AND a.created_at >= $2 AND a.created_at <= $3;
        `,
        [connectionId, from, to]
      )
    : await pool.query(
        `
        SELECT COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.type = 'request_review'
           AND a.created_at >= $1 AND a.created_at <= $2;
        `,
        [from, to]
      );

  const ineligibleDispatchesInRangeRow = connectionId
    ? await pool.query(
        `
        SELECT COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.connection_id = $1
           AND d.type = 'request_review'
           AND a.status = 'ineligible'
           AND a.created_at >= $2 AND a.created_at <= $3;
        `,
        [connectionId, from, to]
      )
    : await pool.query(
        `
        SELECT COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.type = 'request_review'
           AND a.status = 'ineligible'
           AND a.created_at >= $1 AND a.created_at <= $2;
        `,
        [from, to]
      );

  const attemptedDispatchesInRange = intOr0((attemptedDispatchesInRangeRow.rows[0] as any)?.n);
  const ineligibleDispatchesInRange = intOr0((ineligibleDispatchesInRangeRow.rows[0] as any)?.n);

  // ---- Attempts in range (joined to dispatches for connection scoping)
  const attemptsByStatusRows = connectionId
    ? await pool.query(
        `
        SELECT a.status, COUNT(1)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.connection_id = $1
           AND d.type = 'request_review'
           AND a.created_at >= $2 AND a.created_at <= $3
         GROUP BY a.status;
        `,
        [connectionId, from, to]
      )
    : await pool.query(
        `
        SELECT a.status, COUNT(1)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE a.created_at >= $1 AND a.created_at <= $2
           AND d.type = 'request_review'
         GROUP BY a.status;
        `,
        [from, to]
      );

  const attemptsInRange = {
    sent: 0,
    ineligible: 0,
    throttled: 0,
    failed: 0,
  };
  for (const r of attemptsByStatusRows.rows as any[]) {
    const s = String(r.status);
    if (s in attemptsInRange) (attemptsInRange as any)[s] = intOr0(r.n);
  }

  // ---- Orders (synced)
  const ordersTotalRow = connectionId
    ? await pool.query(`SELECT COUNT(1)::int AS n FROM hermes_orders WHERE connection_id = $1;`, [connectionId])
    : await pool.query(`SELECT COUNT(1)::int AS n FROM hermes_orders;`);

  const ordersImportedRow = connectionId
    ? await pool.query(
        `SELECT COUNT(1)::int AS n FROM hermes_orders WHERE connection_id = $1 AND imported_at >= $2 AND imported_at <= $3;`,
        [connectionId, from, to]
      )
    : await pool.query(
        `SELECT COUNT(1)::int AS n FROM hermes_orders WHERE imported_at >= $1 AND imported_at <= $2;`,
        [from, to]
      );

  const ordersWithDispatchRow = connectionId
    ? await pool.query(
        `
        SELECT COUNT(1)::int AS n
          FROM hermes_orders o
         WHERE o.connection_id = $1
           AND EXISTS (
             SELECT 1
               FROM hermes_dispatches d
              WHERE d.connection_id = o.connection_id
                AND d.order_id = o.order_id
                AND d.type = 'request_review'
           );
        `,
        [connectionId]
      )
    : await pool.query(
        `
        SELECT COUNT(1)::int AS n
          FROM hermes_orders o
         WHERE EXISTS (
             SELECT 1
               FROM hermes_dispatches d
              WHERE d.connection_id = o.connection_id
                AND d.order_id = o.order_id
                AND d.type = 'request_review'
           );
        `
      );

  const ordersStatusRows = connectionId
    ? await pool.query(
        `
        SELECT COALESCE(order_status, '(null)') AS status, COUNT(1)::int AS n
          FROM hermes_orders
         WHERE connection_id = $1
         GROUP BY 1;
        `,
        [connectionId]
      )
    : await pool.query(
        `
        SELECT COALESCE(order_status, '(null)') AS status, COUNT(1)::int AS n
          FROM hermes_orders
         GROUP BY 1;
        `
      );

  const ordersPurchaseRangeRow = connectionId
    ? await pool.query(
        `
        SELECT
          MIN(purchase_date)::text AS oldest,
          MAX(purchase_date)::text AS newest
        FROM hermes_orders
        WHERE connection_id = $1;
        `,
        [connectionId]
      )
    : await pool.query(
        `
        SELECT
          MIN(purchase_date)::text AS oldest,
          MAX(purchase_date)::text AS newest
        FROM hermes_orders;
        `
      );

  let shipped = 0;
  let pending = 0;
  let canceled = 0;
  for (const r of ordersStatusRows.rows as any[]) {
    const status = String(r.status);
    const n = intOr0(r.n);
    if (status === "Shipped" || status === "PartiallyShipped") shipped += n;
    else if (status === "Pending") pending += n;
    else if (status === "Canceled") canceled += n;
  }

  const oldestPurchaseIso =
    typeof (ordersPurchaseRangeRow.rows[0] as any)?.oldest === "string"
      ? ((ordersPurchaseRangeRow.rows[0] as any).oldest as string)
      : null;

  const newestPurchaseIso =
    typeof (ordersPurchaseRangeRow.rows[0] as any)?.newest === "string"
      ? ((ordersPurchaseRangeRow.rows[0] as any).newest as string)
      : null;

  const orders = {
    total: intOr0((ordersTotalRow.rows[0] as any)?.n),
    shipped,
    pending,
    canceled,
    oldestPurchaseIso,
    newestPurchaseIso,
    importedInRange: intOr0((ordersImportedRow.rows[0] as any)?.n),
    withAnyDispatch: intOr0((ordersWithDispatchRow.rows[0] as any)?.n),
  };

  // ---- Series: initialize days to 0
  const series: AnalyticsOverview["series"] = [];
  for (let i = 0; i < rangeDays; i += 1) {
    const day = dayKeyUtc(addUtcDays(from, i));
    series.push({ day, sent: 0, ineligible: 0, ineligibleUnique: 0, throttled: 0, failed: 0, attemptedUnique: 0 });
  }
  const byDay = new Map(series.map((d) => [d.day, d]));

  // Sent series from dispatches
  const sentSeriesRows = connectionId
    ? await pool.query(
        `
        SELECT date_trunc('day', sent_at) AS day, COUNT(1)::int AS n
          FROM hermes_dispatches
         WHERE connection_id = $1
           AND type = 'request_review'
           AND sent_at >= $2 AND sent_at <= $3
         GROUP BY 1
         ORDER BY 1;
        `,
        [connectionId, from, to]
      )
    : await pool.query(
        `
        SELECT date_trunc('day', sent_at) AS day, COUNT(1)::int AS n
          FROM hermes_dispatches
         WHERE type = 'request_review'
           AND sent_at >= $1 AND sent_at <= $2
         GROUP BY 1
         ORDER BY 1;
        `,
        [from, to]
      );

  for (const r of sentSeriesRows.rows as any[]) {
    const day = dayKeyUtc(new Date(r.day));
    const bucket = byDay.get(day);
    if (bucket) bucket.sent = intOr0(r.n);
  }

  // Attempt series from attempts
  const attemptSeriesRows = connectionId
    ? await pool.query(
        `
        SELECT date_trunc('day', a.created_at) AS day, a.status, COUNT(1)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.connection_id = $1
           AND d.type = 'request_review'
           AND a.created_at >= $2 AND a.created_at <= $3
         GROUP BY 1, 2
         ORDER BY 1;
        `,
        [connectionId, from, to]
      )
    : await pool.query(
        `
        SELECT date_trunc('day', a.created_at) AS day, a.status, COUNT(1)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE a.created_at >= $1 AND a.created_at <= $2
           AND d.type = 'request_review'
         GROUP BY 1, 2
         ORDER BY 1;
        `,
        [from, to]
      );

  for (const r of attemptSeriesRows.rows as any[]) {
    const day = dayKeyUtc(new Date(r.day));
    const status = String(r.status);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    if (status === "ineligible") bucket.ineligible += intOr0(r.n);
    if (status === "throttled") bucket.throttled += intOr0(r.n);
    if (status === "failed") bucket.failed += intOr0(r.n);
  }

  const ineligibleUniqueSeriesRows = connectionId
    ? await pool.query(
        `
        SELECT date_trunc('day', a.created_at) AS day, COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.connection_id = $1
           AND d.type = 'request_review'
           AND a.status = 'ineligible'
           AND a.created_at >= $2 AND a.created_at <= $3
         GROUP BY 1
         ORDER BY 1;
        `,
        [connectionId, from, to]
      )
    : await pool.query(
        `
        SELECT date_trunc('day', a.created_at) AS day, COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.type = 'request_review'
           AND a.status = 'ineligible'
           AND a.created_at >= $1 AND a.created_at <= $2
         GROUP BY 1
         ORDER BY 1;
        `,
        [from, to]
      );

  for (const r of ineligibleUniqueSeriesRows.rows as any[]) {
    const day = dayKeyUtc(new Date(r.day));
    const bucket = byDay.get(day);
    if (bucket) bucket.ineligibleUnique = intOr0(r.n);
  }

  const attemptedUniqueSeriesRows = connectionId
    ? await pool.query(
        `
        SELECT date_trunc('day', a.created_at) AS day, COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.connection_id = $1
           AND d.type = 'request_review'
           AND a.created_at >= $2 AND a.created_at <= $3
         GROUP BY 1
         ORDER BY 1;
        `,
        [connectionId, from, to]
      )
    : await pool.query(
        `
        SELECT date_trunc('day', a.created_at) AS day, COUNT(DISTINCT a.dispatch_id)::int AS n
          FROM hermes_dispatch_attempts a
          JOIN hermes_dispatches d ON d.id = a.dispatch_id
         WHERE d.type = 'request_review'
           AND a.created_at >= $1 AND a.created_at <= $2
         GROUP BY 1
         ORDER BY 1;
        `,
        [from, to]
      );

  for (const r of attemptedUniqueSeriesRows.rows as any[]) {
    const day = dayKeyUtc(new Date(r.day));
    const bucket = byDay.get(day);
    if (bucket) bucket.attemptedUnique = intOr0(r.n);
  }

  // ---- Queue: upcoming scheduled sends (next N days, starting today UTC)
  const queueDays = 7;
  const queueFrom = startOfUtcDay(to);
  const queueTo = startOfUtcDay(addUtcDays(queueFrom, queueDays));

  const queueSeries: AnalyticsOverview["queue"]["series"] = [];
  for (let i = 0; i < queueDays; i += 1) {
    const day = dayKeyUtc(addUtcDays(queueFrom, i));
    queueSeries.push({ day, queued: 0 });
  }
  const queueByDay = new Map(queueSeries.map((d) => [d.day, d]));

  const queuedSeriesRows = connectionId
    ? await pool.query(
        `
        SELECT date_trunc('day', scheduled_at) AS day, COUNT(1)::int AS n
          FROM hermes_dispatches
         WHERE connection_id = $1
           AND type = 'request_review'
           AND state = 'queued'
           AND scheduled_at >= $2 AND scheduled_at < $3
         GROUP BY 1
         ORDER BY 1;
        `,
        [connectionId, queueFrom, queueTo]
      )
    : await pool.query(
        `
        SELECT date_trunc('day', scheduled_at) AS day, COUNT(1)::int AS n
          FROM hermes_dispatches
         WHERE type = 'request_review'
           AND state = 'queued'
           AND scheduled_at >= $1 AND scheduled_at < $2
         GROUP BY 1
         ORDER BY 1;
        `,
        [queueFrom, queueTo]
      );

  for (const r of queuedSeriesRows.rows as any[]) {
    const day = dayKeyUtc(new Date(r.day));
    const bucket = queueByDay.get(day);
    if (bucket) bucket.queued = intOr0(r.n);
  }

  const queuedTotal = queueSeries.reduce((acc, d) => acc + d.queued, 0);

  return {
    rangeDays,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
    queue: {
      nextDays: queueDays,
      fromIso: queueFrom.toISOString(),
      toIso: queueTo.toISOString(),
      queuedTotal,
      series: queueSeries,
    },
    summary: {
      sentInRange,
      attemptedDispatchesInRange,
      ineligibleDispatchesInRange,
      attemptsInRange,
      dispatchStateNow: stateNow,
      orders,
    },
    series,
  };
}
