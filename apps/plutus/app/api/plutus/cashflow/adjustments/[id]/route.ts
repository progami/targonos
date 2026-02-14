import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-cashflow-adjustment-delete-route' });

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    await db.cashflowForecastAdjustment.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error('Cashflow adjustment DELETE failed', error);

    return NextResponse.json(
      {
        error: 'Failed to delete adjustment',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
