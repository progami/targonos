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
  limit: z.coerce.number().int().min(1).max(1000).optional(),
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
  const limit = parsed.data.limit ?? 500;

  const skus = await talos.sku.findMany({
    where: {
      isActive: true,
      ...(query
        ? {
            OR: [
              { skuCode: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { asin: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: {
      skuCode: true,
      asin: true,
      description: true,
    },
    orderBy: { skuCode: 'asc' },
    take: limit,
  });

  return NextResponse.json({
    products: skus.map((sku) => ({
      sku: sku.skuCode,
      asin: sku.asin,
      name: sku.description,
    })),
  });
});
