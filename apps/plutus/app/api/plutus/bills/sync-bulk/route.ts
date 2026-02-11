import { NextRequest, NextResponse } from 'next/server';
import { updateBill, QboAuthError } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { createLogger } from '@targon/logger';
import db from '@/lib/db';
import { buildManufacturingLineDescriptionsFromMappings } from '@/lib/plutus/bills/qbo-sync';

const logger = createLogger({ name: 'plutus-bills-sync-bulk' });

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const qboBillIdsRaw = body.qboBillIds;
    if (!Array.isArray(qboBillIdsRaw) || qboBillIdsRaw.length === 0) {
      return NextResponse.json({ error: 'qboBillIds array is required' }, { status: 400 });
    }

    const qboBillIds = qboBillIdsRaw
      .filter((item): item is string => typeof item === 'string' && item !== '');

    if (qboBillIds.length === 0) {
      return NextResponse.json({ error: 'qboBillIds array is required' }, { status: 400 });
    }

    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    let activeConnection = connection;
    let shouldSaveConnection = false;
    let successCount = 0;
    const failures: Array<{ qboBillId: string; error: string }> = [];

    const mappings = await db.billMapping.findMany({
      where: { qboBillId: { in: qboBillIds } },
      include: { lines: true },
    });
    const mappingByBillId = new Map(mappings.map((mapping) => [mapping.qboBillId, mapping]));

    for (const qboBillId of qboBillIds) {
      const mapping = mappingByBillId.get(qboBillId);
      if (!mapping) {
        failures.push({ qboBillId, error: 'No mapping found for this bill' });
        continue;
      }

      try {
        const lineDescriptions = buildManufacturingLineDescriptionsFromMappings(qboBillId, mapping.lines);
        const syncResult = await updateBill(activeConnection, qboBillId, {
          privateNote: mapping.poNumber.trim() === '' ? undefined : `PO: ${mapping.poNumber}`,
          lineDescriptions,
        });
        if (syncResult.updatedConnection) {
          activeConnection = syncResult.updatedConnection;
          shouldSaveConnection = true;
        }

        await db.billMapping.update({
          where: { id: mapping.id },
          data: { syncedAt: new Date() },
        });
        successCount += 1;
      } catch (error) {
        failures.push({
          qboBillId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (shouldSaveConnection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json({
      successCount,
      failureCount: failures.length,
      failures,
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    logger.error('Failed to sync bills in bulk', error);
    return NextResponse.json(
      { error: 'Failed to sync bills in bulk', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
