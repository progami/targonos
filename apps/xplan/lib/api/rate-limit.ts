import 'server-only';

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function cleanupExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

export type RateLimitConfig = {
  windowMs: number;
  maxRequests: number;
};

export const RATE_LIMIT_PRESETS = {
  standard: { windowMs: 60_000, maxRequests: 60 },
  expensive: { windowMs: 60_000, maxRequests: 10 },
  bulk: { windowMs: 60_000, maxRequests: 5 },
} as const;

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; remaining: 0; resetAt: number; retryAfterMs: number };

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig,
): RateLimitResult {
  cleanupExpiredEntries();

  const now = Date.now();
  const key = `${identifier}:${config.windowMs}:${config.maxRequests}`;
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: config.maxRequests - 1, resetAt };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      retryAfterMs: entry.resetAt - now,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

export function getRateLimitIdentifier(
  request: Request,
  userId?: string | null,
): string {
  if (userId) {
    return `user:${userId}`;
  }

  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() ?? 'unknown';
  return `ip:${ip}`;
}
