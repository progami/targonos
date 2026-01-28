/**
 * Minimal in-process token-bucket rate limiter.
 *
 * IMPORTANT:
 * - SP-API rate limits are applied per (application + selling partner) and other factors.
 * - This limiter is process-local; if you run multiple worker processes, you should replace
 *   this with a shared limiter (Redis, etc.) so all workers cooperate.
 */

export type TokenBucketConfig = {
  ratePerSecond: number; // tokens added per second
  burst: number; // bucket capacity
};

type BucketState = {
  cfg: TokenBucketConfig;
  tokens: number; // can be fractional
  lastRefillMs: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class TokenBucketRateLimiter {
  private buckets = new Map<string, BucketState>();
  private queues = new Map<string, Promise<void>>();

  /** Ensure a bucket exists; update config if provided values differ. */
  ensure(key: string, cfg: TokenBucketConfig): void {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing) {
      this.buckets.set(key, {
        cfg,
        tokens: cfg.burst,
        lastRefillMs: now,
      });
      return;
    }

    // If rate/burst changed, keep current tokens but clamp to new burst.
    const changed =
      existing.cfg.ratePerSecond !== cfg.ratePerSecond || existing.cfg.burst !== cfg.burst;
    if (changed) {
      existing.cfg = cfg;
      existing.tokens = Math.min(existing.tokens, cfg.burst);
      existing.lastRefillMs = Math.min(existing.lastRefillMs, now);
    }
  }

  updateRate(key: string, ratePerSecond: number): void {
    if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) return;
    const b = this.buckets.get(key);
    if (!b) return;
    if (b.cfg.ratePerSecond === ratePerSecond) return;
    b.cfg = { ...b.cfg, ratePerSecond };
  }

  private refill(b: BucketState, nowMs: number): void {
    const elapsedMs = Math.max(0, nowMs - b.lastRefillMs);
    if (elapsedMs === 0) return;
    const add = (elapsedMs / 1000) * b.cfg.ratePerSecond;
    b.tokens = Math.min(b.cfg.burst, b.tokens + add);
    b.lastRefillMs = nowMs;
  }

  private consumeOrWaitMs(b: BucketState, nowMs: number): number {
    this.refill(b, nowMs);

    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }

    // Need additional tokens.
    const needed = 1 - b.tokens;
    const waitSeconds = needed / b.cfg.ratePerSecond;
    const waitMs = Math.ceil(waitSeconds * 1000);

    // Model the passage of time by advancing lastRefillMs; after waiting, we consume the token.
    // We keep tokens at 0 because the generated token is immediately consumed.
    b.tokens = 0;
    b.lastRefillMs = nowMs + waitMs;

    return waitMs;
  }

  /**
   * Wait until a token is available for the given bucket key.
   *
   * Calls for the same key are queued to avoid races.
   */
  async acquire(key: string): Promise<void> {
    const prev = this.queues.get(key) ?? Promise.resolve();

    const run = prev
      .catch(() => {
        // keep chain healthy
      })
      .then(async () => {
        const b = this.buckets.get(key);
        if (!b) {
          // If caller forgot to ensure(), allow 1 rps burst 1 as safe default.
          this.ensure(key, { ratePerSecond: 1, burst: 1 });
        }
        const bucket = this.buckets.get(key)!;
        const waitMs = this.consumeOrWaitMs(bucket, Date.now());
        if (waitMs > 0) await sleep(waitMs);
      });

    this.queues.set(key, run);

    try {
      await run;
    } finally {
      // Cleanup if nothing else is chained after us.
      if (this.queues.get(key) === run) this.queues.delete(key);
    }
  }
}

// A process-global limiter instance. Safe for Next.js hot-reload and worker reuse.
const g = globalThis as unknown as { __hermesSpApiLimiter?: TokenBucketRateLimiter };
export const spApiLimiter: TokenBucketRateLimiter =
  g.__hermesSpApiLimiter ?? (g.__hermesSpApiLimiter = new TokenBucketRateLimiter());
