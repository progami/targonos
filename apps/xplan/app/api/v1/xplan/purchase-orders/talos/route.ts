import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { getTalosPrisma } from '@/lib/integrations/talos-client';

export const runtime = 'nodejs';

const querySchema = z.object({
  strategyId: z.string().min(1),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = withXPlanAuth(async (request: Request, session) => {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    strategyId: searchParams.get('strategyId'),
    q: searchParams.get('q') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'strategyId is required' }, { status: 400 });
  }

  const { response } = await requireXPlanStrategyAccess(parsed.data.strategyId, session);
  if (response) return response;

  const strategyRow = await (prisma as unknown as Record<string, any>).strategy?.findUnique?.({
    where: { id: parsed.data.strategyId },
    select: { region: true },
  });
  const region = strategyRow?.region === 'UK' ? 'UK' : 'US';

  const talos = getTalosPrisma(region);
  if (!talos) {
    return NextResponse.json(
      {
        error:
          region === 'UK'
            ? 'TALOS_DATABASE_URL_UK is not configured'
            : 'TALOS_DATABASE_URL_US is not configured',
      },
      { status: 501 },
    );
  }

  const query = parsed.data.q?.trim();
  const limit = parsed.data.limit ?? 250;

  const orders = await talos.purchaseOrder.findMany({
    where: {
      type: 'PURCHASE',
      status: { notIn: ['CANCELLED', 'REJECTED'] },
      ...(query
        ? {
            OR: [
              { poNumber: { contains: query, mode: 'insensitive' } },
              { orderNumber: { contains: query, mode: 'insensitive' } },
              { counterpartyName: { contains: query, mode: 'insensitive' } },
              { factoryName: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      poNumber: true,
      orderNumber: true,
      status: true,
      counterpartyName: true,
      factoryName: true,
      expectedDate: true,
      manufacturingStartDate: true,
      expectedCompletionDate: true,
      actualCompletionDate: true,
      estimatedDeparture: true,
      actualDeparture: true,
      estimatedArrival: true,
      actualArrival: true,
      warehouseName: true,
      vesselName: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { lines: true, containers: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({
    orders: orders.map((order) => ({
      id: order.id,
      poNumber: order.poNumber,
      orderNumber: order.orderNumber,
      status: order.status,
      counterpartyName: order.counterpartyName,
      factoryName: order.factoryName,
      expectedDate: order.expectedDate,
      manufacturingStartDate: order.manufacturingStartDate,
      expectedCompletionDate: order.expectedCompletionDate,
      actualCompletionDate: order.actualCompletionDate,
      estimatedDeparture: order.estimatedDeparture,
      actualDeparture: order.actualDeparture,
      estimatedArrival: order.estimatedArrival,
      actualArrival: order.actualArrival,
      warehouseName: order.warehouseName,
      vesselName: order.vesselName,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      lineCount: order._count.lines,
      containerCount: order._count.containers,
    })),
  });
});
