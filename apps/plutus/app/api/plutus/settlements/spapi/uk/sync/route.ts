import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { QboAuthError } from '@/lib/qbo/api';
import { syncUkSettlementsFromSpApiFinances } from '@/lib/amazon-finances/uk-settlement-sync';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlements-spapi-uk-sync' });

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const startDate = typeof body.startDate === 'string' ? body.startDate : '';
    const endDate = typeof body.endDate === 'string' ? body.endDate : undefined;
    const settlementIds = Array.isArray(body.settlementIds) ? (body.settlementIds as unknown[]).map((v) => String(v)) : undefined;
    const postToQbo = body.postToQbo === undefined ? true : body.postToQbo === true;
    const process = body.process === true;

    const result = await syncUkSettlementsFromSpApiFinances({
      startDate,
      endDate,
      settlementIds,
      postToQbo,
      process,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('UK SP-API settlement sync failed', { error });
    return NextResponse.json(
      {
        error: 'UK SP-API settlement sync failed',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
