import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';

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

  const version = await prisma.listingImageVersion.findUnique({
    where: { id },
    include: { target: { select: { id: true, type: true, owner: true } } },
  });

  if (!version) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (version.target.type !== 'ASIN' || version.target.owner !== 'OURS') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.watchTarget.update({
    where: { id: version.targetId },
    data: { activeImageVersionId: version.id },
  });

  return NextResponse.json({ ok: true });
});

