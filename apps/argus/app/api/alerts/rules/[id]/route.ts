import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

const paramsSchema = z.object({
  id: z.string().min(1),
});

const UpdateRuleSchema = z.object({
  enabled: z.boolean().optional(),
  thresholds: z.record(z.any()).optional(),
});

export const PATCH = withArgusAuth(async (request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  const body = await request.json();
  const input = UpdateRuleSchema.parse(body);

  const updated = await prisma.alertRule.update({
    where: { id },
    data: {
      enabled: input.enabled,
      thresholds: input.thresholds,
    },
  });

  return NextResponse.json({ rule: updated });
});

export const DELETE = withArgusAuth(async (_request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  await prisma.alertRule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
