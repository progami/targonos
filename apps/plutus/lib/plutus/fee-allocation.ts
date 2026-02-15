import { allocateByWeight } from '@/lib/inventory/money';
import type { LmbAuditRow } from '@/lib/lmb/audit-csv';
import type { PnlBucketKey } from '@/lib/pnl-allocation';
import { classifyPnlBucket } from '@/lib/pnl-allocation';
import { db } from '@/lib/db';
import { normalizeSku } from './settlement-validation';

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

export async function buildDeterministicSkuAllocations(input: {
  rows: LmbAuditRow[];
  marketplace: 'amazon.com' | 'amazon.co.uk';
  invoiceStartDate: string;
  invoiceEndDate: string;
}): Promise<{
  skuAllocationsByBucket: Partial<Record<PnlBucketKey, Record<string, number>>>;
  issues: AllocationIssue[];
}> {
  const skuAllocationsByBucket: Partial<Record<PnlBucketKey, Record<string, number>>> = {};
  const issues: AllocationIssue[] = [];
  const skuLessTotalsByBucket = sumSkuLessTotalsByBucket(input.rows);

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
      issues.push({
        bucket: 'amazonAdvertisingCosts',
        message: 'Missing Ads Data upload covering invoice date range',
      });
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
        issues.push({
          bucket: 'amazonAdvertisingCosts',
          message: `Ads report total mismatch (${weightsTotal} vs ${expected})`,
        });
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
      issues.push({
        bucket: 'warehousingAwd',
        message: 'Missing AWD report upload covering invoice date range',
      });
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
