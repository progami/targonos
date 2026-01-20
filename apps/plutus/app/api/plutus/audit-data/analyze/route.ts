import { NextResponse } from 'next/server';
import { unzipSync, strFromU8 } from 'fflate';
import { parseLmbAuditCsv } from '@/lib/lmb/audit-csv';

export const runtime = 'nodejs';

function toUint8Array(buf: ArrayBuffer): Uint8Array {
  return new Uint8Array(buf);
}

function asCsvText(fileName: string, rawBytes: Uint8Array): string {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.csv')) {
    throw new Error(`Unsupported file inside ZIP (expected .csv): ${fileName}`);
  }
  return strFromU8(rawBytes);
}

type InvoiceSummary = {
  invoice: string;
  minDate: string;
  maxDate: string;
  rowCount: number;
  skuCount: number;
};

function buildInvoiceSummaries(rows: ReturnType<typeof parseLmbAuditCsv>['rows']): InvoiceSummary[] {
  const byInvoice = new Map<string, { minDate: string; maxDate: string; rowCount: number; skuSet: Set<string> }>();

  for (const row of rows) {
    const existing = byInvoice.get(row.invoice);
    if (!existing) {
      const skuSet = new Set<string>();
      if (row.sku.trim() !== '') skuSet.add(row.sku.trim());

      byInvoice.set(row.invoice, {
        minDate: row.date,
        maxDate: row.date,
        rowCount: 1,
        skuSet,
      });
      continue;
    }

    existing.rowCount += 1;
    if (row.date < existing.minDate) existing.minDate = row.date;
    if (row.date > existing.maxDate) existing.maxDate = row.date;
    if (row.sku.trim() !== '') existing.skuSet.add(row.sku.trim());
  }

  const summaries: InvoiceSummary[] = [];
  for (const [invoice, data] of byInvoice.entries()) {
    summaries.push({
      invoice,
      minDate: data.minDate,
      maxDate: data.maxDate,
      rowCount: data.rowCount,
      skuCount: data.skuSet.size,
    });
  }

  summaries.sort((a, b) => a.invoice.localeCompare(b.invoice));
  return summaries;
}

function buildSkuListForInvoice(rows: ReturnType<typeof parseLmbAuditCsv>['rows'], invoice: string): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.invoice !== invoice) continue;
    const sku = row.sku.trim();
    if (sku !== '') set.add(sku);
  }
  return Array.from(set.values());
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    const invoiceRaw = formData.get('invoice');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const bytes = toUint8Array(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();

    const requestedInvoice = typeof invoiceRaw === 'string' ? invoiceRaw.trim() : '';

    let csvText = '';
    let innerName = file.name;
    let size = bytes.length;

    if (lowerName.endsWith('.zip')) {
      const unzipped = unzipSync(bytes);
      const csvEntries = Object.entries(unzipped).filter(([name]) => name.toLowerCase().endsWith('.csv'));
      if (csvEntries.length !== 1) {
        throw new Error(`ZIP must contain exactly one .csv (found ${csvEntries.length})`);
      }

      const entry = csvEntries[0];
      if (!entry) {
        throw new Error('ZIP is missing CSV entry');
      }

      innerName = entry[0];
      size = entry[1].length;
      csvText = asCsvText(innerName, entry[1]);
    } else if (lowerName.endsWith('.csv')) {
      csvText = strFromU8(bytes);
    }

    if (csvText === '') {
      return NextResponse.json(
        {
          error: 'Unsupported file type. Upload a .zip or .csv',
        },
        { status: 400 },
      );
    }

    const parsed = parseLmbAuditCsv(csvText);
    if (parsed.rows.length === 0) {
      throw new Error('Audit file has no rows');
    }

    let minDate = parsed.rows[0]?.date;
    let maxDate = parsed.rows[0]?.date;
    for (const row of parsed.rows) {
      if (minDate === undefined || row.date < minDate) minDate = row.date;
      if (maxDate === undefined || row.date > maxDate) maxDate = row.date;
    }

    if (minDate === undefined || maxDate === undefined) {
      throw new Error('Audit file has no rows');
    }

    const invoiceSummaries = buildInvoiceSummaries(parsed.rows);

    const response: {
      fileName: string;
      innerName: string;
      size: number;
      rowCount: number;
      minDate: string;
      maxDate: string;
      invoiceSummaries: InvoiceSummary[];
      selectedInvoice?: string;
      skus?: string[];
    } = {
      fileName: file.name,
      innerName,
      size,
      rowCount: parsed.rows.length,
      minDate,
      maxDate,
      invoiceSummaries,
    };

    if (requestedInvoice !== '') {
      const exists = invoiceSummaries.some((s) => s.invoice === requestedInvoice);
      if (!exists) {
        return NextResponse.json(
          {
            error: 'Invoice not found in uploaded audit file',
            invoices: invoiceSummaries.map((s) => s.invoice),
          },
          { status: 400 },
        );
      }

      response.selectedInvoice = requestedInvoice;
      response.skus = buildSkuListForInvoice(parsed.rows, requestedInvoice);
    }

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to analyze audit file',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
