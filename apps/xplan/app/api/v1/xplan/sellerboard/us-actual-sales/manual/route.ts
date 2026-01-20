import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import { syncSellerboardUsActualSales } from '@/lib/integrations/sellerboard';
import prisma from '@/lib/prisma';

export const runtime = 'nodejs';

export const POST = withXPlanAuth(async (request: Request, session) => {
  const actor = getStrategyActor(session);
  if (!actor.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const reportUrl = process.env.SELLERBOARD_US_ORDERS_REPORT_URL?.trim();
  if (!reportUrl) {
    return NextResponse.json(
      { error: 'Missing SELLERBOARD_US_ORDERS_REPORT_URL' },
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
  if (strategy.region !== 'US') {
    return NextResponse.json({ error: 'Strategy region mismatch' }, { status: 400 });
  }

  const startedAt = Date.now();

  try {
    const result = await syncSellerboardUsActualSales({ reportUrl, strategyId });
    return NextResponse.json({
      ok: true,
      durationMs: Date.now() - startedAt,
      ...result,
      oldestPurchaseDateUtc: result.oldestPurchaseDateUtc?.toISOString() ?? null,
      newestPurchaseDateUtc: result.newestPurchaseDateUtc?.toISOString() ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
