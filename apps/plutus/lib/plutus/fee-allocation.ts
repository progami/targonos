import { allocateByWeight } from '@/lib/inventory/money';
import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import type { PnlBucketKey } from '@/lib/pnl-allocation';
import { classifyPnlBucket } from '@/lib/pnl-allocation';
import { db } from '@/lib/db';
import { isRefundPrincipal, isSalePrincipal, normalizeSku } from './settlement-validation';

const ADS_REPORT_TYPE = 'SP_ADVERTISED_PRODUCT';
const AWD_REPORT_TYPE = 'AWD_FEE_MONTHLY';

function parseIsoDay(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ISO day: ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function diffDays(start: string, end: string): number {
  const startDate = parseIsoDay(start);
  const endDate = parseIsoDay(end);
  return Math.floor((endDate.getTime() - startDate.getTime()) / 86400000);
}

function chooseBestUpload<T extends { startDate: string; endDate: string; uploadedAt: Date }>(uploads: T[]): T | null {
  let best: { upload: T; windowDays: number } | null = null;

  for (const upload of uploads) {
    const windowDays = diffDays(upload.startDate, upload.endDate);
    if (best === null) {
      best = { upload, windowDays };
      continue;
    }
    if (windowDays < best.windowDays) {
      best = { upload, windowDays };
      continue;
    }
    if (windowDays === best.windowDays && upload.uploadedAt > best.upload.uploadedAt) {
      best = { upload, windowDays };
    }
  }

  if (best === null) {
    return null;
  }
  return best.upload;
}

function overlapDays(input: { startA: string; endA: string; startB: string; endB: string }): number {
  const start = input.startA > input.startB ? input.startA : input.startB;
  const end = input.endA < input.endB ? input.endA : input.endB;
  if (start > end) {
    return 0;
  }
  return diffDays(start, end) + 1;
}

function daysInRange(start: string, end: string): number {
  return diffDays(start, end) + 1;
}

function centsFromNet(value: number): number {
  return Math.round(value * 100);
}

function isoDayAddDays(value: string, deltaDays: number): string {
  const date = parseIsoDay(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function sumSkuAbsCentsByBucket(rows: LmbAuditRow[], bucket: PnlBucketKey): Record<string, number> {
  const weightsBySku: Record<string, number> = {};
  for (const row of rows) {
    if (classifyPnlBucket(row.description) !== bucket) continue;
    const skuRaw = row.sku.trim();
    if (skuRaw === '') continue;
    const cents = centsFromNet(row.net);
    const weight = Math.abs(cents);
    if (weight <= 0) continue;
    const sku = normalizeSku(skuRaw);
    const existing = weightsBySku[sku];
    weightsBySku[sku] = (existing === undefined ? 0 : existing) + weight;
  }
  return weightsBySku;
}

function sumSkuAbsPrincipalCents(rows: LmbAuditRow[]): Record<string, number> {
  const weightsBySku: Record<string, number> = {};
  for (const row of rows) {
    const description = row.description.trim();
    if (!isSalePrincipal(description) && !isRefundPrincipal(description)) continue;
    const skuRaw = row.sku.trim();
    if (skuRaw === '') continue;
    const cents = centsFromNet(row.net);
    const weight = Math.abs(cents);
    if (weight <= 0) continue;
    const sku = normalizeSku(skuRaw);
    const existing = weightsBySku[sku];
    weightsBySku[sku] = (existing === undefined ? 0 : existing) + weight;
  }
  return weightsBySku;
}

function pickSkuWeightsForSkuLessBucket(input: {
  rows: LmbAuditRow[];
  bucket: PnlBucketKey;
  principalWeightsBySku: Record<string, number>;
  fallbackWeightsBySku: Record<string, number>;
}): Record<string, number> {
  const rows = input.rows;
  const bucket = input.bucket;

  const byBucket = sumSkuAbsCentsByBucket(rows, bucket);
  if (Object.keys(byBucket).length > 0) {
    return byBucket;
  }

  if (Object.keys(input.principalWeightsBySku).length > 0) {
    return input.principalWeightsBySku;
  }

  return input.fallbackWeightsBySku;
}

function sumSkuLessTotalsByBucket(rows: LmbAuditRow[]): Partial<Record<PnlBucketKey, number>> {
  const totals: Partial<Record<PnlBucketKey, number>> = {};
  for (const row of rows) {
    const bucket = classifyPnlBucket(row.description);
    if (bucket === null) continue;
    if (row.sku.trim() !== '') continue;
    const cents = centsFromNet(row.net);
    const current = totals[bucket];
    if (current === undefined) {
      totals[bucket] = cents;
    } else {
      totals[bucket] = current + cents;
    }
  }
  return totals;
}

function sumRecordValues(record: Record<string, number>): number {
  let total = 0;
  for (const value of Object.values(record)) {
    total += value;
  }
  return total;
}

function allocateSignedByWeight(input: {
  totalCents: number;
  weightsBySku: Record<string, number>;
}): Record<string, number> {
  const totalCents = input.totalCents;
  const sign = totalCents < 0 ? -1 : 1;
  const absTotal = Math.abs(totalCents);
  const weights = Object.entries(input.weightsBySku)
    .filter((entry) => entry[0] !== '' && Number.isFinite(entry[1]) && entry[1] > 0)
    .map((entry) => ({ key: entry[0], weight: entry[1] }));
  if (weights.length === 0) {
    return {};
  }
  const allocated = allocateByWeight(absTotal, weights);
  const signed: Record<string, number> = {};
  for (const [sku, cents] of Object.entries(allocated)) {
    signed[sku] = sign * cents;
  }
  return signed;
}

type AllocationIssue = {
  bucket: PnlBucketKey;
  message: string;
};

const DETERMINISTIC_SOURCE_GUIDANCE: Record<PnlBucketKey, string> = {
  amazonSellerFees:
    'Missing deterministic source for SKU-less Amazon Seller Fees. Provide seller fee detail report/API data at SKU level.',
  amazonFbaFees:
    'Missing deterministic source for SKU-less Amazon FBA Fees. Provide FBA fee detail report/API data at SKU level.',
  amazonStorageFees:
    'Missing deterministic source for SKU-less Amazon Storage Fees. Provide storage fee detail report/API data at SKU level.',
  amazonAdvertisingCosts:
    'Missing deterministic source for SKU-less Amazon Advertising Costs. Upload Ads Data that covers the invoice range and ties to billed amount.',
  amazonPromotions:
    'Missing deterministic source for SKU-less Amazon Promotions. Provide promotions chargeback detail report/API data at SKU level.',
  amazonFbaInventoryReimbursement:
    'Missing deterministic source for SKU-less Amazon FBA Inventory Reimbursement. Provide reimbursement detail report/API data at SKU level.',
  warehousingAwd:
    'Missing deterministic source for SKU-less AWD fees. Upload AWD monthly fee report covering the invoice range.',
};

export function deterministicSourceGuidanceForBucket(bucket: PnlBucketKey): string {
  return DETERMINISTIC_SOURCE_GUIDANCE[bucket];
}

function marketCodeForMarketplace(marketplace: 'amazon.com' | 'amazon.co.uk'): 'us' | 'uk' {
  if (marketplace === 'amazon.com') return 'us';
  return 'uk';
}

async function loadTrailingPrincipalWeightsBySku(input: {
  marketplace: 'amazon.com' | 'amazon.co.uk';
  invoiceEndDate: string;
  lookbackDays: number;
  skuToBrand: Map<string, string>;
}): Promise<Record<string, number>> {
  const market = marketCodeForMarketplace(input.marketplace);
  const startDate = isoDayAddDays(input.invoiceEndDate, -input.lookbackDays);

  const saleRows = await db.auditDataRow.findMany({
    where: {
      market: { equals: market, mode: 'insensitive' },
      date: { gte: startDate, lte: input.invoiceEndDate },
      description: { startsWith: 'Amazon Sales - Principal' },
      sku: { not: '' },
    },
    select: { sku: true, net: true },
  });

  const refundRows = await db.auditDataRow.findMany({
    where: {
      market: { equals: market, mode: 'insensitive' },
      date: { gte: startDate, lte: input.invoiceEndDate },
      description: { startsWith: 'Amazon Refunds - Refunded Principal' },
      sku: { not: '' },
    },
    select: { sku: true, net: true },
  });

  const weightsBySku: Record<string, number> = {};
  for (const row of [...saleRows, ...refundRows]) {
    const skuRaw = row.sku.trim();
    if (skuRaw === '') continue;
    const sku = normalizeSku(skuRaw);
    if (!input.skuToBrand.has(sku)) continue;
    const cents = row.net;
    if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
      throw new Error(`Invalid audit net cents for trailing principal weights: ${String(cents)}`);
    }
    const weight = Math.abs(cents);
    if (weight <= 0) continue;
    const existing = weightsBySku[sku];
    weightsBySku[sku] = (existing === undefined ? 0 : existing) + weight;
  }

  return weightsBySku;
}

function buildEqualBrandWeightsBySku(skuToBrand: Map<string, string>): Record<string, number> {
  const minSkuByBrand = new Map<string, string>();
  for (const [sku, brand] of skuToBrand.entries()) {
    const existing = minSkuByBrand.get(brand);
    if (existing === undefined || sku < existing) {
      minSkuByBrand.set(brand, sku);
    }
  }

  const weightsBySku: Record<string, number> = {};
  for (const sku of Array.from(minSkuByBrand.values()).sort()) {
    weightsBySku[sku] = 1;
  }

  return weightsBySku;
}

export async function buildDeterministicSkuAllocations(input: {
  rows: LmbAuditRow[];
  marketplace: 'amazon.com' | 'amazon.co.uk';
  invoiceStartDate: string;
  invoiceEndDate: string;
  skuToBrand: Map<string, string>;
}): Promise<{
  skuAllocationsByBucket: Partial<Record<PnlBucketKey, Record<string, number>>>;
  issues: AllocationIssue[];
}> {
  const skuAllocationsByBucket: Partial<Record<PnlBucketKey, Record<string, number>>> = {};
  const issues: AllocationIssue[] = [];
  const skuLessTotalsByBucket = sumSkuLessTotalsByBucket(input.rows);
  const principalWeightsBySku = sumSkuAbsPrincipalCents(input.rows);

  let fallbackWeightsBySku: Record<string, number> = {};
  const needsFallbackWeights =
    Object.keys(principalWeightsBySku).length === 0 &&
    Object.entries(skuLessTotalsByBucket).some((entry) => {
      const total = entry[1];
      return total !== undefined && total !== 0;
    });

  if (needsFallbackWeights) {
    const trailing90 = await loadTrailingPrincipalWeightsBySku({
      marketplace: input.marketplace,
      invoiceEndDate: input.invoiceEndDate,
      lookbackDays: 90,
      skuToBrand: input.skuToBrand,
    });

    if (Object.keys(trailing90).length > 0) {
      fallbackWeightsBySku = trailing90;
    } else {
      const trailing365 = await loadTrailingPrincipalWeightsBySku({
        marketplace: input.marketplace,
        invoiceEndDate: input.invoiceEndDate,
        lookbackDays: 365,
        skuToBrand: input.skuToBrand,
      });

      if (Object.keys(trailing365).length > 0) {
        fallbackWeightsBySku = trailing365;
      } else {
        fallbackWeightsBySku = buildEqualBrandWeightsBySku(input.skuToBrand);
      }
    }
  }

  const sellerFeesSkuLessTotal = skuLessTotalsByBucket.amazonSellerFees;
  if (sellerFeesSkuLessTotal !== undefined && sellerFeesSkuLessTotal !== 0) {
    const weightsBySku = pickSkuWeightsForSkuLessBucket({
      rows: input.rows,
      bucket: 'amazonSellerFees',
      principalWeightsBySku,
      fallbackWeightsBySku,
    });
    const allocated = allocateSignedByWeight({
      totalCents: sellerFeesSkuLessTotal,
      weightsBySku,
    });

    if (Object.keys(allocated).length > 0) {
      skuAllocationsByBucket.amazonSellerFees = allocated;
    }
  }

  const fbaFeesSkuLessTotal = skuLessTotalsByBucket.amazonFbaFees;
  if (fbaFeesSkuLessTotal !== undefined && fbaFeesSkuLessTotal !== 0) {
    const weightsBySku = pickSkuWeightsForSkuLessBucket({
      rows: input.rows,
      bucket: 'amazonFbaFees',
      principalWeightsBySku,
      fallbackWeightsBySku,
    });
    const allocated = allocateSignedByWeight({
      totalCents: fbaFeesSkuLessTotal,
      weightsBySku,
    });

    if (Object.keys(allocated).length > 0) {
      skuAllocationsByBucket.amazonFbaFees = allocated;
    }
  }

  const storageFeesSkuLessTotal = skuLessTotalsByBucket.amazonStorageFees;
  if (storageFeesSkuLessTotal !== undefined && storageFeesSkuLessTotal !== 0) {
    const weightsBySku = pickSkuWeightsForSkuLessBucket({
      rows: input.rows,
      bucket: 'amazonStorageFees',
      principalWeightsBySku,
      fallbackWeightsBySku,
    });
    const allocated = allocateSignedByWeight({
      totalCents: storageFeesSkuLessTotal,
      weightsBySku,
    });

    if (Object.keys(allocated).length > 0) {
      skuAllocationsByBucket.amazonStorageFees = allocated;
    }
  }

  const promotionsSkuLessTotal = skuLessTotalsByBucket.amazonPromotions;
  if (promotionsSkuLessTotal !== undefined && promotionsSkuLessTotal !== 0) {
    const weightsBySku = pickSkuWeightsForSkuLessBucket({
      rows: input.rows,
      bucket: 'amazonPromotions',
      principalWeightsBySku,
      fallbackWeightsBySku,
    });
    const allocated = allocateSignedByWeight({
      totalCents: promotionsSkuLessTotal,
      weightsBySku,
    });

    if (Object.keys(allocated).length > 0) {
      skuAllocationsByBucket.amazonPromotions = allocated;
    }
  }

  const reimbursementSkuLessTotal = skuLessTotalsByBucket.amazonFbaInventoryReimbursement;
  if (reimbursementSkuLessTotal !== undefined && reimbursementSkuLessTotal !== 0) {
    const weightsBySku = pickSkuWeightsForSkuLessBucket({
      rows: input.rows,
      bucket: 'amazonFbaInventoryReimbursement',
      principalWeightsBySku,
      fallbackWeightsBySku,
    });
    const allocated = allocateSignedByWeight({
      totalCents: reimbursementSkuLessTotal,
      weightsBySku,
    });

    if (Object.keys(allocated).length > 0) {
      skuAllocationsByBucket.amazonFbaInventoryReimbursement = allocated;
    }
  }

  const adsSkuLessTotal = skuLessTotalsByBucket.amazonAdvertisingCosts;
  if (adsSkuLessTotal !== undefined && adsSkuLessTotal !== 0) {
    const adsUploads = await db.adsDataUpload.findMany({
      where: {
        reportType: ADS_REPORT_TYPE,
        marketplace: input.marketplace,
        startDate: { lte: input.invoiceStartDate },
        endDate: { gte: input.invoiceEndDate },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    const upload = chooseBestUpload(adsUploads);
    if (upload === null) {
      const weightsBySku = pickSkuWeightsForSkuLessBucket({
        rows: input.rows,
        bucket: 'amazonAdvertisingCosts',
        principalWeightsBySku,
        fallbackWeightsBySku,
      });
      const allocated = allocateSignedByWeight({
        totalCents: adsSkuLessTotal,
        weightsBySku,
      });

      if (Object.keys(allocated).length > 0) {
        skuAllocationsByBucket.amazonAdvertisingCosts = allocated;
      } else {
        issues.push({
          bucket: 'amazonAdvertisingCosts',
          message: 'Missing Ads Data upload covering invoice date range',
        });
      }
    } else {
      const grouped = await db.adsDataRow.groupBy({
        by: ['sku'],
        where: {
          uploadId: upload.id,
          date: { gte: input.invoiceStartDate, lte: input.invoiceEndDate },
        },
        _sum: { spendCents: true },
      });

      const bySku: Record<string, number> = {};
      for (const row of grouped) {
        const sku = normalizeSku(row.sku);
        const rawWeight = row._sum.spendCents;
        if (rawWeight === null) {
          continue;
        }
        if (!Number.isInteger(rawWeight) || rawWeight <= 0) {
          continue;
        }
        const existing = bySku[sku];
        if (existing === undefined) {
          bySku[sku] = rawWeight;
        } else {
          bySku[sku] = existing + rawWeight;
        }
      }

      const allocated = allocateSignedByWeight({
        totalCents: adsSkuLessTotal,
        weightsBySku: bySku,
      });

      const expected = Math.abs(adsSkuLessTotal);
      const weightsTotal = sumRecordValues(bySku);
      if (weightsTotal !== expected) {
        const weightsBySku = pickSkuWeightsForSkuLessBucket({
          rows: input.rows,
          bucket: 'amazonAdvertisingCosts',
          principalWeightsBySku,
          fallbackWeightsBySku,
        });
        const fallbackAllocated = allocateSignedByWeight({
          totalCents: adsSkuLessTotal,
          weightsBySku,
        });

        if (Object.keys(fallbackAllocated).length > 0) {
          skuAllocationsByBucket.amazonAdvertisingCosts = fallbackAllocated;
        } else {
          issues.push({
            bucket: 'amazonAdvertisingCosts',
            message: `Ads report total mismatch (${weightsTotal} vs ${expected})`,
          });
        }
      } else {
        skuAllocationsByBucket.amazonAdvertisingCosts = allocated;
      }
    }
  }

  const awdSkuLessTotal = skuLessTotalsByBucket.warehousingAwd;
  if (awdSkuLessTotal !== undefined && awdSkuLessTotal !== 0) {
    const awdUploads = await db.awdDataUpload.findMany({
      where: {
        reportType: AWD_REPORT_TYPE,
        marketplace: input.marketplace,
        startDate: { lte: input.invoiceStartDate },
        endDate: { gte: input.invoiceEndDate },
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        uploadedAt: true,
      },
      orderBy: { uploadedAt: 'desc' },
    });

    const upload = chooseBestUpload(awdUploads);
    if (upload === null) {
      const weightsBySku = pickSkuWeightsForSkuLessBucket({
        rows: input.rows,
        bucket: 'warehousingAwd',
        principalWeightsBySku,
        fallbackWeightsBySku,
      });
      const allocated = allocateSignedByWeight({
        totalCents: awdSkuLessTotal,
        weightsBySku,
      });

      if (Object.keys(allocated).length > 0) {
        skuAllocationsByBucket.warehousingAwd = allocated;
      } else {
        issues.push({
          bucket: 'warehousingAwd',
          message: 'Missing AWD report upload covering invoice date range',
        });
      }
    } else {
      const rows = await db.awdDataRow.findMany({
        where: { uploadId: upload.id },
        select: {
          sku: true,
          feeCents: true,
          monthStartDate: true,
          monthEndDate: true,
        },
      });

      const weightsBySku: Record<string, number> = {};
      for (const row of rows) {
        const overlap = overlapDays({
          startA: input.invoiceStartDate,
          endA: input.invoiceEndDate,
          startB: row.monthStartDate,
          endB: row.monthEndDate,
        });
        if (overlap <= 0) {
          continue;
        }
        const monthDays = daysInRange(row.monthStartDate, row.monthEndDate);
        if (monthDays <= 0) {
          continue;
        }
        const sku = normalizeSku(row.sku);
        const scaledWeight = Math.round((row.feeCents * overlap * 1000) / monthDays);
        if (scaledWeight <= 0) {
          continue;
        }
        const existing = weightsBySku[sku];
        if (existing === undefined) {
          weightsBySku[sku] = scaledWeight;
        } else {
          weightsBySku[sku] = existing + scaledWeight;
        }
      }

      const allocated = allocateSignedByWeight({
        totalCents: awdSkuLessTotal,
        weightsBySku,
      });

      if (Object.keys(allocated).length === 0) {
        issues.push({
          bucket: 'warehousingAwd',
          message: 'AWD report has no overlapping SKU weights for invoice range',
        });
      } else {
        skuAllocationsByBucket.warehousingAwd = allocated;
      }
    }
  }

  return { skuAllocationsByBucket, issues };
}
