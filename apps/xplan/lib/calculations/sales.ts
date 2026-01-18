import { isValid } from 'date-fns';
import { coerceNumber } from '@/lib/utils/numbers';
import { buildWeekCalendar, weekNumberForDate } from './calendar';
import { differenceInCalendarWeeksUtc, startOfWeekUtc } from './week-utils';
import type { PurchaseOrderDerived } from './ops';
import type { SalesWeekInput } from './types';

interface ComputeSalesPlanOptions {
  productIds?: string[];
  calendar?: ReturnType<typeof buildWeekCalendar>;
  mode?: 'DEFAULT' | 'PROJECTED' | 'REAL';
  asOfDate?: Date;
}

const PLANNING_PLACEHOLDER_PRODUCT_ID = '__planning__';

export interface BatchAllocation {
  orderCode: string;
  batchCode?: string | null;
  quantity: number;
  sellingPrice: number;
  landedUnitCost: number;
  manufacturingCost: number;
  freightCost: number;
  tariffRate: number;
  tacosPercent: number;
  fbaFee: number;
  amazonReferralRate: number;
  storagePerMonth: number;
}

export interface SalesWeekDerived {
  productId: string;
  weekNumber: number;
  weekDate: Date | null;
  stockStart: number;
  arrivals: number;
  arrivalOrders: Array<{
    orderCode: string;
    shipName?: string | null;
    productId: string;
    quantity: number;
  }>;
  actualSales: number | null;
  forecastSales: number | null;
  systemForecastSales: number | null;
  systemForecastVersion: string | null;
  finalSales: number;
  finalSalesSource: 'OVERRIDE' | 'ACTUAL' | 'PLANNER' | 'SYSTEM' | 'ZERO';
  finalPercentError: number | null;
  stockEnd: number;
  stockWeeks: number;
  batchAllocations?: BatchAllocation[];
  hasActualData: boolean;
}

interface BatchInventory {
  orderCode: string;
  batchCode?: string | null;
  quantity: number;
  arrivalWeek: number;
  sellingPrice: number;
  landedUnitCost: number;
  manufacturingCost: number;
  freightCost: number;
  tariffRate: number;
  tacosPercent: number;
  fbaFee: number;
  amazonReferralRate: number;
  storagePerMonth: number;
}

type ArrivalScheduleEntry = {
  quantity: number;
  orders: Array<{
    orderCode: string;
    shipName?: string | null;
    productId: string;
    quantity: number;
  }>;
  batches: BatchInventory[];
};

function buildArrivalSchedule(
  purchaseOrders: PurchaseOrderDerived[],
  calendar: ReturnType<typeof buildWeekCalendar>,
): Map<string, ArrivalScheduleEntry> {
  const schedule = new Map<string, ArrivalScheduleEntry>();

  for (const order of purchaseOrders) {
    const weekNumber =
      order.availableWeekNumber ??
      order.inboundEtaWeekNumber ??
      (() => {
        const arrivalDate = order.availableDate ?? order.inboundEta;
        return arrivalDate ? weekNumberForDate(arrivalDate, calendar) : null;
      })();

    if (weekNumber == null || !calendar.weekDates.has(weekNumber)) continue;
    const arrivalBatches =
      Array.isArray(order.batches) && order.batches.length > 0
        ? order.batches
        : [
            {
              batchCode: order.orderCode,
              productId: order.productId,
              quantity: order.quantity,
              sellingPrice: order.sellingPrice,
              landedUnitCost: order.landedUnitCost,
              manufacturingCost: order.manufacturingCost,
              freightCost: order.freightCost,
              tariffRate: order.tariffRate,
              tacosPercent: order.tacosPercent,
              fbaFee: order.fbaFee,
              amazonReferralRate: order.amazonReferralRate,
              storagePerMonth: order.storagePerMonth,
            },
          ];

    for (const batch of arrivalBatches) {
      const quantity = Math.max(0, batch.quantity);
      if (!batch.productId || quantity <= 0) continue;

      const key = `${batch.productId}:${weekNumber}`;
      const entry = schedule.get(key) ?? { quantity: 0, orders: [], batches: [] };
      entry.quantity += quantity;
      entry.orders.push({
        orderCode: order.orderCode,
        shipName: order.shipName ?? null,
        productId: batch.productId,
        quantity,
      });

      // Add batch with costs
      entry.batches.push({
        orderCode: order.orderCode,
        batchCode: batch.batchCode ?? order.orderCode, // Use orderCode as batchCode for now
        quantity,
        arrivalWeek: weekNumber,
        sellingPrice: batch.sellingPrice ?? order.sellingPrice,
        landedUnitCost: batch.landedUnitCost ?? order.landedUnitCost,
        manufacturingCost: batch.manufacturingCost ?? order.manufacturingCost,
        freightCost: batch.freightCost ?? order.freightCost,
        tariffRate: batch.tariffRate ?? order.tariffRate,
        tacosPercent: batch.tacosPercent ?? order.tacosPercent,
        fbaFee: batch.fbaFee ?? order.fbaFee,
        amazonReferralRate: batch.amazonReferralRate ?? order.amazonReferralRate,
        storagePerMonth: batch.storagePerMonth ?? order.storagePerMonth,
      });

      schedule.set(key, entry);
    }
  }

  return schedule;
}

