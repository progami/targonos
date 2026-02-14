import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import { allocateByWeight, toCents } from '@/lib/inventory/money';

export class PnlAllocationNoWeightsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PnlAllocationNoWeightsError';
  }
}

export type PnlBucketKey =
  | 'amazonSellerFees'
  | 'amazonFbaFees'
  | 'amazonStorageFees'
  | 'amazonAdvertisingCosts'
  | 'amazonPromotions'
  | 'amazonFbaInventoryReimbursement'
  | 'warehousingAwd';

export type PnlAllocation = {
  invoiceId: string;
  allocationsByBucket: Record<PnlBucketKey, Record<string, number>>;
  skuBreakdownByBucketBrand: Record<PnlBucketKey, Record<string, Record<string, number>>>;
};

export type BrandResolver = {
  getBrandForSku: (sku: string) => string;
};

function classifyBucket(description: string): PnlBucketKey | null {
  const normalized = description.trim();

  if (normalized.startsWith('Amazon Seller Fees')) return 'amazonSellerFees';
  if (/^Amazon (FBA Fees|Storage Fees)/.test(normalized) && /\bAWD\b/i.test(normalized)) return 'warehousingAwd';
  if (normalized.startsWith('Amazon FBA Fees')) return 'amazonFbaFees';
  if (normalized.startsWith('Amazon Storage Fees')) return 'amazonStorageFees';
  if (normalized.startsWith('Amazon Advertising Costs')) return 'amazonAdvertisingCosts';
  if (normalized.startsWith('Amazon Promotions')) return 'amazonPromotions';
  if (normalized.startsWith('Amazon FBA Inventory Reimbursement')) return 'amazonFbaInventoryReimbursement';

  return null;
}

function isSalesPrincipal(description: string): boolean {
  return description.trim().startsWith('Amazon Sales - Principal');
}

function allocateSignedByWeights(totalCents: number, weightsByKey: Map<string, number>, noWeightsMessage: string): Record<string, number> {
  if (weightsByKey.size === 0) {
    throw new PnlAllocationNoWeightsError(noWeightsMessage);
  }

  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);

  const weights = Array.from(weightsByKey.entries()).map(([key, weight]) => ({
    key,
    weight,
  }));

  let totalWeight = 0;
  for (const w of weights) totalWeight += w.weight;
  if (totalWeight <= 0) {
    throw new PnlAllocationNoWeightsError(noWeightsMessage);
  }

  const allocated = allocateByWeight(abs, weights);
  const result: Record<string, number> = {};
  for (const [key, cents] of Object.entries(allocated)) {
    result[key] = sign * cents;
  }
  return result;
}

function allocateSignedByUnits(totalCents: number, unitsByBrand: Map<string, number>): Record<string, number> {
  return allocateSignedByWeights(
    totalCents,
    unitsByBrand,
    'Cannot allocate SKU-less fee buckets because there are no Amazon Sales - Principal rows with SKU + quantity > 0',
  );
}

function addCents(target: Record<string, number>, brand: string, cents: number) {
  const current = target[brand];
  target[brand] = (current === undefined ? 0 : current) + cents;
}

function addSkuCents(target: Record<string, Record<string, number>>, brand: string, sku: string, cents: number) {
  const existingBySku = target[brand];
  if (existingBySku === undefined) {
    target[brand] = { [sku]: cents };
    return;
  }

  const current = existingBySku[sku];
  existingBySku[sku] = (current === undefined ? 0 : current) + cents;
}

export function computePnlAllocation(rows: LmbAuditRow[], brandResolver: BrandResolver): PnlAllocation {
  if (rows.length === 0) {
    throw new Error('No rows provided');
  }

  const invoiceId = rows[0].invoice;
  for (const row of rows) {
    if (row.invoice !== invoiceId) {
      throw new Error('All rows must have the same Invoice');
    }
  }

  const allocationsByBucket: Record<PnlBucketKey, Record<string, number>> = {
    amazonSellerFees: {},
    amazonFbaFees: {},
    amazonStorageFees: {},
    amazonAdvertisingCosts: {},
    amazonPromotions: {},
    amazonFbaInventoryReimbursement: {},
    warehousingAwd: {},
  };
  const skuBreakdownByBucketBrand: Record<PnlBucketKey, Record<string, Record<string, number>>> = {
    amazonSellerFees: {},
    amazonFbaFees: {},
    amazonStorageFees: {},
    amazonAdvertisingCosts: {},
    amazonPromotions: {},
    amazonFbaInventoryReimbursement: {},
    warehousingAwd: {},
  };

  // Units sold by brand (weights for non-SKU lines)
  const unitsByBrand = new Map<string, number>();
  const unitsByBrandSku = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const sku = row.sku.trim();
    if (sku === '') continue;
    if (!isSalesPrincipal(row.description)) continue;
    if (!Number.isFinite(row.quantity) || row.quantity === 0) continue;

    const brand = brandResolver.getBrandForSku(sku);
    const units = Math.abs(row.quantity);
    const current = unitsByBrand.get(brand);
    unitsByBrand.set(brand, (current === undefined ? 0 : current) + units);

    const brandSkuUnits = unitsByBrandSku.get(brand);
    if (brandSkuUnits === undefined) {
      unitsByBrandSku.set(brand, new Map([[sku, units]]));
      continue;
    }
    const skuUnits = brandSkuUnits.get(sku);
    brandSkuUnits.set(sku, (skuUnits === undefined ? 0 : skuUnits) + units);
  }

  for (const row of rows) {
    const bucket = classifyBucket(row.description);
    if (!bucket) continue;

    const cents = toCents(row.net);
    if (!Number.isInteger(cents)) {
      throw new Error('Net cents must be an integer');
    }

    const sku = row.sku.trim();
    if (sku !== '') {
      const brand = brandResolver.getBrandForSku(sku);
      addCents(allocationsByBucket[bucket], brand, cents);
      addSkuCents(skuBreakdownByBucketBrand[bucket], brand, sku, cents);
      continue;
    }

    const allocations = allocateSignedByUnits(cents, unitsByBrand);
    for (const [brand, allocatedCents] of Object.entries(allocations)) {
      addCents(allocationsByBucket[bucket], brand, allocatedCents);

      const brandSkuUnits = unitsByBrandSku.get(brand);
      if (brandSkuUnits === undefined) {
        throw new PnlAllocationNoWeightsError(`Cannot allocate SKU breakdown for brand ${brand}: missing unit weights`);
      }
      const skuAllocations = allocateSignedByWeights(
        allocatedCents,
        brandSkuUnits,
        `Cannot allocate SKU breakdown for brand ${brand}: zero unit weights`,
      );
      for (const [allocatedSku, allocatedSkuCents] of Object.entries(skuAllocations)) {
        addSkuCents(skuBreakdownByBucketBrand[bucket], brand, allocatedSku, allocatedSkuCents);
      }
    }
  }

  return { invoiceId, allocationsByBucket, skuBreakdownByBucketBrand };
}
