import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';
import {
  requireLandedCostCurrency,
  requireLandedCostType,
} from '@/lib/plutus/landed-cost-allocation-rules';

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

function requireNonBlankString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

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
      {
        error: 'Failed to list landed-cost allocations',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const qboBillId = requireNonBlankString(body, 'qboBillId');
    const qboBillLineId = requireNonBlankString(body, 'qboBillLineId');
    const qboPurchaseOrderId = requireNonBlankString(body, 'qboPurchaseOrderId');
    const sku = requireNonBlankString(body, 'sku').toUpperCase();
    const costType = requireLandedCostType(requireNonBlankString(body, 'costType'));
    const currency = requireLandedCostCurrency(requireNonBlankString(body, 'currency'));

    const allocatedAmountCents = Number(body.allocatedAmountCents);
    if (!Number.isInteger(allocatedAmountCents) || allocatedAmountCents <= 0) {
      throw new Error('allocatedAmountCents must be a positive integer');
    }

    const created = await db.landedCostAllocation.create({
      data: {
        qboBillId,
        qboBillLineId,
        qboPurchaseOrderId,
        qboPurchaseOrderLineId:
          typeof body.qboPurchaseOrderLineId === 'string' &&
          body.qboPurchaseOrderLineId.trim() !== ''
            ? body.qboPurchaseOrderLineId.trim()
            : null,
        sku,
        costType,
        allocatedAmountCents,
        currency,
        sourceNote:
          typeof body.sourceNote === 'string' && body.sourceNote.trim() !== ''
            ? body.sourceNote.trim()
            : null,
      },
    });

    return NextResponse.json({ allocation: created }, { status: 201 });
  } catch (error) {
    logger.error('Failed to create landed-cost allocation', error);
    return NextResponse.json(
      {
        error: 'Failed to create landed-cost allocation',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 },
    );
  }
}