function clampNonNegative(value: number): number {
  return value < 0 ? 0 : value;
}

/**
 * Allocate sales using FIFO from available batch inventory
 * Returns the batch allocations for the sales quantity
 */
function allocateSalesFIFO(
  salesQuantity: number,
  batchInventory: BatchInventory[],
): { allocations: BatchAllocation[]; remainingBatches: BatchInventory[] } {
  if (salesQuantity <= 0 || batchInventory.length === 0) {
    return { allocations: [], remainingBatches: [...batchInventory] };
  }

  const allocations: BatchAllocation[] = [];
  const remaining: BatchInventory[] = [];
  let unallocated = salesQuantity;

  // Sort batches by arrival week (FIFO - oldest first)
  const sortedBatches = [...batchInventory].sort((a, b) => a.arrivalWeek - b.arrivalWeek);

  for (const batch of sortedBatches) {
    if (unallocated <= 0) {
      remaining.push(batch);
      continue;
    }

    const quantityToAllocate = Math.min(unallocated, batch.quantity);

    allocations.push({
      orderCode: batch.orderCode,
      batchCode: batch.batchCode,
      quantity: quantityToAllocate,
      sellingPrice: batch.sellingPrice,
      landedUnitCost: batch.landedUnitCost,
      manufacturingCost: batch.manufacturingCost,
      freightCost: batch.freightCost,
      tariffRate: batch.tariffRate,
      tacosPercent: batch.tacosPercent,
      fbaFee: batch.fbaFee,
      amazonReferralRate: batch.amazonReferralRate,
      storagePerMonth: batch.storagePerMonth,
    });

    const remainingQuantity = batch.quantity - quantityToAllocate;
    if (remainingQuantity > 0) {
      remaining.push({ ...batch, quantity: remainingQuantity });
    }

    unallocated -= quantityToAllocate;
  }

  return { allocations, remainingBatches: remaining };
}

