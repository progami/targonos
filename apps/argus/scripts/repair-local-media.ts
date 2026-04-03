import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@targon/prisma-argus'

type MediaAssetRecord = {
  id: string
  sha256: string
  filePath: string
  mimeType: string
  originalName: string | null
  sourceUrl: string | null
}

const APP_DIR = process.cwd()
const MEDIA_ROOT = path.join(APP_DIR, 'public', 'media')
const FIXTURE_SEARCH_DIRS = [
  path.join(APP_DIR, 'fixtures', 'amazon-pdp', 'listingpage_files'),
  path.join(APP_DIR, 'fixtures', 'amazon-pdp', '6pk_files'),
  path.join(APP_DIR, '..', 'archived', 'argus-v1', 'fixtures', 'amazon-pdp', 'listingpage_files'),
  path.join(APP_DIR, '..', 'archived', 'argus-v1', 'fixtures', 'amazon-pdp', '6pk_files'),
]

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
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

async function loadEnvFile(filePath: string): Promise<void> {
  let raw: string

  try {
    raw = await fs.readFile(filePath, 'utf8')
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return
    }

    throw error
  }

  for (const line of raw.split(/\r?\n/u)) {
    const parsed = parseDotenvLine(line)
    if (!parsed) continue
    if (process.env[parsed.key] !== undefined) continue
    process.env[parsed.key] = parsed.value
  }
}

async function loadArgusEnv(): Promise<void> {
  await loadEnvFile(path.join(APP_DIR, '.env.local'))
  await loadEnvFile(path.join(APP_DIR, '.env'))
}

function getArgusMediaBackend(): 'local' | 's3' {
  const raw = process.env.ARGUS_MEDIA_BACKEND
  if (raw === undefined) return 'local'

  const normalized = raw.trim().toLowerCase()
  if (normalized.length === 0) return 'local'
  if (normalized === 'local') return 'local'
  if (normalized === 's3') return 's3'

  throw new Error(`Unsupported ARGUS_MEDIA_BACKEND value: ${raw}`)
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required to repair Argus local media.')
  }

  const trimmed = databaseUrl.trim()
  if (trimmed.length === 0) {
    throw new Error('DATABASE_URL is required to repair Argus local media.')
  }

  return trimmed
}

function createPrismaClient(): PrismaClient {
  const url = new URL(requireDatabaseUrl())
  url.searchParams.set('application_name', 'argus-repair-local-media')

  return new PrismaClient({
    log: ['error'],
    datasourceUrl: url.toString(),
  })
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      return false
    }

    throw error
  }
}

type AssetCandidate = {
  bytes: Buffer
  source: string
}

type ResolvedAssetAction =
  | {
      action: 'restore'
      candidate: AssetCandidate
    }
  | {
      action: 'refresh'
      candidate: AssetCandidate
      sha256: string
      filePath: string
    }

async function readFixtureCandidate(originalName: string): Promise<AssetCandidate | null> {
  for (const directory of FIXTURE_SEARCH_DIRS) {
    const absolutePath = path.join(directory, originalName)
    if (!(await fileExists(absolutePath))) {
      continue
    }

    const bytes = await fs.readFile(absolutePath)
    return {
      bytes,
      source: absolutePath,
    }
  }

  return null
}

function buildOriginalNameUrl(asset: MediaAssetRecord): string | null {
  if (asset.sourceUrl === null) return null
  if (asset.originalName === null) return null
  if (asset.originalName.trim().length === 0) return null

  const url = new URL(asset.sourceUrl)
  const segments = url.pathname.split('/')
  segments[segments.length - 1] = asset.originalName
  url.pathname = segments.join('/')
  return url.toString()
}

async function downloadCandidate(url: string): Promise<AssetCandidate> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    source: url,
  }
}

async function tryDownloadCandidate(url: string): Promise<AssetCandidate | null> {
  try {
    return await downloadCandidate(url)
  } catch {
    return null
  }
}

function sha256ForBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function resolveFilePathForHash(filePath: string, sha256: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const prefix = sha256.slice(0, 2)
  return `media/${prefix}/${sha256}${ext}`
}

