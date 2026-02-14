import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import {
  CashflowSnapshotError,
  generateAndPersistCashflowSnapshot,
  getLatestCashflowSnapshotPayload,
} from '@/lib/plutus/cashflow/snapshot';

const logger = createLogger({ name: 'plutus-cashflow-snapshot-route' });

export async function GET(req: NextRequest) {
  try {
    const refresh = req.nextUrl.searchParams.get('refresh') === '1';

    if (refresh) {
      const snapshot = await generateAndPersistCashflowSnapshot();
      return NextResponse.json({ snapshot });
    }

    const latest = await getLatestCashflowSnapshotPayload();
    if (latest) {
      return NextResponse.json({ snapshot: latest });
    }

    const snapshot = await generateAndPersistCashflowSnapshot();
    return NextResponse.json({ snapshot });
  } catch (error) {
    if (error instanceof CashflowSnapshotError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error('Cashflow snapshot route failed', error);
    return NextResponse.json(
      {
        error: 'Failed to load cashflow snapshot',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
