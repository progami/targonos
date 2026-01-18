import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import { loadPlanningCalendar } from '@/lib/planning';
import { weekStartsOnForRegion } from '@/lib/strategy-region';
import {
  inferSellerboardReportTimeZoneFromCsv,
  parseSellerboardDashboardWeeklyFinancials,
} from '@/lib/integrations/sellerboard';
import { getTalosPrisma } from '@/lib/integrations/talos-client';

export const runtime = 'nodejs';

type WeekComparison = {
  weekNumber: number;
  weekDate: string | null;
  sellerboard: {
    revenue: number;
    amazonFees: number;
    referralFees: number;
    fbaFees: number;
    refunds: number;
    ppcSpend: number;
    netProfit: number;
  };
  database: {
    revenue: number;
    amazonFees: number;
    referralFees: number;
    fbaFees: number;
    refunds: number;
    ppcSpend: number;
    netProfit: number;
  };
  profitAndLossWeek: {
    revenue: number | null;
    amazonFees: number | null;
    ppcSpend: number | null;
    netProfit: number | null;
  } | null;
  diff: {
    sellerboardMinusDbRevenue: number;
    sellerboardMinusPnLRevenue: number | null;
  };
};

export const GET = withXPlanAuth(async (request: Request, session) => {
  const actor = getStrategyActor(session);
  if (!actor.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const strategyId = url.searchParams.get('strategyId');
  const weekParam = url.searchParams.get('week');

  if (!strategyId) {
    return NextResponse.json({ error: 'Missing strategyId parameter' }, { status: 400 });
  }

  const reportUrl = process.env.SELLERBOARD_US_DASHBOARD_REPORT_URL?.trim();
  if (!reportUrl) {
    return NextResponse.json(
      { error: 'Missing SELLERBOARD_US_DASHBOARD_REPORT_URL' },
      { status: 500 },
    );
  }

  try {
    const response = await fetch(reportUrl, { method: 'GET' });
    if (!response.ok) {
      return NextResponse.json(
        { error: `Sellerboard fetch failed (${response.status})` },
        { status: 502 },
      );
    }

    const csv = await response.text();
    const reportTimeZone = inferSellerboardReportTimeZoneFromCsv(csv);
    const weekStartsOn = weekStartsOnForRegion('US');
    const planning = await loadPlanningCalendar(weekStartsOn);
    const parsed = parseSellerboardDashboardWeeklyFinancials(csv, planning, { weekStartsOn });

    const productCodes = Array.from(
      new Set(parsed.weeklyFinancials.map((entry) => entry.productCode)),
    );

    const xplanProducts = await prisma.product.findMany({
      where: { strategyId, strategy: { region: 'US' } },
      select: { id: true, sku: true, asin: true, name: true },
    });

    type MatchedProduct = { id: string; sku: string; asin: string | null; matchedBy: 'sku' | 'asin' | 'talos-asin' };
    const productByCode = new Map<string, MatchedProduct>();

    for (const product of xplanProducts) {
      if (productCodes.includes(product.sku)) {
        productByCode.set(product.sku, {
          id: product.id,
          sku: product.sku,
          asin: product.asin ?? null,
          matchedBy: 'sku',
        });
      }
      if (product.asin && productCodes.includes(product.asin)) {
        productByCode.set(product.asin, {
          id: product.id,
          sku: product.sku,
          asin: product.asin,
          matchedBy: 'asin',
        });
      }
    }

    const unmatchedCodes = productCodes.filter((code) => !productByCode.has(code));
    if (unmatchedCodes.length) {
      const talos = getTalosPrisma('US');
      if (talos) {
        const mappings = await talos.sku.findMany({
          where: { asin: { in: unmatchedCodes } },
          select: { asin: true, skuCode: true },
        });

        const skuCodeToAsin = new Map<string, string>();
        for (const mapping of mappings) {
          if (mapping.asin && mapping.skuCode) {
            skuCodeToAsin.set(mapping.skuCode.trim(), mapping.asin.trim());
          }
        }

        for (const product of xplanProducts) {
          const asin = skuCodeToAsin.get(product.sku);
          if (asin && unmatchedCodes.includes(asin) && !productByCode.has(asin)) {
            productByCode.set(asin, { id: product.id, sku: product.sku, asin, matchedBy: 'talos-asin' });
          }
        }
      }
    }

    const sellerboardByWeek = new Map<number, Array<{ productId: string; financials: typeof parsed.weeklyFinancials[number] }>>();
    for (const entry of parsed.weeklyFinancials) {
      const match = productByCode.get(entry.productCode);
      if (!match) continue;
      const existing = sellerboardByWeek.get(entry.weekNumber) ?? [];
      existing.push({ productId: match.id, financials: entry });
      sellerboardByWeek.set(entry.weekNumber, existing);
    }

    const targetWeeks = weekParam
      ? [parseInt(weekParam, 10)]
      : Array.from(sellerboardByWeek.keys()).sort((a, b) => b - a).slice(0, 10);

    const dbFinancials = await prisma.salesWeekFinancials.findMany({
      where: { strategyId, weekNumber: { in: targetWeeks } },
      select: {
        weekNumber: true,
        actualRevenue: true,
        actualAmazonFees: true,
        actualReferralFees: true,
        actualFbaFees: true,
        actualRefunds: true,
        actualPpcSpend: true,
        actualNetProfit: true,
      },
    });

    const dbByWeek = new Map<number, typeof dbFinancials>();
    for (const row of dbFinancials) {
      const existing = dbByWeek.get(row.weekNumber) ?? [];
      existing.push(row);
      dbByWeek.set(row.weekNumber, existing);
    }

    const pnlWeeks = await prisma.profitAndLossWeek.findMany({
      where: { strategyId, weekNumber: { in: targetWeeks } },
      select: { weekNumber: true, revenue: true, amazonFees: true, ppcSpend: true, netProfit: true },
    });
    const pnlByWeek = new Map<number, typeof pnlWeeks[number]>();
    for (const row of pnlWeeks) pnlByWeek.set(row.weekNumber, row);

    const sumDecimal = (value: unknown): number => {
      if (value == null) return 0;
      if (typeof value === 'number') return value;
      if (typeof (value as { toNumber?: unknown }).toNumber === 'function') {
        return (value as { toNumber: () => number }).toNumber();
      }
      return Number(value);
    };

    const comparisons: WeekComparison[] = [];
    for (const weekNumber of targetWeeks) {
      const entries = sellerboardByWeek.get(weekNumber) ?? [];
      const sellerboardTotals = entries.reduce(
        (acc, item) => {
          acc.revenue += item.financials.revenue;
          acc.amazonFees += item.financials.amazonFees;
          acc.referralFees += item.financials.referralFees;
          acc.fbaFees += item.financials.fbaFees;
          acc.refunds += item.financials.refunds;
          acc.ppcSpend += item.financials.ppcSpend;
          acc.netProfit += item.financials.netProfit;
          return acc;
        },
        { revenue: 0, amazonFees: 0, referralFees: 0, fbaFees: 0, refunds: 0, ppcSpend: 0, netProfit: 0 },
      );

      const dbRows = dbByWeek.get(weekNumber) ?? [];
      const dbTotals = dbRows.reduce(
        (acc, row) => {
          acc.revenue += sumDecimal(row.actualRevenue);
          acc.amazonFees += sumDecimal(row.actualAmazonFees);
          acc.referralFees += sumDecimal(row.actualReferralFees);
          acc.fbaFees += sumDecimal(row.actualFbaFees);
          acc.refunds += sumDecimal(row.actualRefunds);
          acc.ppcSpend += sumDecimal(row.actualPpcSpend);
          acc.netProfit += sumDecimal(row.actualNetProfit);
          return acc;
        },
        { revenue: 0, amazonFees: 0, referralFees: 0, fbaFees: 0, refunds: 0, ppcSpend: 0, netProfit: 0 },
      );

      const pnl = pnlByWeek.get(weekNumber);
      const pnlPayload = pnl
        ? {
            revenue: sumDecimal(pnl.revenue),
            amazonFees: sumDecimal(pnl.amazonFees),
            ppcSpend: sumDecimal(pnl.ppcSpend),
            netProfit: sumDecimal(pnl.netProfit),
          }
        : null;

      const weekDate = planning.calendar.weekDates.get(weekNumber);

      comparisons.push({
        weekNumber,
        weekDate: weekDate?.toISOString().split('T')[0] ?? null,
        sellerboard: sellerboardTotals,
        database: dbTotals,
        profitAndLossWeek: pnlPayload,
        diff: {
          sellerboardMinusDbRevenue: sellerboardTotals.revenue - dbTotals.revenue,
          sellerboardMinusPnLRevenue: pnlPayload ? sellerboardTotals.revenue - pnlPayload.revenue : null,
        },
      });
    }

    const allUnmatchedCodes = productCodes.filter((code) => !productByCode.has(code));

    return NextResponse.json({
      summary: {
        reportTimeZone,
        sellerboardRowsParsed: parsed.rowsParsed,
        sellerboardRowsSkipped: parsed.rowsSkipped,
        uniqueProductCodes: productCodes.length,
        matchedProducts: productByCode.size,
        unmatchedProducts: allUnmatchedCodes.length,
        unmatchedCodes: allUnmatchedCodes.slice(0, 20),
        dateRange: {
          oldest: parsed.oldestDateUtc?.toISOString() ?? null,
          newest: parsed.newestDateUtc?.toISOString() ?? null,
        },
      },
      comparisons,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
