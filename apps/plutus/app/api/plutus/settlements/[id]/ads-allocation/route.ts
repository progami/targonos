import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { allocateByWeight } from '@/lib/inventory/money';
import { normalizeSku } from '@/lib/plutus/settlement-validation';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';
import { buildSettlementSkuProfitability } from '@/lib/plutus/settlement-ads-profitability';

export const runtime = 'nodejs';

const ADS_REPORT_TYPE = 'SP_ADVERTISED_PRODUCT';
const WEIGHT_SOURCE = 'SPONSORED_PRODUCTS_SPEND';
const WEIGHT_UNIT = 'cents';

type RouteContext = { params: Promise<{ id: string }> };
type AllocationLine = { sku: string; weight: number; allocatedCents: number };

class AllocationApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'AllocationApiError';
    this.status = status;
  }
}

function buildMarketWhere(marketplace: 'amazon.com' | 'amazon.co.uk') {
  if (marketplace === 'amazon.com') {
    return {
      OR: [
        { market: { equals: 'US', mode: 'insensitive' as const } },
        { market: { contains: 'amazon.com', mode: 'insensitive' as const } },
      ],
    };
  }
  if (marketplace === 'amazon.co.uk') {
    return {
      OR: [
        { market: { equals: 'UK', mode: 'insensitive' as const } },
        { market: { contains: 'amazon.co.uk', mode: 'insensitive' as const } },
      ],
    };
  }

  const exhaustive: never = marketplace;
  throw new Error(`Unsupported marketplace: ${exhaustive}`);
}

function parseIsoDay(value: string): Date {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid ISO day: ${value}`);
  }
  const date = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ISO day: ${value}`);
  }
  return date;
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

  return best ? best.upload : null;
}

async function loadInvoiceDateRange(input: { invoiceId: string; marketplace: 'amazon.com' | 'amazon.co.uk' }) {
  const result = await db.auditDataRow.aggregate({
    where: {
      invoiceId: input.invoiceId,
      ...buildMarketWhere(input.marketplace),
    },
    _min: { date: true },
    _max: { date: true },
  });

  const start = result._min.date;
  const end = result._max.date;
  if (typeof start !== 'string' || typeof end !== 'string') {
    throw new AllocationApiError(`Audit invoice not found: ${input.marketplace} ${input.invoiceId}`, 400);
  }

  return { startDate: start, endDate: end };
}

async function loadSettlementAdsTotalCents(input: { invoiceId: string; marketplace: 'amazon.com' | 'amazon.co.uk' }) {
  const result = await db.auditDataRow.aggregate({
    where: {
      invoiceId: input.invoiceId,
      description: { startsWith: 'Amazon Advertising Costs' },
      ...buildMarketWhere(input.marketplace),
    },
    _sum: { net: true },
  });

  const total = result._sum.net;
  return typeof total === 'number' && Number.isInteger(total) ? total : 0;
}

