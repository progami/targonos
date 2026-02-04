import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withXPlanAuth, RATE_LIMIT_PRESETS } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { loadPlanningCalendar } from '@/lib/planning';
import { parseStrategyRegion, weekStartsOnForRegion } from '@/lib/strategy-region';
import {
  fetchSellerboardCsv,
  inferSellerboardReportTimeZoneFromCsv,
} from '@/lib/integrations/sellerboard';
import { parseSellerboardDashboardWeeklyTotals } from '@/lib/integrations/sellerboard/dashboard';

export const runtime = 'nodejs';

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'object' && value && 'toNumber' in value) {
    const maybe = value as { toNumber?: unknown };
    if (typeof maybe.toNumber === 'function') {
      return (maybe.toNumber as () => number)();
    }
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export const GET = withXPlanAuth(
  async (request: Request, session) => {
    const url = new URL(request.url);
    const strategyId = url.searchParams.get('strategyId');

    const { response } = await requireXPlanStrategyAccess(strategyId, session);
    if (response) return response;

    const strategy = await prisma.strategy.findUnique({
      where: { id: strategyId! },
      select: { region: true },
    });
    if (!strategy) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const region = parseStrategyRegion(strategy.region);
    if (!region) {
      throw new Error('StrategyRegionInvalid');
    }

    const reportUrl =
      region === 'UK'
        ? process.env.SELLERBOARD_UK_DASHBOARD_REPORT_URL?.trim()
        : process.env.SELLERBOARD_US_DASHBOARD_REPORT_URL?.trim();
    if (!reportUrl) {
      return NextResponse.json(
        { error: `Missing SELLERBOARD_${region}_DASHBOARD_REPORT_URL` },
        { status: 500 },
      );
    }

    const weekStartsOn = weekStartsOnForRegion(region);
    const planning = await loadPlanningCalendar(weekStartsOn);

    const csv = await fetchSellerboardCsv(reportUrl);
    const reportTimeZone = inferSellerboardReportTimeZoneFromCsv(csv);
    const parsed = parseSellerboardDashboardWeeklyTotals(csv, planning, { weekStartsOn });

    const requestedWeekRaw = url.searchParams.get('week');
    const requestedWeek = requestedWeekRaw ? Number.parseInt(requestedWeekRaw, 10) : null;
    const limit = parsePositiveInt(url.searchParams.get('limit'), 8);

    const sellerboardWeeks = parsed.weeklyTotals.slice().sort((a, b) => b.weekNumber - a.weekNumber);
    const weekNumbers = Number.isFinite(requestedWeek)
      ? sellerboardWeeks
          .filter((row) => row.weekNumber === requestedWeek)
          .map((row) => row.weekNumber)
      : sellerboardWeeks.slice(0, limit).map((row) => row.weekNumber);

    const pnlRows = await prisma.profitAndLossWeek.findMany({
      where: { strategyId: strategyId!, weekNumber: { in: weekNumbers } },
      select: {
        weekNumber: true,
        weekDate: true,
        units: true,
        revenue: true,
        cogs: true,
        amazonFees: true,
        ppcSpend: true,
        grossProfit: true,
        netProfit: true,
      },
    });
    const pnlByWeek = new Map<number, (typeof pnlRows)[number]>();
    for (const row of pnlRows) {
      pnlByWeek.set(row.weekNumber, row);
    }

    const weeks = weekNumbers
      .slice()
      .sort((a, b) => b - a)
      .map((weekNumber) => {
        const sellerboard = sellerboardWeeks.find((row) => row.weekNumber === weekNumber) ?? null;
        const db = pnlByWeek.get(weekNumber) ?? null;

        const dbUnits = db?.units ?? null;
        const dbRevenue = toNumber(db?.revenue);
        const dbCogs = toNumber(db?.cogs);
        const dbAmazonFees = toNumber(db?.amazonFees);
        const dbPpcSpend = toNumber(db?.ppcSpend);
        const dbNetProfit = toNumber(db?.netProfit);

        return {
          weekNumber,
          weekDate: db?.weekDate ? db.weekDate.toISOString().split('T')[0] : null,
          sellerboard: sellerboard
            ? {
                units: sellerboard.units,
                revenue: sellerboard.revenue,
                cogs: sellerboard.cogs,
                amazonFees: sellerboard.amazonFees,
                ppcSpend: sellerboard.ppcSpend,
                grossProfit: sellerboard.grossProfit,
                netProfit: sellerboard.netProfit,
                estimatedPayout: sellerboard.estimatedPayout,
              }
            : null,
          database: db
            ? {
                units: dbUnits,
                revenue: dbRevenue,
                cogs: dbCogs,
                amazonFees: dbAmazonFees,
                ppcSpend: dbPpcSpend,
                grossProfit: toNumber(db.grossProfit),
                netProfit: dbNetProfit,
              }
            : null,
          diff: sellerboard
            ? {
                units: dbUnits == null ? null : sellerboard.units - dbUnits,
                revenue: dbRevenue == null ? null : sellerboard.revenue - dbRevenue,
                cogs: dbCogs == null ? null : sellerboard.cogs - dbCogs,
                amazonFees: dbAmazonFees == null ? null : sellerboard.amazonFees - dbAmazonFees,
                ppcSpend: dbPpcSpend == null ? null : sellerboard.ppcSpend - dbPpcSpend,
                netProfit: dbNetProfit == null ? null : sellerboard.netProfit - dbNetProfit,
              }
            : null,
        };
      });

    return NextResponse.json({
      ok: true,
      region,
      reportTimeZone,
      sellerboard: {
        rowsParsed: parsed.rowsParsed,
        rowsSkipped: parsed.rowsSkipped,
        csvSha256: parsed.csvSha256,
        oldestDate: parsed.oldestDate?.toISOString() ?? null,
        newestDate: parsed.newestDate?.toISOString() ?? null,
      },
      weeks,
    });
  },
  { rateLimit: RATE_LIMIT_PRESETS.expensive },
);
