import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { getS3 } from '@/lib/s3';
import { requireEnv } from '@/lib/env';

const paramsSchema = z.object({
  id: z.string().min(1),
});

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const contentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

const bodySchema = z.object({
  files: z
    .array(
      z.object({
        sha256: sha256Schema,
        contentType: contentTypeSchema,
        byteSize: z.number().int().min(1).max(15 * 1024 * 1024),
      }),
    )
    .min(1)
    .max(9),
});

function extForContentType(contentType: z.infer<typeof contentTypeSchema>): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  throw new Error(`Unsupported content type: ${contentType}`);
}

function blobKey(argusEnv: string, sha256: string, contentType: z.infer<typeof contentTypeSchema>): string {
  const ext = extForContentType(contentType);
  return `argus/${argusEnv}/listing-image-blobs/${sha256.slice(0, 2)}/${sha256}.${ext}`;
}

export const POST = withArgusAuth(async (request, _session, context: { params: Promise<unknown> }) => {
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

  const input = bodySchema.parse(await request.json());

  const argusEnv = requireEnv('ARGUS_ENV');
  const s3 = getS3();

  const keys = input.files.map((f) => f.sha256);
  const existing = await prisma.listingImageBlob.findMany({
    where: { sha256: { in: keys } },
  });
  const existingMap = new Map(existing.map((b) => [b.sha256, b]));

  const blobs = await Promise.all(
    input.files.map(async (file) => {
      const exists = existingMap.has(file.sha256);
      const key = blobKey(argusEnv, file.sha256, file.contentType);

      if (exists) {
        const row = existingMap.get(file.sha256)!;
        return {
          sha256: file.sha256,
          exists: true,
          s3Key: row.s3Key,
          contentType: row.contentType,
          byteSize: row.byteSize,
          width: row.width,
          height: row.height,
        };
      }

      const putUrl = await s3.getPresignedUrl(key, 'put', {
        expiresIn: 15 * 60,
        contentType: file.contentType,
      });

      return {
        sha256: file.sha256,
        exists: false,
        s3Key: key,
        putUrl,
        contentType: file.contentType,
        byteSize: file.byteSize,
      };
    }),
  );

  return NextResponse.json({ blobs });
});