async function resolveAssetAction(asset: MediaAssetRecord): Promise<ResolvedAssetAction> {
  if (asset.originalName !== null && asset.originalName.trim().length > 0) {
    const fixtureCandidate = await readFixtureCandidate(asset.originalName)
    if (fixtureCandidate !== null) {
      const fixtureSha256 = sha256ForBytes(fixtureCandidate.bytes)
      if (fixtureSha256 === asset.sha256) {
        return {
          action: 'restore',
          candidate: fixtureCandidate,
        }
      }
    }
  }

  const remoteCandidates: AssetCandidate[] = []
  const originalNameUrl = buildOriginalNameUrl(asset)
  if (originalNameUrl !== null) {
    const originalNameCandidate = await tryDownloadCandidate(originalNameUrl)
    if (originalNameCandidate !== null) {
      remoteCandidates.push(originalNameCandidate)
    }
  }
  if (asset.sourceUrl !== null) {
    const sourceCandidate = await tryDownloadCandidate(asset.sourceUrl)
    if (sourceCandidate !== null) {
      remoteCandidates.push(sourceCandidate)
    }
  }

  for (const candidate of remoteCandidates) {
    const candidateSha256 = sha256ForBytes(candidate.bytes)
    if (candidateSha256 === asset.sha256) {
      return {
        action: 'restore',
        candidate,
      }
    }
  }

  const refreshCandidate = remoteCandidates[0]
  if (refreshCandidate === undefined) {
    throw new Error(`Missing sourceUrl/originalName candidate for missing media asset ${asset.id} (${asset.filePath}).`)
  }

  const refreshedSha256 = sha256ForBytes(refreshCandidate.bytes)
  return {
    action: 'refresh',
    candidate: refreshCandidate,
    sha256: refreshedSha256,
    filePath: resolveFilePathForHash(asset.filePath, refreshedSha256),
  }
}

async function restoreMissingAsset(prisma: PrismaClient, asset: MediaAssetRecord): Promise<boolean> {
  const absolutePath = path.join(APP_DIR, 'public', asset.filePath)
  if (await fileExists(absolutePath)) {
    return false
  }

  const action = await resolveAssetAction(asset)

  if (action.action === 'restore') {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true })
    await fs.writeFile(absolutePath, action.candidate.bytes)
    console.log(`[repair-local-media] restored ${asset.filePath} from ${action.candidate.source}`)
    return true
  }

  const conflictingAsset = await prisma.mediaAsset.findUnique({
    where: {
      sha256: action.sha256,
    },
    select: {
      id: true,
    },
  })
  if (conflictingAsset !== null && conflictingAsset.id !== asset.id) {
    throw new Error(`Refusing to refresh ${asset.id}: sha256 ${action.sha256} already belongs to ${conflictingAsset.id}`)
  }

  const refreshedAbsolutePath = path.join(APP_DIR, 'public', action.filePath)
  await fs.mkdir(path.dirname(refreshedAbsolutePath), { recursive: true })
  await fs.writeFile(refreshedAbsolutePath, action.candidate.bytes)

  await prisma.mediaAsset.update({
    where: {
      id: asset.id,
    },
    data: {
      sha256: action.sha256,
      filePath: action.filePath,
      bytes: action.candidate.bytes.length,
      mimeType: asset.mimeType,
    },
  })

  console.log(`[repair-local-media] refreshed ${asset.id} -> ${action.filePath} from ${action.candidate.source}`)
  return true
}

async function main(): Promise<void> {
  await loadArgusEnv()

  const backend = getArgusMediaBackend()
  if (backend !== 'local') {
    throw new Error(`repair-local-media only supports the local media backend. Current backend: ${backend}`)
  }

  await fs.mkdir(MEDIA_ROOT, { recursive: true })

  const prisma = createPrismaClient()

  try {
    const assets = await prisma.mediaAsset.findMany({
      select: {
        id: true,
        sha256: true,
        filePath: true,
        mimeType: true,
        originalName: true,
        sourceUrl: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    let restoredCount = 0
    let missingCount = 0

    for (const asset of assets) {
      const absolutePath = path.join(APP_DIR, 'public', asset.filePath)
      if (await fileExists(absolutePath)) {
        continue
      }

      missingCount += 1
      const restored = await restoreMissingAsset(prisma, asset)
      if (restored) {
        restoredCount += 1
      }
    }

    if (missingCount === 0) {
      console.log('[repair-local-media] all media assets already exist on disk')
      return
    }

    console.log(`[repair-local-media] restored ${restoredCount} missing media asset(s)`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
