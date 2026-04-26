import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@targon/prisma-argus'

const APP_DIR = process.cwd()
const DRIVE_LISTING_DIR =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Listing'
const LIVE_IMAGES_DIR = path.join(DRIVE_LISTING_DIR, 'Images - Live')

type GalleryImport = {
  asin: string
  seq: number
  note: string
  files: string[]
}

const IMPORTS: GalleryImport[] = [
  {
    asin: 'B09HXC3NL8',
    seq: 2,
    note: 'US current gallery from Images - Live.',
    files: [
      path.join(LIVE_IMAGES_DIR, '6 Pk - Main.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 1.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 2.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 3.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 4.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 5.png'),
    ],
  },
  {
    asin: 'B0CR1GSBQ9',
    seq: 2,
    note: 'US current gallery from Images - Live.',
    files: [
      path.join(LIVE_IMAGES_DIR, '3 Pk - Main copy 2.png'),
      path.join(LIVE_IMAGES_DIR, '3 Pk - Img 1 copy 2.png'),
      path.join(LIVE_IMAGES_DIR, '3 Pk - Img 3 copy 2.png'),
      path.join(LIVE_IMAGES_DIR, '3 Pk - Img 3 copy 3.png'),
      path.join(LIVE_IMAGES_DIR, '3 ST - Image 5.png'),
    ],
  },
  {
    asin: 'B0FP66CWQ6',
    seq: 1,
    note: 'US current gallery from Images - Live.',
    files: [
      path.join(LIVE_IMAGES_DIR, '12 Pk - Main copy.png'),
      path.join(LIVE_IMAGES_DIR, '12 Pk - Img 1 copy.png'),
      path.join(LIVE_IMAGES_DIR, '12 Pk - Img 3 copy.png'),
    ],
  },
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
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1)
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1)
  }

  return { key, value }
}

async function loadEnvFile(filePath: string): Promise<void> {
  const raw = await readFile(filePath, 'utf8')

  for (const line of raw.split(/\r?\n/u)) {
    const parsed = parseDotenvLine(line)
    if (parsed === null) continue
    if (process.env[parsed.key] !== undefined) continue
    process.env[parsed.key] = parsed.value
  }
}

function requireDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL
  if (databaseUrl === undefined) {
    throw new Error('DATABASE_URL is required to import US gallery versions.')
  }

  const trimmed = databaseUrl.trim()
  if (trimmed.length === 0) {
    throw new Error('DATABASE_URL is required to import US gallery versions.')
  }

  return trimmed
}

function mimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg') return 'image/jpeg'
  if (ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  throw new Error(`Unsupported image type: ${filePath}`)
}

async function storeGalleryFile(filePath: string): Promise<string> {
  const data = await readFile(filePath)
  const ext = path.extname(filePath).toLowerCase()
  if (ext.length === 0) {
    throw new Error(`Missing file extension: ${filePath}`)
  }

  const { storeImageBuffer } = await import('../lib/image-store')
  const stored = await storeImageBuffer(data, ext, {
    mimeType: mimeTypeForFile(filePath),
    sourceUrl: pathToFileURL(filePath).toString(),
    originalName: path.basename(filePath),
  })

  return stored.mediaId
}

async function hashGalleryFile(filePath: string): Promise<string> {
  const data = await readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

async function syncExistingRevision(prisma: PrismaClient, item: GalleryImport, revisionId: string): Promise<void> {
  const slots = await prisma.gallerySlot.findMany({
    where: { revisionId },
    orderBy: { position: 'asc' },
    select: {
      mediaId: true,
      media: {
        select: {
          sha256: true,
        },
      },
    },
  })

  if (slots.length !== item.files.length) {
    throw new Error(`Gallery revision ${revisionId} has ${slots.length} slots; expected ${item.files.length}.`)
  }

  for (let index = 0; index < item.files.length; index += 1) {
    const filePath = item.files[index]
    const expectedSha256 = await hashGalleryFile(filePath)
    const slot = slots[index]
    if (slot.media.sha256 !== expectedSha256) {
      throw new Error(`Gallery revision ${revisionId} slot ${index} does not match ${filePath}.`)
    }

    await prisma.mediaAsset.update({
      where: { id: slot.mediaId },
      data: {
        sourceUrl: pathToFileURL(filePath).toString(),
        originalName: path.basename(filePath),
      },
    })
  }

  await prisma.galleryRevision.update({
    where: { id: revisionId },
    data: {
      note: item.note,
    },
  })
}

async function importGallery(prisma: PrismaClient, item: GalleryImport): Promise<void> {
  const listing = await prisma.listing.findFirstOrThrow({
    where: {
      marketplace: 'US',
      asin: item.asin,
    },
    select: {
      id: true,
      label: true,
    },
  })

  const existing = await prisma.galleryRevision.findUnique({
    where: {
      listingId_seq: {
        listingId: listing.id,
        seq: item.seq,
      },
    },
    select: {
      id: true,
    },
  })
  if (existing !== null) {
    await syncExistingRevision(prisma, item, existing.id)
    console.log(`[import-us-gallery-versions] ${item.asin} ${listing.label} -> repaired Images v${item.seq} metadata`)
    return
  }

  const mediaIds: string[] = []
  for (const file of item.files) {
    const mediaId = await storeGalleryFile(file)
    mediaIds.push(mediaId)
  }

  await prisma.galleryRevision.create({
    data: {
      listingId: listing.id,
      seq: item.seq,
      origin: 'MANUAL_ENTRY',
      note: item.note,
      slots: {
        create: mediaIds.map((mediaId, position) => ({
          mediaId,
          position,
        })),
      },
    },
  })

  console.log(`[import-us-gallery-versions] ${item.asin} ${listing.label} -> Images v${item.seq} (${mediaIds.length} slots)`)
}

async function main(): Promise<void> {
  await loadEnvFile(path.join(APP_DIR, '.env.local'))

  const prisma = new PrismaClient({
    log: ['error'],
    datasourceUrl: requireDatabaseUrl(),
  })

  try {
    for (const item of IMPORTS) {
      await importGallery(prisma, item)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
