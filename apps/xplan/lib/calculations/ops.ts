import {
  coerceNumber,
  coercePercent,
  parseNumber,
  parsePercent,
  roundWeeks,
} from '@/lib/utils/numbers';
import { getCalendarDateForWeek, weekNumberForDate, type WeekCalendar } from './calendar';
import {
  BusinessParameterMap,
  LeadTimeProfile,
  PurchaseOrderInput,
  PurchaseOrderPaymentInput,
  PurchaseOrderStatus,
} from './types';
import { ProductCostSummary } from './product';
import {
  planningWeekDateForWeekNumber,
  planningWeekNumberForDate,
  type PlanningWeekConfig,
} from './planning-week';
import { isRemovedPaymentCategory } from '@/lib/payments';

export type PaymentCategory = 'MANUFACTURING' | 'FREIGHT' | 'TARIFF' | 'OTHER';

export interface PaymentPlanItem {
  paymentIndex: number;
  category: PaymentCategory;
  label: string;
  plannedPercent: number;
  plannedAmount: number;
  plannedWeekNumber: number | null;
  plannedDefaultWeekNumber: number | null;
  plannedDate: Date | null;
  plannedDefaultDate: Date | null;
  actualPercent?: number | null;
  actualAmount?: number | null;
  actualWeekNumber?: number | null;
  actualDate?: Date | null;
}

export interface PurchaseOrderBatchDerived {
  batchCode?: string | null;
  productId: string;
  quantity: number;
  sellingPrice: number;
  manufacturingCost: number;
  freightCost: number;
  tariffRate: number;
  tacosPercent: number;
  fbaFee: number;
  amazonReferralRate: number;
  storagePerMonth: number;
  landedUnitCost: number;
}

export interface PurchaseOrderDerived {
  id: string;
  orderCode: string;
  productId: string;
  quantity: number;
  batches: PurchaseOrderBatchDerived[];
  status: PurchaseOrderStatus;
  statusIcon?: string | null;
  notes?: string | null;
  shipName?: string | null;
  containerNumber?: string | null;
  createdAt?: Date | null;
  stageProfile: LeadTimeProfile;
  poWeekNumber: number | null;
  productionStartWeekNumber: number | null;
  productionCompleteWeekNumber: number | null;
  sourceDepartureWeekNumber: number | null;
  portEtaWeekNumber: number | null;
  inboundEtaWeekNumber: number | null;
  availableWeekNumber: number | null;
  productionStart: Date | null;
  productionComplete: Date | null;
  sourceDeparture: Date | null;
  transportReference: string | null;
  portEta: Date | null;
  inboundEta: Date | null;
  availableDate: Date | null;
  totalLeadDays: number | null;
  weeksUntilArrival: number | null;
  // Per-unit costs (weighted average from batches)
  sellingPrice: number;
  manufacturingCost: number;
  freightCost: number;
  tariffRate: number;
  tacosPercent: number;
  fbaFee: number;
  amazonReferralRate: number;
  storagePerMonth: number;
  landedUnitCost: number;
  // Totals
  manufacturingCostTotal: number;
  freightCostTotal: number;
  tariffCostTotal: number;
  supplierCostTotal: number;
  plannedPoValue: number;
  plannedPayments: PaymentPlanItem[];
  payments: PurchaseOrderPaymentInput[];
  paidAmount: number;
  paidPercent: number;
  remainingAmount: number;
  remainingPercent: number;
}

const STATUS_ICON_MAP: Record<PurchaseOrderStatus, string> = {
  DRAFT: '📝',
  ISSUED: '📤',
  MANUFACTURING: '🛠',
  OCEAN: '🚢',
  WAREHOUSE: '📦',
  SHIPPED: '🚚',
};

const PAY_PERCENT_FIELDS = ['pay1Percent', 'pay2Percent', 'pay3Percent'] as const;
const PAY_AMOUNT_FIELDS = ['pay1Amount', 'pay2Amount', 'pay3Amount'] as const;
const PAY_DATE_FIELDS = ['pay1Date', 'pay2Date', 'pay3Date'] as const;

