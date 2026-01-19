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

type AnalyzedFile = {
  name: string;
  size: number;
  invoices: string[];
  minDate: string;
  maxDate: string;
  rowCount: number;
};

function analyzeCsvText(name: string, text: string, size: number): AnalyzedFile {
  const parsed = parseLmbAuditCsv(text);

  let minDate = parsed.rows[0]?.date;
  let maxDate = parsed.rows[0]?.date;
  const invoiceSet = new Set<string>();

  for (const row of parsed.rows) {
    if (minDate === undefined || row.date < minDate) minDate = row.date;
    if (maxDate === undefined || row.date > maxDate) maxDate = row.date;
    invoiceSet.add(row.invoice);
  }

  if (minDate === undefined || maxDate === undefined) {
    throw new Error('Audit file has no rows');
  }

  return {
    name,
    size,
    invoices: Array.from(invoiceSet.values()).sort(),
    minDate,
    maxDate,
    rowCount: parsed.rows.length,
  };
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    }

    const bytes = toUint8Array(await file.arrayBuffer());
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith('.zip')) {
      const unzipped = unzipSync(bytes);
      const analyzed: AnalyzedFile[] = [];

      for (const [name, raw] of Object.entries(unzipped)) {
        const text = asCsvText(name, raw);
        analyzed.push(analyzeCsvText(name, text, raw.length));
      }

      analyzed.sort((a, b) => a.name.localeCompare(b.name));

      return NextResponse.json({
        fileName: file.name,
        files: analyzed,
      });
    }

    if (lowerName.endsWith('.csv')) {
      const text = strFromU8(bytes);
      return NextResponse.json({
        fileName: file.name,
        files: [analyzeCsvText(file.name, text, bytes.length)],
      });
    }

    return NextResponse.json(
      {
        error: 'Unsupported file type. Upload a .zip or .csv',
      },
      { status: 400 },
    );
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
