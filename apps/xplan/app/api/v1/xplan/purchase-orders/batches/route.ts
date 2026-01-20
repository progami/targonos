import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategiesAccess, requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';

const prismaAny = prisma as unknown as {
  batchTableRow?: typeof prisma.batchTableRow;
};

function ensureBatchDelegate() {
  if (!prismaAny.batchTableRow) {
    return null;
  }
  return prismaAny.batchTableRow;
}

const allowedFields = [
  'batchCode',
  'productId',
  'quantity',
  'overrideSellingPrice',
  'overrideManufacturingCost',
  'overrideFreightCost',
  'overrideTariffRate',
  'overrideTariffCost',
  'overrideTacosPercent',
  'overrideFbaFee',
  'overrideReferralRate',
  'overrideStoragePerMonth',
  'cartonSide1Cm',
  'cartonSide2Cm',
  'cartonSide3Cm',
  'cartonWeightKg',
  'unitsPerCarton',
] as const;

const percentFields: Record<string, true> = {
  overrideTariffRate: true,
  overrideTacosPercent: true,
  overrideReferralRate: true,
};

const decimalFields: Record<string, true> = {
  overrideSellingPrice: true,
  overrideManufacturingCost: true,
  overrideFreightCost: true,
  overrideTariffCost: true,
  overrideFbaFee: true,
  overrideStoragePerMonth: true,
  cartonSide1Cm: true,
  cartonSide2Cm: true,
  cartonSide3Cm: true,
  cartonWeightKg: true,
};

const integerFields: Record<string, true> = {
  unitsPerCarton: true,
};

function parseNumber(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const cleaned = trimmed.replace(/[$,%\s]/g, '').replace(/,/g, '');
  const parsed = Number(cleaned);
  return Number.isNaN(parsed) ? null : parsed;
}

const updateSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().min(1),
      values: z.record(z.string(), z.string().nullable().optional()),
    }),
  ),
});

const createSchema = z.object({
  purchaseOrderId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).default(0),
  batchCode: z.string().trim().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

async function recalcOrderQuantity(purchaseOrderId: string) {
  const delegate = ensureBatchDelegate();
  if (!delegate) return;

  try {
    const aggregate = (await delegate.aggregate({
      where: { purchaseOrderId },
      _sum: { quantity: true },
    })) as { _sum?: { quantity?: number | null } };
    const quantity = aggregate?._sum?.quantity ?? 0;
    await prisma.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { quantity } });
  } catch (error: any) {
    if (error?.code === 'P2021') {
      console.warn('BatchTableRow table missing; skip quantity recalculation');
      return;
    }
    throw error;
  }
}

