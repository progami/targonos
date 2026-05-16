import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-purchase-orders-api' });

type PurchaseOrderRow = {
  id: string;
  internalRef: string;
  sourceType: string;
  sourceId: string;
  supplierRef: string | null;
  marketplace: string | null;
  status: string;
  layerCount: bigint;
  layerAmountCents: bigint | null;
};

export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<PurchaseOrderRow[]>(`
      SELECT
        po."id",
        po."internalRef",
        po."sourceType",
        po."sourceId",
        po."supplierRef",
        po."marketplace",
        po."status",
        COUNT(layer."id") AS "layerCount",
        COALESCE(SUM(layer."amountCents"), 0) AS "layerAmountCents"
      FROM "PurchaseOrder" po
      LEFT JOIN "PoCostLayer" layer ON layer."purchaseOrderId" = po."id"
      GROUP BY po."id"
      ORDER BY po."internalRef" ASC
      LIMIT 500
    `);

    return NextResponse.json({
      purchaseOrders: rows.map((row) => ({
        id: row.id,
        internalRef: row.internalRef,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        supplierRef: row.supplierRef,
        marketplace: row.marketplace,
        status: row.status,
        layerCount: Number(row.layerCount),
        layerAmountCents: Number(row.layerAmountCents ?? 0n),
      })),
    });
  } catch (error) {
    logger.error('Failed to list exact purchase orders', error);
    return NextResponse.json(
      { error: 'Failed to list exact purchase orders', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
