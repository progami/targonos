import { NextResponse } from 'next/server';
import {
  safeEqual,
  syncSellerboardUkActualSales,
  syncSellerboardUkDashboard,
} from '@/lib/integrations/sellerboard';
import {
  checkRateLimit,
  getRateLimitIdentifier,
  RATE_LIMIT_PRESETS,
} from '@/lib/api/rate-limit';

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

  const ordersReportUrl = process.env.SELLERBOARD_UK_ORDERS_REPORT_URL?.trim();
  if (!ordersReportUrl) {
    return NextResponse.json(
      { error: 'Missing SELLERBOARD_UK_ORDERS_REPORT_URL' },
      { status: 500 },
    );
  }

  const dashboardReportUrl = process.env.SELLERBOARD_UK_DASHBOARD_REPORT_URL?.trim();
  if (!dashboardReportUrl) {
    return NextResponse.json(
      { error: 'Missing SELLERBOARD_UK_DASHBOARD_REPORT_URL' },
      { status: 500 },
    );
  }

  const startedAt = Date.now();

  try {
    const actualSalesStartedAt = Date.now();
    const actualSalesResult = await syncSellerboardUkActualSales({
      reportUrl: ordersReportUrl,
    });
    const actualSales = {
      ok: true,
      durationMs: Date.now() - actualSalesStartedAt,
      ...actualSalesResult,
      oldestPurchaseDateUtc: actualSalesResult.oldestPurchaseDateUtc?.toISOString() ?? null,
      newestPurchaseDateUtc: actualSalesResult.newestPurchaseDateUtc?.toISOString() ?? null,
    };

    const dashboardStartedAt = Date.now();
    const dashboardResult = await syncSellerboardUkDashboard({
      reportUrl: dashboardReportUrl,
    });
    const dashboard = {
      ok: true,
      durationMs: Date.now() - dashboardStartedAt,
      ...dashboardResult,
      oldestDateUtc: dashboardResult.oldestDateUtc?.toISOString() ?? null,
      newestDateUtc: dashboardResult.newestDateUtc?.toISOString() ?? null,
    };

    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      actualSales,
      dashboard,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[POST /sellerboard/uk-sync] sync error:', error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
};
