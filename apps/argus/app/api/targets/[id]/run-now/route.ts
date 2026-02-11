import { NextResponse } from 'next/server';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const paramsSchema = z.object({
  id: z.string().min(1),
});

export const POST = withArgusAuth(async (_request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);
  const target = await prisma.watchTarget.findUnique({ where: { id } });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const job = await prisma.captureJob.create({
    data: {
      targetId: target.id,
      scheduledAt: new Date(),
      status: 'QUEUED',
    },
  });

  return NextResponse.json({ job }, { status: 201 });
});
