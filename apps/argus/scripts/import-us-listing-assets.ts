import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { PrismaClient, RevisionOrigin } from '@targon/prisma-argus'

const APP_DIR = process.cwd()
const DRIVE_LISTING_DIR =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Listing'
const LIVE_IMAGES_DIR = path.join(DRIVE_LISTING_DIR, 'Images - Live')
const EBC_LIVE_DIR = path.join(DRIVE_LISTING_DIR, 'A+ - Live', 'FinalEBC', 'Exports 4', 'Desktop')
const EBC_PREVIOUS_01_DIR = path.join(DRIVE_LISTING_DIR, 'A+ - Previous', '01-01-2026')
const EBC_PREVIOUS_02_DIR = path.join(DRIVE_LISTING_DIR, 'A+ - Previous', '02-01-2026')

type ListingAssetImport = {
  asin: string
  label: string
  title: string
  gallerySeq: number
  galleryFiles: string[]
  ebcRevisions: EbcRevisionImport[]
}

type EbcRevisionImport = {
  seq: number
  note: string
  files: string[]
}

const BRAND_NAME = 'Caelum Star'
const MARKETPLACE = 'US'

const LISTINGS: ListingAssetImport[] = [
  {
    asin: 'B0FLKJ7WWM',
    label: '1 Pack 12x9 ft Extra Large',
    title:
      'Caelum Star 1 Pack 12x9 ft Extra Large Plastic Drop Cloth for Painting, Furniture Covers, Painters Plastic Cover, Clear Paint Tarp, Floor Protector, Disposable Paint Drop Cloth, 55% Recycled',
    gallerySeq: 1,
    galleryFiles: [
      path.join(LIVE_IMAGES_DIR, '1 Pk - Main copy.png'),
      path.join(LIVE_IMAGES_DIR, '1 Pk - Img 1 copy.png'),
      path.join(LIVE_IMAGES_DIR, '1 Pk - Img 3 copy.png'),
    ],
    ebcRevisions: [
      previous01Revision('1 ST'),
      previous02Revision('01 ..Drop Cloths (Orange)'),
      liveRevision('1Pack', [
        'Artboard 2 copy 5.jpg',
        'Artboard 2 copy 4.jpg',
        'Artboard 2 copy 7.jpg',
        'Artboard 2 copy 3.jpg',
      ]),
    ],
  },
  {
    asin: 'B0CR1GSBQ9',
    label: '3 Pack 12x9 ft Extra Large',
    title:
      'Caelum Star 3 Pack 12x9 ft Extra Large Plastic Drop Cloth for Painting, Furniture Covers, Painters Plastic Cover, Clear Paint Tarp, Floor Protector, Disposable Paint Drop Cloth, 55% Recycled',
    gallerySeq: 2,
    galleryFiles: [
      path.join(LIVE_IMAGES_DIR, '3 Pk - Main copy 2.png'),
      path.join(LIVE_IMAGES_DIR, '3 Pk - Img 1 copy 2.png'),
      path.join(LIVE_IMAGES_DIR, '3 Pk - Img 3 copy 2.png'),
      path.join(LIVE_IMAGES_DIR, '3 Pk - Img 3 copy 3.png'),
      path.join(LIVE_IMAGES_DIR, '3 ST - Image 5.png'),
    ],
    ebcRevisions: [
      previous01Revision('3 ST'),
      previous02Revision('02 ..Drop Cloths (Orange)'),
      liveRevision('3Pack', ['1.jpg', '2.jpg', '3.jpg', '4.jpg', '5a.jpg', '5b.jpg', '5c.jpg', '5d.jpg', '6.jpg']),
    ],
  },
  {
    asin: 'B09HXC3NL8',
    label: '6 Pack 12x9 ft Extra Large',
    title:
      'Caelum Star 6 Pack 12x9 ft Extra Large Plastic Drop Cloth for Painting, Furniture Covers, Painters Plastic Cover, Clear Paint Tarp, Floor Protector, Disposable Paint Drop Cloth, 55% Recycled',
    gallerySeq: 2,
    galleryFiles: [
      path.join(LIVE_IMAGES_DIR, '6 Pk - Main.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 1.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 2.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 3.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 4.png'),
      path.join(LIVE_IMAGES_DIR, '6 Pk - Img 5.png'),
    ],
    ebcRevisions: [
      previous01Revision('6 LD'),
      previous02Revision('03 ..Drop Cloths (Green)'),
      liveRevision('6Pack', [
        'Artboard 2 copy 3.jpg',
        'Artboard 2 copy 4.jpg',
        'Artboard 2 copy 5.jpg',
        'Artboard 2 copy 6.jpg',
        'Artboard 2 copy 8.jpg',
        'Artboard 2 copy 2.jpg',
        'Artboard 2.jpg',
        'Artboard 2 copy.jpg',
        'Artboard 2 copy 7.jpg',
      ]),
    ],
  },
  {
    asin: 'B0FP66CWQ6',
    label: '12 Pack 12x9 ft Extra Large',
    title:
      'Caelum Star 12 Pack 12x9 ft Extra Large Plastic Drop Cloth for Painting, Furniture Covers, Painters Plastic Cover, Clear Paint Tarp, Floor Protector, Disposable Paint Drop Cloth, 55% Recycled',
    gallerySeq: 1,
    galleryFiles: [
      path.join(LIVE_IMAGES_DIR, '12 Pk - Main copy.png'),
      path.join(LIVE_IMAGES_DIR, '12 Pk - Img 1 copy.png'),
      path.join(LIVE_IMAGES_DIR, '12 Pk - Img 3 copy.png'),
    ],
    ebcRevisions: [
      previous01Revision('12 LD'),
      previous02Revision('04 ..Drop Cloths (Green)'),
      liveRevision('12Pack', [
        'Artboard 2 copy 5.jpg',
        'Artboard 2 copy 4.jpg',
        'Artboard 2 copy 7.jpg',
        'Artboard 2 copy 3.jpg',
      ]),
    ],
  },
]

