import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import { getUnitsForAsin, getOrdersWithItems } from '@targon/amazon-sp-api';

export const runtime = 'nodejs';

/**
 * Fetch orders from Amazon SP API.
 *
 * Query params:
 * - startDate: YYYY-MM-DD
 * - endDate: YYYY-MM-DD
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

  try {
    if (asinFilter) {
      // Get units for specific ASIN
      const result = await getUnitsForAsin('US', asinFilter, {
        createdAfter: startDate,
        createdBefore: endDate,
      });

      return NextResponse.json({
        source: 'Amazon SP API',
        dateRange: {
          start: startDateParam,
          end: endDateParam,
          startDay: startDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
          endDay: endDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        },
        filter: asinFilter,
        result,
      });
    } else {
      // Get all orders summary
      const summary = await getOrdersWithItems('US', {
        createdAfter: startDate,
        createdBefore: endDate,
        orderStatuses: ['Unshipped', 'PartiallyShipped', 'Shipped'],
      });

      // Convert byAsin to sorted array
      const productTotals = Object.entries(summary.byAsin)
        .map(([asin, data]) => ({ asin, ...data }))
        .sort((a, b) => b.units - a.units);

      return NextResponse.json({
        source: 'Amazon SP API',
        dateRange: {
          start: startDateParam,
          end: endDateParam,
          startDay: startDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
          endDay: endDate.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }),
        },
        stats: {
          totalOrders: summary.totalOrders,
          totalUnits: summary.totalUnits,
          byStatus: summary.byStatus,
        },
        productTotals: productTotals.slice(0, 50),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
