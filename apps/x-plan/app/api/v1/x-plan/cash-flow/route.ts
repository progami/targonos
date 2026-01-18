import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-x-plan';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { getCalendarDateForWeek } from '@/lib/calculations/calendar';
import { loadPlanningCalendar } from '@/lib/planning';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

const editableFields = ['amazonPayout', 'inventorySpend', 'fixedCosts'] as const;

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

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      for (const { weekNumber, values } of parsed.data.updates) {
        const data: Record<string, number | null> = {};
        for (const field of editableFields) {
          if (!(field in values)) continue;
          data[field] = parseNumber(values[field]);
        }
        const decimalData = Object.fromEntries(
          Object.entries(data).map(([key, value]) => [
            key,
            value == null ? null : new Prisma.Decimal(value),
          ]),
        ) as Record<string, Prisma.Decimal | null>;
        if (Object.keys(data).length === 0) {
          await tx.cashFlowWeek.findFirst({ where: { strategyId, weekNumber } });
          continue;
        }
        try {
          await tx.cashFlowWeek.update({
            where: { strategyId_weekNumber: { strategyId, weekNumber } },
            data: decimalData,
          });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            const weekDate =
              getCalendarDateForWeek(weekNumber, planning.calendar) ??
              planning.calendar.calendarStart ??
              new Date();
            await tx.cashFlowWeek.create({
              data: {
                strategyId,
                weekNumber,
                weekDate,
                periodLabel: `Week ${weekNumber}`,
                ...decimalData,
              },
            });
            continue;
          }
          throw error;
        }
      }
    });
  } catch (error) {
    console.error('[cash-flow][PUT]', error);
    return NextResponse.json({ error: 'Unable to update cash flow' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
});
