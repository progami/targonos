import { NextResponse } from 'next/server';
import { safeEqual, syncSellerboardUkActualSales } from '@/lib/integrations/sellerboard';
import { checkRateLimit, getRateLimitIdentifier, RATE_LIMIT_PRESETS } from '@/lib/api/rate-limit';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

const SYNC_RATE_LIMIT = RATE_LIMIT_PRESETS.expensive;

function extractBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ? match[1].trim() : null;
}

function requireSyncAuth(request: Request): NextResponse | null {
  const expected = process.env.SELLERBOARD_SYNC_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json({ error: 'Missing SELLERBOARD_SYNC_TOKEN' }, { status: 500 });
  }

  const provided = extractBearerToken(request.headers.get('authorization'));
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export const POST = async (request: Request) => {
  const authError = requireSyncAuth(request);
  if (authError) return authError;

  const identifier = getRateLimitIdentifier(request, 'sellerboard-sync-uk');
  const rateLimitResult = checkRateLimit(identifier, SYNC_RATE_LIMIT);
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(rateLimitResult.retryAfterMs / 1000)),
        },
      },
    );
  }

  const reportUrl = process.env.SELLERBOARD_UK_ORDERS_REPORT_URL?.trim();
  if (!reportUrl) {
    return NextResponse.json(
      { error: 'Missing SELLERBOARD_UK_ORDERS_REPORT_URL' },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const rawStrategyId = url.searchParams.get('strategyId');
  const strategyId = rawStrategyId ? rawStrategyId.trim() : '';
  if (!strategyId) {
    return NextResponse.json({ error: 'Missing strategyId' }, { status: 400 });
  }

  const strategy = await prisma.strategy.findUnique({
    where: { id: strategyId },
    select: { region: true },
  });
  if (!strategy) {
    return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
  }
  if (strategy.region !== 'UK') {
    return NextResponse.json({ error: 'Strategy region mismatch' }, { status: 400 });
  }

  try {
    const result = await syncSellerboardUkActualSales({ reportUrl, strategyId });
    return NextResponse.json({
      ok: true,
      ...result,
      oldestPurchaseDateUtc: result.oldestPurchaseDateUtc?.toISOString() ?? null,
      newestPurchaseDateUtc: result.newestPurchaseDateUtc?.toISOString() ?? null,
    });
  } catch (error) {
    console.error('[POST /sellerboard/uk-actual-sales] sync error:', error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 502 });
  }
};