async function computeAllocation(input: {
  marketplace: 'amazon.com' | 'amazon.co.uk';
  invoiceId: string;
  invoiceStartDate: string;
  invoiceEndDate: string;
  totalAdsCents: number;
}): Promise<{
  adsDataUpload: null | { id: string; filename: string; startDate: string; endDate: string; uploadedAt: Date };
  lines: AllocationLine[];
}> {
  if (input.totalAdsCents === 0) {
    return {
      adsDataUpload: null,
      lines: [],
    };
  }

  const coveringUploads = await db.adsDataUpload.findMany({
    where: {
      reportType: ADS_REPORT_TYPE,
      marketplace: input.marketplace,
      startDate: { lte: input.invoiceStartDate },
      endDate: { gte: input.invoiceEndDate },
    },
    select: {
      id: true,
      filename: true,
      startDate: true,
      endDate: true,
      uploadedAt: true,
    },
    orderBy: { uploadedAt: 'desc' },
  });

  if (coveringUploads.length === 0) {
    throw new AllocationApiError(
      `No Ads Data upload covers ${input.marketplace} ${input.invoiceId} (${input.invoiceStartDate}–${input.invoiceEndDate}). Upload a Sponsored Products report for that full range.`,
      400,
    );
  }

  const best = chooseBestUpload(coveringUploads);
  if (!best) {
    throw new Error('Failed to select Ads Data upload');
  }

  const grouped = await db.adsDataRow.groupBy({
    by: ['sku'],
    where: {
      uploadId: best.id,
      date: { gte: input.invoiceStartDate, lte: input.invoiceEndDate },
    },
    _sum: { spendCents: true },
  });

  const weights = grouped
    .map((g) => ({ sku: normalizeSku(g.sku), weight: g._sum.spendCents ?? 0 }))
    .filter((w) => Number.isInteger(w.weight) && w.weight > 0 && w.sku !== '');

  weights.sort((a, b) => a.sku.localeCompare(b.sku));

  let totalWeight = 0;
  for (const w of weights) totalWeight += w.weight;
  if (totalWeight <= 0) {
    throw new AllocationApiError(`Ads report has zero spend for ${input.invoiceStartDate}–${input.invoiceEndDate}`, 400);
  }

  const sign = input.totalAdsCents < 0 ? -1 : 1;
  const absTotal = Math.abs(input.totalAdsCents);

  const allocatedAbs = allocateByWeight(
    absTotal,
    weights.map((w) => ({ key: w.sku, weight: w.weight })),
  );

  const lines = weights.map((w) => {
    const cents = allocatedAbs[w.sku];
    if (cents === undefined) {
      throw new Error(`Missing allocation for ${w.sku}`);
    }
    return { sku: w.sku, weight: w.weight, allocatedCents: sign * cents };
  });

  return {
    adsDataUpload: best,
    lines,
  };
}

function numericOrZero(value: number | null): number {
  if (typeof value === 'number') {
    return value;
  }
  return 0;
}

