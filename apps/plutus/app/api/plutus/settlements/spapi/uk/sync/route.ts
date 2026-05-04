import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { QboAuthError } from '@/lib/qbo/api';
import { ExplicitPostToQboError, requireExplicitPostToQbo } from '@/lib/amazon-finances/settlement-sync-post-mode';
import { syncUkSettlementsFromSpApiFinances } from '@/lib/amazon-finances/uk-settlement-sync';
import { HumanApprovalError, requireHumanApprovalHeader } from '@/lib/plutus/human-approval';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlements-spapi-uk-sync' });

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const startDate = typeof body.startDate === 'string' ? body.startDate : '';
    const endDate = typeof body.endDate === 'string' ? body.endDate : undefined;
    const settlementIds = Array.isArray(body.settlementIds) ? (body.settlementIds as unknown[]).map((v) => String(v)) : undefined;
    const postToQbo = requireExplicitPostToQbo(body, 'UK SP-API settlement sync');
    const processInPlutus = body.process === true;

    if (postToQbo === true) {
      requireHumanApprovalHeader(req, 'UK SP-API settlement QBO posting');
    } else if (processInPlutus === true) {
      requireHumanApprovalHeader(req, 'UK SP-API settlement processing');
    }

    const result = await syncUkSettlementsFromSpApiFinances({
      startDate,
      endDate,
      settlementIds,
      postToQbo,
      process: processInPlutus,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (error instanceof ExplicitPostToQboError) {
      return NextResponse.json({ error: 'Invalid settlement sync posting mode', details: error.message }, { status: 400 });
    }
    if (error instanceof HumanApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
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
