import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import {
  getCashflowSnapshotPayloadById,
  getLatestCashflowSnapshotPayload,
} from '@/lib/plutus/cashflow/snapshot';

const logger = createLogger({ name: 'plutus-cashflow-export-route' });

function centsToDecimalString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function GET(req: NextRequest) {
  try {
    const format = req.nextUrl.searchParams.get('format');
    const snapshotId = req.nextUrl.searchParams.get('snapshotId');

    if (format !== 'json' && format !== 'csv') {
      return NextResponse.json({ error: 'format must be json or csv' }, { status: 400 });
    }

    let snapshot = null;
    if (snapshotId !== null && snapshotId !== '') {
      snapshot = await getCashflowSnapshotPayloadById(snapshotId);
    } else {
      snapshot = await getLatestCashflowSnapshotPayload();
    }

    if (!snapshot) {
      return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
    }

    if (format === 'json') {
      return NextResponse.json(snapshot);
    }

    const rows = snapshot.forecast.weeks.map((week) => [
      week.weekStart,
      centsToDecimalString(week.startingCashCents),
      centsToDecimalString(week.inflowsCents),
      centsToDecimalString(week.outflowsCents),
      centsToDecimalString(week.endingCashCents),
    ]);

    const lines = [
      `# currency=${snapshot.currencyCode}`,
      'weekStart,startingCash,inflows,outflows,endingCash',
      ...rows.map((row) => row.join(',')),
    ];

    const filename = `cashflow-13-week-${snapshot.asOfDate}.csv`;

    return new NextResponse(`${lines.join('\n')}\n`, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    logger.error('Cashflow export route failed', error);
    return NextResponse.json(
      {
        error: 'Failed to export cashflow snapshot',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
