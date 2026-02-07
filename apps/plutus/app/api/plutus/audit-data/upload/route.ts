import { NextResponse } from 'next/server';
import { unzipSync, strFromU8 } from 'fflate';
import { parseLmbAuditCsv } from '@/lib/lmb/audit-csv';
import { toCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
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

  // Count unique invoices
  const invoiceSet = new Set<string>();
  for (const row of parsed.rows) {
    invoiceSet.add(row.invoice);
  }

  // Delete existing rows for these invoices (idempotent re-upload)
  const invoiceIds = Array.from(invoiceSet);
  await db.auditDataRow.deleteMany({
    where: { invoiceId: { in: invoiceIds } },
  });

  // Create the upload record and all rows
  const upload = await db.auditDataUpload.create({
    data: {
      filename: file.name,
      rowCount: parsed.rows.length,
      invoiceCount: invoiceIds.length,
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
    rowCount: number;
    minDate: string;
    maxDate: string;
    skuCount: number;
  }> = [];

  for (const invoiceId of invoiceIds) {
    const invoiceRows = parsed.rows.filter((r) => r.invoice === invoiceId);
    let minDate = invoiceRows[0]!.date;
    let maxDate = invoiceRows[0]!.date;
    const skuSet = new Set<string>();

    for (const r of invoiceRows) {
      if (r.date < minDate) minDate = r.date;
      if (r.date > maxDate) maxDate = r.date;
      if (r.sku.trim() !== '') skuSet.add(r.sku.trim());
    }

    invoiceSummaries.push({
      invoiceId,
      rowCount: invoiceRows.length,
      minDate,
      maxDate,
      skuCount: skuSet.size,
    });
  }

  invoiceSummaries.sort((a, b) => a.invoiceId.localeCompare(b.invoiceId));

  return NextResponse.json({
    id: upload.id,
    filename: upload.filename,
    rowCount: upload.rowCount,
    invoiceCount: upload.invoiceCount,
    uploadedAt: upload.uploadedAt.toISOString(),
    invoiceSummaries,
  });
}
