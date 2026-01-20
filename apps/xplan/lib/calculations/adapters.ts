import type {
  Product,
  LeadStageTemplate,
  LeadTimeOverride,
  BusinessParameter,
  PurchaseOrder,
  PurchaseOrderPayment,
  BatchTableRow,
  SalesWeek,
  ProfitAndLossWeek,
  CashFlowWeek,
  PurchaseOrderStatus,
} from '@targon/prisma-xplan';
import { coerceNumber, parseNumber } from '@/lib/utils/numbers';
import {
  BusinessParameterInput,
  CashFlowWeekInput,
  LeadStageOverrideInput,
  LeadStageTemplateInput,
  ProductInput,
  ProfitAndLossWeekInput,
  PurchaseOrderInput,
  PurchaseOrderPaymentInput,
  BatchTableRowInput,
  SalesWeekInput,
} from './types';

function normalizePositiveDecimal(value: unknown): number | null {
  const numeric = parseNumber(value);
  if (numeric == null || !Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

export function mapProducts(products: Product[]): ProductInput[] {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku ?? '',
    sellingPrice: coerceNumber(product.sellingPrice),
    manufacturingCost: coerceNumber(product.manufacturingCost),
    freightCost: coerceNumber(product.freightCost),
    tariffRate: coerceNumber(product.tariffRate),
    tacosPercent: coerceNumber(product.tacosPercent),
    fbaFee: coerceNumber(product.fbaFee),
    amazonReferralRate: coerceNumber(product.amazonReferralRate),
    storagePerMonth: coerceNumber(product.storagePerMonth),
  }));
}

export function mapLeadStageTemplates(stages: LeadStageTemplate[]): LeadStageTemplateInput[] {
  return stages.map((stage) => ({
    id: stage.id,
    label: stage.label,
    defaultWeeks: coerceNumber(stage.defaultWeeks),
    sequence: stage.sequence,
  }));
}

export function mapLeadOverrides(overrides: LeadTimeOverride[]): LeadStageOverrideInput[] {
  return overrides.map((override) => ({
    productId: override.productId,
    stageTemplateId: override.stageTemplateId,
    durationWeeks: coerceNumber(override.durationWeeks),
  }));
}

export function mapBusinessParameters(parameters: BusinessParameter[]): BusinessParameterInput[] {
  return parameters.map((parameter) => ({
    id: parameter.id,
    label: parameter.label,
    valueNumeric: parameter.valueNumeric != null ? coerceNumber(parameter.valueNumeric) : undefined,
    valueText: parameter.valueText ?? undefined,
  }));
}

