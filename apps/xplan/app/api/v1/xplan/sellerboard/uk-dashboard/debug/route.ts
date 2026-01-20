import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';
import { getStrategyActor } from '@/lib/strategy-access';
import { loadPlanningCalendar } from '@/lib/planning';
import { weekStartsOnForRegion } from '@/lib/strategy-region';
import {
  inferSellerboardReportTimeZoneFromCsv,
  parseSellerboardDashboardWeeklyFinancials,
} from '@/lib/integrations/sellerboard';

export const runtime = 'nodejs';

export const GET = withXPlanAuth(async (_request: Request, session) => {
  const actor = getStrategyActor(session);
  if (!actor.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const reportUrl = process.env.SELLERBOARD_UK_DASHBOARD_REPORT_URL?.trim();
  if (!reportUrl) {
    return NextResponse.json(
      { error: 'Missing SELLERBOARD_UK_DASHBOARD_REPORT_URL' },
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
    const weekStartsOn = weekStartsOnForRegion('UK');
    const planning = await loadPlanningCalendar(weekStartsOn);

    const parsed = parseSellerboardDashboardWeeklyFinancials(csv, planning, { weekStartsOn });

    const byWeek = new Map<number, { revenue: number; amazonFees: number; ppcSpend: number; netProfit: number }>();
    for (const entry of parsed.weeklyFinancials) {
      const existing = byWeek.get(entry.weekNumber) ?? {
        revenue: 0,
        amazonFees: 0,
        ppcSpend: 0,
        netProfit: 0,
      };
      existing.revenue += entry.revenue;
      existing.amazonFees += entry.amazonFees;
      existing.ppcSpend += entry.ppcSpend;
      existing.netProfit += entry.netProfit;
      byWeek.set(entry.weekNumber, existing);
    }

    const weeklySummary = Array.from(byWeek.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, 15)
      .map(([weekNumber, totals]) => {
        const weekDate = planning.calendar.weekDates.get(weekNumber);
        return {
          weekNumber,
          weekDate: weekDate?.toISOString().split('T')[0] ?? null,
          ...totals,
        };
      });

    const csvLines = csv.split('\n').slice(0, 50);

    return NextResponse.json({
      reportTimeZone,
      reportUrl: reportUrl.substring(0, 50) + '...',
      rowsParsed: parsed.rowsParsed,
      rowsSkipped: parsed.rowsSkipped,
      oldestDateUtc: parsed.oldestDateUtc?.toISOString() ?? null,
      newestDateUtc: parsed.newestDateUtc?.toISOString() ?? null,
      csvSha256: parsed.csvSha256,
      weeklySummary,
      rawCsvPreview: csvLines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 502 });
  }
});
