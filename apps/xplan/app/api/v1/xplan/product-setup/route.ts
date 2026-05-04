import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-xplan';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';

const numericFields = [
  'openingStock',
  'nextYearOpeningOverride',
  'totalCoverThresholdWeeks',
  'fbaCoverThresholdWeeks',
] as const;

const textFields = ['notes'] as const;

const integerFields = new Set<string>(['openingStock', 'nextYearOpeningOverride']);
const prismaAny = prisma as unknown as {
  productSetupYear: {
    upsert: (args: unknown) => Promise<unknown>;
  };
};

const updateSchema = z.object({
  strategyId: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  updates: z
    .array(
      z.object({
        productId: z.string().min(1),
        values: z.record(z.string(), z.string().nullable().optional()),
      }),
    )
    .min(1),
});

function parseNumberField(field: string, value: string | null | undefined): number | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const cleaned = trimmed.replace(/[$,%\s]/g, '').replace(/,/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${field} must be numeric`);
  }
  if (integerFields.has(field)) {
    return Math.round(parsed);
  }
  return parsed;
}

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { strategyId, year, updates } = parsed.data;
  const { response } = await requireXPlanStrategyAccess(strategyId, session);
  if (response) return response;

  const productIds = updates.map((update) => update.productId);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, strategyId },
    select: { id: true },
  });
  const validProductIds = new Set(products.map((product) => product.id));
  const invalidProduct = productIds.find((productId) => !validProductIds.has(productId));
  if (invalidProduct) {
    return NextResponse.json({ error: 'Product does not belong to strategy' }, { status: 400 });
  }

  try {
    await prisma.$transaction(
      updates.map((update) => {
        const data: Record<string, unknown> = {};

        for (const field of numericFields) {
          if (!(field in update.values)) continue;
          const parsedValue = parseNumberField(field, update.values[field]);
          data[field] =
            parsedValue == null ? null : new Prisma.Decimal(parsedValue.toFixed(2));
          if (integerFields.has(field)) {
            data[field] = parsedValue;
          }
        }

        for (const field of textFields) {
          if (!(field in update.values)) continue;
          const rawValue = update.values[field];
          data[field] = rawValue == null ? null : rawValue;
        }

        return prismaAny.productSetupYear.upsert({
          where: {
            strategyId_productId_year: {
              strategyId,
              productId: update.productId,
              year,
            },
          },
          update: data,
          create: {
            strategyId,
            productId: update.productId,
            year,
            ...data,
          },
        });
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update setup values';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});