export function mapPurchaseOrders(
  orders: Array<
    PurchaseOrder & { payments: PurchaseOrderPayment[]; batchTableRows: BatchTableRow[] }
  >,
): PurchaseOrderInput[] {
  return orders.map((order) => {
    const batches = Array.isArray(order.batchTableRows)
      ? (order.batchTableRows as BatchTableRow[]).map(
          (batch): BatchTableRowInput => ({
            id: batch.id,
            purchaseOrderId: batch.purchaseOrderId,
            batchCode: batch.batchCode ?? undefined,
            productId: batch.productId,
            quantity: coerceNumber(batch.quantity),
            overrideSellingPrice:
              batch.overrideSellingPrice != null ? Number(batch.overrideSellingPrice) : null,
            overrideManufacturingCost:
              batch.overrideManufacturingCost != null
                ? Number(batch.overrideManufacturingCost)
                : null,
            overrideFreightCost:
              batch.overrideFreightCost != null ? Number(batch.overrideFreightCost) : null,
            overrideTariffRate:
              batch.overrideTariffRate != null ? Number(batch.overrideTariffRate) : null,
            overrideTariffCost:
              batch.overrideTariffCost != null ? Number(batch.overrideTariffCost) : null,
            overrideTacosPercent:
              batch.overrideTacosPercent != null ? Number(batch.overrideTacosPercent) : null,
            overrideFbaFee: batch.overrideFbaFee != null ? Number(batch.overrideFbaFee) : null,
            overrideReferralRate:
              batch.overrideReferralRate != null ? Number(batch.overrideReferralRate) : null,
            overrideStoragePerMonth:
              batch.overrideStoragePerMonth != null ? Number(batch.overrideStoragePerMonth) : null,
          }),
        )
      : [];

    const primaryBatch = batches[0];
    const totalBatchQuantity = batches.reduce((sum, batch) => sum + (batch.quantity ?? 0), 0);

    return {
      id: order.id,
      orderCode: order.orderCode,
      productId: primaryBatch?.productId ?? order.productId,
      quantity: batches.length > 0 ? totalBatchQuantity : coerceNumber(order.quantity),
      poDate: order.poDate ?? null,
      poWeekNumber: order.poWeekNumber ?? null,
      productionWeeks: normalizePositiveDecimal(order.productionWeeks),
      sourceWeeks: normalizePositiveDecimal(order.sourceWeeks),
      oceanWeeks: normalizePositiveDecimal(order.oceanWeeks),
      finalWeeks: normalizePositiveDecimal(order.finalWeeks),
      pay1Percent: order.pay1Percent != null ? coerceNumber(order.pay1Percent) : null,
      pay2Percent: order.pay2Percent != null ? coerceNumber(order.pay2Percent) : null,
      pay3Percent: order.pay3Percent != null ? coerceNumber(order.pay3Percent) : null,
      pay1Amount: order.pay1Amount != null ? coerceNumber(order.pay1Amount) : null,
      pay2Amount: order.pay2Amount != null ? coerceNumber(order.pay2Amount) : null,
      pay3Amount: order.pay3Amount != null ? coerceNumber(order.pay3Amount) : null,
      pay1Date: order.pay1Date ?? null,
      pay2Date: order.pay2Date ?? null,
      pay3Date: order.pay3Date ?? null,
      productionStart: order.productionStart ?? null,
      productionComplete: order.productionComplete ?? null,
      productionCompleteWeekNumber: order.productionCompleteWeekNumber ?? null,
      sourceDeparture: order.sourceDeparture ?? null,
      sourceDepartureWeekNumber: order.sourceDepartureWeekNumber ?? null,
      transportReference:
        typeof order.transportReference === 'string'
          ? order.transportReference
          : order.transportReference != null
            ? String(order.transportReference)
            : null,
      createdAt: order.createdAt ?? null,
      shipName: order.shipName ?? null,
      containerNumber: order.containerNumber ?? null,
      portEta: order.portEta ?? null,
      portEtaWeekNumber: order.portEtaWeekNumber ?? null,
      inboundEta: order.inboundEta ?? null,
      inboundEtaWeekNumber: order.inboundEtaWeekNumber ?? null,
      availableDate: order.availableDate ?? null,
      availableWeekNumber: order.availableWeekNumber ?? null,
      totalLeadDays: order.totalLeadDays ?? null,
      status: (typeof order.status === 'string' ? order.status : 'ISSUED') as PurchaseOrderStatus,
      statusIcon: typeof order.statusIcon === 'string' ? order.statusIcon : null,
      notes:
        typeof order.notes === 'string'
          ? order.notes
          : order.notes != null
            ? String(order.notes)
            : null,
      overrideSellingPrice:
        order.overrideSellingPrice != null ? coerceNumber(order.overrideSellingPrice) : null,
      overrideManufacturingCost:
        order.overrideManufacturingCost != null
          ? coerceNumber(order.overrideManufacturingCost)
          : null,
      overrideFreightCost:
        order.overrideFreightCost != null ? coerceNumber(order.overrideFreightCost) : null,
      overrideTariffRate:
        order.overrideTariffRate != null ? coerceNumber(order.overrideTariffRate) : null,
      overrideTacosPercent:
        order.overrideTacosPercent != null ? coerceNumber(order.overrideTacosPercent) : null,
      overrideFbaFee: order.overrideFbaFee != null ? coerceNumber(order.overrideFbaFee) : null,
      overrideReferralRate:
        order.overrideReferralRate != null ? coerceNumber(order.overrideReferralRate) : null,
      overrideStoragePerMonth:
        order.overrideStoragePerMonth != null ? coerceNumber(order.overrideStoragePerMonth) : null,
      payments: Array.isArray(order.payments)
        ? (order.payments as PurchaseOrderPayment[]).map(
            (payment): PurchaseOrderPaymentInput => ({
              paymentIndex: payment.paymentIndex,
              percentage: payment.percentage != null ? coerceNumber(payment.percentage) : null,
              amountExpected:
                payment.amountExpected != null ? coerceNumber(payment.amountExpected) : null,
              amountPaid: payment.amountPaid != null ? coerceNumber(payment.amountPaid) : null,
              category: payment.category ?? null,
              label: payment.label ?? null,
              dueDate: payment.dueDate ?? null,
              dueWeekNumber: payment.dueWeekNumber ?? null,
              dueDateDefault: payment.dueDateDefault ?? null,
              dueWeekNumberDefault: payment.dueWeekNumberDefault ?? null,
              dueDateSource: payment.dueDateSource ?? 'SYSTEM',
            }),
          )
        : [],
      batchTableRows: batches,
    } as PurchaseOrderInput;
  });
}

