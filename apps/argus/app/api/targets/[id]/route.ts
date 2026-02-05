import { NextResponse } from 'next/server';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { WatchTargetInputSchema } from '@/lib/targets/target-input';
import { z } from 'zod';

const paramsSchema = z.object({
  id: z.string().min(1),
});

export const GET = withArgusAuth(async (_request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  const target = await prisma.watchTarget.findUnique({
    where: { id },
    include: {
      alertRules: { orderBy: { createdAt: 'asc' } },
      runs: { take: 50, orderBy: { startedAt: 'desc' }, include: { artifacts: true } },
      jobs: { take: 50, orderBy: { scheduledAt: 'desc' } },
    },
  });

  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ target });
});

export const PATCH = withArgusAuth(async (request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  const body = await request.json();
  const input = WatchTargetInputSchema.parse(body);

  const updated = await prisma.watchTarget.update({
    where: { id },
    data: {
      type: input.type,
      marketplace: input.marketplace,
      owner: input.owner,
      label: input.label,
      asin: input.asin,
      keyword: input.keyword,
      trackedAsins: input.trackedAsins,
      sourceUrl: input.sourceUrl,
      browseNodeId: input.browseNodeId,
      cadenceMinutes: input.cadenceMinutes,
      enabled: input.enabled,
    },
  });

  return NextResponse.json({ target: updated });
});

export const DELETE = withArgusAuth(async (_request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  await prisma.watchTarget.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
