import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-purchase-orders-api' });

type PurchaseOrderRow = {
  poNumber: string;
  qboPurchaseOrderId: string | null;
  marketplace: string;
  layerCount: bigint;
  readyLayerCount: bigint;
  remainingQty: bigint | null;
  remainingValueCents: bigint | null;
};

export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<PurchaseOrderRow[]>(`
      SELECT
        "poNumber",
        MIN("qboPurchaseOrderId") AS "qboPurchaseOrderId",
        "marketplace",
        COUNT("id") AS "layerCount",
        COUNT(*) FILTER (WHERE "status" = 'READY') AS "readyLayerCount",
        COALESCE(SUM("qtyRemaining"), 0) AS "remainingQty",
        COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)), 0) AS "remainingValueCents"
      FROM "CostLayer"
      GROUP BY "poNumber", "marketplace"
      ORDER BY "poNumber" ASC
      LIMIT 500
    `);

    return NextResponse.json({
      purchaseOrders: rows.map((row) => ({
        poNumber: row.poNumber,
        qboPurchaseOrderId: row.qboPurchaseOrderId,
        marketplace: row.marketplace,
        layerCount: Number(row.layerCount),
        readyLayerCount: Number(row.readyLayerCount),
        remainingQty: Number(row.remainingQty ?? 0n),
        remainingValueCents: Number(row.remainingValueCents ?? 0n),
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
