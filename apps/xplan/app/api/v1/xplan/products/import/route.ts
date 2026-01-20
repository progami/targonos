import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-xplan';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loadPlanningCalendar } from '@/lib/planning';
import { withXPlanAuth, RATE_LIMIT_PRESETS } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

export const runtime = 'nodejs';

const BULK_RATE_LIMIT = RATE_LIMIT_PRESETS.bulk;

const importSchema = z.object({
  strategyId: z.string().min(1),
  products: z
    .array(
      z.object({
        sku: z.string().min(1),
        name: z.string().min(1),
        asin: z.string().optional(),
      }),
    )
    .min(1)
    .max(250),
});

type TemplateWeek = { weekNumber: number; weekDate: Date | null };

function normalizeSku(value: string) {
  return value.trim().toLowerCase();
}

export const POST = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = importSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { strategyId } = parsed.data;
  const { response } = await requireXPlanStrategyAccess(strategyId, session);
  if (response) return response;

  const requestedBySku = new Map<string, { sku: string; name: string; asin?: string }>();
  for (const row of parsed.data.products) {
    const sku = row.sku.trim();
    const name = row.name.trim();
    const asin = row.asin?.trim();
    if (!sku || !name) continue;
    requestedBySku.set(normalizeSku(sku), { sku, name, asin });
  }

  if (requestedBySku.size === 0) {
    return NextResponse.json({ error: 'No valid products provided' }, { status: 400 });
  }

  const strategyRow = await (prisma as unknown as Record<string, any>).strategy?.findUnique?.({
    where: { id: strategyId },
    select: { region: true },
  });
  const region = strategyRow?.region === 'UK' ? 'UK' : 'US';
  const weekStartsOn = weekStartsOnForRegion(region);

  const result = await prisma.$transaction<{
    created: Array<{ id: string; sku: string; name: string; asin: string | null }>;
    skippedExisting: Array<{ sku: string; name: string }>;
  }>(async (tx: Prisma.TransactionClient) => {
    const existing = await tx.product.findMany({
      where: { strategyId },
      select: { sku: true },
    });
    const existingSet = new Set(existing.map((row) => normalizeSku(row.sku)));

    const requested = Array.from(requestedBySku.values());
    const toCreate = requested.filter((row) => !existingSet.has(normalizeSku(row.sku)));
    const skippedExisting = requested.filter((row) => existingSet.has(normalizeSku(row.sku)));

    let templateWeeks: TemplateWeek[] = [];
    const templateProduct = await tx.product.findFirst({
      where: { strategyId },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });

    if (templateProduct) {
      templateWeeks = (await tx.salesWeek.findMany({
        where: { strategyId, productId: templateProduct.id },
        select: { weekNumber: true, weekDate: true },
        orderBy: { weekNumber: 'asc' },
      })) as TemplateWeek[];
    }

    if (templateWeeks.length === 0) {
      const planning = await loadPlanningCalendar(weekStartsOn);
      templateWeeks = planning.salesWeeks.map((week) => ({
        weekNumber: week.weekNumber,
        weekDate: week.weekDate ?? null,
      }));
    }

    const created: Array<{ id: string; sku: string; name: string; asin: string | null }> = [];

    for (const row of toCreate) {
      const product = await tx.product.create({
        data: {
          strategyId,
          name: row.name,
          sku: row.sku,
          asin: row.asin,
          sellingPrice: new Prisma.Decimal(0),
          manufacturingCost: new Prisma.Decimal(0),
          freightCost: new Prisma.Decimal(0),
          tariffRate: new Prisma.Decimal(0),
          tacosPercent: new Prisma.Decimal(0),
          fbaFee: new Prisma.Decimal(0),
          amazonReferralRate: new Prisma.Decimal(0),
          storagePerMonth: new Prisma.Decimal(0),
        },
        select: { id: true, sku: true, name: true },
      });

      // Cast to include asin (TypeScript cache issue with Prisma regeneration)
      created.push({ ...product, asin: row.asin ?? null });

      if (templateWeeks.length > 0) {
        await tx.salesWeek.createMany({
          data: templateWeeks.map((week) => ({
            productId: product.id,
            strategyId,
            weekNumber: week.weekNumber,
            weekDate: week.weekDate,
          })),
          skipDuplicates: true,
        });
      }
    }

    return {
      created,
      skippedExisting,
    };
  });

  return NextResponse.json({
    ok: true,
    createdCount: result.created.length,
    skippedExistingCount: result.skippedExisting.length,
    createdSkus: result.created.map((row) => row.sku),
    skippedExistingSkus: result.skippedExisting.map((row) => row.sku),
  });
}, { rateLimit: BULK_RATE_LIMIT });
