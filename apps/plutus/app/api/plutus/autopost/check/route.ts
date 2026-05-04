import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { QboAuthError } from '@/lib/qbo/api';
import { AutopostError, runAutopostCheck } from '@/lib/plutus/autopost-check';
import { HumanApprovalError, requireHumanApprovalHeader } from '@/lib/plutus/human-approval';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-autopost-check' });

export async function POST(req: Request) {
  try {
    requireHumanApprovalHeader(req, 'Autopost check');
    const result = await runAutopostCheck();
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof HumanApprovalError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    if (error instanceof AutopostError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logger.error('Autopost check failed', { error });
    return NextResponse.json(
      { error: 'Autopost check failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