export function computeSalesPlan(
  salesWeeks: SalesWeekInput[],
  purchaseOrders: PurchaseOrderDerived[],
  options: ComputeSalesPlanOptions = {},
): SalesWeekDerived[] {
  const sortedWeeks = [...salesWeeks].sort((a, b) => a.weekNumber - b.weekNumber);
  const calendar = options.calendar ?? buildWeekCalendar(sortedWeeks);
  const arrivalSchedule = buildArrivalSchedule(purchaseOrders, calendar);
  const mode = options.mode ?? 'DEFAULT';

  const results: SalesWeekDerived[] = [];
  const productIds = new Set<string>(options.productIds ?? []);
  const weeksByProduct = new Map<string, Map<number, SalesWeekInput>>();

  for (const week of sortedWeeks) {
    if (!weeksByProduct.has(week.productId)) {
      weeksByProduct.set(week.productId, new Map());
    }
    weeksByProduct.get(week.productId)?.set(week.weekNumber, week);
    productIds.add(week.productId);
  }

  for (const order of purchaseOrders) {
    productIds.add(order.productId);
  }

  const weekNumbers = Array.from(calendar.weekDates.keys()).sort((a, b) => a - b);
  const asOfDate = options.asOfDate ?? new Date();
  const boundedCurrentWeekNumber = weekNumberForDate(asOfDate, calendar);
  const currentWeekNumber =
    boundedCurrentWeekNumber ??
    (calendar.calendarStart && calendar.anchorWeekNumber != null
      ? calendar.anchorWeekNumber +
        differenceInCalendarWeeksUtc(
          asOfDate,
          startOfWeekUtc(calendar.calendarStart, calendar.weekStartsOn),
          calendar.weekStartsOn,
        )
      : null) ??
    Number.NEGATIVE_INFINITY;

  for (const productId of productIds) {
    if (!productId || productId === PLANNING_PLACEHOLDER_PRODUCT_ID) continue;
    const stockEndSeries: number[] = [];
    const productWeeks = weeksByProduct.get(productId);

    // Track FIFO batch inventory across weeks for this product
    let batchInventory: BatchInventory[] = [];

    for (let index = 0; index < weekNumbers.length; index += 1) {
      const weekNumber = weekNumbers[index];
      const week = productWeeks?.get(weekNumber);
      const baseDate = calendar.weekDates.get(weekNumber);
      let weekDate: Date | null = null;
      if (baseDate && isValid(baseDate)) {
        weekDate = baseDate;
      } else if (week?.weekDate) {
        const tentative = week.weekDate instanceof Date ? week.weekDate : new Date(week.weekDate);
        weekDate = isValid(tentative) ? tentative : null;
      }

      const arrivalEntry = arrivalSchedule.get(`${productId}:${weekNumber}`);
      const arrivals = arrivalEntry?.quantity ?? 0;

      // Add arriving batches to inventory
      if (arrivalEntry) {
        batchInventory.push(...arrivalEntry.batches);
      }

      const previousEnd = index > 0 ? stockEndSeries[index - 1] : coerceNumber(week?.stockStart);
      const manualStart = week?.stockStart;
      const baseStart =
        manualStart != null ? clampNonNegative(coerceNumber(manualStart)) : previousEnd;
      const stockStart = clampNonNegative(baseStart + arrivals);

      const actualSales = week?.actualSales != null ? coerceNumber(week.actualSales) : null;
      const forecastSales = week?.forecastSales != null ? coerceNumber(week.forecastSales) : null;
      const systemForecastSales =
        week?.systemForecastSales != null ? coerceNumber(week.systemForecastSales) : null;
      const systemForecastVersion = week?.systemForecastVersion ?? null;
      const hasActualDataFlag = week?.hasActualData ?? (actualSales != null);

      const isPastWeek = weekNumber < currentWeekNumber;
      let computedFinalSales: number;
      let finalSalesSource: SalesWeekDerived['finalSalesSource'];

      const actualOnly = mode === 'REAL' || (mode === 'DEFAULT' && isPastWeek);

      if (actualOnly) {
        if (hasActualDataFlag && actualSales != null) {
          computedFinalSales = clampNonNegative(actualSales);
          finalSalesSource = 'ACTUAL';
        } else {
          computedFinalSales = 0;
          finalSalesSource = 'ZERO';
        }
      } else if (week?.finalSales != null) {
        computedFinalSales = clampNonNegative(coerceNumber(week.finalSales));
        finalSalesSource = 'OVERRIDE';
      } else {
        const candidates: Array<{
          value: number | null;
          source: SalesWeekDerived['finalSalesSource'];
        }> = [];

        if (mode === 'DEFAULT' || mode === 'PROJECTED') {
          candidates.push({ value: forecastSales, source: 'PLANNER' });
          candidates.push({ value: systemForecastSales, source: 'SYSTEM' });
        }

        const match = candidates.find((candidate) => candidate.value != null);
        if (match && match.value != null) {
          computedFinalSales = clampNonNegative(match.value);
          finalSalesSource = match.source;
        } else {
          computedFinalSales = 0;
          finalSalesSource = 'ZERO';
        }
      }

      // Allocate sales using FIFO
      const { allocations, remainingBatches } = allocateSalesFIFO(
        computedFinalSales,
        batchInventory,
      );
      batchInventory = remainingBatches;

      const stockEnd = clampNonNegative(stockStart - computedFinalSales);
      const stockWeeks =
        computedFinalSales > 0
          ? stockStart / computedFinalSales
          : stockStart > 0
            ? Number.POSITIVE_INFINITY
            : 0;
      let percentError: number | null = null;
      if (actualSales != null && forecastSales != null && forecastSales !== 0) {
        percentError = (actualSales - forecastSales) / Math.abs(forecastSales);
      }
      stockEndSeries.push(stockEnd);

      results.push({
        productId,
        weekNumber,
        weekDate,
        stockStart,
        arrivals,
        arrivalOrders: arrivalEntry?.orders ?? [],
        actualSales,
        forecastSales,
        systemForecastSales,
        systemForecastVersion,
        finalSales: computedFinalSales,
        finalSalesSource,
        finalPercentError: percentError,
        stockEnd,
        stockWeeks,
        batchAllocations: allocations.length > 0 ? allocations : undefined,
        hasActualData: isPastWeek && hasActualDataFlag,
      });
    }
  }

  return results.sort((a, b) => {
    if (a.weekNumber === b.weekNumber) {
      return a.productId.localeCompare(b.productId);
    }
    return a.weekNumber - b.weekNumber;
  });
}