export function mapSalesWeeks(rows: SalesWeek[]): SalesWeekInput[] {
  return rows.map((row) => {
    const explicitHasActualData = (row as SalesWeek & { hasActualData?: boolean }).hasActualData;
    const hasActualData =
      explicitHasActualData === true ? true : row.actualSales != null;
    return {
      id: row.id,
      productId: row.productId,
      weekNumber: row.weekNumber,
      weekDate: row.weekDate,
      stockStart: row.stockStart ?? null,
      actualSales: row.actualSales ?? null,
      forecastSales: row.forecastSales ?? null,
      systemForecastSales: row.systemForecastSales ?? null,
      systemForecastVersion: row.systemForecastVersion ?? null,
      finalSales: row.finalSales ?? null,
      stockWeeks: row.stockWeeks != null ? coerceNumber(row.stockWeeks) : null,
      stockEnd: row.stockEnd ?? null,
      hasActualData,
    };
  });
}

export function mapProfitAndLossWeeks(rows: ProfitAndLossWeek[]): ProfitAndLossWeekInput[] {
  return rows.map((row) => ({
    id: row.id,
    weekNumber: row.weekNumber,
    weekDate: row.weekDate,
    units: row.units ?? null,
    revenue: row.revenue != null ? coerceNumber(row.revenue) : null,
    cogs: row.cogs != null ? coerceNumber(row.cogs) : null,
    grossProfit: row.grossProfit != null ? coerceNumber(row.grossProfit) : null,
    grossMargin: row.grossMargin != null ? coerceNumber(row.grossMargin) : null,
    amazonFees: row.amazonFees != null ? coerceNumber(row.amazonFees) : null,
    ppcSpend: row.ppcSpend != null ? coerceNumber(row.ppcSpend) : null,
    fixedCosts: row.fixedCosts != null ? coerceNumber(row.fixedCosts) : null,
    totalOpex: row.totalOpex != null ? coerceNumber(row.totalOpex) : null,
    netProfit: row.netProfit != null ? coerceNumber(row.netProfit) : null,
  }));
}

export function mapCashFlowWeeks(rows: CashFlowWeek[]): CashFlowWeekInput[] {
  return rows.map((row) => ({
    id: row.id,
    weekNumber: row.weekNumber,
    weekDate: row.weekDate,
    amazonPayout: row.amazonPayout != null ? coerceNumber(row.amazonPayout) : null,
    inventorySpend: row.inventorySpend != null ? coerceNumber(row.inventorySpend) : null,
    fixedCosts: row.fixedCosts != null ? coerceNumber(row.fixedCosts) : null,
    netCash: row.netCash != null ? coerceNumber(row.netCash) : null,
    cashBalance: row.cashBalance != null ? coerceNumber(row.cashBalance) : null,
  }));
}
