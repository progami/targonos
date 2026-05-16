import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-landed-cost-allocations-api' });

type AllocationRow = {
  id: string;
  qboBillId: string;
  qboBillLineId: string;
  qboPurchaseOrderId: string;
  qboPurchaseOrderLineId: string | null;
  sku: string;
  costType: string;
  allocatedAmountCents: number;
  currency: string;
  sourceNote: string | null;
};

export async function GET() {
  try {
    const rows = await db.$queryRawUnsafe<AllocationRow[]>(`
      SELECT
        "id",
        "qboBillId",
        "qboBillLineId",
        "qboPurchaseOrderId",
        "qboPurchaseOrderLineId",
        "sku",
        "costType",
        "allocatedAmountCents",
        "currency",
        "sourceNote"
      FROM "LandedCostAllocation"
      ORDER BY "qboBillId" ASC, "qboBillLineId" ASC, "sku" ASC
      LIMIT 1000
    `);

    return NextResponse.json({ allocations: rows });
  } catch (error) {
    logger.error('Failed to list landed-cost allocations', error);
    return NextResponse.json(
      { error: 'Failed to list landed-cost allocations', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const required = ['qboBillId', 'qboBillLineId', 'qboPurchaseOrderId', 'sku', 'costType', 'allocatedAmountCents', 'currency'];
    for (const key of required) {
      if (typeof body[key] !== 'string' && key !== 'allocatedAmountCents') {
        throw new Error(`${key} is required`);
      }
    }

    const allocatedAmountCents = Number(body.allocatedAmountCents);
    if (!Number.isInteger(allocatedAmountCents) || allocatedAmountCents < 0) {
      throw new Error('allocatedAmountCents must be a non-negative integer');
    }

    const created = await db.landedCostAllocation.create({
      data: {
        qboBillId: String(body.qboBillId).trim(),
        qboBillLineId: String(body.qboBillLineId).trim(),
        qboPurchaseOrderId: String(body.qboPurchaseOrderId).trim(),
        qboPurchaseOrderLineId:
          typeof body.qboPurchaseOrderLineId === 'string' && body.qboPurchaseOrderLineId.trim() !== ''
            ? body.qboPurchaseOrderLineId.trim()
            : null,
        sku: String(body.sku).trim().toUpperCase(),
        costType: String(body.costType).trim().toUpperCase(),
        allocatedAmountCents,
        currency: String(body.currency).trim().toUpperCase(),
        sourceNote: typeof body.sourceNote === 'string' && body.sourceNote.trim() !== '' ? body.sourceNote.trim() : null,
      },
    });

    return NextResponse.json({ allocation: created }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create landed-cost allocation', error);
    return NextResponse.json(
      { error: 'Failed to create landed-cost allocation', details: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
