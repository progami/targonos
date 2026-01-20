import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loadPlanningCalendar } from '@/lib/planning';
import { getCalendarDateForWeek } from '@/lib/calculations/calendar';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

const editableFields = [
  'units',
  'revenue',
  'cogs',
  'amazonFees',
  'ppcSpend',
  'fixedCosts',
] as const;

const updateSchema = z.object({
  strategyId: z.string().min(1),
  updates: z.array(
    z.object({
      weekNumber: z.number().int(),
      values: z.record(z.string(), z.string().nullable().optional()),
    }),
  ),
});

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[,$%\s]/g, '');
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { strategyId } = parsed.data;
  const { response } = await requireXPlanStrategyAccess(strategyId, session);
  if (response) return response;

  const strategyRow = await (prisma as unknown as Record<string, any>).strategy?.findUnique?.({
    where: { id: strategyId },
    select: { region: true },
  });
  const weekStartsOn = weekStartsOnForRegion(strategyRow?.region === 'UK' ? 'UK' : 'US');
  const planning = await loadPlanningCalendar(weekStartsOn);
  const minWeek = planning.calendar.minWeekNumber ?? 1;
  const maxWeek = planning.calendar.maxWeekNumber ?? minWeek;

  const outOfRange = parsed.data.updates.find(
    ({ weekNumber }) => weekNumber < minWeek || weekNumber > maxWeek,
  );

  if (outOfRange) {
    return NextResponse.json(
      { error: `Week ${outOfRange.weekNumber} is outside the planning calendar` },
      { status: 400 },
    );
  }

  await prisma.$transaction(
    parsed.data.updates.map(({ weekNumber, values }) => {
      const data: Record<string, number | null> = {};
      for (const field of editableFields) {
        if (!(field in values)) continue;
        data[field] = parseNumber(values[field]);
      }
      if (Object.keys(data).length === 0) {
        return prisma.profitAndLossWeek.findFirst({ where: { strategyId, weekNumber } });
      }
      const weekDate =
        getCalendarDateForWeek(weekNumber, planning.calendar) ??
        planning.calendar.calendarStart ??
        new Date();
      return prisma.profitAndLossWeek.upsert({
        where: { strategyId_weekNumber: { strategyId, weekNumber } },
        update: data,
        create: { strategyId, weekNumber, weekDate, ...data },
      });
    }),
  );

  return NextResponse.json({ ok: true });
});
