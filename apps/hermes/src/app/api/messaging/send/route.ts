import { NextResponse } from "next/server";
import { z } from "zod";

import { maybeAutoMigrate } from "@/server/db/migrate";
import { getPgPool } from "@/server/db/pool";
import { queueBuyerMessage } from "@/server/dispatch/ledger";
import { processBuyerMessageDispatch } from "@/server/messaging/dispatcher";
import { MESSAGING_KINDS } from "@/server/sp-api/messaging";
import { withApiLogging } from "@/server/api-logging";
import { isHermesDryRun } from "@/server/env/flags";

export const runtime = "nodejs";

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function computeDefaultExpiresAt(params: {
  connectionId: string;
  orderId: string;
}): Promise<Date | null> {
  const pool = getPgPool();
  const res = await pool.query<{
    purchase_date: string | null;
    latest_delivery_date: string | null;
  }>(
    `
    SELECT purchase_date::text AS purchase_date,
           latest_delivery_date::text AS latest_delivery_date
      FROM hermes_orders
     WHERE connection_id = $1 AND order_id = $2
     LIMIT 1;
    `,
    [params.connectionId, params.orderId]
  );

  const row = res.rows[0];
  if (!row) return null;

  const delivery = row.latest_delivery_date ? new Date(row.latest_delivery_date) : null;
  if (delivery && Number.isFinite(delivery.getTime())) return addDays(delivery, 30);

  const purchase = row.purchase_date ? new Date(row.purchase_date) : null;
  if (purchase && Number.isFinite(purchase.getTime())) return addDays(purchase, 60);

  return null;
}

function lintBuyerMessageText(text: string): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const t = text.trim();

  if (!t) {
    reasons.push("Message text is empty");
    return { ok: false, reasons };
  }

  // Very conservative guardrails to avoid policy violations.
  const lower = t.toLowerCase();

  const bannedPhrases = [
    "review",
    "feedback",
    "rating",
    "5 star",
    "five star",
    "gift card",
    "coupon",
    "discount",
    "promo",
    "promotion",
    "incentiv",
  ];
  for (const p of bannedPhrases) {
    if (lower.includes(p)) {
      reasons.push(`Contains restricted phrase: "${p}"`);
      break;
    }
  }

  // Links / contact info
  if (lower.includes("http://") || lower.includes("https://") || lower.includes("www.")) {
    reasons.push("Links are not allowed in buyer messages");
  }
  if (t.includes("@")) {
    reasons.push("Email addresses are not allowed in buyer messages");
  }
  // Rough phone heuristic (blocks common patterns)
  if (/\+?\d[\d\s().-]{7,}\d/.test(t)) {
    reasons.push("Phone numbers are not allowed in buyer messages");
  }

  // HTML-ish content
  if (/[<>]/.test(t)) {
    reasons.push("HTML / markup is not allowed in buyer messages");
  }

  return { ok: reasons.length === 0, reasons };
}

function collectStringValues(input: unknown, opts?: { maxValues?: number; maxDepth?: number }): string[] {
  const maxValuesRaw = opts?.maxValues;
  const maxDepthRaw = opts?.maxDepth;
  const maxValues =
    typeof maxValuesRaw === "number" && Number.isFinite(maxValuesRaw)
      ? Math.max(1, Math.min(maxValuesRaw, 200))
      : 25;
  const maxDepth =
    typeof maxDepthRaw === "number" && Number.isFinite(maxDepthRaw)
      ? Math.max(0, Math.min(maxDepthRaw, 8))
      : 4;

  const out: string[] = [];
  const seen = new Set<unknown>();

  const walk = (value: unknown, depth: number) => {
    if (out.length >= maxValues) return;
    if (depth > maxDepth) return;

    if (typeof value === "string") {
      const t = value.trim();
      if (t) out.push(t);
      return;
    }

    if (!value || typeof value !== "object") return;
    if (seen.has(value)) return;
    seen.add(value);

    if (Array.isArray(value)) {
      for (const v of value) walk(v, depth + 1);
      return;
    }

    for (const v of Object.values(value as Record<string, unknown>)) {
      walk(v, depth + 1);
    }
  };

  walk(input, 0);
  return out;
}

