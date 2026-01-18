import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loadPlanningCalendar } from '@/lib/planning';
import { getCalendarDateForWeek } from '@/lib/calculations/calendar';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

const updateSchema = z.object({
  strategyId: z.string().min(1),
  version: z.string().trim().min(1).max(64).optional(),
  updates: z.array(
    z.object({
      productId: z.string().min(1),
      weekNumber: z.number().int(),
      systemForecastSales: z.number().int().nullable(),
      version: z.string().trim().min(1).max(64).optional(),
    }),
  ),
});

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { strategyId } = parsed.data;
  const { actor, response } = await requireXPlanStrategyAccess(strategyId, session);
  if (response) return response;
  if (!actor.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const strategyRow = await (prisma as unknown as Record<string, any>).strategy?.findUnique?.({
    where: { id: strategyId },
    select: { region: true },
  });
  const weekStartsOn = weekStartsOnForRegion(strategyRow?.region === 'UK' ? 'UK' : 'US');
  const planning = await loadPlanningCalendar(weekStartsOn);
  const calendar = planning.calendar;

  const batchVersion = parsed.data.version;

  await prisma.$transaction(
    parsed.data.updates.map(({ productId, weekNumber, systemForecastSales, version }) => {
      const weekDate = getCalendarDateForWeek(weekNumber, calendar);
      if (!weekDate) {
        throw new Error(`Unknown planning week ${weekNumber}`);
      }

      const systemForecastVersion = version ?? batchVersion ?? null;

      return prisma.salesWeek.upsert({
        where: { strategyId_productId_weekNumber: { strategyId, productId, weekNumber } },
        update: {
          systemForecastSales,
          systemForecastVersion,
        },
        create: {
          strategyId,
          productId,
          weekNumber,
          weekDate,
          systemForecastSales,
          systemForecastVersion,
        },
      });
    }),
  );

  return NextResponse.json({ ok: true });
});
