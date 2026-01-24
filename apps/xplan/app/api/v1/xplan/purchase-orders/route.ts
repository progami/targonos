import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-xplan';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { OPS_STAGE_DEFAULT_LABELS } from '@/lib/business-parameter-labels';
import { withXPlanAuth, RATE_LIMIT_PRESETS } from '@/lib/api/auth';
import { requireXPlanStrategiesAccess, requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { loadPlanningCalendar } from '@/lib/planning';
import { getCalendarDateForWeek, weekNumberForDate } from '@/lib/calculations/calendar';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

const EXPENSIVE_RATE_LIMIT = RATE_LIMIT_PRESETS.expensive;

const allowedFields = [
  'productId',
  'orderCode',
  'poDate',
  'poWeekNumber',
  'quantity',
  'productionWeeks',
  'sourceWeeks',
  'oceanWeeks',
  'finalWeeks',
  'pay1Date',
  'pay1Percent',
  'pay1Amount',
  'pay2Date',
  'pay2Percent',
  'pay2Amount',
  'pay3Date',
  'pay3Percent',
  'pay3Amount',
  'productionStart',
  'productionComplete',
  'productionCompleteWeekNumber',
  'sourceDeparture',
  'sourceDepartureWeekNumber',
  'transportReference',
  'shipName',
  'containerNumber',
  'portEta',
  'portEtaWeekNumber',
  'inboundEta',
  'inboundEtaWeekNumber',
  'availableDate',
  'availableWeekNumber',
  'status',
  'notes',
  'overrideSellingPrice',
  'overrideManufacturingCost',
  'overrideFreightCost',
  'overrideTariffRate',
  'overrideTacosPercent',
  'overrideFbaFee',
  'overrideReferralRate',
  'overrideStoragePerMonth',
] as const;

const percentFields: Record<string, true> = {
  pay1Percent: true,
  pay2Percent: true,
  pay3Percent: true,
  overrideTariffRate: true,
  overrideTacosPercent: true,
  overrideReferralRate: true,
};

const decimalFields: Record<string, true> = {
  productionWeeks: true,
  sourceWeeks: true,
  oceanWeeks: true,
  finalWeeks: true,
  pay1Amount: true,
  pay2Amount: true,
  pay3Amount: true,
  overrideSellingPrice: true,
  overrideManufacturingCost: true,
  overrideFreightCost: true,
  overrideFbaFee: true,
  overrideStoragePerMonth: true,
};

const weekNumberFields: Record<string, true> = {
  poWeekNumber: true,
  productionCompleteWeekNumber: true,
  sourceDepartureWeekNumber: true,
  portEtaWeekNumber: true,
  inboundEtaWeekNumber: true,
  availableWeekNumber: true,
};

const dateFields: Record<string, true> = {
  poDate: true,
  pay1Date: true,
  pay2Date: true,
  pay3Date: true,
  productionStart: true,
  productionComplete: true,
  sourceDeparture: true,
  portEta: true,
  inboundEta: true,
  availableDate: true,
};

const DATE_TO_WEEK_FIELD: Record<string, string> = {
  poDate: 'poWeekNumber',
  productionComplete: 'productionCompleteWeekNumber',
  sourceDeparture: 'sourceDepartureWeekNumber',
  portEta: 'portEtaWeekNumber',
  inboundEta: 'inboundEtaWeekNumber',
  availableDate: 'availableWeekNumber',
};

const WEEK_TO_DATE_FIELD: Record<string, string> = Object.fromEntries(
  Object.entries(DATE_TO_WEEK_FIELD).map(([dateField, weekField]) => [weekField, dateField]),
);

const updateSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().min(1),
      values: z.record(z.string(), z.string().nullable().optional()),
    }),
  ),
});

