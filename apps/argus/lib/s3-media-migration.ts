import path from 'node:path'
import { getArgusMediaS3Key, requireArgusS3MediaConfig } from './media-backend'

export type LocalMediaAsset = {
  id: string
  filePath: string
  storageBackend?: string
  s3Bucket?: string | null
  s3Key?: string | null
  mimeType: string
  bytes: number
}

export type LocalMediaUpload = {
  id: string
  filePath: string
  absolutePath: string
  s3Bucket: string
  s3Key: string
  contentType: string
  bytes: number
}

function normalizeMediaFilePath(filePath: string): string {
  const normalized = filePath.trim().replace(/^\/+/u, '')
  if (!normalized.startsWith('media/')) {
    throw new Error(`Invalid media filePath: ${filePath}`)
  }

  const segments = normalized.split('/')
  if (segments.length < 3) {
    throw new Error(`Invalid media filePath: ${filePath}`)
  }

  for (const segment of segments) {
    if (segment.length === 0) {
      throw new Error(`Invalid media filePath: ${filePath}`)
    }
    if (segment === '.') {
      throw new Error(`Invalid media filePath: ${filePath}`)
    }
    if (segment === '..') {
      throw new Error(`Invalid media filePath: ${filePath}`)
    }
  }

  return normalized
}

export function buildLocalMediaUpload(appDir: string, asset: LocalMediaAsset): LocalMediaUpload {
  const config = requireArgusS3MediaConfig()

  const normalized = normalizeMediaFilePath(asset.filePath)
  const mediaRelativePath = normalized.slice('media/'.length)

  return {
    id: asset.id,
    filePath: normalized,
    absolutePath: path.join(appDir, 'public', 'media', ...mediaRelativePath.split('/')),
    s3Bucket: config.bucket,
    s3Key: getArgusMediaS3Key(normalized),
    contentType: asset.mimeType,
    bytes: asset.bytes,
  }
}
