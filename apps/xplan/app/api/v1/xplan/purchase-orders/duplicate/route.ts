import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';

// Type assertion for Prisma models (some generated client types are not fully resolved at build time)
const prismaAny = prisma as unknown as Record<string, any>;

const duplicateSchema = z.object({
  id: z.string().min(1),
});

function generateOrderCode() {
  const random = Math.random().toString(36).slice(-5).toUpperCase();
  return `PO-${random}`;
}

function buildCopyCode(base: string, attempt: number) {
  const trimmed = base.trim();
  const suffix = attempt === 0 ? '-COPY' : `-COPY-${attempt + 1}`;
  return `${trimmed}${suffix}`;
}

async function resolveDuplicateOrderCode(strategyId: string, sourceOrderCode: string) {
  const trimmed = sourceOrderCode.trim();

  if (trimmed) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = buildCopyCode(trimmed, attempt);
      const conflict = await prismaAny.purchaseOrder.findUnique({
        where: { strategyId_orderCode: { strategyId, orderCode: candidate } },
        select: { id: true },
      });
      if (!conflict) return candidate;
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = generateOrderCode();
    const conflict = await prismaAny.purchaseOrder.findUnique({
      where: { strategyId_orderCode: { strategyId, orderCode: candidate } },
      select: { id: true },
    });
    if (!conflict) return candidate;
  }

  throw new Error('Unable to generate a unique purchase order code. Try again.');
}

export const POST = withXPlanAuth(async (request: Request, session) => {
  const body = await request.json().catch(() => null);
  const parsed = duplicateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const source = await prismaAny.purchaseOrder.findUnique({
    where: { id: parsed.data.id },
    include: {
      payments: true,
      batchTableRows: true,
      logisticsEvents: true,
    },
  });

  if (!source) {
    return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 });
  }

  const { response } = await requireXPlanStrategyAccess(source.strategyId, session);
  if (response) return response;

  const orderCode = await resolveDuplicateOrderCode(source.strategyId, source.orderCode);

  const created = await prismaAny.purchaseOrder.create({
    data: {
      strategyId: source.strategyId,
      productId: source.productId,
      orderCode,
      poDate: source.poDate,
      quantity: source.quantity,
      productionWeeks: source.productionWeeks,
      sourceWeeks: source.sourceWeeks,
      oceanWeeks: source.oceanWeeks,
      finalWeeks: source.finalWeeks,
      pay1Date: source.pay1Date,
      pay1Percent: source.pay1Percent,
      pay1Amount: source.pay1Amount,
      pay2Date: source.pay2Date,
      pay2Percent: source.pay2Percent,
      pay2Amount: source.pay2Amount,
      pay3Date: source.pay3Date,
      pay3Percent: source.pay3Percent,
      pay3Amount: source.pay3Amount,
      productionStart: source.productionStart,
      productionComplete: source.productionComplete,
      sourceDeparture: source.sourceDeparture,
      transportReference: source.transportReference,
      shipName: source.shipName,
      containerNumber: source.containerNumber,
      portEta: source.portEta,
      inboundEta: source.inboundEta,
      availableDate: source.availableDate,
      totalLeadDays: source.totalLeadDays,
      status: source.status,
      statusIcon: source.statusIcon,
      weeksUntilArrival: source.weeksUntilArrival,
      notes: source.notes,
      overrideSellingPrice: source.overrideSellingPrice,
      overrideManufacturingCost: source.overrideManufacturingCost,
      overrideFreightCost: source.overrideFreightCost,
      overrideTariffRate: source.overrideTariffRate,
      overrideTacosPercent: source.overrideTacosPercent,
      overrideFbaFee: source.overrideFbaFee,
      overrideReferralRate: source.overrideReferralRate,
      overrideStoragePerMonth: source.overrideStoragePerMonth,
      batchTableRows: source.batchTableRows.length
        ? {
            create: source.batchTableRows.map((batch: any) => ({
              batchCode: batch.batchCode,
              productId: batch.productId,
              quantity: batch.quantity,
              overrideSellingPrice: batch.overrideSellingPrice,
              overrideManufacturingCost: batch.overrideManufacturingCost,
              overrideFreightCost: batch.overrideFreightCost,
              overrideTariffRate: batch.overrideTariffRate,
              overrideTariffCost: batch.overrideTariffCost,
              overrideTacosPercent: batch.overrideTacosPercent,
              overrideFbaFee: batch.overrideFbaFee,
              overrideReferralRate: batch.overrideReferralRate,
              overrideStoragePerMonth: batch.overrideStoragePerMonth,
            })),
          }
        : undefined,
      payments: source.payments.length
        ? {
            create: source.payments.map((payment: any) => ({
              paymentIndex: payment.paymentIndex,
              dueDate: payment.dueDate,
              dueDateDefault: payment.dueDateDefault,
              dueDateSource: payment.dueDateSource,
              percentage: payment.percentage,
              amountExpected: payment.amountExpected,
              amountPaid: payment.amountPaid,
              category: payment.category,
              label: payment.label,
            })),
          }
        : undefined,
      logisticsEvents: source.logisticsEvents.length
        ? {
            create: source.logisticsEvents.map((event: any) => ({
              type: event.type,
              eventDate: event.eventDate,
              reference: event.reference,
              notes: event.notes,
            })),
          }
        : undefined,
    },
    select: {
      id: true,
      orderCode: true,
      productId: true,
      quantity: true,
    },
  });

  return NextResponse.json({ order: created });
});