const DEFAULT_MANUFACTURING_SPLIT: [number, number, number] = [0.5, 0.3, 0.2];
const MANUFACTURING_SPLIT_LABEL_BASE = ['MFG Deposit', 'MFG Production', 'MFG Final'] as const;

function roundedPercentsFromFractions(fractions: readonly number[]): [number, number, number] {
  const raw = fractions.slice(0, 3).map((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric * 100 : 0;
  });
  while (raw.length < 3) raw.push(0);

  const floored = raw.map((value) => Math.floor(value));
  let remainder = 100 - floored.reduce((sum, value) => sum + value, 0);

  const fractionalOrder = raw
    .map((value, idx) => ({ idx, fractional: value - Math.floor(value) }))
    .sort((a, b) => b.fractional - a.fractional);

  for (const entry of fractionalOrder) {
    if (remainder <= 0) break;
    floored[entry.idx] = (floored[entry.idx] ?? 0) + 1;
    remainder -= 1;
  }

  return [floored[0] ?? 0, floored[1] ?? 0, floored[2] ?? 0];
}

function normalizeSupplierPaymentSplit(
  split: readonly number[] | undefined,
  fallback: [number, number, number],
): [number, number, number] {
  if (!split || split.length === 0) {
    return fallback;
  }

  const sanitized = split.slice(0, 3).map((value) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  });

  while (sanitized.length < 3) {
    sanitized.push(0);
  }

  const total = sanitized.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    return fallback;
  }

  return sanitized.map((value) => (value > 0 ? value / total : 0)) as [number, number, number];
}

function resolveOverride(base: number, override?: number | null): number {
  const numeric = parseNumber(override);
  return numeric ?? base;
}

function normalizePercentValue(value: number | null | undefined): number | null {
  return parsePercent(value);
}

function resolveStageWeeks(stageValue: number | null | undefined, fallback: number): number {
  return roundWeeks(stageValue, fallback);
}

function normalizePaymentIndex(index: number | null | undefined): number {
  if (index == null) return 1;
  const numeric = Number(index);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.round(numeric));
}

function optionalNumber(value: number | null | undefined): number | null {
  return parseNumber(value);
}

function findPayment(
  payments: PurchaseOrderPaymentInput[] | undefined,
  index: number,
): PurchaseOrderPaymentInput | undefined {
  if (!payments || payments.length === 0) return undefined;
  return payments.find((payment) => normalizePaymentIndex(payment.paymentIndex) === index);
}

type WeekMapping = {
  calendar?: WeekCalendar | null;
  planningWeekConfig?: PlanningWeekConfig | null;
};

function normalizeWeekNumber(value: number | null | undefined): number | null {
  if (value == null) return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
}

function resolveWeekNumber(date: Date | null | undefined, mapping: WeekMapping): number | null {
  if (!date) return null;
  if (mapping.calendar) return weekNumberForDate(date, mapping.calendar);
  if (mapping.planningWeekConfig)
    return planningWeekNumberForDate(date, mapping.planningWeekConfig);
  return null;
}

function resolveWeekDate(weekNumber: number | null | undefined, mapping: WeekMapping): Date | null {
  if (weekNumber == null) return null;
  if (mapping.calendar) return getCalendarDateForWeek(weekNumber, mapping.calendar);
  if (mapping.planningWeekConfig)
    return planningWeekDateForWeekNumber(weekNumber, mapping.planningWeekConfig);
  return null;
}

function stageOffsetWeeks(weeks: number): number {
  const numeric = Number(weeks);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.floor(numeric);
}

function addStageDurationDate(start: Date, weeks: number): Date {
  const days = Math.max(0, Math.round(Number(weeks) * 7));
  if (days === 0) return start;
  return new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function weeksBetweenDates(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs)) return null;
  const diffDays = diffMs / MS_PER_DAY;
  if (!Number.isFinite(diffDays) || diffDays < 0) return null;
  return diffDays / 7;
}

