import { NextResponse } from 'next/server';
import { parseAmazonTransactionCsv, type AmazonTransactionRow } from '@/lib/reconciliation/amazon-csv';
import { fromCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

type ReconciliationRow = {
  orderId: string;
  date: string;
  type: string;
  amazonTotal: number;
  lmbTotal: number;
  status: 'matched' | 'discrepancy' | 'amazon-only' | 'lmb-only';
  difference: number;
};

type ReconciliationResult = {
  summary: {
    totalAmazonTransactions: number;
    totalLmbRows: number;
    matched: number;
    discrepancies: number;
    amazonOnly: number;
    lmbOnly: number;
  };
  rows: ReconciliationRow[];
};

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file');
  const month = formData.get('month') as string | null; // YYYY-MM
  const marketplace = formData.get('marketplace') as string | null; // US or UK

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 });
  }

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'Invalid month format. Expected YYYY-MM.' }, { status: 400 });
  }

  if (marketplace !== 'US' && marketplace !== 'UK') {
    return NextResponse.json({ error: 'Marketplace must be US or UK.' }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed size is 10MB.` },
      { status: 400 },
    );
  }

  const csvText = await file.text();

  if (csvText.trim() === '') {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }

  let parsed: ReturnType<typeof parseAmazonTransactionCsv>;
  try {
    parsed = parseAmazonTransactionCsv(csvText);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
  if (parsed.rows.length === 0) {
    return NextResponse.json({ error: 'No transaction rows found in file' }, { status: 400 });
  }

  // Build a date prefix for the selected month (YYYY-MM) to filter both Amazon and LMB rows
  const monthPrefix = month; // e.g., "2026-01"

  // Aggregate Amazon transactions by order ID
  // Amazon rows can have multiple lines per order (fees, sales, etc.)
  const amazonByOrder = new Map<string, { total: number; date: string; type: string; rows: AmazonTransactionRow[] }>();

  for (const row of parsed.rows) {
    // Try to extract a date from the dateTime field for month filtering
    // Amazon datetime format: "Jan 1, 2026 12:00:00 AM PST" or "2026-01-15T..."
    const dateStr = extractDatePrefix(row.dateTime);

    // If we can determine the month, filter by it; otherwise include the row
    if (dateStr !== null && !dateStr.startsWith(monthPrefix)) {
      continue;
    }

    const existing = amazonByOrder.get(row.orderId);
    if (existing) {
      existing.total += row.total;
      existing.rows.push(row);
      // Keep earliest date
      if (row.dateTime < existing.date) {
        existing.date = row.dateTime;
        existing.type = row.type;
      }
    } else {
      amazonByOrder.set(row.orderId, {
        total: row.total,
        date: row.dateTime,
        type: row.type,
        rows: [row],
      });
    }
  }

  // Load LMB audit data for the matching month and marketplace
  const lmbMarketWhere =
    marketplace === 'US'
      ? {
          OR: [
            { market: { equals: 'US', mode: 'insensitive' as const } },
            { market: { contains: 'amazon.com', mode: 'insensitive' as const } },
          ],
        }
      : {
          OR: [
            { market: { equals: 'UK', mode: 'insensitive' as const } },
            { market: { contains: 'amazon.co.uk', mode: 'insensitive' as const } },
          ],
        };

  // The date in AuditDataRow is stored as YYYY-MM-DD string
  // We filter rows that start with the month prefix
  const lmbRows = await db.auditDataRow.findMany({
    where: {
      ...lmbMarketWhere,
      date: { startsWith: monthPrefix },
    },
    select: {
      orderId: true,
      date: true,
      description: true,
      net: true, // cents
    },
  });

  // Aggregate LMB rows by order ID
  const lmbByOrder = new Map<string, { total: number; date: string }>();

  for (const row of lmbRows) {
    const existing = lmbByOrder.get(row.orderId);
    if (existing) {
      existing.total += row.net;
      if (row.date < existing.date) {
        existing.date = row.date;
      }
    } else {
      lmbByOrder.set(row.orderId, {
        total: row.net,
        date: row.date,
      });
    }
  }

  // Reconcile
  const allOrderIds = new Set([...amazonByOrder.keys(), ...lmbByOrder.keys()]);
  const resultRows: ReconciliationRow[] = [];

  let matched = 0;
  let discrepancies = 0;
  let amazonOnly = 0;
  let lmbOnly = 0;

  for (const orderId of allOrderIds) {
    const amazon = amazonByOrder.get(orderId);
    const lmb = lmbByOrder.get(orderId);

    if (amazon && lmb) {
      // Amazon total is in dollars, LMB total is in cents
      const amazonDollars = Math.round(amazon.total * 100) / 100;
      const lmbDollars = fromCents(lmb.total);
      const diff = Math.round((amazonDollars - lmbDollars) * 100) / 100;

      // Tolerance: within 1 cent
      if (Math.abs(diff) <= 0.01) {
        matched++;
        resultRows.push({
          orderId,
          date: lmb.date,
          type: amazon.type,
          amazonTotal: amazonDollars,
          lmbTotal: lmbDollars,
          status: 'matched',
          difference: 0,
        });
      } else {
        discrepancies++;
        resultRows.push({
          orderId,
          date: lmb.date,
          type: amazon.type,
          amazonTotal: amazonDollars,
          lmbTotal: lmbDollars,
          status: 'discrepancy',
          difference: diff,
        });
      }
    } else if (amazon && !lmb) {
      amazonOnly++;
      const amazonDollars = Math.round(amazon.total * 100) / 100;
      resultRows.push({
        orderId,
        date: amazon.date,
        type: amazon.type,
        amazonTotal: amazonDollars,
        lmbTotal: 0,
        status: 'amazon-only',
        difference: amazonDollars,
      });
    } else if (!amazon && lmb) {
      lmbOnly++;
      const lmbDollars = fromCents(lmb.total);
      resultRows.push({
        orderId,
        date: lmb.date,
        type: '',
        amazonTotal: 0,
        lmbTotal: lmbDollars,
        status: 'lmb-only',
        difference: -lmbDollars,
      });
    }
  }

  // Sort: discrepancies first, then amazon-only, then lmb-only, then matched
  const statusOrder: Record<string, number> = {
    discrepancy: 0,
    'amazon-only': 1,
    'lmb-only': 2,
    matched: 3,
  };
  resultRows.sort((a, b) => {
    const orderDiff = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
    if (orderDiff !== 0) return orderDiff;
    return a.orderId.localeCompare(b.orderId);
  });

  const result: ReconciliationResult = {
    summary: {
      totalAmazonTransactions: amazonByOrder.size,
      totalLmbRows: lmbByOrder.size,
      matched,
      discrepancies,
      amazonOnly,
      lmbOnly,
    },
    rows: resultRows,
  };

  return NextResponse.json(result);
}

/**
 * Try to extract a YYYY-MM date prefix from an Amazon datetime string.
 * Returns null if the format is not recognized.
 *
 * Known formats:
 * - "Jan 1, 2026 12:00:00 AM PST"
 * - "2026-01-15T00:00:00+00:00"
 * - "2026-01-15"
 */
function extractDatePrefix(dateTime: string): string | null {
  if (!dateTime) return null;

  // Try ISO format first: "2026-01-15..."
  const isoMatch = dateTime.match(/^(\d{4})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}`;
  }

  // Try "Mon DD, YYYY" format
  const monthNames: Record<string, string> = {
    jan: '01',
    feb: '02',
    mar: '03',
    apr: '04',
    may: '05',
    jun: '06',
    jul: '07',
    aug: '08',
    sep: '09',
    oct: '10',
    nov: '11',
    dec: '12',
  };

  const namedMatch = dateTime.match(/^([A-Za-z]{3})\s+\d{1,2},?\s+(\d{4})/);
  if (namedMatch) {
    const monthNum = monthNames[namedMatch[1].toLowerCase()];
    if (monthNum) {
      return `${namedMatch[2]}-${monthNum}`;
    }
  }

  return null;
}
