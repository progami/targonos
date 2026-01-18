import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import {
  inferSellerboardReportTimeZoneFromHeaders,
  parseCsv,
  parseSellerboardDateUtc,
} from '@/lib/integrations/sellerboard';

export const runtime = 'nodejs';

/**
 * Debug endpoint to sum Sellerboard CSV data using Sellerboard UI week boundaries (Mon-Sun)
 * to verify if CSV matches UI totals.
 *
 * Query params:
 * - startDate: YYYY-MM-DD (Monday of the week)
 * - endDate: YYYY-MM-DD (Sunday of the week)
 * - asin: filter by specific ASIN (optional)
 */
export const GET = withXPlanAuth(async (request: Request, session) => {
  const actor = getStrategyActor(session);
  if (!actor.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(request.url);
  const startDateParam = url.searchParams.get('startDate');
  const endDateParam = url.searchParams.get('endDate');
  const asinFilter = url.searchParams.get('asin')?.trim().toUpperCase();

  if (!startDateParam || !endDateParam) {
    return NextResponse.json(
      { error: 'Missing startDate or endDate (YYYY-MM-DD format)' },
      { status: 400 },
    );
  }

  const startDate = new Date(startDateParam + 'T00:00:00.000Z');
  const endDate = new Date(endDateParam + 'T23:59:59.999Z');

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return NextResponse.json({ error: 'Invalid date format' }, { status: 400 });
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
    const rows = parseCsv(csv);

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Empty CSV' }, { status: 500 });
    }

    const headers = rows[0].map((h) => h.trim());
    const reportTimeZone = inferSellerboardReportTimeZoneFromHeaders(headers);
    const productIdx = headers.indexOf('Products');
    const dateIdx = headers.indexOf('PurchaseDate(UTC)');
    const unitsIdx = headers.indexOf('NumberOfItems');
    const statusIdx = headers.indexOf('OrderStatus');

    if (productIdx === -1 || dateIdx === -1 || unitsIdx === -1) {
      return NextResponse.json(
        { error: 'Missing required columns', headers },
        { status: 500 },
      );
    }

    const unitsByProduct = new Map<string, number>();
    const ordersByProduct = new Map<string, Array<{ date: string; units: number; status: string }>>();
    let totalUnits = 0;
    let matchedRows = 0;
    let skippedCancelled = 0;
    let outsideDateRange = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const productCode = row[productIdx]?.trim().toUpperCase();
      const dateValue = row[dateIdx];
      const unitsValue = row[unitsIdx];
      const status = statusIdx !== -1 ? row[statusIdx]?.trim() : '';

      if (!productCode || !dateValue) continue;

      if (status.toLowerCase() === 'cancelled') {
        skippedCancelled++;
        continue;
      }

      const purchaseDate = parseSellerboardDateUtc(dateValue);
      if (!purchaseDate) continue;

      if (purchaseDate < startDate || purchaseDate > endDate) {
        outsideDateRange++;
        continue;
      }

      if (asinFilter && productCode !== asinFilter) continue;

      const units = parseInt(unitsValue, 10);
      if (!Number.isFinite(units)) continue;

      matchedRows++;
      totalUnits += units;
      unitsByProduct.set(productCode, (unitsByProduct.get(productCode) ?? 0) + units);

      const existing = ordersByProduct.get(productCode);
      const nextList = existing ?? [];
      nextList.push({ date: purchaseDate.toISOString(), units, status });
      ordersByProduct.set(productCode, nextList);
    }

    const productTotals = Array.from(unitsByProduct.entries())
      .map(([asin, units]) => ({ asin, units }))
      .sort((a, b) => b.units - a.units);

    const orderDetails = asinFilter ? ordersByProduct.get(asinFilter) ?? [] : [];

    return NextResponse.json({
      reportTimeZone,
      dateRange: {
        start: startDateParam,
        end: endDateParam,
        startDay: startDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        endDay: endDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
      },
      filter: asinFilter ?? 'none',
      stats: {
        totalRows: rows.length - 1,
        matchedRows,
        skippedCancelled,
        outsideDateRange,
        totalUnits,
        uniqueProducts: unitsByProduct.size,
      },
      productTotals: productTotals.slice(0, 50),
      orderDetails: orderDetails.slice(0, 100),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
