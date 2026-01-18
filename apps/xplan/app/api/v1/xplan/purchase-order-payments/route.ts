import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-xplan';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategiesAccess, requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { REMOVED_PAYMENT_CATEGORY } from '@/lib/payments';
import { loadPlanningCalendar } from '@/lib/planning';
import { getCalendarDateForWeek, weekNumberForDate } from '@/lib/calculations/calendar';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

type UpdatePayload = {
  id: string;
  values: Record<string, string | null | undefined>;
};

const allowedFields = [
  'dueDate',
  'dueWeekNumber',
  'dueDateDefault',
  'dueWeekNumberDefault',
  'dueDateSource',
  'percentage',
  'amountExpected',
  'amountPaid',
] as const;

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,%\s]/g, '').replace(/,/g, '');
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T00:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.updates)) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const updates = body.updates as UpdatePayload[];

  const paymentMeta = await prisma.purchaseOrderPayment.findMany({
    where: { id: { in: updates.map(({ id }) => id) } },
    select: {
      id: true,
      purchaseOrder: { select: { strategyId: true, strategy: { select: { region: true } } } },
    },
  });

  const { response } = await requireXPlanStrategiesAccess(
    paymentMeta.map((row) => row.purchaseOrder.strategyId),
    session,
  );
  if (response) return response;

  const weekStartsOnByPayment = new Map<string, 0 | 1>();
  const weekStartsOnSet = new Set<0 | 1>();
  for (const row of paymentMeta) {
    const weekStartsOn = weekStartsOnForRegion(
      row.purchaseOrder.strategy?.region === 'UK' ? 'UK' : 'US',
    );
    weekStartsOnByPayment.set(row.id, weekStartsOn);
    weekStartsOnSet.add(weekStartsOn);
  }

  const calendarsByStart = new Map<
    0 | 1,
    Awaited<ReturnType<typeof loadPlanningCalendar>>['calendar']
  >();
  await Promise.all(
    Array.from(weekStartsOnSet).map(async (weekStartsOn) => {
      const planning = await loadPlanningCalendar(weekStartsOn);
      calendarsByStart.set(weekStartsOn, planning.calendar);
    }),
  );

  await prisma.$transaction(
    updates.map(({ id, values }) => {
      const data: Record<string, unknown> = {};
      const weekStartsOn = weekStartsOnByPayment.get(id) ?? 1;
      const calendar = calendarsByStart.get(weekStartsOn);

      for (const field of allowedFields) {
        if (!(field in values)) continue;
        const incoming = values[field];
        if (incoming === undefined) {
          continue;
        }

        if (field === 'dueDateSource') {
          const normalized = String(incoming).trim().toUpperCase();
          if (normalized === 'USER' || normalized === 'SYSTEM') {
            data[field] = normalized;
          }
          continue;
        }

        if (incoming === null || incoming === '') {
          data[field] = null;
          if (field === 'dueDate') {
            data.dueWeekNumber = null;
          } else if (field === 'dueDateDefault') {
            data.dueWeekNumberDefault = null;
          } else if (field === 'dueWeekNumber') {
            data.dueDate = null;
          } else if (field === 'dueWeekNumberDefault') {
            data.dueDateDefault = null;
          }
          continue;
        }

        if (field === 'dueWeekNumber' || field === 'dueWeekNumberDefault') {
          const parsedWeek = parseNumber(incoming);
          const weekNumber = parsedWeek == null ? null : Math.round(parsedWeek);
          data[field] = weekNumber;
          const dateField = field === 'dueWeekNumber' ? 'dueDate' : 'dueDateDefault';
          if (calendar && weekNumber != null) {
            data[dateField] = getCalendarDateForWeek(weekNumber, calendar);
          }
        } else if (field === 'dueDate' || field === 'dueDateDefault') {
          const parsedDate = parseDate(incoming);
          if (!parsedDate) {
            data[field] = null;
            continue;
          }

          if (calendar) {
            const weekNumber = weekNumberForDate(parsedDate, calendar);
            if (weekNumber != null) {
              const normalizedDate = getCalendarDateForWeek(weekNumber, calendar);
              data[field] = normalizedDate;
              const weekField = field === 'dueDate' ? 'dueWeekNumber' : 'dueWeekNumberDefault';
              data[weekField] = weekNumber;
              continue;
            }
          }

          data[field] = parsedDate;
        } else if (field === 'percentage') {
          const parsed = parseNumber(incoming);
          const decimal = parsed == null ? null : parsed > 1 ? parsed / 100 : parsed;
          data[field] = decimal == null ? null : new Prisma.Decimal(decimal.toFixed(4));
        } else if (field === 'amountExpected' || field === 'amountPaid') {
          const parsed = parseNumber(incoming);
          data[field] = parsed == null ? null : new Prisma.Decimal(parsed.toFixed(2));
        }
      }

      if (Object.keys(data).length === 0) {
        return prisma.purchaseOrderPayment.findUnique({ where: { id } });
      }

      return prisma.purchaseOrderPayment.update({ where: { id }, data });
    }),
  );

  return NextResponse.json({ ok: true });
});

