import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { getS3 } from '@/lib/s3';

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

  const version = await prisma.listingImageVersion.findUnique({
    where: { id },
    include: {
      target: { select: { id: true, type: true, owner: true, activeImageVersionId: true } },
      slots: { orderBy: [{ position: 'asc' }], include: { blob: true } },
    },
  });

  if (!version) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (version.target.type !== 'ASIN' || version.target.owner !== 'OURS') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const s3 = getS3();

  const images = await Promise.all(
    version.slots.map(async (slot) => {
      const url = await s3.getPresignedUrl(slot.blob.s3Key, 'get', { expiresIn: 3600 });
      return {
        position: slot.position,
        fileName: slot.fileName,
        sha256: slot.blob.sha256,
        contentType: slot.blob.contentType,
        byteSize: slot.blob.byteSize,
        width: slot.blob.width,
        height: slot.blob.height,
        url,
      };
    }),
  );

  return NextResponse.json({
    version: {
      id: version.id,
      targetId: version.targetId,
      versionNumber: version.versionNumber,
      label: version.label,
      notes: version.notes,
      createdAt: version.createdAt,
      isActive: version.target.activeImageVersionId === version.id,
    },
    images,
  });
});