function buildStageSchedule(
  order: PurchaseOrderInput,
  stageProfile: LeadTimeProfile,
  createdAt: Date,
  mapping: WeekMapping,
) {
  let productionWeeks = resolveStageWeeks(order.productionWeeks, stageProfile.productionWeeks);
  let sourceWeeks = resolveStageWeeks(order.sourceWeeks, stageProfile.sourceWeeks);
  let oceanWeeks = resolveStageWeeks(order.oceanWeeks, stageProfile.oceanWeeks);
  let finalWeeks = resolveStageWeeks(order.finalWeeks, stageProfile.finalWeeks);

  const poWeekNumber =
    normalizeWeekNumber(order.poWeekNumber) ?? resolveWeekNumber(order.poDate ?? null, mapping);
  const productionStartWeekNumber =
    poWeekNumber ?? resolveWeekNumber(order.productionStart ?? order.poDate ?? createdAt, mapping);

  const productionCompleteWeekNumber =
    normalizeWeekNumber(order.productionCompleteWeekNumber) ??
    resolveWeekNumber(order.productionComplete ?? null, mapping) ??
    (productionStartWeekNumber != null
      ? productionStartWeekNumber + stageOffsetWeeks(productionWeeks)
      : null);

  const sourceBaseWeekNumber = productionCompleteWeekNumber ?? productionStartWeekNumber;
  const sourceDepartureWeekNumber =
    normalizeWeekNumber(order.sourceDepartureWeekNumber) ??
    resolveWeekNumber(order.sourceDeparture ?? null, mapping) ??
    (sourceBaseWeekNumber != null ? sourceBaseWeekNumber + stageOffsetWeeks(sourceWeeks) : null);

  const oceanBaseWeekNumber = sourceDepartureWeekNumber ?? sourceBaseWeekNumber;
  const portEtaWeekNumber =
    normalizeWeekNumber(order.portEtaWeekNumber) ??
    resolveWeekNumber(order.portEta ?? null, mapping) ??
    (oceanBaseWeekNumber != null ? oceanBaseWeekNumber + stageOffsetWeeks(oceanWeeks) : null);

  const inboundEtaWeekNumber =
    normalizeWeekNumber(order.inboundEtaWeekNumber) ??
    resolveWeekNumber(order.inboundEta ?? null, mapping) ??
    portEtaWeekNumber;

  const finalBaseWeekNumber = portEtaWeekNumber ?? inboundEtaWeekNumber ?? oceanBaseWeekNumber;
  const availableWeekNumber =
    normalizeWeekNumber(order.availableWeekNumber) ??
    resolveWeekNumber(order.availableDate ?? null, mapping) ??
    (finalBaseWeekNumber != null ? finalBaseWeekNumber + stageOffsetWeeks(finalWeeks) : null);

  let productionStart = resolveWeekDate(productionStartWeekNumber, mapping);
  let productionComplete = resolveWeekDate(productionCompleteWeekNumber, mapping);
  let sourceDeparture = resolveWeekDate(sourceDepartureWeekNumber, mapping);
  let portEta = resolveWeekDate(portEtaWeekNumber, mapping);
  let inboundEta = resolveWeekDate(inboundEtaWeekNumber, mapping);
  let availableDate = resolveWeekDate(availableWeekNumber, mapping);

  if (!mapping.calendar && !mapping.planningWeekConfig) {
    const productionStartFallback = order.poDate ?? order.productionStart ?? createdAt;
    const productionCompleteFallback =
      order.productionComplete ??
      (productionStartFallback
        ? addStageDurationDate(productionStartFallback, productionWeeks)
        : null);

    const sourceBaseFallback = productionCompleteFallback ?? productionStartFallback;
    const sourceDepartureFallback =
      order.sourceDeparture ??
      (sourceBaseFallback ? addStageDurationDate(sourceBaseFallback, sourceWeeks) : null);

    const oceanBaseFallback = sourceDepartureFallback ?? sourceBaseFallback;
    const portEtaFallback =
      order.portEta ??
      (oceanBaseFallback ? addStageDurationDate(oceanBaseFallback, oceanWeeks) : null);

    const inboundEtaFallback = order.inboundEta ?? portEtaFallback;

    const finalBaseFallback = portEtaFallback ?? inboundEtaFallback ?? oceanBaseFallback;
    const availableFallback =
      order.availableDate ??
      (finalBaseFallback ? addStageDurationDate(finalBaseFallback, finalWeeks) : null);

    productionStart = productionStartFallback ?? null;
    productionComplete = productionCompleteFallback ?? null;
    sourceDeparture = sourceDepartureFallback ?? null;
    portEta = portEtaFallback ?? null;
    inboundEta = inboundEtaFallback ?? null;
    availableDate = availableFallback ?? null;
  }

  const productionStartForDiff =
    order.poDate ?? order.productionStart ?? productionStart ?? createdAt;
  const productionCompleteForDiff = order.productionComplete ?? productionComplete ?? null;
  const sourceDepartureForDiff = order.sourceDeparture ?? sourceDeparture ?? null;
  const portEtaForDiff = order.portEta ?? portEta ?? null;
  const availableForDiff = order.availableDate ?? availableDate ?? null;

  const computedProductionWeeks = weeksBetweenDates(
    productionStartForDiff,
    productionCompleteForDiff,
  );
  if (computedProductionWeeks != null) {
    productionWeeks = computedProductionWeeks;
  }

  const sourceStartForDiff = productionCompleteForDiff ?? productionStartForDiff;
  const computedSourceWeeks = weeksBetweenDates(sourceStartForDiff, sourceDepartureForDiff);
  if (computedSourceWeeks != null) {
    sourceWeeks = computedSourceWeeks;
  }

  const oceanStartForDiff = sourceDepartureForDiff ?? sourceStartForDiff;
  const computedOceanWeeks = weeksBetweenDates(oceanStartForDiff, portEtaForDiff);
  if (computedOceanWeeks != null) {
    oceanWeeks = computedOceanWeeks;
  }

  const finalStartForDiff = portEtaForDiff ?? oceanStartForDiff;
  const computedFinalWeeks = weeksBetweenDates(finalStartForDiff, availableForDiff);
  if (computedFinalWeeks != null) {
    finalWeeks = computedFinalWeeks;
  }

  return {
    productionWeeks,
    sourceWeeks,
    oceanWeeks,
    finalWeeks,
    poWeekNumber,
    productionStartWeekNumber,
    productionCompleteWeekNumber,
    sourceDepartureWeekNumber,
    portEtaWeekNumber,
    inboundEtaWeekNumber,
    availableWeekNumber,
    productionStart,
    productionComplete,
    sourceDeparture,
    portEta,
    inboundEta,
    availableDate,
  };
}