function previous01Revision(packCode: string): EbcRevisionImport {
  return {
    seq: 1,
    note: 'US A+ previous version from A+ - Previous/01-01-2026.',
    files: [1, 2, 3, 4, 5].map((position) => path.join(EBC_PREVIOUS_01_DIR, `0${position} - v01 - ${packCode} - US.jpg`)),
  }
}

function previous02Revision(folderName: string): EbcRevisionImport {
  return {
    seq: 2,
    note: 'US A+ previous version from A+ - Previous/02-01-2026.',
    files: [1, 2, 3, 4, 5].map((position) =>
      path.join(EBC_PREVIOUS_02_DIR, folderName, `A+__Premium__Desktop__Master__ARCHIVE_0${position}.jpg`),
    ),
  }
}

function liveRevision(packFolder: string, fileNames: string[]): EbcRevisionImport {
  return {
    seq: 3,
    note: 'US current A+ desktop modules from A+ - Live/FinalEBC/Exports 4.',
    files: fileNames.map((fileName) => path.join(EBC_LIVE_DIR, packFolder, fileName)),
  }
}

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
    throw new Error('DATABASE_URL is required to import US listing assets.')
  }

  const trimmed = databaseUrl.trim()
  if (trimmed.length === 0) {
    throw new Error('DATABASE_URL is required to import US listing assets.')
  }

  return trimmed
}

function mimeTypeForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.jpg') return 'image/jpeg'
  if (ext === '.jpeg') return 'image/jpeg'
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  throw new Error(`Unsupported media type: ${filePath}`)
}

function assertFileExists(filePath: string): void {
  if (existsSync(filePath)) return
  throw new Error(`Missing source file: ${filePath}`)
}

async function hashFile(filePath: string): Promise<string> {
  assertFileExists(filePath)
  const data = await readFile(filePath)
  return createHash('sha256').update(data).digest('hex')
}

async function storeAssetFile(prisma: PrismaClient, filePath: string): Promise<string> {
  assertFileExists(filePath)
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

  await prisma.mediaAsset.update({
    where: { id: stored.mediaId },
    data: {
      sourceUrl: pathToFileURL(filePath).toString(),
      originalName: path.basename(filePath),
    },
  })

  return stored.mediaId
}

