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

const bodySchema = z
  .object({
    strategyId: z.string().min(1),
    reference: z.string().trim().min(1).optional(),
    references: z.array(z.string().trim().min(1)).max(500).optional(),
    orderCode: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    const hasReference = Boolean(value.reference?.trim());
    const hasReferences = Array.isArray(value.references) && value.references.length > 0;

    if (!hasReference && !hasReferences) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'reference or references is required',
        path: ['reference'],
      });
    }

    if (hasReference && hasReferences) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide either reference or references, not both',
        path: ['references'],
      });
    }

    if ((value.references?.length ?? 0) > 1 && value.orderCode?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'orderCode override only supports a single purchase order import',
        path: ['orderCode'],
      });
    }
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
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, '');
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

type ImportFailure = {
  reference: string;
  orderCode: string | null;
  error: string;
};

type CreatedOrderSummary = {
  id: string;
  orderCode: string;
  quantity: number;
  reference: string;
};

type TalosPurchaseOrderLine = {
  skuCode: string;
  unitsOrdered: number;
  lotRef?: string | null;
};

type TalosPurchaseOrderContainer = {
  containerNumber?: string | null;
};

type TalosPurchaseOrderRecord = {
  id: string;
  poNumber: string | null;
  orderNumber: string;
  status: string;
  createdAt: Date;
  manufacturingStartDate?: Date | null;
  manufacturingStart?: Date | null;
  actualCompletionDate?: Date | null;
  expectedCompletionDate?: Date | null;
  expectedDate?: Date | null;
  manufacturingEnd?: Date | null;
  actualDeparture?: Date | null;
  estimatedDeparture?: Date | null;
  actualArrival?: Date | null;
  estimatedArrival?: Date | null;
  receivedDate?: Date | null;
  customsClearedDate?: Date | null;
  deliveredDate?: Date | null;
  vesselName?: string | null;
  masterBillOfLading?: string | null;
  houseBillOfLading?: string | null;
  notes?: string | null;
  lines: TalosPurchaseOrderLine[];
  containers: TalosPurchaseOrderContainer[];
};

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

  const references = Array.from(
    new Set(
      (parsed.data.references ?? [parsed.data.reference ?? ''])
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
  const orderCodeOverride = parsed.data.orderCode?.trim();

  let talosPurchaseOrders: TalosPurchaseOrderRecord[] = [];
  const notFoundFailures: ImportFailure[] = [];

  if (references.length === 1) {
    const reference = references[0];
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

    talosPurchaseOrders = [purchaseOrder as TalosPurchaseOrderRecord];
  } else {
    const orders = await talos.purchaseOrder.findMany({
      where: { id: { in: references } },
      include: { lines: true, containers: true },
    });

    const orderById = new Map(orders.map((order) => [order.id, order as TalosPurchaseOrderRecord]));
    talosPurchaseOrders = references.flatMap((reference) => {
      const match = orderById.get(reference);
      if (match) return [match];
      notFoundFailures.push({
        reference,
        orderCode: null,
        error: 'Talos purchase order not found',
      });
      return [];
    });
  }

  const stageDefaultsRows = await prisma.businessParameter.findMany({
    where: { strategyId, label: { in: STAGE_DEFAULT_LABEL_SET } },
    select: { label: true, valueNumeric: true },
  });
  const stageDefaults = buildStageDefaultsMap(stageDefaultsRows);

  const weekStartsOn = weekStartsOnForRegion(region);
  const planning = await loadPlanningCalendar(weekStartsOn);
  const calendar = planning.calendar;

  const allSkuCodes = Array.from(
    new Set(
      talosPurchaseOrders.flatMap((purchaseOrder) =>
        purchaseOrder.lines
          .map((line) => line.skuCode.trim())
          .filter((skuCode) => skuCode.length > 0),
      ),
    ),
  );
  const products = await prisma.product.findMany({
    where: { strategyId, sku: { in: allSkuCodes } },
    select: { id: true, sku: true },
  });
  const productBySku = new Map(products.map((product) => [product.sku, product.id]));

  const buildFailure = (
    purchaseOrder: TalosPurchaseOrderRecord,
    error: string,
    orderCode?: string | null,
  ): ImportFailure => ({
    reference: purchaseOrder.id,
    orderCode: orderCode ?? purchaseOrder.poNumber?.trim() ?? purchaseOrder.orderNumber.trim(),
    error,
  });

  const buildPurchaseOrderCreateData = ({
    purchaseOrder,
    resolvedOrderCode,
    primaryProductId,
    poDate,
    poWeekNumber,
    productionStart,
    productionComplete,
    productionCompleteWeekNumber,
    sourceDeparture,
    sourceDepartureWeekNumber,
    portEta,
    portEtaWeekNumber,
    availableDate,
    availableWeekNumber,
    batchRows,
  }: {
    purchaseOrder: TalosPurchaseOrderRecord;
    resolvedOrderCode: string;
    primaryProductId: string;
    poDate: Date | null;
    poWeekNumber: number | null;
    productionStart: Date | null;
    productionComplete: Date | null;
    productionCompleteWeekNumber: number | null;
    sourceDeparture: Date | null;
    sourceDepartureWeekNumber: number | null;
    portEta: Date | null;
    portEtaWeekNumber: number | null;
    availableDate: Date | null;
    availableWeekNumber: number | null;
    batchRows: Array<{ skuCode: string; batchCode: string | null; quantity: number }>;
  }) => {
    const shipName = purchaseOrder.vesselName?.trim();
    const containerNumber = purchaseOrder.containers
      .map((container) =>
        typeof container.containerNumber === 'string' ? container.containerNumber.trim() : '',
      )
      .filter((value) => value.length > 0)
      .join(', ');
    const transportReferenceRaw = purchaseOrder.masterBillOfLading
      ? purchaseOrder.masterBillOfLading
      : purchaseOrder.houseBillOfLading;
    const transportReference = transportReferenceRaw?.trim();

    return {
      strategyId,
      productId: primaryProductId,
      orderCode: resolvedOrderCode,
      quantity: purchaseOrder.lines.reduce((sum, line) => sum + line.unitsOrdered, 0),
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
    };
  };

  const buildCreateData = (
    purchaseOrder: TalosPurchaseOrderRecord,
    resolvedOrderCode: string,
  ): { error: string } | { data: ReturnType<typeof buildPurchaseOrderCreateData> } => {
    const skuCodes = Array.from(
      new Set(
        purchaseOrder.lines
          .map((line) => line.skuCode.trim())
          .filter((skuCode) => skuCode.length > 0),
      ),
    );
    const missingSkus = skuCodes.filter((skuCode) => !productBySku.has(skuCode));
    if (missingSkus.length > 0) {
      return { error: `Create these products in X-Plan first: ${missingSkus.join(', ')}` } as const;
    }

    const primaryLine = purchaseOrder.lines.find((line) => line.skuCode.trim().length > 0) ?? null;
    const primarySku = primaryLine?.skuCode.trim() ?? '';
    const primaryProductId = primarySku ? productBySku.get(primarySku) : null;
    if (!primaryProductId) {
      return { error: `Missing X-Plan product for sku "${primarySku}"` } as const;
    }

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
    const portEta = toUtcDateOnly(
      purchaseOrder.actualArrival ?? purchaseOrder.estimatedArrival ?? null,
    );
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
    const sourceDepartureWeekNumber = sourceDeparture
      ? weekNumberForDate(sourceDeparture, calendar)
      : null;
    const portEtaWeekNumber = portEta ? weekNumberForDate(portEta, calendar) : null;
    const availableWeekNumber = availableDate ? weekNumberForDate(availableDate, calendar) : null;

    const batchRows = purchaseOrder.lines
      .map((line) => ({
        skuCode: line.skuCode.trim(),
        batchCode: line.lotRef?.trim() ? line.lotRef.trim() : null,
        quantity: line.unitsOrdered,
      }))
      .filter((row) => row.skuCode.length > 0);

    return {
      data: buildPurchaseOrderCreateData({
        purchaseOrder,
        resolvedOrderCode,
        primaryProductId,
        poDate,
        poWeekNumber,
        productionStart,
        productionComplete,
        productionCompleteWeekNumber,
        sourceDeparture,
        sourceDepartureWeekNumber,
        portEta,
        portEtaWeekNumber,
        availableDate,
        availableWeekNumber,
        batchRows,
      }),
    };
  };

  const preferredOrderCodes = talosPurchaseOrders.map((purchaseOrder, index) => {
    const preferredCodeRaw = purchaseOrder.poNumber
      ? purchaseOrder.poNumber
      : purchaseOrder.orderNumber;
    const preferredCode = preferredCodeRaw.trim();
    const resolvedOrderCode =
      orderCodeOverride && references.length === 1 && index === 0
        ? orderCodeOverride
        : preferredCode;
    return { reference: purchaseOrder.id, orderCode: resolvedOrderCode };
  });
  const existingOrders = await prisma.purchaseOrder.findMany({
    where: {
      strategyId,
      orderCode: { in: preferredOrderCodes.map((entry) => entry.orderCode) },
    },
    select: { orderCode: true },
  });
  const existingOrderCodes = new Set(existingOrders.map((order) => order.orderCode));
  const reservedOrderCodes = new Set<string>();
  const createdOrders: CreatedOrderSummary[] = [];
  const failed: ImportFailure[] = [...notFoundFailures];

  try {
    for (const purchaseOrder of talosPurchaseOrders) {
      const talosStatusNormalized = String(purchaseOrder.status)
        .trim()
        .toUpperCase()
        .replace(/[^A-Z_]/g, '');
      if (TALOS_IMPORT_DISALLOWED_STATUS_VALUES.has(talosStatusNormalized)) {
        const message = `Talos purchase order is ${talosStatusNormalized} and cannot be imported`;
        if (references.length === 1) {
          return NextResponse.json({ error: message }, { status: 400 });
        }
        failed.push(buildFailure(purchaseOrder, message));
        continue;
      }

      if (!Array.isArray(purchaseOrder.lines) || purchaseOrder.lines.length === 0) {
        if (references.length === 1) {
          return NextResponse.json(
            { error: 'Talos purchase order has no line items' },
            { status: 400 },
          );
        }
        failed.push(buildFailure(purchaseOrder, 'Talos purchase order has no line items'));
        continue;
      }

      const preferredCodeRaw = purchaseOrder.poNumber
        ? purchaseOrder.poNumber
        : purchaseOrder.orderNumber;
      const preferredCode = preferredCodeRaw.trim();
      const resolvedOrderCode =
        orderCodeOverride && references.length === 1 ? orderCodeOverride : preferredCode;

      if (!resolvedOrderCode) {
        if (references.length === 1) {
          return NextResponse.json(
            { error: 'Talos purchase order is missing a usable order code' },
            { status: 400 },
          );
        }
        failed.push(
          buildFailure(purchaseOrder, 'Talos purchase order is missing a usable order code'),
        );
        continue;
      }

      if (existingOrderCodes.has(resolvedOrderCode) || reservedOrderCodes.has(resolvedOrderCode)) {
        if (references.length === 1) {
          return NextResponse.json(
            { error: 'A purchase order with this code already exists.' },
            { status: 409 },
          );
        }
        failed.push(
          buildFailure(
            purchaseOrder,
            'A purchase order with this code already exists.',
            resolvedOrderCode,
          ),
        );
        continue;
      }

      const createData = buildCreateData(purchaseOrder, resolvedOrderCode);
      if ('error' in createData) {
        if (references.length === 1) {
          return NextResponse.json({ error: createData.error }, { status: 400 });
        }
        failed.push(buildFailure(purchaseOrder, createData.error, resolvedOrderCode));
        continue;
      }

      try {
        const created = await prisma.purchaseOrder.create({
          data: createData.data,
          select: { id: true, orderCode: true, quantity: true },
        });
        reservedOrderCodes.add(created.orderCode);
        createdOrders.push({
          id: created.id,
          orderCode: created.orderCode,
          quantity: Number(created.quantity),
          reference: purchaseOrder.id,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          if (references.length === 1) {
            return NextResponse.json(
              { error: 'A purchase order with this code already exists.' },
              { status: 409 },
            );
          }
          failed.push(
            buildFailure(
              purchaseOrder,
              'A purchase order with this code already exists.',
              resolvedOrderCode,
            ),
          );
          continue;
        }

        if (references.length === 1) {
          throw error;
        }

        console.error('[POST /purchase-orders/import-talos] error:', error);
        failed.push(
          buildFailure(purchaseOrder, 'Unable to import purchase order', resolvedOrderCode),
        );
      }
    }

    if (references.length === 1) {
      const created = createdOrders[0];
      if (!created) {
        return NextResponse.json({ error: 'Unable to import purchase order' }, { status: 500 });
      }
      return NextResponse.json({
        order: { id: created.id, orderCode: created.orderCode, quantity: created.quantity },
        createdOrders,
        importedCount: createdOrders.length,
        failed,
        failedCount: failed.length,
      });
    }

    const ok = createdOrders.length > 0;
    return NextResponse.json(
      {
        order:
          createdOrders[0] == null
            ? null
            : {
                id: createdOrders[0].id,
                orderCode: createdOrders[0].orderCode,
                quantity: createdOrders[0].quantity,
              },
        createdOrders,
        importedCount: createdOrders.length,
        failed,
        failedCount: failed.length,
        error: ok ? undefined : 'None of the selected purchase orders could be imported',
      },
      { status: ok ? 200 : 400 },
    );
  } catch (error) {
    console.error('[POST /purchase-orders/import-talos] error:', error);
    return NextResponse.json({ error: 'Unable to import purchase order' }, { status: 500 });
  }
});
