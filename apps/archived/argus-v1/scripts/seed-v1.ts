/**
 * Seeds the existing fixture as the first snapshot for the 6-pack listing.
 *
 * Usage: npx tsx scripts/seed-v1.ts
 *
 * Requires DATABASE_URL to be set (auto-loaded from .env.local).
 */

import { join } from 'path'
import { PrismaClient } from '@targon/prisma-argus'
import { extractAll } from '../lib/extractor'
import { readFileSync, existsSync } from 'fs'
import { createHash } from 'crypto'
import { mkdirSync, writeFileSync } from 'fs'
import { extname, basename } from 'path'

const prisma = new PrismaClient()

const FIXTURE_DIR = join(__dirname, '..', 'fixtures', 'amazon-pdp')
const HTML_PATH = join(FIXTURE_DIR, 'replica.html')
const ASSETS_DIR = join(FIXTURE_DIR, 'listingpage_files')
const MEDIA_ROOT = join(__dirname, '..', 'public', 'media')

const LISTING_ASIN = 'B09HXC3NL8'
const LISTING_LABEL = '6 Pack Extra Large Clear Painter\'s Drop Cloth for Painting'
const LISTING_BRAND = 'CS Fabric Woven'

async function main() {
  console.log('Seeding v1 snapshot for', LISTING_ASIN)

  // Check if listing already exists
  const existing = await prisma.listing.findFirst({
    where: { asin: LISTING_ASIN },
  })
  if (existing) {
    console.log('Listing already exists:', existing.id)
    console.log('Skipping seed.')
    return
  }

  // Create listing
  const listing = await prisma.listing.create({
    data: {
      asin: LISTING_ASIN,
      marketplace: 'US',
      label: LISTING_LABEL,
      brandName: LISTING_BRAND,
      enabled: true,
    },
  })
  console.log('Created listing:', listing.id)

  // Extract data from HTML
  const html = readFileSync(HTML_PATH, 'utf-8')
  const extracted = extractAll(html)

  // ─── Title ────────────────────────────────────────────────────
  const titleText = extracted.title ? extracted.title : LISTING_LABEL
  const titleRev = await prisma.titleRevision.create({
    data: {
      listingId: listing.id,
      seq: 1,
      title: titleText,
      origin: 'CAPTURED_SNAPSHOT',
    },
  })
  console.log('Created title revision v1')

  // ─── Bullets ─────────────────────────────────────────────────
  const bulletsRev = await prisma.bulletsRevision.create({
    data: {
      listingId: listing.id,
      seq: 1,
      ...extracted.bullets,
      origin: 'CAPTURED_SNAPSHOT',
    },
  })
  console.log('Created bullets revision v1')

  // ─── Gallery ─────────────────────────────────────────────────
  const gallerySlots = []
  for (const img of extracted.gallery.images) {
    const localPath = resolveAssetPath(img.src)
    if (!localPath || !existsSync(localPath)) {
      console.warn('  Skipping missing image:', img.src)
      continue
    }
    const stored = await storeImageFile(localPath, img.hiRes ?? img.src, basename(img.src))
    gallerySlots.push({
      position: img.position,
      mediaId: stored.mediaId,
    })
  }

  const galleryRev = await prisma.galleryRevision.create({
    data: {
      listingId: listing.id,
      seq: 1,
      origin: 'CAPTURED_SNAPSHOT',
      slots: { create: gallerySlots },
    },
  })
  console.log(`Created gallery revision v1 with ${gallerySlots.length} images`)

  // ─── EBC ─────────────────────────────────────────────────────
  const ebcSections = []
  for (let si = 0; si < extracted.ebc.length; si++) {
    const section = extracted.ebc[si]
    const moduleData = []
    for (let mi = 0; mi < section.modules.length; mi++) {
      const mod = section.modules[mi]
      const imageData = []
      for (let ii = 0; ii < mod.images.length; ii++) {
        const img = mod.images[ii]
        const localPath = resolveAssetPath(img.src)
        if (!localPath || !existsSync(localPath)) {
          console.warn('  Skipping missing EBC image:', img.src)
          continue
        }
        const stored = await storeImageFile(localPath, img.src, basename(img.src))
        imageData.push({
          position: ii,
          mediaId: stored.mediaId,
          altText: img.alt,
        })
      }
      moduleData.push({
        position: mi,
        moduleType: mod.moduleType,
        headline: mod.headline,
        bodyText: mod.bodyText,
        images: { create: imageData },
      })
    }
    ebcSections.push({
      position: si,
      sectionType: section.sectionType,
      heading: section.heading,
      modules: { create: moduleData },
    })
  }

  const ebcRev = await prisma.ebcRevision.create({
    data: {
      listingId: listing.id,
      seq: 1,
      origin: 'CAPTURED_SNAPSHOT',
      sections: { create: ebcSections },
    },
  })
  console.log(`Created EBC revision v1 with ${ebcSections.length} sections`)

  // Update listing active pointers
  await prisma.listing.update({
    where: { id: listing.id },
    data: {
      activeTitleId: titleRev.id,
      activeBulletsId: bulletsRev.id,
      activeGalleryId: galleryRev.id,
      activeEbcId: ebcRev.id,
    },
  })

  // Create snapshot
  await prisma.snapshot.create({
    data: {
      listingId: listing.id,
      seq: 1,
      capturedAt: new Date(),
      rawHtmlPath: HTML_PATH,
      titleRevisionId: titleRev.id,
      bulletsRevisionId: bulletsRev.id,
      galleryRevisionId: galleryRev.id,
      ebcRevisionId: ebcRev.id,
      note: 'Initial seed from fixture',
    },
  })

  console.log('Created snapshot v1')
  console.log('Done! Listing ID:', listing.id)
}

function resolveAssetPath(src: string): string | null {
  const cleaned = src.replace(/^\.\//, '')
  if (cleaned.startsWith('listingpage_files/')) {
    const filename = cleaned.replace('listingpage_files/', '')
    return join(ASSETS_DIR, filename)
  }
  return join(ASSETS_DIR, basename(cleaned))
}

async function storeImageFile(
  sourcePath: string,
  sourceUrl: string,
  originalName: string,
): Promise<{ mediaId: string; sha256: string }> {
  const data = readFileSync(sourcePath)
  const sha256 = createHash('sha256').update(data).digest('hex')
  const ext = extname(sourcePath).toLowerCase()
  const prefix = sha256.slice(0, 2)
  const absPath = join(MEDIA_ROOT, prefix, `${sha256}${ext}`)
  const relPath = `media/${prefix}/${sha256}${ext}`

  const dir = join(MEDIA_ROOT, prefix)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  if (!existsSync(absPath)) {
    writeFileSync(absPath, data)
  }

  const existing = await prisma.mediaAsset.findUnique({ where: { sha256 } })
  if (existing) {
    return { mediaId: existing.id, sha256 }
  }

  const mimeMap: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  }

  const asset = await prisma.mediaAsset.create({
    data: {
      sha256,
      filePath: relPath,
      mimeType: mimeMap[ext] ?? 'application/octet-stream',
      bytes: data.length,
      sourceUrl,
      originalName,
    },
  })

  return { mediaId: asset.id, sha256 }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e)
    prisma.$disconnect()
    process.exit(1)
  })
