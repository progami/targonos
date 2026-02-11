import { NextResponse } from 'next/server';
import type { Session } from 'next-auth';
import { hasCapability } from '@targon/auth';
import { auth } from '@/lib/auth';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  RATE_LIMIT_PRESETS,
  type RateLimitConfig,
} from './rate-limit';

export type XPlanAuthedHandler = (request: Request, session: Session) => Promise<Response>;

export type WithXPlanAuthOptions = {
  rateLimit?: RateLimitConfig;
};

export function withXPlanAuth(
  handler: XPlanAuthedHandler,
  options?: WithXPlanAuthOptions,
) {
  return async (request: Request) => {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const canEnter = hasCapability({ session, appId: 'xplan', capability: 'enter' });
    if (!canEnter) {
      return NextResponse.json({ error: 'No access to xplan' }, { status: 403 });
    }

    if (options?.rateLimit) {
      const userId = (session as any).user?.id ?? (session as any).sub;
      const identifier = getRateLimitIdentifier(request, userId);
      const result = checkRateLimit(identifier, options.rateLimit);

      if (!result.allowed) {
        return NextResponse.json(
          { error: 'Too many requests' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil(result.retryAfterMs / 1000)),
              'X-RateLimit-Limit': String(options.rateLimit.maxRequests),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
            },
          },
        );
      }
    }

    return handler(request, session);
  };
}

export { RATE_LIMIT_PRESETS };
