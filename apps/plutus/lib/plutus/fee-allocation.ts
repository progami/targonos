import { allocateByWeight } from '@/lib/inventory/money';
import type { PnlBucketKey } from '@/lib/pnl-allocation';
import { classifyPnlBucket } from '@/lib/pnl-allocation';
import { db } from '@/lib/db';
import { isRefundPrincipal, isSalePrincipal, normalizeSku } from './settlement-validation';
import type { SettlementAuditRow } from './settlement-audit';

const AWD_REPORT_TYPE = 'AWD_FEE_MONTHLY';

type AwdFeeType = 'STORAGE_FEE' | 'PROCESSING_FEE' | 'TRANSPORTATION_FEE';

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

function centsFromNet(value: number): number {
  return Math.round(value * 100);
}

function monthWindowOffsetForIsoDay(value: string, deltaMonths: number): { monthStart: string; monthEnd: string } {
  const date = parseIsoDay(value);
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  start.setUTCMonth(start.getUTCMonth() + deltaMonths);

  const monthStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return {
    monthStart: monthStart.toISOString().slice(0, 10),
    monthEnd: monthEnd.toISOString().slice(0, 10),
  };
}

function awdFeeTypeFromDescription(description: string): AwdFeeType | null {
  const normalized = description.trim().toLowerCase();
  if (!normalized.includes('awd')) return null;
  if (normalized.includes('storage fee')) return 'STORAGE_FEE';
  if (normalized.includes('processing fee')) return 'PROCESSING_FEE';
  if (normalized.includes('transportation fee')) return 'TRANSPORTATION_FEE';
  return null;
}

function sumSkuLessAwdFeeTotals(rows: SettlementAuditRow[]): {
  totalsByFeeType: Partial<Record<AwdFeeType, number>>;
  unknownDescriptions: string[];
} {
  const totalsByFeeType: Partial<Record<AwdFeeType, number>> = {};
  const unknownDescriptions = new Set<string>();

  for (const row of rows) {
    if (classifyPnlBucket(row.description) !== 'warehousingAwd') continue;
    if (row.sku.trim() !== '') continue;

    const feeType = awdFeeTypeFromDescription(row.description);
    if (feeType === null) {
      unknownDescriptions.add(row.description.trim());
      continue;
    }
    const cents = centsFromNet(row.net);
    const existing = totalsByFeeType[feeType];
    totalsByFeeType[feeType] = (existing === undefined ? 0 : existing) + cents;
  }

  return {
    totalsByFeeType,
    unknownDescriptions: Array.from(unknownDescriptions).sort(),
  };
}

function monthOffsetForAwdFeeType(feeType: AwdFeeType): number {
  if (feeType === 'STORAGE_FEE') return -1;
  return 0;
}

function sumChargeTypeTotals(rows: Array<{ chargeType: string | null; sku: string; feeCents: number }>): Map<
  string | null,
  { totalCents: number; feeCentsBySku: Record<string, number> }
> {
  const byChargeType = new Map<string | null, { totalCents: number; feeCentsBySku: Record<string, number> }>();

  for (const row of rows) {
    const chargeType = row.chargeType;
    const existing = byChargeType.get(chargeType);
    const sku = normalizeSku(row.sku);
    if (sku === '') continue;

    if (existing === undefined) {
      byChargeType.set(chargeType, {
        totalCents: row.feeCents,
        feeCentsBySku: { [sku]: row.feeCents },
      });
      continue;
    }

    existing.totalCents += row.feeCents;
    const current = existing.feeCentsBySku[sku];
    existing.feeCentsBySku[sku] = (current === undefined ? 0 : current) + row.feeCents;
  }

  return byChargeType;
}

function buildChargeTypeBreakdownString(byChargeType: Map<string | null, { totalCents: number }>): string {
  const parts: string[] = [];
  for (const [chargeType, totals] of byChargeType.entries()) {
    const label = chargeType === null ? 'Unspecified' : chargeType;
    parts.push(`${label}=${totals.totalCents}`);
  }
  parts.sort();
  return parts.join(', ');
}

