import { NextResponse } from 'next/server';
import { Prisma, type PurchaseOrderStatus as XPlanPurchaseOrderStatus } from '@targon/prisma-xplan';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { getTalosPrisma } from '@/lib/integrations/talos-client';
import { OPS_STAGE_DEFAULT_LABELS } from '@/lib/business-parameter-labels';
import { loadPlanningCalendar } from '@/lib/planning';
import { weekNumberForDate } from '@/lib/calculations/calendar';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

export const runtime = 'nodejs';

const bodySchema = z.object({
  strategyId: z.string().min(1),
  reference: z.string().min(1),
  orderCode: z.string().trim().optional(),
});

type StageDefaultsMap = Record<string, number>;

type StageParameterRow = {
  label?: string | null;
  valueNumeric?: Prisma.Decimal | number | null;
};

const STAGE_DEFAULT_LABEL_SET = Object.values(OPS_STAGE_DEFAULT_LABELS);

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
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return 1;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function toUtcDateOnly(value: Date | null | undefined): Date | null {
  if (!value) return null;
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

const XPLAN_STATUS_VALUES = new Set<string>([
  'DRAFT',
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'SHIPPED',
  'REJECTED',
  'ARCHIVED',
  'CANCELLED',
]);

const TALOS_IMPORT_DISALLOWED_STATUS_VALUES = new Set<string>(['CANCELLED', 'REJECTED']);

function mapTalosStatus(value: string): XPlanPurchaseOrderStatus {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z_]/g, '');
  if (XPLAN_STATUS_VALUES.has(normalized)) {
    return normalized as XPlanPurchaseOrderStatus;
  }

  switch (normalized) {
    case 'CLOSED':
      return 'SHIPPED';
    case 'POSTED':
      return 'ISSUED';
    case 'REVIEW':
    case 'AWAITING_PROOF':
      return 'DRAFT';
    default:
      return 'ISSUED';
  }
}

