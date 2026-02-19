export type ArgusMediaBackend = 'local' | 's3'

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
  if (configured !== undefined && configured.trim().length > 0) {
    return normalizePrefix(configured)
  }

  const env = process.env.ARGUS_ENV
  if (env === undefined || env.trim().length === 0) {
    throw new Error('ARGUS_ENV must be set when using the S3 media backend without ARGUS_MEDIA_S3_PREFIX.')
  }

  return normalizePrefix(`argus/${env.trim()}`)
}

export function getArgusMediaS3Key(filePath: string): string {
  const normalized = filePath.trim().replace(/^\/+/u, '')
  if (!normalized.startsWith('media/')) {
    throw new Error(`Invalid media filePath: ${filePath}`)
  }

  return `${getArgusMediaS3Prefix()}/${normalized}`
}

