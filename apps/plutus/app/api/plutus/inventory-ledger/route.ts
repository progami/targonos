import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-inventory-ledger' });

export async function GET() {
  try {
    const rows = await db.inventoryMovement.findMany({
      orderBy: [
        { movementDate: 'desc' },
        { id: 'asc' },
      ],
      take: 500,
      select: {
        id: true,
        marketplace: true,
        movementType: true,
        quantity: true,
        movementDate: true,
        sourceType: true,
        sourceId: true,
        sourceLineId: true,
        createdAt: true,
        updatedAt: true,
        canonicalProduct: {
          select: {
            id: true,
            name: true,
            active: true,
            productGroup: {
              select: {
                id: true,
                code: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const movements = rows.map((row) => ({
      id: row.id,
      marketplace: row.marketplace,
      movementType: row.movementType,
      quantity: row.quantity,
      movementDate: row.movementDate,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      sourceLineId: row.sourceLineId,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      product: row.canonicalProduct,
    }));

    return NextResponse.json({ movements });
  } catch (error) {
    logger.error('Failed to list Plutus inventory movements', error);
    return NextResponse.json(
      { error: 'Failed to list inventory ledger', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
