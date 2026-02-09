import { NextRequest, NextResponse } from 'next/server';
import { updateBill, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';

const logger = createLogger({ name: 'plutus-bills-sync' });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { qboBillId } = body;

    if (typeof qboBillId !== 'string') {
      return NextResponse.json({ error: 'qboBillId is required' }, { status: 400 });
    }

    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    // Load mapping from DB
    const mapping = await db.billMapping.findUnique({
      where: { qboBillId },
      include: { lines: true },
    });

    if (!mapping) {
      return NextResponse.json({ error: 'No mapping found for this bill. Save the mapping first.' }, { status: 404 });
    }

    // Build line descriptions for manufacturing lines
    const lineDescriptions = mapping.lines
      .filter((line) => line.component === 'manufacturing' && line.sku && line.quantity)
      .map((line) => ({
        lineId: line.qboLineId,
        description: `${line.sku} x ${line.quantity} units`,
      }));

    // Push to QBO
    const { updatedConnection } = await updateBill(connection, qboBillId, {
      privateNote: `PO: ${mapping.poNumber}`,
      lineDescriptions,
    });

    if (updatedConnection) {
      await saveServerQboConnection(updatedConnection);
    }

    // Mark as synced
    await db.billMapping.update({
      where: { id: mapping.id },
      data: { syncedAt: new Date() },
    });

    return NextResponse.json({ success: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Failed to sync bill to QBO', error);
    return NextResponse.json(
      { error: 'Failed to sync bill to QBO', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
