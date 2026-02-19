import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { withXPlanAuth } from '@/lib/api/auth';
import { requireXPlanStrategyAccess } from '@/lib/api/strategy-guard';

type UpsertPayload = {
  productId: string;
  stageTemplateId: string;
  durationWeeks: number;
};

type DeletePayload = {
  productId: string;
  stageTemplateId: string;
};

export const PUT = withXPlanAuth(async (request: Request, session) => {
  const body = (await request.json()) as UpsertPayload;

  if (!body?.productId || !body?.stageTemplateId || body?.durationWeeks == null) {
    return NextResponse.json(
      { error: 'productId, stageTemplateId, and durationWeeks are required' },
      { status: 400 },
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: body.productId },
    select: { strategyId: true },
  });

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { response } = await requireXPlanStrategyAccess(product.strategyId, session);
  if (response) return response;

  const override = await prisma.leadTimeOverride.upsert({
    where: {
      productId_stageTemplateId: {
        productId: body.productId,
        stageTemplateId: body.stageTemplateId,
      },
    },
    update: { durationWeeks: body.durationWeeks },
    create: {
      productId: body.productId,
      stageTemplateId: body.stageTemplateId,
      durationWeeks: body.durationWeeks,
    },
  });

  return NextResponse.json({ override });
});

export const DELETE = withXPlanAuth(async (request: Request, session) => {
  const body = (await request.json()) as DeletePayload;

  if (!body?.productId || !body?.stageTemplateId) {
    return NextResponse.json(
      { error: 'productId and stageTemplateId are required' },
      { status: 400 },
    );
  }

  const product = await prisma.product.findUnique({
    where: { id: body.productId },
    select: { strategyId: true },
  });

  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  const { response } = await requireXPlanStrategyAccess(product.strategyId, session);
  if (response) return response;

  await prisma.leadTimeOverride.deleteMany({
    where: {
      productId: body.productId,
      stageTemplateId: body.stageTemplateId,
    },
  });

  return NextResponse.json({ ok: true });
});
