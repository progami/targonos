import type { ProductCostSummary } from './product';
import type { SalesWeekDerived } from './sales';

export interface AllocationLedgerLine {
  weekNumber: number;
  weekDate: Date | null;
  productId: string;
  orderCode: string | null;
  batchCode: string | null;
  units: number;
  revenue: number;
  manufacturingCost: number;
  freightCost: number;
  tariffCost: number;
  cogs: number;
  referralFees: number;
  fbaFees: number;
  storageFees: number;
  amazonFees: number;
  ppcSpend: number;
}

function coerceFinite(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function buildAllocationLedger(
  salesPlan: SalesWeekDerived[],
  products: Map<string, ProductCostSummary>,
): AllocationLedgerLine[] {
  const lines: AllocationLedgerLine[] = [];

  for (const row of salesPlan) {
    const weekNumber = row.weekNumber;
    const weekDate = row.weekDate ?? null;

    let allocatedUnits = 0;
    if (row.batchAllocations && row.batchAllocations.length > 0) {
      for (const allocation of row.batchAllocations) {
        const units = coerceFinite(allocation.quantity);
        const revenue = units * coerceFinite(allocation.sellingPrice);

        const manufacturingCost = units * coerceFinite(allocation.manufacturingCost);
        const freightCost = units * coerceFinite(allocation.freightCost);
        const tariffUnitCost = Math.max(
          0,
          coerceFinite(allocation.landedUnitCost) -
            coerceFinite(allocation.manufacturingCost) -
            coerceFinite(allocation.freightCost),
        );
        const tariffCost = units * tariffUnitCost;
        const cogs = units * coerceFinite(allocation.landedUnitCost);

        const referralFees = revenue * coerceFinite(allocation.amazonReferralRate);
        const fbaFees = units * coerceFinite(allocation.fbaFee);
        const storageFees = units * coerceFinite(allocation.storagePerMonth);
        const amazonFees = referralFees + fbaFees + storageFees;
        const ppcSpend =
          units * coerceFinite(allocation.sellingPrice) * coerceFinite(allocation.tacosPercent);

        lines.push({
          weekNumber,
          weekDate,
          productId: row.productId,
          orderCode: allocation.orderCode,
          batchCode: allocation.batchCode ?? null,
          units,
          revenue,
          manufacturingCost,
          freightCost,
          tariffCost,
          cogs,
          referralFees,
          fbaFees,
          storageFees,
          amazonFees,
          ppcSpend,
        });

        allocatedUnits += units;
      }
    }

    const remainingUnits = row.finalSales - allocatedUnits;
    if (remainingUnits > 0) {
      const product = products.get(row.productId);
      if (!product) continue;

      const units = coerceFinite(remainingUnits);
      const revenue = units * coerceFinite(product.sellingPrice);

      const manufacturingCost = units * coerceFinite(product.manufacturingCost);
      const freightCost = units * coerceFinite(product.freightCost);
      const tariffUnitCost = Math.max(
        0,
        coerceFinite(product.landedUnitCost) -
          coerceFinite(product.manufacturingCost) -
          coerceFinite(product.freightCost),
      );
      const tariffCost = units * tariffUnitCost;
      const cogs = units * coerceFinite(product.landedUnitCost);

      const referralFees = revenue * coerceFinite(product.amazonReferralRate);
      const fbaFees = units * coerceFinite(product.fbaFee);
      const storageFees = units * coerceFinite(product.storagePerMonth);
      const amazonFees = referralFees + fbaFees + storageFees;
      const ppcSpend =
        units * coerceFinite(product.sellingPrice) * coerceFinite(product.tacosPercent);

      lines.push({
        weekNumber,
        weekDate,
        productId: row.productId,
        orderCode: null,
        batchCode: null,
        units,
        revenue,
        manufacturingCost,
        freightCost,
        tariffCost,
        cogs,
        referralFees,
        fbaFees,
        storageFees,
        amazonFees,
        ppcSpend,
      });
    }
  }

  return lines;
}
