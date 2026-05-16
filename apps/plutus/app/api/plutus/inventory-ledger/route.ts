import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-inventory-ledger-api' });

type InventoryLayerRow = {
  id: string;
  poNumber: string;
  marketplace: string;
  sku: string;
  qtyReceived: number;
  qtyRemaining: number;
  landedTotalCents: number;
  unitCost: number;
  currency: string;
  status: string;
  receiptDate: Date | null;
};

export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<InventoryLayerRow[]>(`
      SELECT
        "id",
        "poNumber",
        "marketplace",
        "sku",
        "qtyReceived",
        "qtyRemaining",
        "landedTotalCents",
        "unitCost",
        "currency",
        "status",
        "receiptDate"
      FROM "CostLayer"
      ORDER BY "poNumber" ASC, "sku" ASC, "receiptDate" ASC
      LIMIT 1000
    `);

    return NextResponse.json({
      layers: rows.map((row) => ({
        id: row.id,
        poNumber: row.poNumber,
        marketplace: row.marketplace,
        sku: row.sku,
        qtyReceived: row.qtyReceived,
        qtyRemaining: row.qtyRemaining,
        landedTotalCents: row.landedTotalCents,
        unitCost: Number(row.unitCost),
        currency: row.currency,
        status: row.status,
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