export const POST = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
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
  const region = strategyRow?.region === 'UK' ? 'UK' : 'US';

  const talos = getTalosPrisma(region);
  if (!talos) {
    return NextResponse.json(
      {
        error:
          region === 'UK'
            ? 'TALOS_DATABASE_URL_UK is not configured'
            : 'TALOS_DATABASE_URL_US is not configured',
      },
      { status: 501 },
    );
  }

  const reference = parsed.data.reference.trim();
  const orderCodeOverride = parsed.data.orderCode?.trim();

  const where =
    UUID_RE.test(reference) === true
      ? { OR: [{ id: reference }, { poNumber: reference }, { orderNumber: reference }] }
      : { OR: [{ poNumber: reference }, { orderNumber: reference }] };

  const purchaseOrder = await talos.purchaseOrder.findFirst({
    where,
    include: { lines: true, containers: true },
  });

  if (!purchaseOrder) {
    return NextResponse.json({ error: 'Talos purchase order not found' }, { status: 404 });
  }

  const talosStatusNormalized = String(purchaseOrder.status)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, '');
  if (TALOS_IMPORT_DISALLOWED_STATUS_VALUES.has(talosStatusNormalized)) {
    return NextResponse.json(
      { error: `Talos purchase order is ${talosStatusNormalized} and cannot be imported` },
      { status: 400 },
    );
  }

  if (!Array.isArray(purchaseOrder.lines) || purchaseOrder.lines.length === 0) {
    return NextResponse.json(
      { error: 'Talos purchase order has no line items' },
      { status: 400 },
    );
  }

  const orderCodeCandidate =
    orderCodeOverride && orderCodeOverride.length > 0 ? orderCodeOverride : null;
  const talosPreferredCodeRaw = purchaseOrder.poNumber ? purchaseOrder.poNumber : purchaseOrder.orderNumber;
  const talosPreferredCode = talosPreferredCodeRaw.trim();
  const resolvedOrderCode = orderCodeCandidate ? orderCodeCandidate : talosPreferredCode;

  const existing = await prisma.purchaseOrder.findUnique({
    where: { strategyId_orderCode: { strategyId, orderCode: resolvedOrderCode } },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'A purchase order with this code already exists.' },
      { status: 409 },
    );
  }

  const skuCodes = Array.from(new Set(purchaseOrder.lines.map((line) => line.skuCode.trim()))).filter(
    (sku) => sku.length > 0,
  );
  const products = await prisma.product.findMany({
    where: { strategyId, sku: { in: skuCodes } },
    select: { id: true, sku: true },
  });
  const productBySku = new Map(products.map((product) => [product.sku, product.id]));

  const missingSkus: string[] = [];
  for (const sku of skuCodes) {
    if (!productBySku.has(sku)) {
      missingSkus.push(sku);
    }
  }
  if (missingSkus.length > 0) {
    return NextResponse.json(
      { error: `Create these products in X-Plan first: ${missingSkus.join(', ')}` },
      { status: 400 },
    );
  }

  const primarySku = purchaseOrder.lines[0].skuCode.trim();
  const primaryProductId = productBySku.get(primarySku);
  if (!primaryProductId) {
    return NextResponse.json(
      { error: `Missing X-Plan product for sku "${primarySku}"` },
      { status: 400 },
    );
  }

  const stageDefaultsRows = await prisma.businessParameter.findMany({
    where: { strategyId, label: { in: STAGE_DEFAULT_LABEL_SET } },
    select: { label: true, valueNumeric: true },
  });
  const stageDefaults = buildStageDefaultsMap(stageDefaultsRows);

  const weekStartsOn = weekStartsOnForRegion(region);
  const planning = await loadPlanningCalendar(weekStartsOn);
  const calendar = planning.calendar;

  const poDate = toUtcDateOnly(purchaseOrder.createdAt);
  const productionStart = toUtcDateOnly(
    purchaseOrder.manufacturingStartDate ?? purchaseOrder.manufacturingStart ?? null,
  );
  const productionComplete = toUtcDateOnly(
    purchaseOrder.actualCompletionDate ??
      purchaseOrder.expectedCompletionDate ??
      purchaseOrder.expectedDate ??
      purchaseOrder.manufacturingEnd ??
      null,
  );
  const sourceDeparture = toUtcDateOnly(
    purchaseOrder.actualDeparture ?? purchaseOrder.estimatedDeparture ?? null,
  );
  const portEta = toUtcDateOnly(purchaseOrder.actualArrival ?? purchaseOrder.estimatedArrival ?? null);
  const availableDate = toUtcDateOnly(
    purchaseOrder.receivedDate ??
      purchaseOrder.customsClearedDate ??
      purchaseOrder.deliveredDate ??
      null,
  );

  const poWeekNumber = poDate ? weekNumberForDate(poDate, calendar) : null;
  const productionCompleteWeekNumber = productionComplete
    ? weekNumberForDate(productionComplete, calendar)
    : null;
  const sourceDepartureWeekNumber = sourceDeparture ? weekNumberForDate(sourceDeparture, calendar) : null;
  const portEtaWeekNumber = portEta ? weekNumberForDate(portEta, calendar) : null;
  const availableWeekNumber = availableDate ? weekNumberForDate(availableDate, calendar) : null;

  const shipName = purchaseOrder.vesselName?.trim();
  const containerNumber = purchaseOrder.containers
    .map((container) => container.containerNumber.trim())
    .filter((value) => value.length > 0)
    .join(', ');
  const transportReferenceRaw = purchaseOrder.masterBillOfLading
    ? purchaseOrder.masterBillOfLading
    : purchaseOrder.houseBillOfLading;
  const transportReference = transportReferenceRaw?.trim();

  const totalUnitsOrdered = purchaseOrder.lines.reduce((sum, line) => sum + line.unitsOrdered, 0);

  const batchRows = purchaseOrder.lines.map((line) => ({
    skuCode: line.skuCode.trim(),
    batchCode: line.lotRef?.trim() ? line.lotRef.trim() : null,
    quantity: line.unitsOrdered,
  }));

  try {
    const created = await prisma.purchaseOrder.create({
      data: {
        strategyId,
        productId: primaryProductId,
        orderCode: resolvedOrderCode,
        quantity: totalUnitsOrdered,
        poDate,
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
        productionStart,
        productionComplete,
        productionCompleteWeekNumber,
        sourceDeparture,
        sourceDepartureWeekNumber,
        portEta,
        portEtaWeekNumber,
        availableDate,
        availableWeekNumber,
        shipName: shipName && shipName.length > 0 ? shipName : null,
        containerNumber: containerNumber && containerNumber.length > 0 ? containerNumber : null,
        transportReference:
          transportReference && transportReference.length > 0 ? transportReference : null,
        notes: purchaseOrder.notes?.trim() ? purchaseOrder.notes.trim() : null,
        status: mapTalosStatus(String(purchaseOrder.status)),
        batchTableRows: {
          create: batchRows.map((row) => ({
            productId: productBySku.get(row.skuCode)!,
            quantity: row.quantity,
            batchCode: row.batchCode,
          })),
        },
      },
      select: { id: true, orderCode: true, quantity: true },
    });

    return NextResponse.json({
      order: { id: created.id, orderCode: created.orderCode, quantity: created.quantity },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json(
        { error: 'A purchase order with this code already exists.' },
        { status: 409 },
      );
    }
    console.error('[POST /purchase-orders/import-talos] error:', error);
    return NextResponse.json({ error: 'Unable to import purchase order' }, { status: 500 });
  }
});
