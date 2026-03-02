import {
  fetchInboundShipmentItemsByShipmentId,
  listTransactionsForFinancialEventGroupId,
  listTransactionsForSettlementId,
} from '@/lib/amazon-finances/sp-api-finances';
import type { TenantCode } from '@/lib/amazon-finances/types';
import type { PnlBucketKey } from '@/lib/pnl-allocation';
import { classifyPnlBucket } from '@/lib/pnl-allocation';
import { db } from '@/lib/db';
import { normalizeSku } from './settlement-validation';
import type { SettlementAuditRow } from './settlement-audit';
import {
  allocateShipmentFeeChargesBySkuQuantity,
  extractInboundTransportationServiceFeeCharges,
  isInboundTransportationMemoDescription,
  type InboundShipmentItem,
} from './shipment-fee-allocation';

const AWD_REPORT_TYPE = 'AWD_FEE_MONTHLY';

type AwdFeeType = 'STORAGE_FEE' | 'PROCESSING_FEE' | 'TRANSPORTATION_FEE';
type MarketplaceId = 'amazon.com' | 'amazon.co.uk';

const SETTLEMENT_ID_FILENAME_PATTERN = /spapi-finances-settlement-([A-Za-z0-9][A-Za-z0-9_-]*)/i;
const FBA_INBOUND_LOOKBACK_DAYS = 60;

function tenantCodeForMarketplace(marketplace: MarketplaceId): TenantCode {
  if (marketplace === 'amazon.com') return 'US';
  if (marketplace === 'amazon.co.uk') return 'UK';
  throw new Error(`Unsupported marketplace: ${marketplace}`);
}

function isSkuLessParentOnlyFbaFeeMemo(description: string): boolean {
  const normalized = description.trim();
  if (normalized === 'Amazon FBA Fees - FBA Pick & Pack Fee Adjustment') return true;
  if (normalized === 'Amazon FBA Fees - FBA Pick & Pack Fee Adjustment - Domestic Orders') return true;
  return false;
}

function isSkuLessParentOnlyInboundTransportationMemo(description: string): boolean {
  const normalized = description.trim();
  if (normalized === 'Amazon FBA Fees - FBA Inbound Transportation Fee - Domestic Orders') return true;
  if (normalized === 'Amazon FBA Fees - FBA Inbound Transportation Program Fee - Domestic Orders') return true;
  return false;
}

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

