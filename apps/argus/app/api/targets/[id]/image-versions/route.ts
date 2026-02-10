import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { requireEnv } from '@/lib/env';

const paramsSchema = z.object({
  id: z.string().min(1),
});

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const contentTypeSchema = z.enum(['image/jpeg', 'image/png', 'image/webp']);

const createSchema = z.object({
  label: z.string().max(200).optional(),
  notes: z.string().max(4000).optional(),
  blobs: z
    .array(
      z.object({
        sha256: sha256Schema,
        s3Key: z.string().min(1).max(1000),
        contentType: contentTypeSchema,
        byteSize: z.number().int().min(1).max(15 * 1024 * 1024),
        width: z.number().int().min(1).max(20000),
        height: z.number().int().min(1).max(20000),
      }),
    )
    .min(1)
    .max(9),
  images: z
    .array(
      z.object({
        sha256: sha256Schema,
        fileName: z.string().min(1).max(255),
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

function expectedBlobKey(argusEnv: string, sha256: string, contentType: z.infer<typeof contentTypeSchema>): string {
  const ext = extForContentType(contentType);
  return `argus/${argusEnv}/listing-image-blobs/${sha256.slice(0, 2)}/${sha256}.${ext}`;
}

function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .replace(/[/\\\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  if (!cleaned) {
    throw new Error('Invalid fileName');
  }

  if (cleaned.length <= 200) return cleaned;

  const extMatch = cleaned.match(/(\.[a-z0-9]{1,8})$/);
  if (!extMatch) return cleaned.slice(0, 200);
  const ext = extMatch[1]!;
  const base = cleaned.slice(0, 200 - ext.length);
  return `${base}${ext}`;
}

export const GET = withArgusAuth(async (_request, _session, context: { params: Promise<unknown> }) => {
  const rawParams = await context.params;
  const safeParams =
    rawParams && typeof rawParams === 'object'
      ? { ...(rawParams as Record<string, unknown>), then: undefined }
      : rawParams;

  const { id } = paramsSchema.parse(safeParams);

  const target = await prisma.watchTarget.findUnique({
    where: { id },
    select: { id: true, type: true, owner: true, activeImageVersionId: true },
  });
  if (!target) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (target.type !== 'ASIN' || target.owner !== 'OURS') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const versions = await prisma.listingImageVersion.findMany({
    where: { targetId: target.id },
    orderBy: [{ versionNumber: 'desc' }],
    include: { _count: { select: { slots: true } } },
  });

  return NextResponse.json({
    activeImageVersionId: target.activeImageVersionId,
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      label: v.label,
      notes: v.notes,
      createdAt: v.createdAt,
      createdByEmail: v.createdByEmail,
      imageCount: v._count.slots,
      isActive: target.activeImageVersionId === v.id,
    })),
  });
});

export const POST = withArgusAuth(async (request, session, context: { params: Promise<unknown> }) => {
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

  const input = createSchema.parse(await request.json());

  const argusEnv = requireEnv('ARGUS_ENV');

  const blobShaSet = new Set<string>();
  for (const b of input.blobs) {
    if (blobShaSet.has(b.sha256)) {
      return NextResponse.json({ error: `Duplicate blob sha256: ${b.sha256}` }, { status: 400 });
    }
    blobShaSet.add(b.sha256);

    const expected = expectedBlobKey(argusEnv, b.sha256, b.contentType);
    if (b.s3Key !== expected) {
      return NextResponse.json({ error: `Invalid s3Key for ${b.sha256}` }, { status: 400 });
    }
  }

  for (const img of input.images) {
    if (!blobShaSet.has(img.sha256)) {
      return NextResponse.json({ error: `Missing blob metadata for ${img.sha256}` }, { status: 400 });
    }
  }

  const user = session.user;
  if (!user || typeof user.id !== 'string' || user.id.trim() === '') {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const createdByUserId = user.id;
  const createdByEmail = typeof user.email === 'string' ? user.email : null;

  const created = await prisma.$transaction(async (tx) => {
    const last = await tx.listingImageVersion.findFirst({
      where: { targetId: target.id },
      orderBy: [{ versionNumber: 'desc' }],
      select: { versionNumber: true },
    });

    let nextVersionNumber = 1;
    if (last && Number.isFinite(last.versionNumber)) {
      nextVersionNumber = last.versionNumber + 1;
    }

    await tx.listingImageBlob.createMany({
      data: input.blobs.map((b) => ({
        sha256: b.sha256,
        s3Key: b.s3Key,
        contentType: b.contentType,
        byteSize: b.byteSize,
        width: b.width,
        height: b.height,
      })),
      skipDuplicates: true,
    });

    const version = await tx.listingImageVersion.create({
      data: {
        targetId: target.id,
        versionNumber: nextVersionNumber,
        label: input.label,
        notes: input.notes,
        createdByUserId,
        createdByEmail,
      },
    });

    await tx.listingImageVersionSlot.createMany({
      data: input.images.map((img, index) => ({
        versionId: version.id,
        position: index + 1,
        fileName: sanitizeFilename(img.fileName),
        blobSha256: img.sha256,
      })),
    });

    await tx.watchTarget.update({
      where: { id: target.id },
      data: { activeImageVersionId: version.id },
    });

    return version;
  });

  return NextResponse.json({ versionId: created.id }, { status: 201 });
});
