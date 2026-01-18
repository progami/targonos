import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import prisma from '@/lib/prisma';
import { syncSellerboardUkActualSales, syncSellerboardUkDashboard } from '@/lib/integrations/sellerboard';

export const runtime = 'nodejs';

export const POST = withXPlanAuth(async (request: Request, session) => {
  const actor = getStrategyActor(session);
  if (!actor.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
      strategyId,
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
      strategyId,
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
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
