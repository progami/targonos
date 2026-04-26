import { createReadStream } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { PrismaClient } from '@targon/prisma-argus'
import { buildLocalMediaUpload, type LocalMediaAsset } from '../lib/s3-media-migration'
import { getArgusMediaBackend, requireArgusS3MediaConfig } from '../lib/media-backend'

const APP_DIR = process.cwd()

function parseDotenvLine(rawLine: string): { key: string; value: string } | null {
  let line = rawLine.trim()
  if (line.length === 0) return null
  if (line.startsWith('#')) return null

  if (line.startsWith('export ')) {
    line = line.slice('export '.length).trim()
  }

  const separatorIndex = line.indexOf('=')
  if (separatorIndex === -1) return null

  const key = line.slice(0, separatorIndex).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) return null

  let value = line.slice(separatorIndex + 1).trim()
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

async function loadEnvFile(filePath: string): Promise<void> {
  let raw: string

  try {
    raw = await readFile(filePath, 'utf8')
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return
    }

    throw error
  }

  for (const line of raw.split(/\r?\n/u)) {
    const parsed = parseDotenvLine(line)
    if (parsed === null) continue
    if (process.env[parsed.key] !== undefined) continue
    process.env[parsed.key] = parsed.value
  }
}

async function loadArgusEnv(): Promise<void> {
  await loadEnvFile(path.join(APP_DIR, '.env.local'))
  await loadEnvFile(path.join(APP_DIR, '.env'))
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required to upload Argus local media to S3.')
  }

  const trimmed = databaseUrl.trim()
  if (trimmed.length === 0) {
    throw new Error('DATABASE_URL is required to upload Argus local media to S3.')
  }

  return trimmed
}

function createPrismaClient(): PrismaClient {
  const url = new URL(requireDatabaseUrl())
  url.searchParams.set('application_name', 'argus-upload-local-media-to-s3')

  return new PrismaClient({
    log: ['error'],
    datasourceUrl: url.toString(),
  })
}

async function assertFileExists(filePath: string): Promise<void> {
  try {
    await access(filePath)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      throw new Error(`Missing local media file: ${filePath}`)
    }

    throw error
  }
}

async function main(): Promise<void> {
  await loadArgusEnv()

  const backend = getArgusMediaBackend()
  if (backend !== 's3') {
    throw new Error(`upload-local-media-to-s3 requires ARGUS_MEDIA_BACKEND=s3. Current backend: ${backend}`)
  }

  const config = requireArgusS3MediaConfig()
  const prisma = createPrismaClient()

  try {
    const records = await prisma.mediaAsset.findMany({
      where: {
        filePath: {
          startsWith: 'media/',
        },
      },
      select: {
        id: true,
        filePath: true,
        storageBackend: true,
        s3Bucket: true,
        s3Key: true,
        mimeType: true,
        bytes: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    const assets: LocalMediaAsset[] = records.map((record) => {
      if (record.bytes === null) {
        throw new Error(`Media asset ${record.id} is missing byte size and cannot be uploaded to S3.`)
      }

      return {
        id: record.id,
        filePath: record.filePath,
        storageBackend: record.storageBackend,
        s3Bucket: record.s3Bucket,
        s3Key: record.s3Key,
        mimeType: record.mimeType,
        bytes: record.bytes,
      }
    })

    const uploads = assets.map((asset) => buildLocalMediaUpload(APP_DIR, asset))

    const { getS3Service } = await import('@targon/aws-s3')
    const s3 = getS3Service()

    let uploadedCount = 0
    for (const upload of uploads) {
      await assertFileExists(upload.absolutePath)
      await s3.uploadFile(createReadStream(upload.absolutePath), upload.s3Key, {
        contentType: upload.contentType,
        contentLength: upload.bytes,
        cacheControl: 'public, max-age=31536000, immutable',
      })
      await prisma.mediaAsset.update({
        where: {
          id: upload.id,
        },
        data: {
          storageBackend: 'S3',
          s3Bucket: upload.s3Bucket,
          s3Key: upload.s3Key,
        },
      })
      uploadedCount += 1
      console.log(`[upload-local-media-to-s3] uploaded ${upload.filePath} -> s3://${config.bucket}/${upload.s3Key}`)
    }

    console.log(`[upload-local-media-to-s3] uploaded ${uploadedCount} media asset(s) to ${config.prefix}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
