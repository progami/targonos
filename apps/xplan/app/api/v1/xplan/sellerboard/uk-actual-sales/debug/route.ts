import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import { loadPlanningCalendar } from '@/lib/planning';
import { sellerboardReportTimeZoneForRegion, weekStartsOnForRegion } from '@/lib/strategy-region';
import {
  inferSellerboardReportTimeZoneFromCsv,
  parseSellerboardOrdersWeeklyUnits,
} from '@/lib/integrations/sellerboard';

export const runtime = 'nodejs';

export const GET = withXPlanAuth(async (_request: Request, session) => {
  const actor = getStrategyActor(session);
  if (!actor.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
    const reportTimeZone = sellerboardReportTimeZoneForRegion('UK');
    const inferredTimeZone = inferSellerboardReportTimeZoneFromCsv(csv);
    const weekStartsOn = weekStartsOnForRegion('UK');
    const planning = await loadPlanningCalendar(weekStartsOn);

    const parsed = parseSellerboardOrdersWeeklyUnits(csv, planning, {
      weekStartsOn,
      reportTimeZone,
      excludeStatuses: ['Cancelled'],
    });

    const byWeek = new Map<number, Map<string, number>>();
    for (const entry of parsed.weeklyUnits) {
      const existing = byWeek.get(entry.weekNumber);
      const weekMap = existing ?? new Map<string, number>();
      weekMap.set(entry.productCode, (weekMap.get(entry.productCode) ?? 0) + entry.units);
      byWeek.set(entry.weekNumber, weekMap);
    }

    const weeklyData: Record<string, Record<string, number>> = {};
    for (const [weekNumber, products] of byWeek.entries()) {
      const weekDate = planning.calendar.weekDates.get(weekNumber);
      const weekKey = `Week ${weekNumber} (${weekDate?.toISOString().split('T')[0] ?? 'unknown'})`;
      weeklyData[weekKey] = Object.fromEntries(products);
    }

    const csvLines = csv.split('\n').slice(0, 50);

    return NextResponse.json({
      reportTimeZone,
      inferredTimeZone,
      reportUrl: reportUrl.substring(0, 50) + '...',
      rowsParsed: parsed.rowsParsed,
      rowsSkipped: parsed.rowsSkipped,
      oldestPurchaseDateUtc: parsed.oldestPurchaseDateUtc?.toISOString() ?? null,
      newestPurchaseDateUtc: parsed.newestPurchaseDateUtc?.toISOString() ?? null,
      csvSha256: parsed.csvSha256,
      weeklyData,
      rawCsvPreview: csvLines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
