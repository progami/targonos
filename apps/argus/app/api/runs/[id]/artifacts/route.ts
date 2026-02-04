import { NextResponse } from 'next/server';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { s3 } from '@/lib/s3';
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
  const run = await prisma.captureRun.findUnique({
    where: { id },
    include: { artifacts: { orderBy: [{ createdAt: 'asc' }] } },
  });

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const artifacts = await Promise.all(
    run.artifacts.map(async (artifact) => {
      const url = await s3.getPresignedUrl(artifact.s3Key, 'get', { expiresIn: 3600 });
      return { ...artifact, url };
    }),
  );

  return NextResponse.json({ artifacts });
});
