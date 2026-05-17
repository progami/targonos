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
  notReadyLayerCount: bigint;
  liveQtyRemaining: bigint | null;
  inTransitQtyRemaining: bigint | null;
  liveValueCents: bigint | null;
  inTransitValueCents: bigint | null;
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
        COUNT(*) FILTER (WHERE "status" = 'NOT_READY') AS "notReadyLayerCount",
        COALESCE(SUM("qtyRemaining") FILTER (WHERE "status" = 'READY'), 0) AS "liveQtyRemaining",
        COALESCE(SUM("qtyRemaining") FILTER (WHERE "status" = 'NOT_READY'), 0) AS "inTransitQtyRemaining",
        COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)) FILTER (WHERE "status" = 'READY'), 0) AS "liveValueCents",
        COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)) FILTER (WHERE "status" = 'NOT_READY'), 0) AS "inTransitValueCents"
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
        notReadyLayerCount: Number(row.notReadyLayerCount),
        liveQtyRemaining: Number(row.liveQtyRemaining ?? 0n),
        inTransitQtyRemaining: Number(row.inTransitQtyRemaining ?? 0n),
        liveValueCents: Number(row.liveValueCents ?? 0n),
        inTransitValueCents: Number(row.inTransitValueCents ?? 0n),
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