async function ensureListing(prisma: PrismaClient, item: ListingAssetImport): Promise<string> {
  const listing = await prisma.listing.upsert({
    where: {
      marketplace_asin: {
        marketplace: MARKETPLACE,
        asin: item.asin,
      },
    },
    update: {
      label: item.label,
      brandName: BRAND_NAME,
      enabled: true,
    },
    create: {
      marketplace: MARKETPLACE,
      asin: item.asin,
      label: item.label,
      brandName: BRAND_NAME,
      enabled: true,
    },
    select: { id: true },
  })

  return listing.id
}

async function ensureTitleRevision(prisma: PrismaClient, listingId: string, item: ListingAssetImport): Promise<string> {
  const existing = await prisma.titleRevision.findUnique({
    where: {
      listingId_seq: {
        listingId,
        seq: 1,
      },
    },
    select: {
      id: true,
      title: true,
    },
  })

  if (existing !== null) {
    if (existing.title !== item.title) {
      throw new Error(`Title v1 for ${item.asin} does not match the US migration title.`)
    }
    return existing.id
  }

  const created = await prisma.titleRevision.create({
    data: {
      listingId,
      seq: 1,
      title: item.title,
      origin: RevisionOrigin.CAPTURED_SNAPSHOT,
      note: 'Catalog metadata refresh',
    },
    select: { id: true },
  })

  return created.id
}

async function ensureGalleryRevision(prisma: PrismaClient, listingId: string, item: ListingAssetImport): Promise<string> {
  for (const filePath of item.galleryFiles) assertFileExists(filePath)

  const existing = await prisma.galleryRevision.findUnique({
    where: {
      listingId_seq: {
        listingId,
        seq: item.gallerySeq,
      },
    },
    select: { id: true },
  })

  if (existing !== null) {
    await syncExistingGalleryRevision(prisma, item, existing.id)
    return existing.id
  }

  const mediaIds: string[] = []
  for (const filePath of item.galleryFiles) {
    const mediaId = await storeAssetFile(prisma, filePath)
    mediaIds.push(mediaId)
  }

  const created = await prisma.galleryRevision.create({
    data: {
      listingId,
      seq: item.gallerySeq,
      origin: RevisionOrigin.MANUAL_ENTRY,
      note: 'US current gallery from Images - Live.',
      slots: {
        create: mediaIds.map((mediaId, position) => ({
          mediaId,
          position,
        })),
      },
    },
    select: { id: true },
  })

  return created.id
}

async function syncExistingGalleryRevision(
  prisma: PrismaClient,
  item: ListingAssetImport,
  revisionId: string,
): Promise<void> {
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

  if (slots.length !== item.galleryFiles.length) {
    throw new Error(`Gallery revision ${revisionId} has ${slots.length} slots; expected ${item.galleryFiles.length}.`)
  }

  for (let index = 0; index < item.galleryFiles.length; index += 1) {
    const filePath = item.galleryFiles[index]
    const expectedSha256 = await hashFile(filePath)
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
    data: { note: 'US current gallery from Images - Live.' },
  })
}

async function ensureEbcRevision(
  prisma: PrismaClient,
  listingId: string,
  item: ListingAssetImport,
  revision: EbcRevisionImport,
): Promise<string> {
  for (const filePath of revision.files) assertFileExists(filePath)

  const existing = await prisma.ebcRevision.findUnique({
    where: {
      listingId_seq: {
        listingId,
        seq: revision.seq,
      },
    },
    select: { id: true },
  })

  if (existing !== null) {
    await syncExistingEbcRevision(prisma, item, revision, existing.id)
    return existing.id
  }

  const modulesCreate = []
  for (let position = 0; position < revision.files.length; position += 1) {
    const filePath = revision.files[position]
    const mediaId = await storeAssetFile(prisma, filePath)
    modulesCreate.push({
      position,
      moduleType: 'FULL_IMAGE',
      headline: null,
      bodyText: null,
      images: {
        create: [
          {
            position: 0,
            mediaId,
            altText: `${item.label} A+ module ${position + 1}`,
          },
        ],
      },
    })
  }

  const created = await prisma.ebcRevision.create({
    data: {
      listingId,
      seq: revision.seq,
      origin: RevisionOrigin.MANUAL_ENTRY,
      note: revision.note,
      sections: {
        create: [
          {
            position: 0,
            sectionType: 'PRODUCT_DESCRIPTION',
            heading: null,
            modules: { create: modulesCreate },
          },
        ],
      },
    },
    select: { id: true },
  })

  return created.id
}