function shiftIsoDay(value: string, deltaDays: number): string {
  const date = parseIsoDay(value);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function dayStartIso(value: string): string {
  return `${value}T00:00:00.000Z`;
}

function dayEndIso(value: string): string {
  return `${value}T23:59:59.999Z`;
}

function nowMinusFiveMinutesIso(): string {
  return new Date(Date.now() - 5 * 60 * 1000).toISOString();
}

function minIsoTimestamp(a: string, b: string): string {
  return a <= b ? a : b;
}

function resolveSettlementId(input: { settlementId?: string; sourceFilename?: string }): string | null {
  const explicit = input.settlementId;
  if (typeof explicit === 'string') {
    const trimmed = explicit.trim();
    if (trimmed !== '') {
      return trimmed;
    }
  }

  const sourceFilename = input.sourceFilename;
  if (typeof sourceFilename !== 'string') return null;
  const trimmed = sourceFilename.trim();
  if (trimmed === '') return null;

  const match = trimmed.match(SETTLEMENT_ID_FILENAME_PATTERN);
  if (!match || !match[1]) return null;
  return match[1].trim();
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

function monthOffsetsForAwdFeeType(feeType: AwdFeeType): number[] {
  if (feeType === 'STORAGE_FEE') return [-1, 0];
  return [0, -1];
}

type AwdFeeResolutionAttempt =
  | {
      ok: true;
      monthStart: string;
      monthEnd: string;
      feeCentsBySku: Record<string, number>;
    }
  | {
      ok: false;
      monthStart: string;
      monthEnd: string;
      message: string;
    };

async function resolveAwdFeeTypeForMonth(input: {
  marketplace: 'amazon.com' | 'amazon.co.uk';
  feeType: AwdFeeType;
  monthStart: string;
  monthEnd: string;
  expectedTotal: number;
  skuToBrand: Map<string, string>;
}): Promise<AwdFeeResolutionAttempt> {
  const monthStart = input.monthStart;
  const monthEnd = input.monthEnd;

  const awdUploads = await db.awdDataUpload.findMany({
    where: {
      reportType: AWD_REPORT_TYPE,
      marketplace: input.marketplace,
      startDate: { lte: monthStart },
      endDate: { gte: monthEnd },
      rows: { some: { feeType: input.feeType } },
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
    return {
      ok: false,
      monthStart,
      monthEnd,
      message: `Missing AWD report upload for ${input.feeType} covering ${monthStart}..${monthEnd}`,
    };
  }

  const awdRows = await db.awdDataRow.findMany({
    where: {
      uploadId: upload.id,
      feeType: input.feeType,
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
    return {
      ok: false,
      monthStart,
      monthEnd,
      message: `AWD report has no rows for ${input.feeType} covering ${monthStart}..${monthEnd}`,
    };
  }

  const expectedAbs = Math.abs(input.expectedTotal);
  const byChargeType = sumChargeTypeTotals(awdRows);
  const chargeTypeBreakdown = buildChargeTypeBreakdownString(byChargeType);

  let selectedFeeCentsBySku: Record<string, number> | null = null;

  if (byChargeType.size === 1) {
    const entry = Array.from(byChargeType.values())[0];
    if (!entry) throw new Error('Missing AWD charge type aggregation');
    if (entry.totalCents !== expectedAbs) {
      return {
        ok: false,
        monthStart,
        monthEnd,
        message: `AWD ${input.feeType} total mismatch for ${monthStart}..${monthEnd} (${entry.totalCents} vs ${expectedAbs})`,
      };
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
      return {
        ok: false,
        monthStart,
        monthEnd,
        message: `Ambiguous AWD ${input.feeType} charge type match for ${monthStart}..${monthEnd} (${chargeTypeBreakdown})`,
      };
    } else {
      let totalAll = 0;
      for (const entry of byChargeType.values()) {
        totalAll += entry.totalCents;
      }
      if (totalAll !== expectedAbs) {
        return {
          ok: false,
          monthStart,
          monthEnd,
          message: `AWD ${input.feeType} total mismatch for ${monthStart}..${monthEnd} (${chargeTypeBreakdown} vs ${expectedAbs})`,
        };
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
    return {
      ok: false,
      monthStart,
      monthEnd,
      message: `Failed to select AWD rows for ${input.feeType} covering ${monthStart}..${monthEnd}`,
    };
  }

  const missingSkus: string[] = [];
  for (const sku of Object.keys(selectedFeeCentsBySku)) {
    if (!input.skuToBrand.has(sku)) {
      missingSkus.push(sku);
    }
  }
  if (missingSkus.length > 0) {
    return {
      ok: false,
      monthStart,
      monthEnd,
      message: `AWD report contains SKUs not mapped to brand (${missingSkus.slice(0, 10).join(', ')}${
        missingSkus.length > 10 ? ', ...' : ''
      })`,
    };
  }

  let selectedTotal = 0;
  for (const cents of Object.values(selectedFeeCentsBySku)) {
    selectedTotal += cents;
  }
  if (selectedTotal !== expectedAbs) {
    return {
      ok: false,
      monthStart,
      monthEnd,
      message: `AWD ${input.feeType} allocation total mismatch for ${monthStart}..${monthEnd} (${selectedTotal} vs ${expectedAbs})`,
    };
  }

  const sign = input.expectedTotal < 0 ? -1 : 1;
  const signedFeeCentsBySku: Record<string, number> = {};
  for (const [sku, cents] of Object.entries(selectedFeeCentsBySku)) {
    signedFeeCentsBySku[sku] = sign * cents;
  }

  return {
    ok: true,
    monthStart,
    monthEnd,
    feeCentsBySku: signedFeeCentsBySku,
  };
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

function sumSkuLessTotalsByDescription(rows: SettlementAuditRow[], bucket: PnlBucketKey): Map<string, number> {
  const totalsByDescription = new Map<string, number>();
  for (const row of rows) {
    if (classifyPnlBucket(row.description) !== bucket) continue;
    if (row.sku.trim() !== '') continue;

    const description = row.description.trim();
    if (description === '') continue;

    const cents = centsFromNet(row.net);
    const current = totalsByDescription.get(description);
    totalsByDescription.set(description, (current === undefined ? 0 : current) + cents);
  }
  return totalsByDescription;
}

function sumRecordValues(record: Record<string, number>): number {
  let total = 0;
  for (const value of Object.values(record)) {
    total += value;
  }
  return total;
}

async function buildInboundTransportationAllocationFromSpApi(input: {
  marketplace: MarketplaceId;
  settlementId: string;
  invoiceStartDate: string;
  invoiceEndDate: string;
  expectedTotalCents: number;
  skuToBrand: Map<string, string>;
}): Promise<{ allocationBySku: Record<string, number>; issues: string[] }> {
  const settlementId = input.settlementId.trim();
  if (settlementId === '') {
    throw new Error('Missing settlementId for inbound transportation allocation');
  }

  const postedAfterIso = dayStartIso(shiftIsoDay(input.invoiceStartDate, -FBA_INBOUND_LOOKBACK_DAYS));
  const requestedPostedBeforeIso = dayEndIso(shiftIsoDay(input.invoiceEndDate, FBA_INBOUND_LOOKBACK_DAYS));
  const postedBeforeIso = minIsoTimestamp(requestedPostedBeforeIso, nowMinusFiveMinutesIso());
  const tenantCode = tenantCodeForMarketplace(input.marketplace);

  const transactions = settlementId.startsWith('EG-')
    ? await listTransactionsForFinancialEventGroupId({
        tenantCode,
        eventGroupId: settlementId.slice('EG-'.length),
        postedAfterIso,
        postedBeforeIso,
      })
    : await listTransactionsForSettlementId({
        tenantCode,
        settlementId,
        postedAfterIso,
        postedBeforeIso,
      });

  const extraction = extractInboundTransportationServiceFeeCharges(transactions);
  const issues = [...extraction.issues];
  if (extraction.charges.length === 0) {
    issues.push(`SP-API returned no inbound transportation service-fee charges for settlement ${settlementId}`);
    return { allocationBySku: {}, issues };
  }

  const chargesTotalCents = extraction.charges.reduce((total, charge) => total + charge.cents, 0);
  if (chargesTotalCents !== input.expectedTotalCents) {
    issues.push(
      `Inbound transportation fee total mismatch vs SP-API transactions (${chargesTotalCents} vs ${input.expectedTotalCents})`,
    );
  }

  const shipmentItemsByShipmentId = new Map<string, InboundShipmentItem[]>();
  const uniqueShipmentIds = Array.from(new Set(extraction.charges.map((charge) => charge.shipmentId))).sort();
  for (const shipmentId of uniqueShipmentIds) {
    const items = await fetchInboundShipmentItemsByShipmentId({ tenantCode, shipmentId });
    shipmentItemsByShipmentId.set(
      shipmentId,
      items.map((item) => ({
        sku: item.sellerSku,
        quantity: item.quantityShipped,
      })),
    );
  }

  const allocation = allocateShipmentFeeChargesBySkuQuantity({
    charges: extraction.charges,
    shipmentItemsByShipmentId,
  });
  for (const issue of allocation.issues) {
    issues.push(issue);
  }

  for (const sku of Object.keys(allocation.allocationBySku)) {
    if (!input.skuToBrand.has(sku)) {
      issues.push(`Shipment fee allocation contains unmapped SKU ${sku}`);
    }
  }

  const allocatedTotalCents = sumRecordValues(allocation.allocationBySku);
  if (allocatedTotalCents !== input.expectedTotalCents) {
    issues.push(
      `Inbound transportation SKU allocation total mismatch (${allocatedTotalCents} vs ${input.expectedTotalCents})`,
    );
  }

  return {
    allocationBySku: allocation.allocationBySku,
    issues,
  };
}

type AllocationIssue = {
  bucket: PnlBucketKey;
  message: string;
};

const DETERMINISTIC_SOURCE_GUIDANCE: Record<PnlBucketKey, string> = {
  amazonSellerFees:
    'Amazon Seller Fees are allocated to SKU/brand when a SKU is present in the settlement data. SKU-less seller fee lines (e.g., subscription fees) stay in the parent account.',
  amazonFbaFees:
    'SKU-less Amazon FBA Fees stay in the parent account unless we can deterministically link them to SKUs (e.g., inbound transportation via SP-API shipment item data).',
  amazonStorageFees:
    'Amazon Storage Fees are posted without SKU-level allocation when a SKU is not present in the settlement data.',
  amazonAdvertisingCosts:
    'Amazon Advertising Costs are posted without SKU-level allocation.',
  amazonPromotions:
    'Amazon Promotions are posted without SKU-level allocation when a SKU is not present in the settlement data.',
  amazonFbaInventoryReimbursement:
    'Amazon FBA Inventory Reimbursement is posted without SKU-level allocation when a SKU is not present in the settlement data.',
  warehousingAwd:
    'Missing deterministic source for SKU-less AWD fees. Upload AWD fee report covering the invoice range and matching fee types (e.g., STORAGE_FEE / PROCESSING_FEE / TRANSPORTATION_FEE).',
};

export function deterministicSourceGuidanceForBucket(bucket: PnlBucketKey): string {
  return DETERMINISTIC_SOURCE_GUIDANCE[bucket];
}

export async function buildDeterministicSkuAllocations(input: {
  rows: SettlementAuditRow[];
  marketplace: MarketplaceId;
  invoiceStartDate: string;
  invoiceEndDate: string;
  skuToBrand: Map<string, string>;
  settlementId?: string;
  sourceFilename?: string;
}): Promise<{
  skuAllocationsByBucket: Partial<Record<PnlBucketKey, Record<string, number>>>;
  issues: AllocationIssue[];
}> {
  const skuAllocationsByBucket: Partial<Record<PnlBucketKey, Record<string, number>>> = {};
  const issues: AllocationIssue[] = [];
  const skuLessTotalsByBucket = sumSkuLessTotalsByBucket(input.rows);

  const fbaFeesSkuLessTotal = skuLessTotalsByBucket.amazonFbaFees;
  if (fbaFeesSkuLessTotal !== undefined && fbaFeesSkuLessTotal !== 0) {
    const totalsByDescription = sumSkuLessTotalsByDescription(input.rows, 'amazonFbaFees');
    let inboundExpectedTotalCents = 0;

    for (const [description, cents] of totalsByDescription.entries()) {
      if (cents === 0) continue;
      if (isInboundTransportationMemoDescription(description)) {
        if (isSkuLessParentOnlyInboundTransportationMemo(description)) {
          // SKU-less and not deterministically allocatable with current SP-API transaction data.
          continue;
        }
        inboundExpectedTotalCents += cents;
        continue;
      }

      if (isSkuLessParentOnlyFbaFeeMemo(description)) {
        // SKU-less adjustments stay in the parent account (no deterministic SKU linkage).
        continue;
      }

      issues.push({ bucket: 'amazonFbaFees', message: `Unhandled SKU-less FBA fee memo '${description}' (${cents} cents)` });
    }

    if (inboundExpectedTotalCents !== 0) {
      const settlementId = resolveSettlementId({
        settlementId: input.settlementId,
        sourceFilename: input.sourceFilename,
      });

      if (settlementId === null) {
        issues.push({
          bucket: 'amazonFbaFees',
          message:
            'Missing settlementId for inbound transportation fee allocation. Process via SP-API settlement sync or provide a settlementId.',
        });
      } else {
        let inboundAllocation: Awaited<ReturnType<typeof buildInboundTransportationAllocationFromSpApi>> | null = null;
        try {
          inboundAllocation = await buildInboundTransportationAllocationFromSpApi({
            marketplace: input.marketplace,
            settlementId,
            invoiceStartDate: input.invoiceStartDate,
            invoiceEndDate: input.invoiceEndDate,
            expectedTotalCents: inboundExpectedTotalCents,
            skuToBrand: input.skuToBrand,
          });
        } catch (error) {
          issues.push({
            bucket: 'amazonFbaFees',
            message: `Inbound transportation allocation failed for settlement ${settlementId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          });
        }

        if (inboundAllocation !== null) {
          for (const issue of inboundAllocation.issues) {
            issues.push({
              bucket: 'amazonFbaFees',
              message: issue,
            });
          }

          if (Object.keys(inboundAllocation.allocationBySku).length > 0) {
            skuAllocationsByBucket.amazonFbaFees = inboundAllocation.allocationBySku;
          }
        }
      }
    }
  }

  // Note: other SKU-less buckets (storage fees, promotions, reimbursements) intentionally stay in
  // the parent account unless we have a deterministic source for SKU linkage. We do not emit
  // issues for these buckets to avoid blocking processing on data that is not available from the
  // settlement feed.

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

        const offsets = monthOffsetsForAwdFeeType(feeType);
        const attempts: AwdFeeResolutionAttempt[] = [];

        for (const offset of offsets) {
          const monthWindow = monthWindowOffsetForIsoDay(input.invoiceEndDate, offset);
          const attempt = await resolveAwdFeeTypeForMonth({
            marketplace: input.marketplace,
            feeType,
            monthStart: monthWindow.monthStart,
            monthEnd: monthWindow.monthEnd,
            expectedTotal,
            skuToBrand: input.skuToBrand,
          });
          attempts.push(attempt);
        }

        const successfulAttempts = attempts.filter((attempt) => attempt.ok);
        if (successfulAttempts.length === 0) {
          const firstFailure = attempts.find((attempt) => !attempt.ok);
          issues.push({
            bucket: 'warehousingAwd',
            message: firstFailure && !firstFailure.ok
              ? firstFailure.message
              : `Missing AWD allocation source for ${feeType}`,
          });
          continue;
        }

        if (successfulAttempts.length > 1) {
          const monthWindows = successfulAttempts
            .map((attempt) => `${attempt.monthStart}..${attempt.monthEnd}`)
            .sort()
            .join(', ');
          issues.push({
            bucket: 'warehousingAwd',
            message: `Ambiguous AWD ${feeType} month match (${monthWindows})`,
          });
          continue;
        }

        const selected = successfulAttempts[0];
        if (!selected || !selected.ok) {
          throw new Error(`Missing resolved AWD fee allocation for ${feeType}`);
        }

        for (const [sku, cents] of Object.entries(selected.feeCentsBySku)) {
          const current = awdAllocationsBySku[sku];
          awdAllocationsBySku[sku] = (current === undefined ? 0 : current) + cents;
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