async function loadDispatchById(id: string) {
  const pool = getPgPool();
  const res = await pool.query(
    `
    SELECT id, connection_id, order_id, marketplace_id, type, message_kind, state,
           scheduled_at::text, expires_at::text, sent_at::text, last_error, metadata
      FROM hermes_dispatches
     WHERE id = $1
     LIMIT 1;
    `,
    [id]
  );
  return res.rows[0] ?? null;
}

/**
 * POST /api/messaging/send
 *
 * Body:
 * {
 *   "connectionId": "conn_01",
 *   "orderId": "112-...",
 *   "marketplaceId": "ATVPDKIKX0DER",
 *   "kind": "confirmDeliveryDetails",
 *   "text": "...",
 *   "sendNow": true
 * }
 *
 * Safety:
 * - queues idempotently: one per (order, kind)
 * - optional immediate send runs through the same claim+attempt recording as the worker
 */
async function handlePost(req: Request) {
  if (isHermesDryRun()) {
    return NextResponse.json(
      { ok: false, error: "Hermes is in dry-run mode. Messaging is disabled." },
      { status: 403 }
    );
  }

  await maybeAutoMigrate();

  const schema = z.object({
    connectionId: z.string().min(1),
    orderId: z.string().min(1),
    marketplaceId: z.string().min(1),
    kind: z.enum(MESSAGING_KINDS as unknown as [string, ...string[]]),
    text: z.string().max(2000).optional(),
    body: z.any().optional(),
    sendNow: z.boolean().optional().default(true),
    scheduledAt: z.string().datetime().optional(),
  });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Invalid request", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { connectionId, orderId, marketplaceId, kind, text, sendNow, scheduledAt } = parsed.data;

  const messageBody = parsed.data.body ?? (typeof text === "string" ? { text } : undefined);

  // Strict linter: blocks obvious policy violations. Apply to both text and raw body payloads.
  const stringsToLint = [
    ...(typeof text === "string" ? [text] : []),
    ...(messageBody !== undefined ? collectStringValues(messageBody, { maxValues: 25, maxDepth: 4 }) : []),
  ];

  const reasons = new Set<string>();
  for (const s of stringsToLint) {
    if (s.length > 5000) continue;
    const lint = lintBuyerMessageText(s);
    if (!lint.ok) {
      for (const r of lint.reasons) reasons.add(r);
    }
  }
  if (reasons.size > 0) {
    return NextResponse.json(
      { ok: false, error: "Message blocked by safety checks", reasons: Array.from(reasons) },
      { status: 400 }
    );
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : new Date();

  try {
    const expiresAt = await computeDefaultExpiresAt({ connectionId, orderId });

    const meta = {
      source: "api.messaging.send",
      message: {
        kind,
        text: typeof text === "string" ? text : undefined,
        body: messageBody,
      },
    };

    const queued = await queueBuyerMessage({
      connectionId,
      orderId,
      marketplaceId,
      messageKind: kind,
      scheduledAt: scheduledDate,
      expiresAt,
      metadata: meta,
    });

    // Optionally send immediately (useful in dev without a worker running)
    if (sendNow && queued.kind === "queued") {
      await processBuyerMessageDispatch(queued.dispatch as any, {
        maxHardFailures: Number(process.env.HERMES_MAX_HARD_FAILURES ?? 5),
      });
    }

    const latest = await loadDispatchById(queued.dispatch.id);

    return NextResponse.json({ ok: true, queued, dispatch: latest });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message ?? "Failed to send buyer message",
        hint: "Set DATABASE_URL and configure SP-API (LWA + AWS credentials).",
      },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging("POST /api/messaging/send", handlePost);
