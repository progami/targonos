import { z } from 'zod';
import archiver from 'archiver';
import { PassThrough, Readable } from 'stream';
import { NextResponse } from 'next/server';
import { withArgusAuth } from '@/lib/api/auth';
import { prisma } from '@/lib/prisma';
import { getS3 } from '@/lib/s3';

const paramsSchema = z.object({
  id: z.string().min(1),
});

function extForContentType(contentType: string): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  throw new Error(`Unsupported content type: ${contentType}`);
}

function sanitizeBaseName(input: string): string {
  const withoutExt = input.replace(/\.[a-zA-Z0-9]{1,8}$/, '');
  const cleaned = withoutExt
    .replace(/[/\\\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  if (!cleaned) {
    throw new Error('Invalid fileName');
  }
  return cleaned.slice(0, 80);
}

function zipEntryName(position: number, fileName: string, contentType: string): string {
  const base = sanitizeBaseName(fileName);
  const ext = extForContentType(contentType);
  const prefix = String(position).padStart(2, '0');
  if (position === 1) return `${prefix}-main_${base}.${ext}`;
  return `${prefix}_${base}.${ext}`;
}

function zipFileName(input: { marketplace: string; asin: string; versionNumber: number }): string {
  const safeMarket = input.marketplace.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const safeAsin = input.asin.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  if (!safeMarket || !safeAsin) {
    throw new Error('Invalid target identifiers');
  }
  return `argus_${safeMarket}_${safeAsin}_v${input.versionNumber}.zip`;
}

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
      target: { select: { id: true, type: true, owner: true, asin: true, marketplace: true } },
      slots: { orderBy: [{ position: 'asc' }], include: { blob: true } },
    },
  });

  if (!version) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (version.target.type !== 'ASIN' || version.target.owner !== 'OURS') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!version.target.asin) {
    return NextResponse.json({ error: 'Target missing ASIN' }, { status: 500 });
  }

  const filename = zipFileName({
    marketplace: version.target.marketplace,
    asin: version.target.asin,
    versionNumber: version.versionNumber,
  });

  const archive = archiver('zip', { zlib: { level: 9 } });
  const pass = new PassThrough();

  archive.on('error', (err) => {
    pass.destroy(err);
  });

  archive.pipe(pass);

  const s3 = getS3();

  void (async () => {
    try {
      for (const slot of version.slots) {
        const name = zipEntryName(slot.position, slot.fileName, slot.blob.contentType);
        const stream = await s3.streamFile(slot.blob.s3Key);
        archive.append(stream, { name });
      }
      await archive.finalize();
    } catch (err) {
      pass.destroy(err instanceof Error ? err : new Error(String(err)));
    }
  })();

  const stream = Readable.toWeb(pass) as unknown as ReadableStream;

  return new Response(stream, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store',
    },
  });
});
