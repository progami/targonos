import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

function defaultThresholdsForType(type: string) {
  if (type === 'ASIN') {
    return { titleChanged: true, priceDeltaPct: 5, priceDeltaAbs: 1, ratingDelta: 0.2 };
  }
  if (type === 'SEARCH') {
    return { enterExitTop10: true, positionDelta: 5 };
  }
  if (type === 'BROWSE_BESTSELLERS') {
    return { enterExitTop100: true, positionDelta: 10 };
  }
  return {};
}

const CreateRuleSchema = z.object({
  targetId: z.string().trim().min(1),
  enabled: z.boolean().optional(),
  thresholds: z.record(z.any()).optional(),
});

export const GET = withArgusAuth(async (request) => {
  const url = new URL(request.url);
  const targetId = url.searchParams.get('targetId');
  const rules = await prisma.alertRule.findMany({
    where: targetId ? { targetId } : undefined,
    orderBy: [{ createdAt: 'asc' }],
  });
  return NextResponse.json({ rules });
});

export const POST = withArgusAuth(async (request) => {
  const body = await request.json();
  const input = CreateRuleSchema.parse(body);

  const target = await prisma.watchTarget.findUnique({ where: { id: input.targetId } });
  if (!target) {
    return NextResponse.json({ error: 'Target not found' }, { status: 404 });
  }

  const rule = await prisma.alertRule.create({
    data: {
      targetId: target.id,
      enabled: input.enabled ?? false,
      thresholds: input.thresholds ?? defaultThresholdsForType(target.type),
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
});

