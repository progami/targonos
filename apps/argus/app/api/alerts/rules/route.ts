import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

function defaultAsinThresholds() {
  return { titleChanged: true, priceDeltaPct: 5, priceDeltaAbs: 1, imagesChanged: true };
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

  const rule = await prisma.alertRule.upsert({
    where: { targetId: target.id },
    create: {
      targetId: target.id,
      enabled: input.enabled ?? false,
      thresholds: input.thresholds ?? defaultAsinThresholds(),
    },
    update: {
      enabled: input.enabled,
      thresholds: input.thresholds,
    },
  });

  return NextResponse.json({ rule }, { status: 201 });
});
