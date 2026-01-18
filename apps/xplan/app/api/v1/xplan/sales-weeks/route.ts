import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loadPlanningCalendar } from '@/lib/planning';
import { getCalendarDateForWeek } from '@/lib/calculations/calendar';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

const allowedFields = ['actualSales', 'forecastSales', 'finalSales'] as const;

const updateSchema = z.object({
  strategyId: z.string().min(1),
  updates: z.array(
    z.object({
      productId: z.string().min(1),
      weekNumber: z.number().int(),
      values: z.record(z.string(), z.string().nullable().optional()),
    }),
  ),
});

function parseIntValue(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = value.replace(/[,$\s]/g, '');
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return null;
  return Math.round(parsed);
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
  const calendar = planning.calendar;

  await prisma.$transaction(
    parsed.data.updates.map(({ productId, weekNumber, values }) => {
      const data: Record<string, number | null> = {};
      let touchedAutoField = false;
      for (const field of allowedFields) {
        if (!(field in values)) continue;
        data[field] = parseIntValue(values[field]);
        if (field === 'actualSales' || field === 'forecastSales') {
          touchedAutoField = true;
        }
      }

      if (Object.keys(data).length === 0) {
        return prisma.salesWeek.findFirst({ where: { strategyId, productId, weekNumber } });
      }

      if (touchedAutoField && !('finalSales' in values)) {
        data.finalSales = null;
      }

      const weekDate = getCalendarDateForWeek(weekNumber, calendar);
      if (!weekDate) {
        throw new Error(`Unknown planning week ${weekNumber}`);
      }

      return prisma.salesWeek.upsert({
        where: { strategyId_productId_weekNumber: { strategyId, productId, weekNumber } },
        update: data,
        create: {
          strategyId,
          productId,
          weekNumber,
          weekDate,
          ...data,
        },
      });
    }),
  );

  return NextResponse.json({ ok: true });
});
