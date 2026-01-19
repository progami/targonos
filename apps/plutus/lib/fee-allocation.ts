import type { LmbAuditRow } from '@/lib/lmb/audit-csv';

export type FeeBucket =
  | 'Amazon Seller Fees'
  | 'Amazon FBA Fees'
  | 'Amazon Storage Fees'
  | 'Amazon Advertising Costs'
  | 'Amazon Promotions'
  | 'Warehousing:AWD'
  | 'Warehousing:Amazon FC';

export type BrandAllocation = {
  brand: string;
  amount: number;
};

export type FeeAllocationResult = {
  invoice: string;
  market: string;
  allocationsByBucket: Record<FeeBucket, BrandAllocation[]>;
};

export type BrandMap = {
  getBrandForSku: (sku: string) => string;
  getAllBrands: () => string[];
};

function classifyFeeBucket(description: string): FeeBucket | null {
  const normalized = description.trim();

  if (normalized.startsWith('Amazon Seller Fees')) {
    return 'Amazon Seller Fees';
  }

  if (normalized.startsWith('Amazon FBA Fees - AWD ')) {
    return 'Warehousing:AWD';
  }

  if (normalized.startsWith('Amazon FBA Fees')) {
    return 'Amazon FBA Fees';
  }

  if (normalized.startsWith('Amazon Storage Fees - AWD ')) {
    return 'Warehousing:AWD';
  }

  if (normalized.startsWith('Amazon Storage Fees')) {
    return 'Warehousing:Amazon FC';
  }

  if (normalized.startsWith('Amazon Advertising Costs')) {
    return 'Amazon Advertising Costs';
  }

  if (normalized.startsWith('Amazon Promotions')) {
    return 'Amazon Promotions';
  }

  return null;
}

function sum(numbers: number[]): number {
  let total = 0;
  for (const n of numbers) {
    total += n;
  }
  return total;
}

function round2(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function computeUnitsByBrand(rows: LmbAuditRow[], brandMap: BrandMap): Map<string, number> {
  const unitsByBrand = new Map<string, number>();

  for (const row of rows) {
    const sku = row.sku.trim();
    if (sku === '') continue;

    const qty = row.quantity;
    if (!Number.isFinite(qty)) continue;

    const brand = brandMap.getBrandForSku(sku);

    const current = unitsByBrand.get(brand);
    unitsByBrand.set(brand, (current === undefined ? 0 : current) + qty);
  }

  return unitsByBrand;
}

function allocateAmountByUnits(amount: number, unitsByBrand: Map<string, number>, brands: string[]): BrandAllocation[] {
  const weights: number[] = [];

  for (const brand of brands) {
    const units = unitsByBrand.get(brand);
    weights.push(units === undefined ? 0 : units);
  }

  const totalUnits = sum(weights);
  if (totalUnits === 0) {
    throw new Error('Cannot allocate fee row: total units is 0');
  }

  const allocations: BrandAllocation[] = [];
  let allocatedSoFar = 0;

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    const weight = weights[i];

    if (i === brands.length - 1) {
      const remainder = round2(amount - allocatedSoFar);
      allocations.push({ brand, amount: remainder });
      break;
    }

    const share = round2((amount * weight) / totalUnits);
    allocatedSoFar = round2(allocatedSoFar + share);
    allocations.push({ brand, amount: share });
  }

  return allocations;
}

export function computeFeeAllocation(
  rows: LmbAuditRow[],
  brandMap: BrandMap,
): FeeAllocationResult {
  if (rows.length === 0) {
    throw new Error('No rows provided');
  }

  const invoice = rows[0].invoice;
  const market = rows[0].market;

  for (const row of rows) {
    if (row.invoice !== invoice) {
      throw new Error('All rows must have the same Invoice');
    }
    if (row.market !== market) {
      throw new Error('All rows must have the same market');
    }
  }

  const brands = brandMap.getAllBrands();
  const unitsByBrand = computeUnitsByBrand(rows, brandMap);

  const allocationsByBucket: Record<FeeBucket, BrandAllocation[]> = {
    'Amazon Seller Fees': [],
    'Amazon FBA Fees': [],
    'Amazon Storage Fees': [],
    'Amazon Advertising Costs': [],
    'Amazon Promotions': [],
    'Warehousing:AWD': [],
    'Warehousing:Amazon FC': [],
  };

  for (const row of rows) {
    const bucket = classifyFeeBucket(row.description);
    if (!bucket) {
      continue;
    }

    const sku = row.sku.trim();

    if (sku !== '') {
      const brand = brandMap.getBrandForSku(sku);
      allocationsByBucket[bucket].push({ brand, amount: round2(row.net) });
      continue;
    }

    const allocations = allocateAmountByUnits(row.net, unitsByBrand, brands);
    for (const allocation of allocations) {
      allocationsByBucket[bucket].push(allocation);
    }
  }

  return {
    invoice,
    market,
    allocationsByBucket,
  };
}
