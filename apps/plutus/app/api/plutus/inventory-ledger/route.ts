import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-inventory-ledger-api' });

type InventoryLayerRow = {
  id: string;
  internalRef: string;
  marketplace: string;
  sellerSku: string;
  component: string;
  quantity: number;
  amountCents: number;
  currency: string;
  allocationMethod: string;
  receiptDate: Date | null;
};

export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<InventoryLayerRow[]>(`
      SELECT
        layer."id",
        po."internalRef",
        layer."marketplace",
        layer."sellerSku",
        layer."component",
        layer."quantity",
        layer."amountCents",
        layer."currency",
        layer."allocationMethod",
        layer."receiptDate"
      FROM "PoCostLayer" layer
      INNER JOIN "PurchaseOrder" po ON po."id" = layer."purchaseOrderId"
      ORDER BY po."internalRef" ASC, layer."sellerSku" ASC, layer."component" ASC
      LIMIT 1000
    `);

    return NextResponse.json({
      layers: rows.map((row) => ({
        id: row.id,
        internalRef: row.internalRef,
        marketplace: row.marketplace,
        sellerSku: row.sellerSku,
        component: row.component,
        quantity: row.quantity,
        amountCents: row.amountCents,
        currency: row.currency,
        allocationMethod: row.allocationMethod,
        receiptDate: row.receiptDate === null ? null : row.receiptDate.toISOString(),
      })),
    });
  } catch (error) {
    logger.error('Failed to list exact inventory ledger', error);
    return NextResponse.json(
      { error: 'Failed to list exact inventory ledger', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
