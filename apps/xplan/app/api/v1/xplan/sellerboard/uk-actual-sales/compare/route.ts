import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import { loadPlanningCalendar } from '@/lib/planning';
import { sellerboardReportTimeZoneForRegion, weekStartsOnForRegion } from '@/lib/strategy-region';
import { parseSellerboardOrdersWeeklyUnits } from '@/lib/integrations/sellerboard';
import { getTalosPrisma } from '@/lib/integrations/talos-client';

export const runtime = 'nodejs';

type ProductComparison = {
  sku: string;
  asin: string | null;
  name: string;
  sellerboardUnits: number;
  xplanActualSales: number | null;
  difference: number;
  matchedBy: 'sku' | 'asin' | 'talos-asin' | 'not-matched';
};

type WeekComparison = {
  weekNumber: number;
  weekDate: string | null;
  products: ProductComparison[];
  totalSellerboard: number;
  totalXplan: number;
  totalDifference: number;
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

  const reportUrl = process.env.SELLERBOARD_UK_ORDERS_REPORT_URL?.trim();
  if (!reportUrl) {
    return NextResponse.json(
      { error: 'Missing SELLERBOARD_UK_ORDERS_REPORT_URL' },
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
    const weekStartsOn = weekStartsOnForRegion('UK');
    const reportTimeZone = sellerboardReportTimeZoneForRegion('UK');
    const planning = await loadPlanningCalendar(weekStartsOn);

    const parsed = parseSellerboardOrdersWeeklyUnits(csv, planning, {
      weekStartsOn,
      reportTimeZone,
      excludeStatuses: ['Cancelled'],
    });

    const productCodes = Array.from(new Set(parsed.weeklyUnits.map((entry) => entry.productCode)));

    const xplanProducts = await prisma.product.findMany({
      where: {
        strategyId,
        strategy: { region: 'UK' },
      },
      select: {
        id: true,
        sku: true,
        name: true,
      },
    });

    type MatchedProduct = {
      id: string;
      sku: string;
      asin: string | null;
      name: string;
      matchedBy: 'sku' | 'talos-asin';
    };

    const productByCode = new Map<string, MatchedProduct>();

    for (const product of xplanProducts) {
      if (productCodes.includes(product.sku)) {
        productByCode.set(product.sku, {
          id: product.id,
          sku: product.sku,
          asin: null,
          name: product.name,
          matchedBy: 'sku',
        });
      }
    }

    const unmatchedCodes = productCodes.filter((code) => !productByCode.has(code));
    if (unmatchedCodes.length) {
      const talos = getTalosPrisma('UK');
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
            productByCode.set(asin, {
              id: product.id,
              sku: product.sku,
              asin,
              name: product.name,
              matchedBy: 'talos-asin',
            });
          }
        }
      }
    }

    const salesWeeks = await prisma.salesWeek.findMany({
      where: { strategyId },
      select: {
        productId: true,
        weekNumber: true,
        actualSales: true,
      },
    });

    const salesByProductWeek = new Map<string, Map<number, number>>();
    for (const sw of salesWeeks) {
      const existing = salesByProductWeek.get(sw.productId);
      const weekMap = existing ?? new Map<number, number>();
      weekMap.set(sw.weekNumber, Number(sw.actualSales ?? 0));
      salesByProductWeek.set(sw.productId, weekMap);
    }

    const sellerboardByWeek = new Map<number, Map<string, number>>();
    for (const entry of parsed.weeklyUnits) {
      const existing = sellerboardByWeek.get(entry.weekNumber);
      const weekMap = existing ?? new Map<string, number>();
      weekMap.set(entry.productCode, (weekMap.get(entry.productCode) ?? 0) + entry.units);
      sellerboardByWeek.set(entry.weekNumber, weekMap);
    }

    const targetWeeks = weekParam
      ? [parseInt(weekParam, 10)]
      : Array.from(sellerboardByWeek.keys()).sort((a, b) => b - a).slice(0, 10);

    const comparisons: WeekComparison[] = [];

    for (const weekNumber of targetWeeks) {
      const sellerboardWeekData = sellerboardByWeek.get(weekNumber);
      if (!sellerboardWeekData) continue;

      const weekDate = planning.calendar.weekDates.get(weekNumber);
      const products: ProductComparison[] = [];
      let totalSellerboard = 0;
      let totalXplan = 0;

      for (const [productCode, sellerboardUnits] of sellerboardWeekData) {
        totalSellerboard += sellerboardUnits;

        const matchedProduct = productByCode.get(productCode);
        if (matchedProduct) {
          const xplanActualSales =
            salesByProductWeek.get(matchedProduct.id)?.get(weekNumber) ?? null;
          totalXplan += xplanActualSales ?? 0;

          products.push({
            sku: matchedProduct.sku,
            asin: productCode !== matchedProduct.sku ? productCode : matchedProduct.asin,
            name: matchedProduct.name,
            sellerboardUnits,
            xplanActualSales,
            difference: sellerboardUnits - (xplanActualSales ?? 0),
            matchedBy: matchedProduct.matchedBy,
          });
        } else {
          products.push({
            sku: productCode,
            asin: null,
            name: '(not matched)',
            sellerboardUnits,
            xplanActualSales: null,
            difference: sellerboardUnits,
            matchedBy: 'not-matched',
          });
        }
      }

      products.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

      comparisons.push({
        weekNumber,
        weekDate: weekDate?.toISOString().split('T')[0] ?? null,
        products,
        totalSellerboard,
        totalXplan,
        totalDifference: totalSellerboard - totalXplan,
      });
    }

    const allUnmatchedCodes = productCodes.filter((code) => !productByCode.has(code));

    return NextResponse.json({
      summary: {
        sellerboardRowsParsed: parsed.rowsParsed,
        sellerboardRowsSkipped: parsed.rowsSkipped,
        uniqueProductCodes: productCodes.length,
        matchedProducts: productByCode.size,
        unmatchedProducts: allUnmatchedCodes.length,
        unmatchedCodes: allUnmatchedCodes.slice(0, 20),
        dateRange: {
          oldest: parsed.oldestPurchaseDateUtc?.toISOString() ?? null,
          newest: parsed.newestPurchaseDateUtc?.toISOString() ?? null,
        },
      },
      comparisons,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
