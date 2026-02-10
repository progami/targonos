import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@targon/prisma-argus';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

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
    select: { id: true, type: true, owner: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (target.type !== 'ASIN' || target.owner !== 'OURS') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const run = await prisma.captureRun.findFirst({
    where: { targetId: target.id, normalizedExtracted: { not: Prisma.DbNull } },
    orderBy: [{ startedAt: 'desc' }],
    select: { id: true, startedAt: true, normalizedExtracted: true },
  });

  if (!run) {
    return NextResponse.json({ error: 'No capture runs yet' }, { status: 404 });
  }

  const normalized = run.normalizedExtracted as unknown;
  let imageUrls: string[] = [];
  if (normalized && typeof normalized === 'object') {
    const raw = (normalized as any).imageUrls;
    if (Array.isArray(raw)) {
      imageUrls = raw.filter((u): u is string => typeof u === 'string');
    }
  }

  return NextResponse.json({
    runId: run.id,
    capturedAt: run.startedAt,
    imageUrls,
  });
});