async function loadSettlementSkuProfitability(input: {
  settlementProcessingId: string;
  allocationLines: AllocationLine[];
}) {
  const salesBySku = await db.orderSale.groupBy({
    by: ['sku'],
    where: {
      settlementProcessingId: input.settlementProcessingId,
    },
    _sum: {
      quantity: true,
      principalCents: true,
      costManufacturingCents: true,
      costFreightCents: true,
      costDutyCents: true,
      costMfgAccessoriesCents: true,
    },
  });

  const returnsBySku = await db.orderReturn.groupBy({
    by: ['sku'],
    where: {
      settlementProcessingId: input.settlementProcessingId,
    },
    _sum: {
      quantity: true,
      principalCents: true,
      costManufacturingCents: true,
      costFreightCents: true,
      costDutyCents: true,
      costMfgAccessoriesCents: true,
    },
  });

  const sales = salesBySku.map((row) => ({
    sku: row.sku,
    quantity: numericOrZero(row._sum.quantity),
    principalCents: numericOrZero(row._sum.principalCents),
    costManufacturingCents: numericOrZero(row._sum.costManufacturingCents),
    costFreightCents: numericOrZero(row._sum.costFreightCents),
    costDutyCents: numericOrZero(row._sum.costDutyCents),
    costMfgAccessoriesCents: numericOrZero(row._sum.costMfgAccessoriesCents),
  }));

  const returns = returnsBySku.map((row) => ({
    sku: row.sku,
    quantity: numericOrZero(row._sum.quantity),
    principalCents: numericOrZero(row._sum.principalCents),
    costManufacturingCents: numericOrZero(row._sum.costManufacturingCents),
    costFreightCents: numericOrZero(row._sum.costFreightCents),
    costDutyCents: numericOrZero(row._sum.costDutyCents),
    costMfgAccessoriesCents: numericOrZero(row._sum.costMfgAccessoriesCents),
  }));

  return buildSettlementSkuProfitability({
    sales,
    returns,
    allocationLines: input.allocationLines.map((line) => ({
      sku: line.sku,
      allocatedCents: line.allocatedCents,
    })),
  });
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const { id: settlementJournalEntryId } = await context.params;

    const processing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: settlementJournalEntryId },
      select: { id: true, marketplace: true, invoiceId: true },
    });

    if (!processing) {
      return NextResponse.json({ error: 'Settlement not processed' }, { status: 400 });
    }

    if (processing.marketplace !== 'amazon.com' && processing.marketplace !== 'amazon.co.uk') {
      return NextResponse.json({ error: `Unsupported marketplace: ${processing.marketplace}` }, { status: 400 });
    }

    const marketplace = processing.marketplace;
    const invoiceId = processing.invoiceId;

    const existing = await db.settlementAdsAllocation.findUnique({
      where: { settlementProcessingId: processing.id },
      include: {
        lines: true,
        adsDataUpload: { select: { id: true, filename: true, startDate: true, endDate: true, uploadedAt: true } },
      },
    });

    const invoiceRange = await loadInvoiceDateRange({ invoiceId, marketplace });
    const totalAdsCents = await loadSettlementAdsTotalCents({ invoiceId, marketplace });
    let kind: 'saved' | 'computed';
    let weightSource: string;
    let weightUnit: string;
    let adsDataUpload:
      | null
      | {
          id: string;
          filename: string;
          startDate: string;
          endDate: string;
          uploadedAt: string;
        };
    let lines: AllocationLine[];

    if (existing) {
      kind = 'saved';
      weightSource = existing.weightSource;
      weightUnit = existing.weightUnit;
      lines = existing.lines
        .map((l) => ({ sku: l.sku, weight: l.weight, allocatedCents: l.allocatedCents }))
        .sort((a, b) => a.sku.localeCompare(b.sku));
      adsDataUpload = existing.adsDataUpload
        ? {
            ...existing.adsDataUpload,
            uploadedAt: existing.adsDataUpload.uploadedAt.toISOString(),
          }
        : null;
    } else {
      kind = 'computed';
      weightSource = WEIGHT_SOURCE;
      weightUnit = WEIGHT_UNIT;

      const computed = await computeAllocation({
        marketplace,
        invoiceId,
        invoiceStartDate: invoiceRange.startDate,
        invoiceEndDate: invoiceRange.endDate,
        totalAdsCents,
      });

      lines = computed.lines;
      adsDataUpload = computed.adsDataUpload
        ? {
            ...computed.adsDataUpload,
            uploadedAt: computed.adsDataUpload.uploadedAt.toISOString(),
          }
        : null;
    }

    const skuProfitability = await loadSettlementSkuProfitability({
      settlementProcessingId: processing.id,
      allocationLines: lines,
    });

    return NextResponse.json({
      kind,
      marketplace,
      invoiceId,
      invoiceStartDate: invoiceRange.startDate,
      invoiceEndDate: invoiceRange.endDate,
      totalAdsCents,
      weightSource,
      weightUnit,
      adsDataUpload,
      lines,
      skuProfitability,
    });
  } catch (error) {
    if (error instanceof AllocationApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: 'Failed to load settlement advertising allocation',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

type SaveLineInput = { sku: string; weight: number };

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const { id: settlementJournalEntryId } = await context.params;
    const body = (await req.json()) as Partial<{ lines: SaveLineInput[] }>;

    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: 'lines array is required' }, { status: 400 });
    }

    const processing = await db.settlementProcessing.findUnique({
      where: { qboSettlementJournalEntryId: settlementJournalEntryId },
      select: { id: true, marketplace: true, invoiceId: true },
    });

    if (!processing) {
      return NextResponse.json({ error: 'Settlement not processed' }, { status: 400 });
    }

    if (processing.marketplace !== 'amazon.com' && processing.marketplace !== 'amazon.co.uk') {
      return NextResponse.json({ error: `Unsupported marketplace: ${processing.marketplace}` }, { status: 400 });
    }

    const marketplace = processing.marketplace;
    const invoiceId = processing.invoiceId;

    const invoiceRange = await loadInvoiceDateRange({ invoiceId, marketplace });
    const totalAdsCents = await loadSettlementAdsTotalCents({ invoiceId, marketplace });

    if (totalAdsCents === 0) {
      return NextResponse.json({ error: 'No advertising cost found for this invoice' }, { status: 400 });
    }

	    const computed = await computeAllocation({
	      marketplace,
	      invoiceId,
	      invoiceStartDate: invoiceRange.startDate,
	      invoiceEndDate: invoiceRange.endDate,
	      totalAdsCents,
	    });

	    const adsUpload = computed.adsDataUpload;
	    if (!adsUpload) {
	      return NextResponse.json({ error: 'Missing Ads Data upload' }, { status: 400 });
	    }

    const seen = new Set<string>();
    const normalizedLines: Array<{ sku: string; weight: number }> = [];

    for (const raw of body.lines) {
      const skuRaw = typeof raw.sku === 'string' ? raw.sku : '';
      const sku = normalizeSku(skuRaw);
      if (sku === '') {
        return NextResponse.json({ error: 'Each line requires sku' }, { status: 400 });
      }

      const weight = raw.weight;
      if (typeof weight !== 'number' || !Number.isInteger(weight) || weight <= 0) {
        return NextResponse.json({ error: 'Each line requires positive integer weight (cents)' }, { status: 400 });
      }

      if (seen.has(sku)) {
        return NextResponse.json({ error: `Duplicate SKU: ${sku}` }, { status: 400 });
      }
      seen.add(sku);

      normalizedLines.push({ sku, weight });
    }

    normalizedLines.sort((a, b) => a.sku.localeCompare(b.sku));

    const sign = totalAdsCents < 0 ? -1 : 1;
    const absTotal = Math.abs(totalAdsCents);

    const allocatedAbs = allocateByWeight(
      absTotal,
      normalizedLines.map((l) => ({ key: l.sku, weight: l.weight })),
    );

    const linesToSave = normalizedLines.map((l) => {
      const cents = allocatedAbs[l.sku];
      if (cents === undefined) {
        throw new Error(`Missing allocation for ${l.sku}`);
      }
      return { sku: l.sku, weight: l.weight, allocatedCents: sign * cents };
    });

    let sumAllocated = 0;
    for (const line of linesToSave) sumAllocated += line.allocatedCents;
    if (sumAllocated !== totalAdsCents) {
      throw new Error(`Allocated cents do not sum to total (${sumAllocated} vs ${totalAdsCents})`);
    }

	    const saved = await db.$transaction(async (tx) => {
	      const allocation = await tx.settlementAdsAllocation.upsert({
	        where: { settlementProcessingId: processing.id },
	        create: {
	          settlementProcessingId: processing.id,
	          weightSource: WEIGHT_SOURCE,
	          weightUnit: WEIGHT_UNIT,
	          invoiceStartDate: invoiceRange.startDate,
	          invoiceEndDate: invoiceRange.endDate,
	          totalAdsCents,
	          adsDataUploadId: adsUpload.id,
	        },
	        update: {
	          weightSource: WEIGHT_SOURCE,
	          weightUnit: WEIGHT_UNIT,
	          invoiceStartDate: invoiceRange.startDate,
	          invoiceEndDate: invoiceRange.endDate,
	          totalAdsCents,
	          adsDataUploadId: adsUpload.id,
	        },
	        select: { id: true },
	      });

      await tx.settlementAdsAllocationLine.deleteMany({
        where: { settlementAdsAllocationId: allocation.id },
      });

      await tx.settlementAdsAllocationLine.createMany({
        data: linesToSave.map((l) => ({
          settlementAdsAllocationId: allocation.id,
          sku: l.sku,
          weight: l.weight,
          allocatedCents: l.allocatedCents,
        })),
      });

      return allocation;
    });

    const user = await getCurrentUser();
	    await logAudit({
	      userId: user?.id ?? 'system',
	      userName: user?.name ?? user?.email ?? 'system',
	      action: 'SETTLEMENT_ADS_ALLOCATION_SAVED',
	      entityType: 'SettlementAdsAllocation',
	      entityId: saved.id,
	      details: {
	        marketplace,
	        invoiceId,
	        totalAdsCents,
	        weightSource: WEIGHT_SOURCE,
	        adsDataUploadId: adsUpload.id,
	      },
	    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof AllocationApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      {
        error: 'Failed to save settlement advertising allocation',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