const createSchema = z.object({
  strategyId: z.string().min(1),
  productId: z.string().min(1),
  orderCode: z.string().trim().min(1).optional(),
  poDate: z.string().trim().optional(),
  quantity: z.coerce.number().int().min(0).optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

const STAGE_DEFAULT_LABEL_SET = Object.values(OPS_STAGE_DEFAULT_LABELS);
const REQUIRED_STAGE_WEEK_FIELDS = new Set([
  'productionWeeks',
  'sourceWeeks',
  'oceanWeeks',
  'finalWeeks',
]);
const REQUIRED_NON_NULLABLE_FIELDS = new Set(['productId', 'orderCode', 'quantity', 'status']);

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

function validatePurchaseOrderStageDates(dates: {
  poDate: Date | null;
  productionStart: Date | null;
  productionComplete: Date | null;
  sourceDeparture: Date | null;
  portEta: Date | null;
  availableDate: Date | null;
}): string | null {
  const { poDate, productionStart, productionComplete, sourceDeparture, portEta, availableDate } =
    dates;

  if (poDate) {
    const checks = [
      { label: 'Mfg Start', date: productionStart },
      { label: 'Mfg Done', date: productionComplete },
      { label: 'Departure', date: sourceDeparture },
      { label: 'Port Arrival', date: portEta },
      { label: 'Warehouse', date: availableDate },
    ] as const;

    for (const check of checks) {
      if (check.date && check.date.getTime() < poDate.getTime()) {
        return `${check.label} must be on or after PO Date`;
      }
    }
  }

  if (
    productionStart &&
    productionComplete &&
    productionComplete.getTime() < productionStart.getTime()
  ) {
    return 'Mfg Done must be on or after Mfg Start';
  }

  if (
    productionComplete &&
    sourceDeparture &&
    sourceDeparture.getTime() < productionComplete.getTime()
  ) {
    return 'Departure must be on or after Mfg Done';
  }

  if (sourceDeparture && portEta && portEta.getTime() < sourceDeparture.getTime()) {
    return 'Port Arrival must be on or after Departure';
  }

  if (portEta && availableDate && availableDate.getTime() < portEta.getTime()) {
    return 'Warehouse must be on or after Port Arrival';
  }

  return null;
}

type StageDefaultsMap = Record<string, number>;

type StageParameterRow = {
  label?: string | null;
  valueNumeric?: Prisma.Decimal | number | null;
};

function buildStageDefaultsMap(rows: StageParameterRow[]): StageDefaultsMap {
  return rows.reduce((map, row) => {
    const key = row.label?.trim().toLowerCase();
    if (!key) return map;
    const numericValue = row.valueNumeric;
    let numeric: number;
    if (numericValue == null) {
      numeric = NaN;
    } else if (typeof numericValue === 'number') {
      numeric = numericValue;
    } else {
      numeric = Number(numericValue);
    }
    if (Number.isFinite(numeric) && numeric > 0) {
      map[key] = numeric;
    }
    return map;
  }, {} as StageDefaultsMap);
}

function resolveStageDefaultWeeks(map: StageDefaultsMap, label: string): number {
  const key = label.trim().toLowerCase();
  const value = map[key];
  if (Number.isFinite(value) && value && value > 0) {
    return value;
  }
  return 1;
}

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const debug = process.env.NODE_ENV !== 'production';
  const body = await request.json().catch(() => null);
  if (debug) {
    console.log('[PUT /purchase-orders] body:', JSON.stringify(body, null, 2));
  }
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    if (debug) {
      console.log('[PUT /purchase-orders] validation error:', parsed.error.format());
    }
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  for (const update of parsed.data.updates) {
    for (const field of REQUIRED_NON_NULLABLE_FIELDS) {
      if (!(field in update.values)) continue;
      const incoming = update.values[field];
      if (incoming === null || incoming === undefined || incoming.trim() === '') {
        return NextResponse.json({ error: `${field} is required` }, { status: 400 });
      }
    }
    for (const field of REQUIRED_STAGE_WEEK_FIELDS) {
      if (!(field in update.values)) continue;
      const incoming = update.values[field];
      if (incoming === null || incoming === undefined || incoming === '') continue;
      const parsedNumber = parseNumber(incoming);
      if (parsedNumber == null || !Number.isFinite(parsedNumber) || parsedNumber < 0) {
        return NextResponse.json(
          { error: `${field} must be a non-negative number` },
          { status: 400 },
        );
      }
    }
  }

  try {
    const orderMeta = await prisma.purchaseOrder.findMany({
      where: { id: { in: parsed.data.updates.map(({ id }) => id) } },
      select: {
        id: true,
        strategyId: true,
        strategy: { select: { region: true } },
        poDate: true,
        productionStart: true,
        productionComplete: true,
        sourceDeparture: true,
        portEta: true,
        availableDate: true,
      },
    });

    const { response } = await requireXPlanStrategiesAccess(
      orderMeta.map((order) => order.strategyId),
      session,
    );
    if (response) return response;

    const weekStartsOnByOrder = new Map<string, 0 | 1>();
    const weekStartsOnSet = new Set<0 | 1>();
    for (const row of orderMeta) {
      const weekStartsOn = weekStartsOnForRegion(row.strategy?.region === 'UK' ? 'UK' : 'US');
      weekStartsOnByOrder.set(row.id, weekStartsOn);
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

    // Pre-validate orderCode uniqueness before attempting batch update
    const orderCodeUpdates = parsed.data.updates
      .filter(({ values }) => values.orderCode && values.orderCode.trim() !== '')
      .map(({ id, values }) => ({ id, orderCode: values.orderCode!.trim() }));

    if (orderCodeUpdates.length > 0) {
      // Get the strategyId from one of the orders being updated
      const ordersBeingUpdated = (await prisma.purchaseOrder.findMany({
        where: { id: { in: orderCodeUpdates.map((u) => u.id) } },
        select: { id: true, strategyId: true },
      })) as unknown as { id: string; strategyId: string }[];
      const strategyIds = [...new Set(ordersBeingUpdated.map((o) => o.strategyId))];

      const existingOrders = (await prisma.purchaseOrder.findMany({
        where: {
          strategyId: { in: strategyIds },
          orderCode: { in: orderCodeUpdates.map((u) => u.orderCode) },
        },
        select: { id: true, orderCode: true, strategyId: true },
      })) as unknown as { id: string; orderCode: string; strategyId: string }[];

      // Check if any orderCode would conflict with a different PO in the same strategy
      for (const update of orderCodeUpdates) {
        const orderBeingUpdated = ordersBeingUpdated.find((o) => o.id === update.id);
        const conflict = existingOrders.find(
          (existing) =>
            existing.orderCode === update.orderCode &&
            existing.id !== update.id &&
            existing.strategyId === orderBeingUpdated?.strategyId,
        );
        if (conflict) {
          const errorMessage = `Order code "${update.orderCode}" is already in use by another purchase order.`;
          if (debug) {
            console.log('[PUT /purchase-orders] returning 409:', errorMessage);
          }
          return new Response(JSON.stringify({ error: errorMessage }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          });
        }
      }
    }

    const orderById = new Map(orderMeta.map((order) => [order.id, order]));

    const preparedUpdates = parsed.data.updates.map(({ id, values }) => {
      const data: Record<string, unknown> = {};
      const weekStartsOn = weekStartsOnByOrder.get(id) ?? 1;
      const calendar = calendarsByStart.get(weekStartsOn);

      for (const field of allowedFields) {
        if (!(field in values)) continue;
        const incoming = values[field];
        if (incoming === null || incoming === undefined || incoming === '') {
          if (REQUIRED_STAGE_WEEK_FIELDS.has(field) || REQUIRED_NON_NULLABLE_FIELDS.has(field)) {
            continue;
          }
          data[field] = null;
          if (field in DATE_TO_WEEK_FIELD) {
            data[DATE_TO_WEEK_FIELD[field]] = null;
          }
          if (field in WEEK_TO_DATE_FIELD) {
            data[WEEK_TO_DATE_FIELD[field]] = null;
          }
          continue;
        }

        if (field === 'quantity') {
          const parsedQuantity = parseNumber(incoming);
          if (parsedQuantity == null) continue;
          data[field] = Math.max(0, Math.round(parsedQuantity));
        } else if (weekNumberFields[field]) {
          const parsedWeek = parseNumber(incoming);
          const weekNumber = parsedWeek == null ? null : Math.round(parsedWeek);
          data[field] = weekNumber;
          const dateField = WEEK_TO_DATE_FIELD[field];
          if (calendar && dateField && weekNumber != null) {
            data[dateField] = getCalendarDateForWeek(weekNumber, calendar);
          }
        } else if (percentFields[field]) {
          const parsedNumber = parseNumber(incoming);
          if (parsedNumber === null) {
            data[field] = null;
          } else {
            data[field] = parsedNumber > 1 ? parsedNumber / 100 : parsedNumber;
          }
        } else if (decimalFields[field]) {
          data[field] = parseNumber(incoming);
        } else if (dateFields[field]) {
          const parsedDate = parseDate(incoming);
          if (!parsedDate) {
            data[field] = null;
            if (field in DATE_TO_WEEK_FIELD) {
              data[DATE_TO_WEEK_FIELD[field]] = null;
            }
            continue;
          }

          if (calendar && field in DATE_TO_WEEK_FIELD) {
            const weekNumber = weekNumberForDate(parsedDate, calendar);
            if (weekNumber != null) {
              data[DATE_TO_WEEK_FIELD[field]] = weekNumber;
              data[field] = getCalendarDateForWeek(weekNumber, calendar);
              continue;
            }
          }

          data[field] = parsedDate;
        } else if (field === 'status') {
          data[field] = incoming as string;
        } else if (field === 'productId') {
          data[field] = incoming;
        } else if (
          field === 'orderCode' ||
          field === 'transportReference' ||
          field === 'shipName' ||
          field === 'containerNumber'
        ) {
          data[field] = incoming;
        } else if (field === 'notes') {
          data[field] = incoming;
        }
      }

      return { id, data };
    });

    for (const update of preparedUpdates) {
      const existing = orderById.get(update.id);
      if (!existing) continue;

      const touchesStageDates =
        'poDate' in update.data ||
        'productionStart' in update.data ||
        'productionComplete' in update.data ||
        'sourceDeparture' in update.data ||
        'portEta' in update.data ||
        'availableDate' in update.data;

      if (!touchesStageDates) continue;

      const stageError = validatePurchaseOrderStageDates({
        poDate:
          ('poDate' in update.data ? (update.data.poDate as Date | null) : existing.poDate) ?? null,
        productionStart:
          ('productionStart' in update.data
            ? (update.data.productionStart as Date | null)
            : existing.productionStart) ?? null,
        productionComplete:
          ('productionComplete' in update.data
            ? (update.data.productionComplete as Date | null)
            : existing.productionComplete) ?? null,
        sourceDeparture:
          ('sourceDeparture' in update.data
            ? (update.data.sourceDeparture as Date | null)
            : existing.sourceDeparture) ?? null,
        portEta:
          ('portEta' in update.data ? (update.data.portEta as Date | null) : existing.portEta) ??
          null,
        availableDate:
          ('availableDate' in update.data
            ? (update.data.availableDate as Date | null)
            : existing.availableDate) ?? null,
      });

      if (stageError) {
        return NextResponse.json(
          {
            error: `Dates must be in order: PO Date → Mfg Start → Mfg Done → Departure → Port Arrival → Warehouse. (${stageError})`,
          },
          { status: 400 },
        );
      }
    }

    await prisma.$transaction(
      preparedUpdates.map(({ id, data }) => prisma.purchaseOrder.update({ where: { id }, data })),
    );
    if (debug) {
      console.log('[PUT /purchase-orders] success');
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PUT /purchase-orders] error:', error);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const errorMessage = 'A purchase order with this code already exists.';
      if (debug) {
        console.log('[PUT /purchase-orders] returning 409 (Prisma P2002):', errorMessage);
      }
      return new Response(JSON.stringify({ error: errorMessage }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}, { rateLimit: EXPENSIVE_RATE_LIMIT });

function generateOrderCode() {
  const random = Math.random().toString(36).slice(-5).toUpperCase();
  return `PO-${random}`;
}

async function resolveOrderCode(strategyId: string, requested?: string) {
  if (requested) {
    const existing = await prisma.purchaseOrder.findUnique({
      where: { strategyId_orderCode: { strategyId, orderCode: requested } },
    });
    if (existing) {
      return { error: 'A purchase order with this code already exists.', status: 409 as const };
    }
    return { orderCode: requested };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateOrderCode();
    const conflict = await prisma.purchaseOrder.findUnique({
      where: { strategyId_orderCode: { strategyId, orderCode: candidate } },
    });
    if (!conflict) {
      return { orderCode: candidate };
    }
  }

  return {
    error: 'Unable to generate a unique purchase order code. Try again.',
    status: 503 as const,
  };
}

export const POST = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { strategyId, productId, orderCode, quantity, poDate } = parsed.data;

  const { response } = await requireXPlanStrategyAccess(strategyId, session);
  if (response) return response;

  const productRow = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, strategyId: true },
  });
  if (!productRow) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }
  if (productRow.strategyId !== strategyId) {
    return NextResponse.json({ error: 'Product does not belong to strategy' }, { status: 400 });
  }

  const orderCodeResult = await resolveOrderCode(strategyId, orderCode);
  if ('error' in orderCodeResult) {
    return NextResponse.json({ error: orderCodeResult.error }, { status: orderCodeResult.status });
  }

  const stageDefaultsRows = await prisma.businessParameter.findMany({
    where: { strategyId, label: { in: STAGE_DEFAULT_LABEL_SET } },
    select: { label: true, valueNumeric: true },
  });
  const stageDefaults = buildStageDefaultsMap(stageDefaultsRows);

  const strategyRow = await (prisma as unknown as Record<string, any>).strategy?.findUnique?.({
    where: { id: strategyId },
    select: { region: true },
  });
  const weekStartsOn = weekStartsOnForRegion(strategyRow?.region === 'UK' ? 'UK' : 'US');
  const planning = await loadPlanningCalendar(weekStartsOn);
  const parsedPoDate = poDate ? parseDate(poDate) : null;
  const poWeekNumber = parsedPoDate ? weekNumberForDate(parsedPoDate, planning.calendar) : null;
  const normalizedPoDate =
    poWeekNumber != null ? getCalendarDateForWeek(poWeekNumber, planning.calendar) : parsedPoDate;

  const safeQuantity = quantity ?? 0;
  const data = {
    strategyId,
    productId,
    orderCode: orderCodeResult.orderCode,
    quantity: safeQuantity,
    poDate: normalizedPoDate,
    poWeekNumber,
    productionWeeks: new Prisma.Decimal(
      resolveStageDefaultWeeks(stageDefaults, OPS_STAGE_DEFAULT_LABELS.production),
    ),
    sourceWeeks: new Prisma.Decimal(
      resolveStageDefaultWeeks(stageDefaults, OPS_STAGE_DEFAULT_LABELS.source),
    ),
    oceanWeeks: new Prisma.Decimal(
      resolveStageDefaultWeeks(stageDefaults, OPS_STAGE_DEFAULT_LABELS.ocean),
    ),
    finalWeeks: new Prisma.Decimal(
      resolveStageDefaultWeeks(stageDefaults, OPS_STAGE_DEFAULT_LABELS.final),
    ),
    status: 'ISSUED' as const,
  };

  try {
    const created = await prisma.purchaseOrder.create({ data });

    return NextResponse.json({
      order: {
        id: created.id,
        orderCode: created.orderCode,
        productId: created.productId,
        quantity: created.quantity,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A purchase order with this code already exists.' },
        { status: 409 },
      );
    }
    console.error('[POST /purchase-orders] error:', error);
    return NextResponse.json({ error: 'Unable to create purchase order' }, { status: 500 });
  }
});

export const DELETE = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id } = parsed.data;

  try {
    const existing = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, strategyId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    const { response } = await requireXPlanStrategyAccess(existing.strategyId, session);
    if (response) return response;

    await prisma.purchaseOrder.delete({ where: { id } });
  } catch (error) {
    return NextResponse.json({ error: 'Unable to delete purchase order' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});
