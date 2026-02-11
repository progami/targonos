import { NextResponse } from 'next/server';
import { unzipSync, strFromU8 } from 'fflate';
import { parseLmbAuditCsv } from '@/lib/lmb/audit-csv';
import { toCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';
import { normalizeAuditMarketToMarketplaceId, type MarketplaceId } from '@/lib/plutus/audit-invoice-matching';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_CSV_ROWS = 500_000;

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

function buildMarketWhere(marketplace: MarketplaceId) {
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

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 10MB.` },
        { status: 400 },
      );
    }

    const bytes = toUint8Array(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();

    let csvText = '';

    if (lowerName.endsWith('.zip')) {
      const unzipped = unzipSync(bytes);
      const csvEntries = Object.entries(unzipped).filter(([name]) => name.toLowerCase().endsWith('.csv'));
      if (csvEntries.length !== 1) {
        return NextResponse.json(
          { error: `ZIP must contain exactly one .csv (found ${csvEntries.length})` },
          { status: 400 },
        );
      }
      const entry = csvEntries[0]!;
      csvText = strFromU8(entry[1]);
    } else if (lowerName.endsWith('.csv')) {
      csvText = strFromU8(bytes);
    }

    if (csvText === '') {
      return NextResponse.json({ error: 'Unsupported file type. Upload a .csv or .zip' }, { status: 400 });
    }

    const parsed = parseLmbAuditCsv(csvText);
    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'Audit file has no data rows' }, { status: 400 });
    }

    if (parsed.rows.length > MAX_CSV_ROWS) {
      return NextResponse.json(
        { error: `CSV has ${parsed.rows.length.toLocaleString()} rows. Maximum allowed is ${MAX_CSV_ROWS.toLocaleString()} rows.` },
        { status: 400 },
      );
    }

    // Determine marketplaces and unique invoice groups (invoiceId scoped by marketplace)
    const invoiceIdsByMarketplace = new Map<MarketplaceId, Set<string>>();
    const invoiceKeys = new Set<string>();

    for (const row of parsed.rows) {
      const marketplace = normalizeAuditMarketToMarketplaceId(row.market);
      if (marketplace === null) {
        return NextResponse.json({ error: `Unrecognized market value: "${row.market}"` }, { status: 400 });
      }

      invoiceKeys.add(`${marketplace}:${row.invoice}`);

      const existing = invoiceIdsByMarketplace.get(marketplace);
      if (!existing) {
        invoiceIdsByMarketplace.set(marketplace, new Set([row.invoice]));
      } else {
        existing.add(row.invoice);
      }
    }

    // Delete existing rows for these invoice groups (idempotent re-upload)
    for (const [marketplace, invoiceSet] of invoiceIdsByMarketplace.entries()) {
      const invoiceIds = Array.from(invoiceSet);
      if (invoiceIds.length === 0) continue;

      await db.auditDataRow.deleteMany({
        where: {
          invoiceId: { in: invoiceIds },
          ...buildMarketWhere(marketplace),
        },
      });
    }

    // Create the upload record and all rows
    const upload = await db.auditDataUpload.create({
      data: {
        filename: file.name,
        rowCount: parsed.rows.length,
        invoiceCount: invoiceKeys.size,
        rows: {
          createMany: {
            data: parsed.rows.map((row) => ({
              invoiceId: row.invoice,
              market: row.market,
              date: row.date,
              orderId: row.orderId,
              sku: row.sku,
              quantity: row.quantity,
              description: row.description,
              net: toCents(row.net),
            })),
          },
        },
      },
    });

  // Build per-invoice summary
  const invoiceSummaries: Array<{
    invoiceId: string;
    marketplace: MarketplaceId;
    rowCount: number;
    minDate: string;
    maxDate: string;
    skuCount: number;
    markets: string[];
  }> = [];

    const keys = Array.from(invoiceKeys.values()).sort();

    for (const key of keys) {
      const sepIdx = key.indexOf(':');
      if (sepIdx === -1) {
        throw new Error(`Invalid invoice key: ${key}`);
      }
      const marketplace = key.slice(0, sepIdx) as MarketplaceId;
      const invoiceId = key.slice(sepIdx + 1);

      const invoiceRows = parsed.rows.filter((r) => {
        if (r.invoice !== invoiceId) return false;
        return normalizeAuditMarketToMarketplaceId(r.market) === marketplace;
      });
      if (invoiceRows.length === 0) continue;

      let minDate = invoiceRows[0]!.date;
      let maxDate = invoiceRows[0]!.date;
    const skuSet = new Set<string>();
    const marketSet = new Set<string>();

    for (const r of invoiceRows) {
      if (r.date < minDate) minDate = r.date;
      if (r.date > maxDate) maxDate = r.date;
      if (r.sku.trim() !== '') skuSet.add(r.sku.trim());
      if (r.market.trim() !== '') marketSet.add(r.market.trim());
    }

    invoiceSummaries.push({
      invoiceId,
      marketplace,
      rowCount: invoiceRows.length,
      minDate,
      maxDate,
      skuCount: skuSet.size,
      markets: Array.from(marketSet.values()).sort(),
    });
  }

    invoiceSummaries.sort((a, b) => {
      const market = a.marketplace.localeCompare(b.marketplace);
      if (market !== 0) return market;
      return a.invoiceId.localeCompare(b.invoiceId);
    });

  return NextResponse.json({
    id: upload.id,
    filename: upload.filename,
    rowCount: upload.rowCount,
    invoiceCount: upload.invoiceCount,
    uploadedAt: upload.uploadedAt.toISOString(),
    invoiceSummaries,
  });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
