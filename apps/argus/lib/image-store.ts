import { createHash } from 'crypto'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, extname } from 'path'
import prisma from '@/lib/db'

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
  const prefix = sha256.slice(0, 2)
  const relPath = `media/${prefix}/${sha256}${ext}`
  const absPath = join(MEDIA_ROOT, prefix, `${sha256}${ext}`)

  // Ensure directory exists
  const dir = join(MEDIA_ROOT, prefix)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  // Write file if it doesn't exist (content-addressable dedup)
  if (!existsSync(absPath)) {
    writeFileSync(absPath, data)
  }

  const mimeType = opts?.mimeType ?? guessMime(ext)

  // Create or reuse MediaAsset row
  const existing = await prisma.mediaAsset.findUnique({ where: { sha256 } })
  if (existing) {
    return { mediaId: existing.id, sha256, filePath: relPath }
  }

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
  const prefix = sha256.slice(0, 2)
  const relPath = `media/${prefix}/${sha256}${normalizedExt}`
  const absPath = join(MEDIA_ROOT, prefix, `${sha256}${normalizedExt}`)

  const dir = join(MEDIA_ROOT, prefix)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  if (!existsSync(absPath)) {
    writeFileSync(absPath, data)
  }

  const mimeType = opts?.mimeType ?? guessMime(normalizedExt)

  const existing = await prisma.mediaAsset.findUnique({ where: { sha256 } })
  if (existing) {
    return { mediaId: existing.id, sha256, filePath: relPath }
  }

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
