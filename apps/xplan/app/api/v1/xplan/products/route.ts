import { NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-xplan';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { loadPlanningCalendar } from '@/lib/planning';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategiesAccess, requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';
import { weekStartsOnForRegion } from '@/lib/strategy-region';

const numericFields = [
  'sellingPrice',
  'manufacturingCost',
  'freightCost',
  'tariffRate',
  'tacosPercent',
  'fbaFee',
  'amazonReferralRate',
  'storagePerMonth',
] as const;

const textFields = ['name', 'sku'] as const;

const percentFields: NumericField[] = ['tariffRate', 'tacosPercent', 'amazonReferralRate'];

const updateSchema = z.object({
  updates: z
    .array(
      z.object({
        id: z.string().min(1),
        values: z.record(z.string(), z.string().nullable().optional()),
      }),
    )
    .min(1),
});

const createSchema = z.object({
  strategyId: z.string().min(1),
  name: z.string().min(1),
  sku: z.string().min(1),
});

const deleteSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
});

type NumericField = (typeof numericFields)[number];

type TransactionClient = Prisma.TransactionClient;
type TemplateWeek = { weekNumber: number; weekDate: Date | null };

function parseNumeric(value: string | null | undefined) {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/[%$\s]/g, '').replace(/,/g, '');
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

async function seedSalesWeeksForProduct(
  productId: string,
  strategyId: string,
  client: TransactionClient,
  weekStartsOn: 0 | 1,
) {
  const templateProduct = await client.product.findFirst({
    where: { id: { not: productId }, strategyId },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  let templateWeeks: TemplateWeek[] = templateProduct
    ? ((await client.salesWeek.findMany({
        where: { productId: templateProduct.id, strategyId },
        select: { weekNumber: true, weekDate: true },
        orderBy: { weekNumber: 'asc' },
      })) as TemplateWeek[])
    : [];

  if (templateWeeks.length === 0) {
    const planning = await loadPlanningCalendar(weekStartsOn);
    templateWeeks = planning.salesWeeks.map((week) => ({
      weekNumber: week.weekNumber,
      weekDate: week.weekDate ?? null,
    }));
  }

  if (templateWeeks.length === 0) return;

  await client.salesWeek.createMany({
    data: templateWeeks.map((week) => ({
      productId,
      strategyId,
      weekNumber: week.weekNumber,
      weekDate: week.weekDate,
    })),
    skipDuplicates: true,
  });
}

export const GET = withXPlanAuth(async (request: Request, session) => {
  const { searchParams } = new URL(request.url);
  const strategyId = searchParams.get('strategyId');

  if (!strategyId) {
    return NextResponse.json({ error: 'strategyId is required' }, { status: 400 });
  }

  const { response } = await requireXPlanStrategyAccess(strategyId, session);
  if (response) return response;

  const products = await prisma.product.findMany({
    where: { strategyId },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({ products });
});

export const POST = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { response } = await requireXPlanStrategyAccess(parsed.data.strategyId, session);
  if (response) return response;

  const strategyRow = await (prisma as unknown as Record<string, any>).strategy?.findUnique?.({
    where: { id: parsed.data.strategyId },
    select: { region: true },
  });
  const weekStartsOn = weekStartsOnForRegion(strategyRow?.region === 'UK' ? 'UK' : 'US');

  const result = await prisma.$transaction(async (tx: TransactionClient) => {
    const product = await tx.product.create({
      data: {
        strategyId: parsed.data.strategyId,
        name: parsed.data.name.trim(),
        sku: parsed.data.sku.trim(),
        sellingPrice: new Prisma.Decimal(0),
        manufacturingCost: new Prisma.Decimal(0),
        freightCost: new Prisma.Decimal(0),
        tariffRate: new Prisma.Decimal(0),
        tacosPercent: new Prisma.Decimal(0),
        fbaFee: new Prisma.Decimal(0),
        amazonReferralRate: new Prisma.Decimal(0),
        storagePerMonth: new Prisma.Decimal(0),
      },
    });

    await seedSalesWeeksForProduct(product.id, parsed.data.strategyId, tx, weekStartsOn);

    return product;
  });

  return NextResponse.json({ product: result });
});

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const productIds = parsed.data.updates.map(({ id }) => id);
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, strategyId: true },
  });
  const { response } = await requireXPlanStrategiesAccess(
    products.map((product) => product.strategyId),
    session,
  );
  if (response) return response;

  const updates = parsed.data.updates
    .map(({ id, values }) => {
      const data: Record<string, string | number | null> = {};

      for (const field of numericFields) {
        if (field in values) {
          const parsedValue = parseNumeric(values[field]);
          if (parsedValue === null) {
            data[field] = null;
          } else if (percentFields.includes(field) && parsedValue > 1) {
            data[field] = parsedValue / 100;
          } else {
            data[field] = parsedValue;
          }
        }
      }

      for (const field of textFields) {
        if (field in values) {
          const rawValue = values[field];
          if (rawValue == null) continue;
          const trimmed = rawValue.trim();
          if (trimmed) {
            data[field] = trimmed;
          }
        }
      }

      return { id, data };
    })
    .filter((update) => Object.keys(update.data).length > 0);

  if (updates.length === 0) {
    return NextResponse.json({ ok: true });
  }

  await prisma.$transaction(
    updates.map(({ id, data }) =>
      prisma.product.update({
        where: { id },
        data,
      }),
    ),
  );

  return NextResponse.json({ ok: true });
});

export const DELETE = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const ids = parsed.data.ids;
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, strategyId: true },
  });
  const { response } = await requireXPlanStrategiesAccess(
    products.map((product) => product.strategyId),
    session,
  );
  if (response) return response;

  await prisma.$transaction(async (tx: TransactionClient) => {
    await tx.purchaseOrder.deleteMany({ where: { productId: { in: ids } } });
    await tx.leadTimeOverride.deleteMany({ where: { productId: { in: ids } } });
    await tx.product.deleteMany({ where: { id: { in: ids } } });
  });

  return NextResponse.json({ ok: true });
});
