export type ArgusMediaBackend = 'local' | 's3'

export type ArgusS3MediaConfig = {
  prefix: string
  bucket: string
}

function normalizePrefix(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw new Error('ARGUS_MEDIA_S3_PREFIX must be a non-empty string when using the S3 media backend.')
  }

  return trimmed.replace(/^\/+/u, '').replace(/\/+$/u, '')
}

export function getArgusMediaBackend(): ArgusMediaBackend {
  const raw = process.env.ARGUS_MEDIA_BACKEND
  if (raw === undefined) return 'local'

  const normalized = raw.trim().toLowerCase()
  if (normalized.length === 0) return 'local'
  if (normalized === 'local') return 'local'
  if (normalized === 's3') return 's3'

  throw new Error(`Unsupported ARGUS_MEDIA_BACKEND value: ${raw}`)
}

export function getArgusMediaS3Prefix(): string {
  const configured = process.env.ARGUS_MEDIA_S3_PREFIX
  if (configured === undefined) {
    throw new Error('ARGUS_MEDIA_S3_PREFIX is required when using the S3 media backend.')
  }

  return normalizePrefix(configured)
}

export function requireArgusS3MediaConfig(): ArgusS3MediaConfig {
  const backend = getArgusMediaBackend()
  if (backend !== 's3') {
    throw new Error(`ARGUS_MEDIA_BACKEND must be s3 for S3 media operations. Current backend: ${backend}`)
  }

  const prefix = getArgusMediaS3Prefix()
  const bucket = process.env.S3_BUCKET_NAME
  if (bucket === undefined) {
    throw new Error('S3_BUCKET_NAME is required when using the S3 media backend.')
  }

  const trimmedBucket = bucket.trim()
  if (trimmedBucket.length === 0) {
    throw new Error('S3_BUCKET_NAME is required when using the S3 media backend.')
  }

  return {
    prefix,
    bucket: trimmedBucket,
  }
}

export function getArgusMediaS3Key(filePath: string): string {
  const normalized = filePath.trim().replace(/^\/+/u, '')
  if (!normalized.startsWith('media/')) {
    throw new Error(`Invalid media filePath: ${filePath}`)
  }

  return `${getArgusMediaS3Prefix()}/${normalized}`
}