export const POST = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.purchaseOrderId !== 'string') {
    return NextResponse.json({ error: 'purchaseOrderId is required' }, { status: 400 });
  }

  const purchaseOrderId: string = body.purchaseOrderId;
  const paymentIndex: number = Number(body.paymentIndex ?? 1);
  const percentage = parseNumber(body.percentage ?? null);
  const amountExpected = parseNumber(body.amountExpected ?? null);
  const amountPaid = parseNumber(body.amountPaid ?? null);
  const dueDate = parseDate(body.dueDate ?? null);
  const dueDateSource = String(body.dueDateSource ?? 'SYSTEM')
    .trim()
    .toUpperCase();
  const normalizedSource = dueDateSource === 'USER' ? 'USER' : 'SYSTEM';
  const label =
    typeof body.label === 'string' && body.label.trim().length > 0 ? body.label.trim() : undefined;
  const category =
    typeof body.category === 'string' && body.category.trim().length > 0
      ? body.category.trim()
      : undefined;

  try {
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { id: true, strategyId: true, strategy: { select: { region: true } } },
    });

    if (!purchaseOrder) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const { response } = await requireXPlanStrategyAccess(purchaseOrder.strategyId, session);
    if (response) return response;

    const weekStartsOn = weekStartsOnForRegion(
      purchaseOrder?.strategy?.region === 'UK' ? 'UK' : 'US',
    );
    const planning = await loadPlanningCalendar(weekStartsOn);
    const dueWeekNumber = dueDate ? weekNumberForDate(dueDate, planning.calendar) : null;
    const normalizedDueDate =
      dueWeekNumber != null ? getCalendarDateForWeek(dueWeekNumber, planning.calendar) : dueDate;

    const nextIndex = Number.isNaN(paymentIndex) ? 1 : paymentIndex;
    const created = await prisma.purchaseOrderPayment.create({
      data: {
        purchaseOrderId,
        paymentIndex: nextIndex,
        percentage: percentage != null ? new Prisma.Decimal(percentage.toFixed(4)) : null,
        amountExpected:
          amountExpected != null ? new Prisma.Decimal(amountExpected.toFixed(2)) : null,
        amountPaid: amountPaid != null ? new Prisma.Decimal(amountPaid.toFixed(2)) : null,
        dueDate: normalizedDueDate,
        dueWeekNumber,
        dueDateDefault: normalizedDueDate,
        dueWeekNumberDefault: dueWeekNumber,
        dueDateSource: normalizedSource,
        label: label ?? `Payment ${nextIndex}`,
        category: category ?? 'OTHER',
      },
      include: { purchaseOrder: true },
    });

    const toIsoDate = (date: Date | null | undefined) =>
      date ? date.toISOString().slice(0, 10) : null;
    const dueDateIso = toIsoDate(created.dueDate);
    const dueDateDefaultIso = toIsoDate(created.dueDateDefault ?? created.dueDate);

    return NextResponse.json({
      id: created.id,
      purchaseOrderId: created.purchaseOrderId,
      orderCode: created.purchaseOrder.orderCode,
      paymentIndex: created.paymentIndex,
      category: created.category ?? '',
      label: created.label ?? '',
      weekNumber: '',
      dueDate: dueDateIso ?? '',
      dueDateIso,
      dueDateDefault: dueDateDefaultIso ?? '',
      dueDateDefaultIso,
      dueDateSource: created.dueDateSource,
      percentage: created.percentage ? Number(created.percentage).toFixed(2) : '',
      amountExpected: created.amountExpected ? Number(created.amountExpected).toFixed(2) : '',
      amountPaid: created.amountPaid ? Number(created.amountPaid).toFixed(2) : '',
    });
  } catch (error) {
    console.error('[purchase-order-payments][POST]', error);
    return NextResponse.json({ error: 'Unable to create payment' }, { status: 500 });
  }
});

export const DELETE = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.ids)) {
    return NextResponse.json({ error: 'ids array is required' }, { status: 400 });
  }

  const ids = body.ids as string[];

  try {
    const payments = await prisma.purchaseOrderPayment.findMany({
      where: { id: { in: ids } },
      select: { id: true, purchaseOrder: { select: { strategyId: true } } },
    });

    const { response } = await requireXPlanStrategiesAccess(
      payments.map((payment) => payment.purchaseOrder.strategyId),
      session,
    );
    if (response) return response;

    const existingIds = payments.map((payment) => payment.id);
    if (existingIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    await prisma.$transaction(
      existingIds.map((id) =>
        prisma.purchaseOrderPayment.update({
          where: { id },
          data: {
            category: REMOVED_PAYMENT_CATEGORY,
            label: null,
            dueDate: null,
            dueWeekNumber: null,
            dueDateDefault: null,
            dueWeekNumberDefault: null,
            dueDateSource: 'SYSTEM',
            percentage: null,
            amountExpected: null,
            amountPaid: null,
          },
        }),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[purchase-order-payments][DELETE]', error);
    return NextResponse.json({ error: 'Unable to remove payments' }, { status: 500 });
  }
});
