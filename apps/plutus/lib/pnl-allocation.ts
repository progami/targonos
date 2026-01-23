import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import { allocateByWeight, toCents } from '@/lib/inventory/money';

export type PnlBucketKey =
  | 'amazonSellerFees'
  | 'amazonFbaFees'
  | 'amazonStorageFees'
  | 'amazonAdvertisingCosts'
  | 'amazonPromotions'
  | 'amazonFbaInventoryReimbursement';

export type PnlAllocation = {
  invoiceId: string;
  allocationsByBucket: Record<PnlBucketKey, Record<string, number>>;
};

export type BrandResolver = {
  getBrandForSku: (sku: string) => string;
};

function classifyBucket(description: string): PnlBucketKey | null {
  const normalized = description.trim();

  if (normalized.startsWith('Amazon Seller Fees')) return 'amazonSellerFees';
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

function allocateSignedByUnits(
  totalCents: number,
  unitsByBrand: Map<string, number>,
): Record<string, number> {
  const sign = totalCents < 0 ? -1 : 1;
  const abs = Math.abs(totalCents);

  const weights = Array.from(unitsByBrand.entries()).map(([brand, units]) => ({
    key: brand,
    weight: units,
  }));

  const allocated = allocateByWeight(abs, weights);
  const result: Record<string, number> = {};
  for (const [brand, cents] of Object.entries(allocated)) {
    result[brand] = sign * cents;
  }
  return result;
}

function addCents(target: Record<string, number>, brand: string, cents: number) {
  const current = target[brand];
  target[brand] = (current === undefined ? 0 : current) + cents;
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
  };

  // Units sold by brand (weights for non-SKU lines)
  const unitsByBrand = new Map<string, number>();
  for (const row of rows) {
    const sku = row.sku.trim();
    if (sku === '') continue;
    if (!isSalesPrincipal(row.description)) continue;
    if (!Number.isFinite(row.quantity) || row.quantity <= 0) continue;

    const brand = brandResolver.getBrandForSku(sku);
    const current = unitsByBrand.get(brand);
    unitsByBrand.set(brand, (current === undefined ? 0 : current) + row.quantity);
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
      continue;
    }

    const allocations = allocateSignedByUnits(cents, unitsByBrand);
    for (const [brand, allocatedCents] of Object.entries(allocations)) {
      addCents(allocationsByBucket[bucket], brand, allocatedCents);
    }
  }

  return { invoiceId, allocationsByBucket };
}

