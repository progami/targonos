import { NextResponse, type NextRequest } from 'next/server';
import { createLogger } from '@targon/logger';
import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-autopost-settings' });

export async function GET() {
  try {
    const config = await db.setupConfig.findFirst();

    return NextResponse.json({
      autopostEnabled: config ? config.autopostEnabled : false,
      autopostStartDate: config ? config.autopostStartDate : null,
    });
  } catch (error) {
    logger.error('Failed to fetch autopost settings', { error });
    return NextResponse.json(
      { error: 'Failed to fetch autopost settings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const autopostEnabled = body.autopostEnabled === true;
    const autopostStartDate = typeof body.autopostStartDate === 'string' && body.autopostStartDate.trim() !== ''
      ? new Date(`${body.autopostStartDate.trim()}T00:00:00Z`)
      : null;

    const existing = await db.setupConfig.findFirst();
    if (!existing) {
      return NextResponse.json({ error: 'Setup config not found. Complete initial setup first.' }, { status: 400 });
    }

    await db.setupConfig.update({
      where: { id: existing.id },
      data: { autopostEnabled, autopostStartDate },
    });

    return NextResponse.json({ ok: true, autopostEnabled, autopostStartDate });
  } catch (error) {
    logger.error('Failed to update autopost settings', { error });
    return NextResponse.json(
      { error: 'Failed to update autopost settings', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
