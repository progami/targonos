import type { SettlementAuditRow } from '@/lib/plutus/settlement-audit';
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
  parentOnlyBuckets?: PnlBucketKey[];
  skuLessParentOnlyBuckets?: PnlBucketKey[];
};

const DEFAULT_PARENT_ONLY_BUCKETS = new Set<PnlBucketKey>([
  'amazonAdvertisingCosts',
]);

const DEFAULT_SKU_LESS_PARENT_ONLY_BUCKETS = new Set<PnlBucketKey>([
  'amazonSellerFees',
  // These buckets often contain SKU-less lines in SP-API settlement data (e.g. monthly storage fees,
  // reimbursements, promo chargebacks). If a SKU is not present, we keep the amount in the parent
  // account rather than guessing an allocation.
  'amazonStorageFees',
  'amazonPromotions',
  'amazonFbaInventoryReimbursement',
]);

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

function isParentOnlySettlementMemo(description: string): boolean {
  const normalized = description.trim();
  if (normalized.startsWith('Amazon Sales -')) return true;
  if (normalized.startsWith('Amazon Refunds -')) return true;
  if (normalized.startsWith('Amazon Sales Tax -')) return true;
  if (normalized.startsWith('Amazon Reserved Balances -')) return true;
  if (normalized.startsWith('Split month settlement -')) return true;
  return false;
}

function isSkuLessParentOnlyMemo(bucket: PnlBucketKey, description: string): boolean {
  const normalized = description.trim();

  // Pick & pack adjustments can be SKU-less. We keep them in the parent Amazon FBA Fees account
  // (no deterministic SKU linkage available from the settlement feed).
  if (bucket === 'amazonFbaFees') {
    if (normalized === 'Amazon FBA Fees - FBA Pick & Pack Fee Adjustment') return true;
    if (normalized === 'Amazon FBA Fees - FBA Pick & Pack Fee Adjustment - Domestic Orders') return true;

    // Domestic-order inbound transportation fees do not currently carry shipment identifiers in
    // SP-API transactions, so we keep them in the parent account (no SKU allocation).
    if (normalized === 'Amazon FBA Fees - FBA Inbound Transportation Fee - Domestic Orders') return true;
    if (normalized === 'Amazon FBA Fees - FBA Inbound Transportation Program Fee - Domestic Orders') return true;
  }

  return false;
}

function shouldRequirePnlBucketClassification(description: string): boolean {
  const normalized = description.trim();
  if (normalized === '') return false;
  if (isParentOnlySettlementMemo(normalized)) return false;
  if (normalized.startsWith('Amazon ')) return true;
  if (/\bAWD\b/i.test(normalized)) return true;
  return false;
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
  rows: SettlementAuditRow[],
  brandResolver: BrandResolver,
  options?: PnlAllocationOptions,
): PnlAllocation {
  if (rows.length === 0) {
    throw new Error('No rows provided');
  }

  const invoiceId = rows[0].invoiceId;
  for (const row of rows) {
    if (row.invoiceId !== invoiceId) {
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
  const parentOnlyBuckets = new Set<PnlBucketKey>(
    options?.parentOnlyBuckets === undefined ? Array.from(DEFAULT_PARENT_ONLY_BUCKETS) : options.parentOnlyBuckets,
  );
  const skuLessParentOnlyBuckets = new Set<PnlBucketKey>(
    options?.skuLessParentOnlyBuckets === undefined
      ? Array.from(DEFAULT_SKU_LESS_PARENT_ONLY_BUCKETS)
      : options.skuLessParentOnlyBuckets,
  );

  const skuLessTotalsByBucket = new Map<PnlBucketKey, number>();
  for (const row of rows) {
    const bucket = classifyPnlBucket(row.description);
    if (!bucket) {
      if (shouldRequirePnlBucketClassification(row.description)) {
        throw new Error(`Unrecognized P&L bucket memo: ${row.description.trim()}`);
      }
      continue;
    }

    if (parentOnlyBuckets.has(bucket)) {
      continue;
    }

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

    if (skuLessParentOnlyBuckets.has(bucket) || isSkuLessParentOnlyMemo(bucket, row.description)) {
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
      if (sku === '') {
        throw new Error(`Deterministic allocation contains empty SKU for bucket ${bucket}`);
      }
      const brand = brandResolver.getBrandForSku(sku);
      addCents(allocationsByBucket[bucket], brand, cents);
      addSkuCents(skuBreakdownByBucketBrand[bucket], brand, sku, cents);
    }
  }

  return { invoiceId, allocationsByBucket, skuBreakdownByBucketBrand, unallocatedSkuLessBuckets };
}