function computeWeeksUntilWeek(
  targetWeekNumber: number | null,
  mapping: WeekMapping,
): number | null {
  if (targetWeekNumber == null) return null;
  const currentWeek = resolveWeekNumber(new Date(), mapping);
  if (currentWeek == null) return null;
  return Math.max(targetWeekNumber - currentWeek, 0);
}

export function computePurchaseOrderDerived(
  order: PurchaseOrderInput,
  productIndex: Map<string, ProductCostSummary>,
  stageProfile: LeadTimeProfile,
  params: BusinessParameterMap,
  options: WeekMapping = {},
): PurchaseOrderDerived {
  const batches =
    Array.isArray(order.batchTableRows) && order.batchTableRows.length > 0
      ? order.batchTableRows
      : [
          {
            id: order.id,
            purchaseOrderId: order.id,
            batchCode: order.orderCode,
            productId: order.productId,
            quantity: coerceNumber(order.quantity),
            overrideSellingPrice: order.overrideSellingPrice,
            overrideManufacturingCost: order.overrideManufacturingCost,
            overrideFreightCost: order.overrideFreightCost,
            overrideTariffRate: order.overrideTariffRate,
            overrideTacosPercent: order.overrideTacosPercent,
            overrideFbaFee: order.overrideFbaFee,
            overrideReferralRate: order.overrideReferralRate,
            overrideStoragePerMonth: order.overrideStoragePerMonth,
          },
        ];

  const derivedBatches: PurchaseOrderBatchDerived[] = [];

  const orderManufacturingOverride = parseNumber(order.overrideManufacturingCost);
  const orderFreightOverride = parseNumber(order.overrideFreightCost);
  const orderTariffOverride = parsePercent(order.overrideTariffRate);

  let totalQuantity = 0;
  let totalSellingPrice = 0;
  let totalManufacturingCost = 0;
  let totalFreightCost = 0;
  let totalTacosPercent = 0;
  let totalFbaFee = 0;
  let totalReferralRate = 0;
  let totalStoragePerMonth = 0;
  let totalTariffCost = 0;
  let totalAdvertisingCost = 0;
  let totalLandedCost = 0;

  for (const batch of batches) {
    const quantity = Math.max(0, coerceNumber(batch.quantity));
    if (quantity === 0) continue;
    const product = productIndex.get(batch.productId);
    if (!product) continue;

    const sellingPrice = resolveOverride(
      product.sellingPrice,
      batch.overrideSellingPrice ?? order.overrideSellingPrice,
    );
    const manufacturingUnitCost = resolveOverride(
      product.manufacturingCost,
      batch.overrideManufacturingCost ?? orderManufacturingOverride ?? null,
    );
    const freightUnitCost = resolveOverride(
      product.freightCost,
      batch.overrideFreightCost ?? orderFreightOverride ?? null,
    );
    const tariffRateInput = resolveOverride(
      product.tariffRate,
      parsePercent(batch.overrideTariffRate ?? orderTariffOverride ?? null),
    );
    const tariffCostOverride = parseNumber(batch.overrideTariffCost);
    const tariffUnitCost = tariffCostOverride ?? manufacturingUnitCost * tariffRateInput;
    const effectiveTariffRate =
      manufacturingUnitCost > 0 ? tariffUnitCost / manufacturingUnitCost : tariffRateInput;
    const batchManufacturingTotal = manufacturingUnitCost * quantity;
    const batchFreightTotal = freightUnitCost * quantity;
    const batchTariffTotal = tariffUnitCost * quantity;
    const tacosPercent = resolveOverride(
      product.tacosPercent,
      batch.overrideTacosPercent ?? order.overrideTacosPercent,
    );
    const fbaFee = resolveOverride(product.fbaFee, batch.overrideFbaFee ?? order.overrideFbaFee);
    const referralRate = resolveOverride(
      product.amazonReferralRate,
      batch.overrideReferralRate ?? order.overrideReferralRate,
    );
    const storagePerMonth = resolveOverride(
      product.storagePerMonth,
      batch.overrideStoragePerMonth ?? order.overrideStoragePerMonth,
    );

    const advertisingCost = sellingPrice * tacosPercent;
    const landedUnitCost =
      (batchManufacturingTotal + batchFreightTotal + batchTariffTotal) / Math.max(quantity, 1);

    derivedBatches.push({
      batchCode: batch.batchCode,
      productId: batch.productId,
      quantity,
      sellingPrice,
      manufacturingCost: manufacturingUnitCost,
      freightCost: freightUnitCost,
      tariffRate: effectiveTariffRate,
      tacosPercent,
      fbaFee,
      amazonReferralRate: referralRate,
      storagePerMonth,
      landedUnitCost,
    });

    totalQuantity += quantity;
    totalSellingPrice += sellingPrice * quantity;
    totalManufacturingCost += batchManufacturingTotal;
    totalFreightCost += batchFreightTotal;
    totalTacosPercent += tacosPercent * quantity;
    totalFbaFee += fbaFee * quantity;
    totalReferralRate += referralRate * quantity;
    totalStoragePerMonth += storagePerMonth * quantity;
    totalTariffCost += batchTariffTotal;
    totalAdvertisingCost += advertisingCost * quantity;
    totalLandedCost += landedUnitCost * quantity;
  }

  const fallbackQuantity = Math.max(0, coerceNumber(order.quantity));
  const quantity = totalQuantity > 0 ? totalQuantity : fallbackQuantity;
  const divisor = totalQuantity > 0 ? totalQuantity : quantity || 1;

  const sellingPrice = divisor > 0 ? totalSellingPrice / divisor : 0;
  const manufacturingCost = divisor > 0 ? totalManufacturingCost / divisor : 0;
  const freightCost = divisor > 0 ? totalFreightCost / divisor : 0;
  const tariffRate = totalManufacturingCost > 0 ? totalTariffCost / totalManufacturingCost : 0;
  const tacosPercent = divisor > 0 ? totalTacosPercent / divisor : 0;
  const fbaFee = divisor > 0 ? totalFbaFee / divisor : 0;
  const referralRate = divisor > 0 ? totalReferralRate / divisor : 0;
  const storagePerMonth = divisor > 0 ? totalStoragePerMonth / divisor : 0;
  const tariffCost = divisor > 0 ? totalTariffCost / divisor : 0;
  const advertisingCost = divisor > 0 ? totalAdvertisingCost / divisor : 0;
  const landedUnitCost = divisor > 0 ? totalLandedCost / divisor : 0;
  const createdAt = order.createdAt ?? new Date();
  const schedule = buildStageSchedule(order, stageProfile, createdAt, options);

  const resolvedProfile: LeadTimeProfile = {
    productionWeeks: schedule.productionWeeks,
    sourceWeeks: schedule.sourceWeeks,
    oceanWeeks: schedule.oceanWeeks,
    finalWeeks: schedule.finalWeeks,
  };

  const {
    poWeekNumber,
    productionStartWeekNumber,
    productionCompleteWeekNumber,
    sourceDepartureWeekNumber,
    portEtaWeekNumber,
    inboundEtaWeekNumber,
    availableWeekNumber,
    productionStart,
    productionComplete,
    sourceDeparture,
    portEta,
    inboundEta,
    availableDate,
  } = schedule;

  const totalLeadDays = Math.round(
    (schedule.productionWeeks + schedule.sourceWeeks + schedule.oceanWeeks + schedule.finalWeeks) *
      7,
  );
  const weeksUntilArrival = computeWeeksUntilWeek(availableWeekNumber ?? null, options);

  const poValue = landedUnitCost * quantity;

  const payments: PaymentPlanItem[] = [];

  const manufacturingTotal =
    totalManufacturingCost > 0 ? totalManufacturingCost : manufacturingCost * quantity;
  const freightTotal = totalFreightCost > 0 ? totalFreightCost : freightCost * quantity;
  const tariffTotal = totalTariffCost > 0 ? totalTariffCost : tariffCost * quantity;
  const supplierCostTotal = manufacturingTotal + freightTotal + tariffTotal;
  const supplierDenominator = supplierCostTotal > 0 ? supplierCostTotal : Math.max(poValue, 0);
  const depositWeekNumber = poWeekNumber ?? productionStartWeekNumber;
  const productionDueWeekNumber = productionCompleteWeekNumber ?? depositWeekNumber;
  const portDueWeekNumber =
    portEtaWeekNumber ??
    inboundEtaWeekNumber ??
    availableWeekNumber ??
    productionDueWeekNumber ??
    depositWeekNumber;

  const manufacturingFractions = normalizeSupplierPaymentSplit(
    params.supplierPaymentSplit,
    DEFAULT_MANUFACTURING_SPLIT,
  );
  const manufacturingAmounts = manufacturingFractions.map(
    (fraction) => manufacturingTotal * fraction,
  );
  const manufacturingPercents = roundedPercentsFromFractions(manufacturingFractions);
  const manufacturingLabels: readonly string[] = MANUFACTURING_SPLIT_LABEL_BASE.map(
    (base, idx) => `${base} (${manufacturingPercents[idx] ?? 0}%)`,
  );

  const paymentDefinitions: Array<{
    index: number;
    category: PaymentCategory;
    label: string;
    baseAmount: number;
    defaultPercent: number;
    defaultWeekNumber: number | null;
    percentField?: (typeof PAY_PERCENT_FIELDS)[number];
    amountField?: (typeof PAY_AMOUNT_FIELDS)[number];
    dateField?: (typeof PAY_DATE_FIELDS)[number];
  }> = [
    {
      index: 1,
      category: 'MANUFACTURING',
      label: manufacturingLabels[0],
      baseAmount: manufacturingAmounts[0] ?? 0,
      defaultPercent:
        supplierDenominator > 0 ? (manufacturingAmounts[0] ?? 0) / supplierDenominator : 0,
      defaultWeekNumber: depositWeekNumber,
      percentField: PAY_PERCENT_FIELDS[0],
      amountField: PAY_AMOUNT_FIELDS[0],
      dateField: PAY_DATE_FIELDS[0],
    },
    {
      index: 2,
      category: 'MANUFACTURING',
      label: manufacturingLabels[1],
      baseAmount: manufacturingAmounts[1] ?? 0,
      defaultPercent:
        supplierDenominator > 0 ? (manufacturingAmounts[1] ?? 0) / supplierDenominator : 0,
      defaultWeekNumber: productionDueWeekNumber,
      percentField: PAY_PERCENT_FIELDS[1],
      amountField: PAY_AMOUNT_FIELDS[1],
      dateField: PAY_DATE_FIELDS[1],
    },
    {
      index: 3,
      category: 'FREIGHT',
      label: 'Freight (100%)',
      baseAmount: freightTotal,
      defaultPercent: supplierDenominator > 0 ? freightTotal / supplierDenominator : 0,
      defaultWeekNumber: portDueWeekNumber,
    },
    {
      index: 4,
      category: 'MANUFACTURING',
      label: manufacturingLabels[2],
      baseAmount: manufacturingAmounts[2] ?? 0,
      defaultPercent:
        supplierDenominator > 0 ? (manufacturingAmounts[2] ?? 0) / supplierDenominator : 0,
      defaultWeekNumber: portDueWeekNumber,
      percentField: PAY_PERCENT_FIELDS[2],
      amountField: PAY_AMOUNT_FIELDS[2],
      dateField: PAY_DATE_FIELDS[2],
    },
    {
      index: 5,
      category: 'TARIFF',
      label: 'Tariff (100%)',
      baseAmount: tariffTotal,
      defaultPercent: supplierDenominator > 0 ? tariffTotal / supplierDenominator : 0,
      defaultWeekNumber: portDueWeekNumber,
    },
  ];

  for (const definition of paymentDefinitions) {
    const {
      index,
      category,
      label,
      baseAmount,
      defaultPercent,
      defaultWeekNumber,
      percentField,
      amountField,
      dateField,
    } = definition;

    const percentOverride = percentField ? normalizePercentValue(order[percentField]) : null;
    const amountOverride = amountField ? optionalNumber(order[amountField]) : null;
    const dateOverride = dateField ? (order[dateField] ?? null) : null;

    const actualPayment = findPayment(order.payments, index);
    if (isRemovedPaymentCategory(actualPayment?.category)) {
      continue;
    }
    const expectedOverride = actualPayment ? optionalNumber(actualPayment.amountExpected) : null;
    const paidAmount = actualPayment ? optionalNumber(actualPayment.amountPaid) : null;
    const actualPercent =
      normalizePercentValue(actualPayment?.percentage) ??
      (paidAmount != null && supplierDenominator > 0 ? paidAmount / supplierDenominator : null);
    const dueDateSource = actualPayment?.dueDateSource ?? 'SYSTEM';
    const overrideWeekNumber =
      dueDateSource === 'USER'
        ? (normalizeWeekNumber(actualPayment?.dueWeekNumber) ??
          resolveWeekNumber(actualPayment?.dueDate ?? null, options))
        : null;

    let plannedAmount = baseAmount;
    if (amountOverride != null) {
      plannedAmount = amountOverride;
    } else if (expectedOverride != null) {
      plannedAmount = expectedOverride;
    } else if (percentOverride != null && supplierDenominator > 0) {
      plannedAmount = percentOverride * supplierDenominator;
    }

    const plannedPercent = (() => {
      if (percentOverride != null) return percentOverride;
      if (supplierDenominator > 0 && plannedAmount > 0) return plannedAmount / supplierDenominator;
      return defaultPercent;
    })();

    const plannedDefaultWeekNumber =
      resolveWeekNumber(dateOverride, options) ?? defaultWeekNumber ?? null;
    const plannedWeekNumber = overrideWeekNumber ?? plannedDefaultWeekNumber;
    const plannedDefaultDate = resolveWeekDate(plannedDefaultWeekNumber, options);
    const plannedDate = resolveWeekDate(plannedWeekNumber, options) ?? plannedDefaultDate;

    if (plannedAmount <= 0 && paidAmount == null) {
      continue;
    }

    payments.push({
      paymentIndex: index,
      category,
      label,
      plannedPercent,
      plannedAmount,
      plannedWeekNumber,
      plannedDefaultWeekNumber,
      plannedDate,
      plannedDefaultDate,
      actualAmount: paidAmount,
      actualPercent,
      actualWeekNumber: plannedWeekNumber,
      actualDate: plannedDate,
    });
  }

  const totalPaidAmount = payments.reduce((sum, payment) => {
    const amount = coerceNumber(payment.actualAmount);
    return sum + amount;
  }, 0);
  const percentDenominator =
    supplierDenominator > 0 ? supplierDenominator : poValue > 0 ? poValue : 1;
  const totalPaidPercent = percentDenominator > 0 ? totalPaidAmount / percentDenominator : 0;

  return {
    id: order.id,
    orderCode: order.orderCode,
    productId: order.productId,
    quantity,
    batches: derivedBatches,
    status: order.status,
    statusIcon: order.statusIcon ?? STATUS_ICON_MAP[order.status],
    notes: order.notes ?? null,
    shipName: order.shipName ?? null,
    containerNumber: order.containerNumber ?? order.transportReference ?? null,
    createdAt,
    stageProfile: resolvedProfile,
    poWeekNumber: poWeekNumber ?? null,
    productionStartWeekNumber: productionStartWeekNumber ?? null,
    productionCompleteWeekNumber: productionCompleteWeekNumber ?? null,
    sourceDepartureWeekNumber: sourceDepartureWeekNumber ?? null,
    portEtaWeekNumber: portEtaWeekNumber ?? null,
    inboundEtaWeekNumber: inboundEtaWeekNumber ?? null,
    availableWeekNumber: availableWeekNumber ?? null,
    productionStart,
    productionComplete,
    sourceDeparture,
    transportReference: order.transportReference ?? null,
    portEta,
    inboundEta,
    availableDate,
    totalLeadDays,
    weeksUntilArrival,
    // Per-unit costs (weighted average from batches)
    sellingPrice,
    manufacturingCost,
    freightCost,
    tariffRate,
    tacosPercent,
    fbaFee,
    amazonReferralRate: referralRate,
    storagePerMonth,
    landedUnitCost,
    // Totals
    manufacturingCostTotal: manufacturingTotal,
    freightCostTotal: freightTotal,
    tariffCostTotal: tariffTotal,
    supplierCostTotal,
    plannedPoValue: poValue,
    plannedPayments: payments,
    payments: (order.payments ?? []).filter(
      (payment) => !isRemovedPaymentCategory(payment.category),
    ),
    paidAmount: totalPaidAmount,
    paidPercent: totalPaidPercent,
    remainingAmount: Math.max(percentDenominator - totalPaidAmount, 0),
    remainingPercent: Math.max(1 - totalPaidPercent, 0),
  };
}