export const POST = withXPlanAuth(async (request: Request, session) => {
  const delegate = ensureBatchDelegate();
  if (!delegate) {
    return NextResponse.json(
      {
        error:
          'Purchase order batches are not available yet. Regenerate the Prisma client (pnpm --filter @targon/xplan prisma:generate) and ensure the database migration has been applied.',
      },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { purchaseOrderId, productId, quantity, batchCode } = parsed.data;

  const [purchaseOrder, product] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { id: true, strategyId: true },
    }),
    prisma.product.findUnique({ where: { id: productId }, select: { id: true, strategyId: true } }),
  ]);

  if (!purchaseOrder) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
  }
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { response } = await requireXPlanStrategyAccess(purchaseOrder.strategyId, session);
  if (response) return response;

  if (product.strategyId !== purchaseOrder.strategyId) {
    return NextResponse.json({ error: 'Product does not belong to strategy' }, { status: 400 });
  }

  let created;
  try {
    created = await delegate.create({
      data: {
        purchaseOrderId,
        productId,
        quantity,
        batchCode: batchCode && batchCode.length > 0 ? batchCode : null,
      },
    });
  } catch (error: any) {
    if (error?.code === 'P2021') {
      return NextResponse.json(
        {
          error:
            'Purchase order batches are not yet available. Run `prisma migrate dev --schema apps/xplan/prisma/schema.prisma` (or `prisma db push`) and restart the dev server to create the new table.',
        },
        { status: 503 },
      );
    }
    console.error('Failed to create purchase order batch', error);
    return NextResponse.json({ error: 'Failed to create purchase order batch' }, { status: 500 });
  }

  await recalcOrderQuantity(purchaseOrderId);

  return NextResponse.json({
    batch: {
      id: created.id,
      purchaseOrderId: created.purchaseOrderId,
      productId: created.productId,
      quantity: created.quantity,
      batchCode: created.batchCode,
    },
  });
});

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const delegate = ensureBatchDelegate();
  if (!delegate) {
    return NextResponse.json(
      {
        error:
          'Purchase order batches are not available yet. Regenerate the Prisma client (pnpm --filter @targon/xplan prisma:generate) and ensure the database migration has been applied.',
      },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const existingRows = await delegate.findMany({
    where: { id: { in: parsed.data.updates.map(({ id }) => id) } },
    select: { id: true, purchaseOrderId: true },
  });
  const existingById = new Map(existingRows.map((row) => [row.id, row]));

  const purchaseOrderIds = Array.from(new Set(existingRows.map((row) => row.purchaseOrderId)));
  const purchaseOrders = await prisma.purchaseOrder.findMany({
    where: { id: { in: purchaseOrderIds } },
    select: { id: true, strategyId: true },
  });
  const purchaseOrderById = new Map(purchaseOrders.map((order) => [order.id, order]));

  const { response } = await requireXPlanStrategiesAccess(
    purchaseOrders.map((order) => order.strategyId),
    session,
  );
  if (response) return response;

  const ordersToRecalc = new Set<string>();

  for (const { id, values } of parsed.data.updates) {
    const existing = existingById.get(id);
    if (!existing) {
      return NextResponse.json({ error: `Batch ${id} not found` }, { status: 404 });
    }

    const purchaseOrder = purchaseOrderById.get(existing.purchaseOrderId);
    if (!purchaseOrder) {
      return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
    }

    if ('productId' in values) {
      const incomingProductId = values.productId;
      if (incomingProductId) {
        const product = await prisma.product.findUnique({
          where: { id: incomingProductId },
          select: { id: true, strategyId: true },
        });
        if (!product) {
          return NextResponse.json({ error: 'Product not found' }, { status: 404 });
        }
        if (product.strategyId !== purchaseOrder.strategyId) {
          return NextResponse.json(
            { error: 'Product does not belong to strategy' },
            { status: 400 },
          );
        }
      }
    }

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (!(field in values)) continue;
      const incoming = values[field];
      if (incoming == null || incoming === '') {
        data[field] = null;
        continue;
      }
      if (field === 'quantity') {
        const parsedQuantity = parseNumber(incoming);
        data[field] = parsedQuantity != null ? Math.max(0, Math.round(parsedQuantity)) : null;
      } else if (percentFields[field]) {
        const parsedNumber = parseNumber(incoming);
        if (parsedNumber == null) {
          data[field] = null;
        } else {
          const normalized = parsedNumber > 1 ? parsedNumber / 100 : parsedNumber;
          // Clamp to the column precision (5,4) to avoid numeric overflow while allowing full percentages
          const clamped = Math.min(Math.max(normalized, 0), 9.9999);
          data[field] = clamped;
        }
      } else if (decimalFields[field]) {
        data[field] = parseNumber(incoming);
      } else if (integerFields[field]) {
        const parsedInt = parseNumber(incoming);
        data[field] = parsedInt != null ? Math.max(0, Math.round(parsedInt)) : null;
      } else if (field === 'productId' || field === 'batchCode') {
        data[field] = incoming;
      }
    }

    try {
      await delegate.update({ where: { id }, data });
    } catch (error: any) {
      if (error?.code === 'P2021') {
        return NextResponse.json(
          {
            error:
              'Purchase order batches are not yet available. Run `prisma migrate dev --schema apps/xplan/prisma/schema.prisma` (or `prisma db push`) and restart the dev server to create the new table.',
          },
          { status: 503 },
        );
      }
      console.error('Failed to update purchase order batch', error);
      return NextResponse.json({ error: 'Failed to update batch' }, { status: 500 });
    }
    ordersToRecalc.add(existing.purchaseOrderId);
  }

  try {
    await Promise.all(Array.from(ordersToRecalc).map((orderId) => recalcOrderQuantity(orderId)));
  } catch (error) {
    console.error('Failed to recalculate order quantities', error);
    // Continue anyway - the batch updates succeeded, just quantity sync failed
  }

  return NextResponse.json({ ok: true });
});

export const DELETE = withXPlanAuth(async (request: Request, session) => {
  const delegate = ensureBatchDelegate();
  if (!delegate) {
    return NextResponse.json(
      {
        error:
          'Purchase order batches are not available yet. Regenerate the Prisma client (pnpm --filter @targon/xplan prisma:generate) and ensure the database migration has been applied.',
      },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id } = parsed.data;

  const existing = await delegate.findUnique({ where: { id }, select: { purchaseOrderId: true } });
  if (!existing) {
    return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
  }

  const purchaseOrder = await prisma.purchaseOrder.findUnique({
    where: { id: existing.purchaseOrderId },
    select: { id: true, strategyId: true },
  });
  if (!purchaseOrder) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
  }

  const { response } = await requireXPlanStrategyAccess(purchaseOrder.strategyId, session);
  if (response) return response;

  try {
    await delegate.delete({ where: { id } });
  } catch (error: any) {
    if (error?.code === 'P2021') {
      return NextResponse.json(
        {
          error:
            'Purchase order batches are not yet available. Run `prisma migrate dev --schema apps/xplan/prisma/schema.prisma` (or `prisma db push`) and restart the dev server to create the new table.',
        },
        { status: 503 },
      );
    }
    console.error('Failed to delete purchase order batch', error);
    return NextResponse.json({ error: 'Failed to delete purchase order batch' }, { status: 500 });
  }
  await recalcOrderQuantity(existing.purchaseOrderId);

  return NextResponse.json({ ok: true });
});