function sumSkuAbsCentsByBucket(rows: SettlementAuditRow[], bucket: PnlBucketKey): Record<string, number> {
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

function sumSkuAbsPrincipalCents(rows: SettlementAuditRow[]): Record<string, number> {
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
  rows: SettlementAuditRow[];
  bucket: PnlBucketKey;
  principalWeightsBySku: Record<string, number>;
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

  return {};
}

function sumSkuLessTotalsByBucket(rows: SettlementAuditRow[]): Partial<Record<PnlBucketKey, number>> {
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
    'Amazon Advertising Costs are posted without SKU-level allocation.',
  amazonPromotions:
    'Missing deterministic source for SKU-less Amazon Promotions. Provide promotions chargeback detail report/API data at SKU level.',
  amazonFbaInventoryReimbursement:
    'Missing deterministic source for SKU-less Amazon FBA Inventory Reimbursement. Provide reimbursement detail report/API data at SKU level.',
  warehousingAwd:
    'Missing deterministic source for SKU-less AWD fees. Upload AWD fee report covering the invoice range and matching fee types (e.g., STORAGE_FEE / PROCESSING_FEE / TRANSPORTATION_FEE).',
};

export function deterministicSourceGuidanceForBucket(bucket: PnlBucketKey): string {
  return DETERMINISTIC_SOURCE_GUIDANCE[bucket];
}

export async function buildDeterministicSkuAllocations(input: {
  rows: SettlementAuditRow[];
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

  const sellerFeesSkuLessTotal = skuLessTotalsByBucket.amazonSellerFees;
  if (sellerFeesSkuLessTotal !== undefined && sellerFeesSkuLessTotal !== 0) {
    const weightsBySku = pickSkuWeightsForSkuLessBucket({
      rows: input.rows,
      bucket: 'amazonSellerFees',
      principalWeightsBySku,
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
    });
    const allocated = allocateSignedByWeight({
      totalCents: reimbursementSkuLessTotal,
      weightsBySku,
    });

    if (Object.keys(allocated).length > 0) {
      skuAllocationsByBucket.amazonFbaInventoryReimbursement = allocated;
    }
  }

  const awdSkuLessTotal = skuLessTotalsByBucket.warehousingAwd;
  if (awdSkuLessTotal !== undefined && awdSkuLessTotal !== 0) {
    const awdFeeTotals = sumSkuLessAwdFeeTotals(input.rows);
    const awdIssueStart = issues.length;

    if (awdFeeTotals.unknownDescriptions.length > 0) {
      issues.push({
        bucket: 'warehousingAwd',
        message: `Unrecognized AWD fee descriptions: ${awdFeeTotals.unknownDescriptions.join(', ')}`,
      });
    }

    const requiredFeeTypes = (Object.keys(awdFeeTotals.totalsByFeeType) as AwdFeeType[]).filter((feeType) => {
      const total = awdFeeTotals.totalsByFeeType[feeType];
      return total !== undefined && total !== 0;
    });

    if (requiredFeeTypes.length === 0) {
      issues.push({
        bucket: 'warehousingAwd',
        message: 'Cannot determine required AWD fee types from SKU-less rows',
      });
    }

    if (issues.length === awdIssueStart && requiredFeeTypes.length > 0) {
      const awdAllocationsBySku: Record<string, number> = {};

      for (const feeType of requiredFeeTypes) {
        const expectedTotal = awdFeeTotals.totalsByFeeType[feeType];
        if (expectedTotal === undefined || expectedTotal === 0) continue;

        const monthWindow = monthWindowOffsetForIsoDay(input.invoiceEndDate, monthOffsetForAwdFeeType(feeType));
        const monthStart = monthWindow.monthStart;
        const monthEnd = monthWindow.monthEnd;

        const awdUploads = await db.awdDataUpload.findMany({
          where: {
            reportType: AWD_REPORT_TYPE,
            marketplace: input.marketplace,
            startDate: { lte: monthStart },
            endDate: { gte: monthEnd },
            rows: { some: { feeType } },
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
            message: `Missing AWD report upload for ${feeType} covering ${monthStart}..${monthEnd}`,
          });
          continue;
        }

        const awdRows = await db.awdDataRow.findMany({
          where: {
            uploadId: upload.id,
            feeType,
            monthStartDate: monthStart,
            monthEndDate: monthEnd,
          },
          select: {
            sku: true,
            feeCents: true,
            chargeType: true,
          },
        });

        if (awdRows.length === 0) {
          issues.push({
            bucket: 'warehousingAwd',
            message: `AWD report has no rows for ${feeType} covering ${monthStart}..${monthEnd}`,
          });
          continue;
        }

        const expectedAbs = Math.abs(expectedTotal);
        const sign = expectedTotal < 0 ? -1 : 1;

        const byChargeType = sumChargeTypeTotals(awdRows);
        const chargeTypeBreakdown = buildChargeTypeBreakdownString(byChargeType);

        let selectedFeeCentsBySku: Record<string, number> | null = null;

        if (byChargeType.size === 1) {
          const entry = Array.from(byChargeType.values())[0];
          if (!entry) throw new Error('Missing AWD charge type aggregation');
          if (entry.totalCents !== expectedAbs) {
            issues.push({
              bucket: 'warehousingAwd',
              message: `AWD ${feeType} total mismatch for ${monthStart}..${monthEnd} (${entry.totalCents} vs ${expectedAbs})`,
            });
            continue;
          }
          selectedFeeCentsBySku = entry.feeCentsBySku;
        } else {
          const matching: Array<{ totalCents: number; feeCentsBySku: Record<string, number> }> = [];
          for (const entry of byChargeType.values()) {
            if (entry.totalCents === expectedAbs) {
              matching.push(entry);
            }
          }

          if (matching.length === 1) {
            selectedFeeCentsBySku = matching[0]!.feeCentsBySku;
          } else if (matching.length > 1) {
            issues.push({
              bucket: 'warehousingAwd',
              message: `Ambiguous AWD ${feeType} charge type match for ${monthStart}..${monthEnd} (${chargeTypeBreakdown})`,
            });
            continue;
          } else {
            let totalAll = 0;
            for (const entry of byChargeType.values()) {
              totalAll += entry.totalCents;
            }
            if (totalAll !== expectedAbs) {
              issues.push({
                bucket: 'warehousingAwd',
                message: `AWD ${feeType} total mismatch for ${monthStart}..${monthEnd} (${chargeTypeBreakdown} vs ${expectedAbs})`,
              });
              continue;
            }

            const merged: Record<string, number> = {};
            for (const entry of byChargeType.values()) {
              for (const [sku, cents] of Object.entries(entry.feeCentsBySku)) {
                const current = merged[sku];
                merged[sku] = (current === undefined ? 0 : current) + cents;
              }
            }
            selectedFeeCentsBySku = merged;
          }
        }

        if (selectedFeeCentsBySku === null) {
          issues.push({
            bucket: 'warehousingAwd',
            message: `Failed to select AWD rows for ${feeType} covering ${monthStart}..${monthEnd}`,
          });
          continue;
        }

        const missingSkus: string[] = [];
        for (const sku of Object.keys(selectedFeeCentsBySku)) {
          if (!input.skuToBrand.has(sku)) {
            missingSkus.push(sku);
          }
        }
        if (missingSkus.length > 0) {
          issues.push({
            bucket: 'warehousingAwd',
            message: `AWD report contains SKUs not mapped to brand (${missingSkus.slice(0, 10).join(', ')}${
              missingSkus.length > 10 ? ', ...' : ''
            })`,
          });
          continue;
        }

        let selectedTotal = 0;
        for (const cents of Object.values(selectedFeeCentsBySku)) {
          selectedTotal += cents;
        }
        if (selectedTotal !== expectedAbs) {
          issues.push({
            bucket: 'warehousingAwd',
            message: `AWD ${feeType} allocation total mismatch for ${monthStart}..${monthEnd} (${selectedTotal} vs ${expectedAbs})`,
          });
          continue;
        }

        for (const [sku, cents] of Object.entries(selectedFeeCentsBySku)) {
          const signed = sign * cents;
          const current = awdAllocationsBySku[sku];
          awdAllocationsBySku[sku] = (current === undefined ? 0 : current) + signed;
        }
      }

      if (issues.length === awdIssueStart) {
        const allocatedTotal = sumRecordValues(awdAllocationsBySku);
        if (allocatedTotal !== awdSkuLessTotal) {
          issues.push({
            bucket: 'warehousingAwd',
            message: `AWD allocation total mismatch (${allocatedTotal} vs ${awdSkuLessTotal})`,
          });
        } else {
          skuAllocationsByBucket.warehousingAwd = awdAllocationsBySku;
        }
      }
    }
  }

  return { skuAllocationsByBucket, issues };
}
