/**
 * Hermes worker: Buyer-Seller Messaging dispatcher
 *
 * Run:
 *   pnpm worker:buyer-message
 *
 * What it does:
 * - scans for due dispatches (state=queued, type=buyer_message, scheduled_at <= now)
 * - claims each job (queued -> sending) so ONLY ONE worker can send
 * - preflights Amazon eligibility via getMessagingActionsForOrder
 * - sends via Messaging API /messages/{kind}
 * - records every attempt in hermes_dispatch_attempts
 * - never creates duplicates (UNIQUE + claim step)
 */

import { maybeAutoMigrate } from "../db/migrate";
import {
  fetchDueBuyerMessages,
  processBuyerMessageDispatch,
  requeueStuckBuyerMessages,
} from "../messaging/dispatcher";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function getInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function main() {
  await maybeAutoMigrate();

  const loopMs = getInt("HERMES_WORKER_LOOP_MS", 1500);
  const batchSize = getInt("HERMES_WORKER_BATCH_SIZE", 10);
  const maxHardFailures = getInt("HERMES_MAX_HARD_FAILURES", getInt("HERMES_MAX_ATTEMPTS", 5));
  const stuckMinutes = getInt("HERMES_STUCK_SENDING_MINUTES", 15);

  console.log(`[${nowIso()}] Hermes worker started (buyer_message)`);
  console.log(JSON.stringify({ loopMs, batchSize, maxHardFailures, stuckMinutes }, null, 2));

  let stop = false;
  process.on("SIGINT", () => {
    stop = true;
    console.log(`[${nowIso()}] SIGINT received; shutting down...`);
  });
  process.on("SIGTERM", () => {
    stop = true;
    console.log(`[${nowIso()}] SIGTERM received; shutting down...`);
  });

  // eslint-disable-next-line no-constant-condition
  while (!stop) {
    try {
      const requeued = await requeueStuckBuyerMessages(stuckMinutes);
      if (requeued > 0) {
        console.log(`[${nowIso()}] Re-queued ${requeued} stuck dispatch(es)`);
      }

      const due = await fetchDueBuyerMessages(batchSize);
      if (due.length === 0) {
        await sleep(loopMs);
        continue;
      }

      for (const row of due) {
        try {
          await processBuyerMessageDispatch(row as any, { maxHardFailures });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[${nowIso()}] Dispatch ${row.id} error: ${message}`);
          // Best-effort: dispatcher already records attempts; if this throws before doing so,
          // it'll be retried next loop.
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${nowIso()}] Loop error: ${message}`);
      await sleep(loopMs);
    }
  }

  console.log(`[${nowIso()}] Hermes worker stopped`);
}

main().catch((e) => {
  console.error(`[${nowIso()}] Fatal:`, e);
  process.exit(1);
});
