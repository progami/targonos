import { createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, extname } from 'path'
import prisma from '@/lib/db'
import { getArgusMediaBackend, getArgusMediaS3Key } from '@/lib/media-backend'

const MEDIA_ROOT = join(process.cwd(), 'public', 'media')

interface StoredImage {
  mediaId: string
  sha256: string
  filePath: string
}

/**
 * Stores an image in the content-addressable store and creates/reuses a MediaAsset row.
 * Returns the media asset ID for linking to GallerySlot / EbcImage.
 */
export async function storeImage(
  sourcePath: string,
  opts?: { mimeType?: string; sourceUrl?: string; originalName?: string },
): Promise<StoredImage> {
  const data = readFileSync(sourcePath)
  const sha256 = createHash('sha256').update(data).digest('hex')
  const ext = extname(sourcePath).toLowerCase()
  return storeBuffer(data, ext, sha256, opts)
}

/**
 * Stores an image from a buffer (for images already in memory).
 */
export async function storeImageBuffer(
  data: Buffer,
  ext: string,
  opts?: { mimeType?: string; sourceUrl?: string; originalName?: string },
): Promise<StoredImage> {
  const sha256 = createHash('sha256').update(data).digest('hex')
  const normalizedExt = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  return storeBuffer(data, normalizedExt, sha256, opts)
}

async function storeBuffer(
  data: Buffer,
  ext: string,
  sha256: string,
  opts?: { mimeType?: string; sourceUrl?: string; originalName?: string },
): Promise<StoredImage> {
  const existing = await prisma.mediaAsset.findUnique({ where: { sha256 } })
  if (existing) {
    return { mediaId: existing.id, sha256, filePath: existing.filePath }
  }

  const prefix = sha256.slice(0, 2)
  const relPath = `media/${prefix}/${sha256}${ext}`

  const backend = getArgusMediaBackend()

  if (backend === 'local') {
    const absPath = join(MEDIA_ROOT, prefix, `${sha256}${ext}`)
    const dir = join(MEDIA_ROOT, prefix)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }

    if (!existsSync(absPath)) {
      writeFileSync(absPath, data)
    }
  } else if (backend === 's3') {
    const { getS3Service } = await import('@targon/aws-s3')
    const s3 = getS3Service()
    const key = getArgusMediaS3Key(relPath)
    const mimeType = opts?.mimeType ?? guessMime(ext)
    await s3.uploadFile(data, key, {
      contentType: mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
    })
  } else {
    throw new Error(`Unsupported media backend: ${backend}`)
  }

  const mimeType = opts?.mimeType ?? guessMime(ext)

  const asset = await prisma.mediaAsset.create({
    data: {
      sha256,
      filePath: relPath,
      mimeType,
      bytes: data.length,
      sourceUrl: opts?.sourceUrl ?? null,
      originalName: opts?.originalName ?? null,
    },
  })

  return { mediaId: asset.id, sha256, filePath: relPath }
}

function guessMime(ext: string): string {
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.m3u8': 'application/x-mpegURL',
    '.vtt': 'text/vtt',
  }
  return map[ext] ?? 'application/octet-stream'
}
