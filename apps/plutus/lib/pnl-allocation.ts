import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import { toCents } from '@/lib/inventory/money';

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
  unallocatedSkuLessBuckets: Array<{ bucket: PnlBucketKey; totalCents: number; reason: string }>;
};

export type BrandResolver = {
  getBrandForSku: (sku: string) => string;
};

export type PnlAllocationOptions = {
  skuAllocationsByBucket?: Partial<Record<PnlBucketKey, Record<string, number>>>;
};

export function classifyPnlBucket(description: string): PnlBucketKey | null {
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

export function computePnlAllocation(
  rows: LmbAuditRow[],
  brandResolver: BrandResolver,
  options?: PnlAllocationOptions,
): PnlAllocation {
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
  const unallocatedSkuLessBuckets: Array<{ bucket: PnlBucketKey; totalCents: number; reason: string }> = [];

  const skuLessTotalsByBucket = new Map<PnlBucketKey, number>();
  for (const row of rows) {
    const bucket = classifyPnlBucket(row.description);
    if (!bucket) continue;

    const cents = toCents(row.net);
    if (!Number.isInteger(cents)) {
      throw new Error('Net cents must be an integer');
    }

    const skuRaw = row.sku.trim();
    if (skuRaw !== '') {
      const brand = brandResolver.getBrandForSku(skuRaw);
      addCents(allocationsByBucket[bucket], brand, cents);
      addSkuCents(skuBreakdownByBucketBrand[bucket], brand, skuRaw, cents);
      continue;
    }

    const current = skuLessTotalsByBucket.get(bucket);
    if (current === undefined) {
      skuLessTotalsByBucket.set(bucket, cents);
    } else {
      skuLessTotalsByBucket.set(bucket, current + cents);
    }
  }

  for (const [bucket, totalCents] of skuLessTotalsByBucket.entries()) {
    if (totalCents === 0) continue;
    if (!options?.skuAllocationsByBucket) {
      unallocatedSkuLessBuckets.push({
        bucket,
        totalCents,
        reason: 'Missing deterministic SKU allocation for SKU-less rows',
      });
      continue;
    }
    const skuAllocations = options.skuAllocationsByBucket[bucket];
    if (!skuAllocations) {
      unallocatedSkuLessBuckets.push({
        bucket,
        totalCents,
        reason: 'Missing deterministic SKU allocation for SKU-less rows',
      });
      continue;
    }

    let allocatedTotal = 0;
    for (const cents of Object.values(skuAllocations)) {
      allocatedTotal += cents;
    }
    if (allocatedTotal !== totalCents) {
      unallocatedSkuLessBuckets.push({
        bucket,
        totalCents,
        reason: `Deterministic allocation total mismatch (${allocatedTotal} vs ${totalCents})`,
      });
      continue;
    }

    for (const [skuRaw, cents] of Object.entries(skuAllocations)) {
      if (cents === 0) continue;
      const sku = skuRaw.trim();
      if (sku === '') continue;
      const brand = brandResolver.getBrandForSku(sku);
      addCents(allocationsByBucket[bucket], brand, cents);
      addSkuCents(skuBreakdownByBucketBrand[bucket], brand, sku, cents);
    }
  }

  return { invoiceId, allocationsByBucket, skuBreakdownByBucketBrand, unallocatedSkuLessBuckets };
}
