import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-purchase-orders' });

export async function GET() {
  try {
    const rows = await db.purchaseOrder.findMany({
      orderBy: [
        { internalRef: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        internalRef: true,
        supplierRef: true,
        marketplace: true,
        status: true,
        costLayers: {
          orderBy: [
            { component: 'asc' },
            { createdAt: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            component: true,
            quantity: true,
            amountCents: true,
            currency: true,
            allocationMethod: true,
            sourceQboTxnType: true,
            sourceQboTxnId: true,
            sourceQboLineId: true,
            sourceDocumentName: true,
            createdAt: true,
            canonicalProduct: {
              select: {
                id: true,
                name: true,
                active: true,
                aliases: {
                  orderBy: [
                    { marketplace: 'asc' },
                    { aliasType: 'asc' },
                    { value: 'asc' },
                    { id: 'asc' },
                  ],
                  select: {
                    marketplace: true,
                    aliasType: true,
                    value: true,
                    active: true,
                  },
                },
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
        },
      },
    });

    const purchaseOrders = rows.map((row) => ({
      id: row.id,
      internalRef: row.internalRef,
      supplierRef: row.supplierRef,
      marketplace: row.marketplace,
      status: row.status,
      costLayers: row.costLayers.map((layer) => ({
        id: layer.id,
        component: layer.component,
        quantity: layer.quantity,
        amountCents: layer.amountCents,
        currency: layer.currency,
        allocationMethod: layer.allocationMethod,
        sourceQboTxnType: layer.sourceQboTxnType,
        sourceQboTxnId: layer.sourceQboTxnId,
        sourceQboLineId: layer.sourceQboLineId,
        sourceDocumentName: layer.sourceDocumentName,
        createdAt: layer.createdAt,
        product: layer.canonicalProduct,
      })),
    }));

    return NextResponse.json({ purchaseOrders });
  } catch (error) {
    logger.error('Failed to list Plutus purchase orders', error);
    return NextResponse.json(
      { error: 'Failed to list purchase orders', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
