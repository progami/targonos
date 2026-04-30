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

type ProductSkuRow = {
  id: string;
  sku: string | null;
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

function normalizeSkuKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function buildProductBySku(products: ProductSkuRow[]): Map<string, string> {
  const productBySku = new Map<string, string>();
  for (const product of products) {
    const sku = product.sku?.trim();
    if (!sku) continue;
    const normalizedSku = normalizeSkuKey(sku);
    const keys = normalizedSku === sku ? [sku] : [sku, normalizedSku];
    for (const key of keys) {
      const existingProductId = productBySku.get(key);
      if (existingProductId && existingProductId !== product.id) {
        throw new Error(`Ambiguous X-Plan product SKU mapping for "${sku}"`);
      }
      productBySku.set(key, product.id);
    }
  }
  return productBySku;
}

function resolveProductIdForSku(productBySku: Map<string, string>, skuCode: string): string | null {
  const exact = productBySku.get(skuCode);
  if (exact) return exact;
  const normalizedSku = normalizeSkuKey(skuCode);
  if (!normalizedSku) return null;
  return productBySku.get(normalizedSku) ?? null;
}

function toUtcDateOnly(value: Date | null | undefined): Date | null {
  if (!value) return null;
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth();
  const day = value.getUTCDate();
  const date = new Date(Date.UTC(year, month, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

const XPLAN_STATUS_VALUES = new Set<string>([
  'ISSUED',
  'MANUFACTURING',
  'OCEAN',
  'WAREHOUSE',
  'CANCELLED',
]);
const TALOS_SOURCE_SYSTEM = 'TALOS';
const MIGRATION_NOTE_PREFIX = 'Migrated from ';

function isMigratedPurchaseOrder(row: {
  sourceSystem: string | null;
  notes: string | null;
}): boolean {
  return row.sourceSystem == null && row.notes != null && row.notes.startsWith(MIGRATION_NOTE_PREFIX);
}

function mapTalosStatus(value: string): XPlanPurchaseOrderStatus {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z_]/g, '');
  if (XPLAN_STATUS_VALUES.has(normalized)) {
    return normalized as XPlanPurchaseOrderStatus;
  }

  switch (normalized) {
    case 'RFQ':
    case 'AWAITING_PROOF':
    case 'REVIEW':
    case 'POSTED':
      return 'ISSUED';
    case 'CLOSED':
    case 'ARCHIVED':
    case 'REJECTED':
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      throw new Error(`Unsupported Talos purchase order status "${value}"`);
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

const ORDER_CODE_CONFLICT_SELECT = {
  id: true,
  orderCode: true,
  sourceSystem: true,
  notes: true,
} as const;

type OrderCodeConflictRow = {
  id: string;
  orderCode: string;
  sourceSystem: string | null;
  notes: string | null;
};

type TalosPurchaseOrderLine = {
  id: string;
  skuCode: string;
  unitsOrdered: number;
  quantity: number;
  lotRef?: string | null;
  unitsPerCarton?: number | null;
  cartonSide1Cm?: unknown;
  cartonSide2Cm?: unknown;
  cartonSide3Cm?: unknown;
  cartonWeightKg?: unknown;
  unitCost?: unknown;
};

type TalosPurchaseOrderContainer = {
  containerNumber?: string | null;
};

type TalosPurchaseOrderRecord = {
  id: string;
  inboundNumber: string | null;
  orderNumber: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  totalCartons?: number | null;
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

type TalosBatchCreateRow = {
  skuCode: string;
  productId: string;
  batchCode: string | null;
  quantity: number;
  sourceSystem: string;
  sourceLineId: string;
  sourceUpdatedAt: Date;
  unitsPerCarton: number | null;
  cartonSide1Cm: number | null;
  cartonSide2Cm: number | null;
  cartonSide3Cm: number | null;
  cartonWeightKg: number | null;
  overrideManufacturingCost: number | null;
};

function talosOrderReference(purchaseOrder: TalosPurchaseOrderRecord): string {
  const inboundNumber = purchaseOrder.inboundNumber?.trim();
  if (inboundNumber && inboundNumber.length > 0) return inboundNumber;
  return purchaseOrder.orderNumber.trim();
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateTalosCartonTotals(purchaseOrder: TalosPurchaseOrderRecord): string | null {
  const expectedCartons = purchaseOrder.totalCartons;
  if (expectedCartons == null) return null;

  const lineCartons = purchaseOrder.lines.reduce((sum, line) => sum + line.quantity, 0);
  if (lineCartons === expectedCartons) return null;

  return `Talos line carton total (${lineCartons}) does not match PO total cartons (${expectedCartons})`;
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
    const purchaseOrder = await talos.inboundOrder.findUnique({
      where: { id: reference },
      include: { lines: true, containers: true },
    });

    if (!purchaseOrder) {
      return NextResponse.json({ error: 'Talos purchase order not found' }, { status: 404 });
    }

    talosPurchaseOrders = [purchaseOrder as TalosPurchaseOrderRecord];
  } else {
    const orders = await talos.inboundOrder.findMany({
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

  const products = await prisma.product.findMany({
    where: { strategyId },
    select: { id: true, sku: true },
  });
  const productBySku = buildProductBySku(products);

  const buildFailure = (
    purchaseOrder: TalosPurchaseOrderRecord,
    error: string,
    orderCode?: string | null,
  ): ImportFailure => ({
    reference: purchaseOrder.id,
    orderCode: orderCode ?? talosOrderReference(purchaseOrder),
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
    batchRows: TalosBatchCreateRow[];
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
      sourceSystem: TALOS_SOURCE_SYSTEM,
      sourceId: purchaseOrder.id,
      sourceReference: talosOrderReference(purchaseOrder),
      sourceUpdatedAt: purchaseOrder.updatedAt,
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
          productId: row.productId,
          quantity: row.quantity,
          batchCode: row.batchCode,
          sourceSystem: row.sourceSystem,
          sourceLineId: row.sourceLineId,
          sourceUpdatedAt: row.sourceUpdatedAt,
          unitsPerCarton: row.unitsPerCarton,
          cartonSide1Cm: row.cartonSide1Cm,
          cartonSide2Cm: row.cartonSide2Cm,
          cartonSide3Cm: row.cartonSide3Cm,
          cartonWeightKg: row.cartonWeightKg,
          overrideManufacturingCost: row.overrideManufacturingCost,
        })),
      },
    };
  };

  const buildCreateData = (
    purchaseOrder: TalosPurchaseOrderRecord,
    resolvedOrderCode: string,
  ): { error: string } | { data: ReturnType<typeof buildPurchaseOrderCreateData> } => {
    const cartonTotalError = validateTalosCartonTotals(purchaseOrder);
    if (cartonTotalError) return { error: cartonTotalError } as const;

    const skuCodes = Array.from(
      new Set(
        purchaseOrder.lines
          .map((line) => line.skuCode.trim())
          .filter((skuCode) => skuCode.length > 0),
      ),
    );
    const missingSkus = skuCodes.filter((skuCode) => !resolveProductIdForSku(productBySku, skuCode));
    if (missingSkus.length > 0) {
      return { error: `Create these products in X-Plan first: ${missingSkus.join(', ')}` } as const;
    }

    const primaryLine = purchaseOrder.lines.find((line) => line.skuCode.trim().length > 0) ?? null;
    const primarySku = primaryLine?.skuCode.trim() ?? '';
    const primaryProductId = primarySku ? resolveProductIdForSku(productBySku, primarySku) : null;
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
      .map((line): TalosBatchCreateRow => {
        const skuCode = line.skuCode.trim();
        return {
          skuCode,
          productId: resolveProductIdForSku(productBySku, skuCode)!,
          batchCode: line.lotRef?.trim() ? line.lotRef.trim() : null,
          quantity: line.unitsOrdered,
          sourceSystem: TALOS_SOURCE_SYSTEM,
          sourceLineId: line.id,
          sourceUpdatedAt: purchaseOrder.updatedAt,
          unitsPerCarton: line.unitsPerCarton ?? null,
          cartonSide1Cm: toOptionalNumber(line.cartonSide1Cm),
          cartonSide2Cm: toOptionalNumber(line.cartonSide2Cm),
          cartonSide3Cm: toOptionalNumber(line.cartonSide3Cm),
          cartonWeightKg: toOptionalNumber(line.cartonWeightKg),
          overrideManufacturingCost: toOptionalNumber(line.unitCost),
        };
      })
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

  const reservedOrderCodes = new Set<string>();
  const createdOrders: CreatedOrderSummary[] = [];
  const failed: ImportFailure[] = [...notFoundFailures];

  try {
    for (const purchaseOrder of talosPurchaseOrders) {
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

      const preferredCode = talosOrderReference(purchaseOrder);
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

      const existingSourceOrder = await prisma.purchaseOrder.findUnique({
        where: {
          strategyId_sourceSystem_sourceId: {
            strategyId,
            sourceSystem: TALOS_SOURCE_SYSTEM,
            sourceId: purchaseOrder.id,
          },
        },
        select: { id: true, orderCode: true },
      });
      let persistedTarget: { id: string; orderCode: string } | null = existingSourceOrder;

      if (!persistedTarget && reservedOrderCodes.has(resolvedOrderCode)) {
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

      if (!persistedTarget) {
        const orderCodeConflict = (await prisma.purchaseOrder.findUnique({
          where: { strategyId_orderCode: { strategyId, orderCode: resolvedOrderCode } },
          select: ORDER_CODE_CONFLICT_SELECT,
        })) as OrderCodeConflictRow | null;
        if (orderCodeConflict) {
          if (isMigratedPurchaseOrder(orderCodeConflict)) {
            persistedTarget = { id: orderCodeConflict.id, orderCode: orderCodeConflict.orderCode };
          } else {
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
        }
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
        const persisted = persistedTarget
          ? await prisma.purchaseOrder.update({
              where: { id: persistedTarget.id },
              data: {
                ...createData.data,
                batchTableRows: {
                  deleteMany: {},
                  create: createData.data.batchTableRows.create,
                },
              },
              select: { id: true, orderCode: true, quantity: true },
            })
          : await prisma.purchaseOrder.create({
              data: createData.data,
              select: { id: true, orderCode: true, quantity: true },
            });
        reservedOrderCodes.add(persisted.orderCode);
        createdOrders.push({
          id: persisted.id,
          orderCode: persisted.orderCode,
          quantity: Number(persisted.quantity),
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