async function syncExistingEbcRevision(
  prisma: PrismaClient,
  item: ListingAssetImport,
  revision: EbcRevisionImport,
  revisionId: string,
): Promise<void> {
  const existing = await prisma.ebcRevision.findUniqueOrThrow({
    where: { id: revisionId },
    include: {
      sections: {
        orderBy: { position: 'asc' },
        include: {
          modules: {
            orderBy: { position: 'asc' },
            include: {
              images: {
                orderBy: { position: 'asc' },
                include: {
                  media: {
                    select: {
                      sha256: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  if (existing.sections.length !== 1) {
    throw new Error(`EBC revision ${revisionId} has ${existing.sections.length} sections; expected 1.`)
  }

  const section = existing.sections[0]
  if (section.sectionType !== 'PRODUCT_DESCRIPTION') {
    throw new Error(`EBC revision ${revisionId} section type is ${section.sectionType}; expected PRODUCT_DESCRIPTION.`)
  }

  if (section.modules.length !== revision.files.length) {
    throw new Error(`EBC revision ${revisionId} has ${section.modules.length} modules; expected ${revision.files.length}.`)
  }

  for (let index = 0; index < revision.files.length; index += 1) {
    const filePath = revision.files[index]
    const expectedSha256 = await hashFile(filePath)
    const module = section.modules[index]
    if (module.images.length !== 1) {
      throw new Error(`EBC revision ${revisionId} module ${index} has ${module.images.length} images; expected 1.`)
    }

    const image = module.images[0]
    let mediaId = image.mediaId
    if (image.media.sha256 !== expectedSha256) {
      mediaId = await storeAssetFile(prisma, filePath)
      await prisma.ebcImage.update({
        where: { id: image.id },
        data: {
          mediaId,
          altText: `${item.label} A+ module ${index + 1}`,
        },
      })
    }

    await prisma.mediaAsset.update({
      where: { id: mediaId },
      data: {
        sourceUrl: pathToFileURL(filePath).toString(),
        originalName: path.basename(filePath),
      },
    })
  }

  await prisma.ebcRevision.update({
    where: { id: revisionId },
    data: { note: revision.note },
  })
}

async function importListing(prisma: PrismaClient, item: ListingAssetImport): Promise<void> {
  const listingId = await ensureListing(prisma, item)
  const titleRevisionId = await ensureTitleRevision(prisma, listingId, item)
  const galleryRevisionId = await ensureGalleryRevision(prisma, listingId, item)

  let liveEbcRevisionId = ''
  for (const revision of item.ebcRevisions) {
    const ebcRevisionId = await ensureEbcRevision(prisma, listingId, item, revision)
    if (revision.seq === 3) {
      liveEbcRevisionId = ebcRevisionId
    }
  }

  if (liveEbcRevisionId.length === 0) {
    throw new Error(`Live EBC revision missing for ${item.asin}.`)
  }

  await prisma.ebcModulePointer.deleteMany({ where: { listingId } })
  await prisma.listing.update({
    where: { id: listingId },
    data: {
      activeTitleId: titleRevisionId,
      activeGalleryId: galleryRevisionId,
      activeEbcId: liveEbcRevisionId,
    },
  })

  console.log(
    `[import-us-listing-assets] ${item.asin} ${item.label} -> gallery v${item.gallerySeq}, EBC v1-v3, live EBC v3`,
  )
}

async function main(): Promise<void> {
  await loadEnvFile(path.join(APP_DIR, '.env.local'))

  const prisma = new PrismaClient({
    log: ['error'],
    datasourceUrl: requireDatabaseUrl(),
  })

  try {
    for (const item of LISTINGS) {
      await importListing(prisma, item)
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
