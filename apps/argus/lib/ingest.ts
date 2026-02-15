import { readFileSync, existsSync } from 'fs'
import { join, basename, extname } from 'path'
import prisma from '@/lib/db'
import { extractAll } from '@/lib/extractor'
import { storeImage, storeImageBuffer } from '@/lib/image-store'
import type { ExtractedBullets, ExtractedEbcSection, ExtractedImage } from '@/lib/extractor'

interface IngestResult {
  snapshotId: string
  listingId: string
  changes: string[]
  titleSeq: number
  bulletsSeq: number
  gallerySeq: number
  ebcSeq: number
}

/**
 * Ingests a Chrome "Save As Complete Web Page" snapshot.
 * Extracts bullets, images, EBC → creates revisions if changed → creates snapshot.
 */
export async function ingestSnapshot(
  listingId: string,
  htmlPath: string,
  assetsDir: string,
  capturedAt: Date = new Date(),
): Promise<IngestResult> {
  const html = readFileSync(htmlPath, 'utf-8')
  const extracted = extractAll(html)
  const changes: string[] = []

  // Get current listing state
  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id: listingId },
    include: {
      titleRevisions: { orderBy: { seq: 'desc' }, take: 1 },
      bulletsRevisions: { orderBy: { seq: 'desc' }, take: 1 },
      galleryRevisions: {
        orderBy: { seq: 'desc' },
        take: 1,
        include: { slots: true },
      },
      ebcRevisions: {
        orderBy: { seq: 'desc' },
        take: 1,
        include: {
          sections: {
            orderBy: { position: 'asc' },
            include: {
              modules: {
                orderBy: { position: 'asc' },
                include: { images: true },
              },
            },
          },
        },
      },
    },
  })

  let activeTitleId = listing.activeTitleId
  let activeBulletsId = listing.activeBulletsId
  let activeGalleryId = listing.activeGalleryId
  let activeEbcId = listing.activeEbcId

  // ─── Title ────────────────────────────────────────────────────
  const prevTitle = listing.titleRevisions[0] ?? null
  const extractedTitle = extracted.title
  const titleChanged = extractedTitle && (!prevTitle || prevTitle.title !== extractedTitle)
  let titleSeq = prevTitle?.seq ?? 0

  if (titleChanged && extractedTitle) {
    titleSeq = (prevTitle?.seq ?? 0) + 1
    const rev = await prisma.titleRevision.create({
      data: {
        listingId,
        seq: titleSeq,
        title: extractedTitle,
        origin: 'CAPTURED_SNAPSHOT',
      },
    })
    await prisma.listing.update({
      where: { id: listingId },
      data: { activeTitleId: rev.id },
    })
    activeTitleId = rev.id
    changes.push(`Title updated to v${titleSeq}`)
  }

  // ─── Bullets ─────────────────────────────────────────────────
  const prevBullets = listing.bulletsRevisions[0] ?? null
  const bulletsChanged = !prevBullets || hasBulletsChanged(prevBullets, extracted.bullets)
  let bulletsSeq = prevBullets?.seq ?? 0

  if (bulletsChanged) {
    bulletsSeq = (prevBullets?.seq ?? 0) + 1
    const rev = await prisma.bulletsRevision.create({
      data: {
        listingId,
        seq: bulletsSeq,
        ...extracted.bullets,
        origin: 'CAPTURED_SNAPSHOT',
      },
    })
    await prisma.listing.update({
      where: { id: listingId },
      data: { activeBulletsId: rev.id },
    })
    activeBulletsId = rev.id
    changes.push(`Bullets updated to v${bulletsSeq}`)
  }

  // ─── Gallery ─────────────────────────────────────────────────
  const prevGallery = listing.galleryRevisions[0] ?? null
  const galleryMediaIds = await storeGalleryImages(extracted.gallery.images, assetsDir)
  const galleryChanged = !prevGallery || hasGalleryChanged(prevGallery.slots, galleryMediaIds)
  let gallerySeq = prevGallery?.seq ?? 0

  if (galleryChanged) {
    gallerySeq = (prevGallery?.seq ?? 0) + 1
    const rev = await prisma.galleryRevision.create({
      data: {
        listingId,
        seq: gallerySeq,
        origin: 'CAPTURED_SNAPSHOT',
        slots: {
          create: galleryMediaIds.map((mediaId, i) => ({
            position: i,
            mediaId,
          })),
        },
      },
    })
    await prisma.listing.update({
      where: { id: listingId },
      data: { activeGalleryId: rev.id },
    })
    activeGalleryId = rev.id
    changes.push(`Gallery updated to v${gallerySeq}`)
  }

  // ─── EBC ─────────────────────────────────────────────────────
  const prevEbc = listing.ebcRevisions[0] ?? null
  const ebcChanged = !prevEbc || hasEbcChanged(prevEbc.sections, extracted.ebc)
  let ebcSeq = prevEbc?.seq ?? 0

  if (ebcChanged) {
    ebcSeq = (prevEbc?.seq ?? 0) + 1
    const ebcSections = await buildEbcSections(extracted.ebc, assetsDir)
    const rev = await prisma.ebcRevision.create({
      data: {
        listingId,
        seq: ebcSeq,
        origin: 'CAPTURED_SNAPSHOT',
        sections: {
          create: ebcSections,
        },
      },
    })
    await prisma.listing.update({
      where: { id: listingId },
      data: { activeEbcId: rev.id },
    })
    activeEbcId = rev.id
    changes.push(`EBC updated to v${ebcSeq}`)
  }

  // ─── Snapshot ────────────────────────────────────────────────
  const snapshotCount = await prisma.snapshot.count({ where: { listingId } })
  const snapshot = await prisma.snapshot.create({
    data: {
      listingId,
      seq: snapshotCount + 1,
      capturedAt,
      rawHtmlPath: htmlPath,
      titleRevisionId: activeTitleId,
      bulletsRevisionId: activeBulletsId,
      galleryRevisionId: activeGalleryId,
      ebcRevisionId: activeEbcId,
      note: changes.length > 0 ? changes.join('; ') : 'No changes detected',
    },
  })

  return {
    snapshotId: snapshot.id,
    listingId,
    changes,
    titleSeq,
    bulletsSeq,
    gallerySeq,
    ebcSeq,
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function hasBulletsChanged(
  prev: { bullet1: string | null; bullet2: string | null; bullet3: string | null; bullet4: string | null; bullet5: string | null },
  next: ExtractedBullets,
): boolean {
  return (
    prev.bullet1 !== next.bullet1 ||
    prev.bullet2 !== next.bullet2 ||
    prev.bullet3 !== next.bullet3 ||
    prev.bullet4 !== next.bullet4 ||
    prev.bullet5 !== next.bullet5
  )
}

function hasGalleryChanged(
  prevSlots: { position: number; mediaId: string }[],
  nextMediaIds: string[],
): boolean {
  if (prevSlots.length !== nextMediaIds.length) return true
  const prevSorted = [...prevSlots].sort((a, b) => a.position - b.position)
  for (let i = 0; i < prevSorted.length; i++) {
    if (prevSorted[i].mediaId !== nextMediaIds[i]) return true
  }
  return false
}

function hasEbcChanged(
  prevSections: { sectionType: string; modules: { moduleType: string; headline: string | null; bodyText: string | null; images: unknown[] }[] }[],
  nextSections: ExtractedEbcSection[],
): boolean {
  if (prevSections.length !== nextSections.length) return true
  for (let i = 0; i < prevSections.length; i++) {
    const prev = prevSections[i]
    const next = nextSections[i]
    if (prev.sectionType !== next.sectionType) return true
    if (prev.modules.length !== next.modules.length) return true
    for (let j = 0; j < prev.modules.length; j++) {
      const pm = prev.modules[j]
      const nm = next.modules[j]
      if (pm.moduleType !== nm.moduleType || pm.headline !== nm.headline || pm.bodyText !== nm.bodyText) return true
      if (pm.images.length !== nm.images.length) return true
    }
  }
  return false
}

async function storeGalleryImages(
  images: ExtractedImage[],
  assetsDir: string,
): Promise<string[]> {
  const mediaIds: string[] = []
  for (const img of images) {
    const mediaId = await storeSnapshotImage(img.src, assetsDir, {
      sourceUrl: img.hiRes ?? img.src,
      downloadUrl: img.hiRes ?? img.src,
      originalName: basename(img.src),
    })
    if (!mediaId) continue
    mediaIds.push(mediaId)
  }
  return mediaIds
}

async function buildEbcSections(
  sections: ExtractedEbcSection[],
  assetsDir: string,
) {
  const result = []
  for (let si = 0; si < sections.length; si++) {
    const section = sections[si]
    const moduleData = []
    for (let mi = 0; mi < section.modules.length; mi++) {
      const mod = section.modules[mi]
      const imageData = []
      for (let ii = 0; ii < mod.images.length; ii++) {
        const img = mod.images[ii]
        const mediaId = await storeSnapshotImage(img.src, assetsDir, {
          sourceUrl: img.src,
          downloadUrl: img.src,
          originalName: basename(img.src),
        })
        if (!mediaId) continue
        imageData.push({
          position: ii,
          mediaId,
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
    result.push({
      position: si,
      sectionType: section.sectionType,
      heading: section.heading,
      modules: { create: moduleData },
    })
  }
  return result
}

async function storeSnapshotImage(
  src: string,
  assetsDir: string,
  opts: { sourceUrl?: string; downloadUrl?: string; originalName?: string },
): Promise<string | null> {
  const localPath = resolveAssetPath(src, assetsDir)
  if (localPath && existsSync(localPath)) {
    const stored = await storeImage(localPath, {
      sourceUrl: opts.sourceUrl,
      originalName: opts.originalName,
    })
    return stored.mediaId
  }

  const remoteUrl = opts.downloadUrl ?? opts.sourceUrl ?? src
  if (remoteUrl.startsWith('http://') || remoteUrl.startsWith('https://')) {
    const res = await fetch(remoteUrl)
    if (!res.ok) {
      return null
    }
    const data = Buffer.from(await res.arrayBuffer())
    const ext = extnameFromUrl(remoteUrl) ?? extnameFromContentType(res.headers.get('content-type')) ?? '.jpg'
    const stored = await storeImageBuffer(data, ext, {
      sourceUrl: opts.sourceUrl ?? remoteUrl,
      originalName: opts.originalName,
      mimeType: res.headers.get('content-type') ?? undefined,
    })
    return stored.mediaId
  }

  return null
}

function extnameFromUrl(url: string): string | null {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname).toLowerCase()
    return ext.length > 0 ? ext : null
  } catch {
    return null
  }
}

function extnameFromContentType(contentType: string | null): string | null {
  if (!contentType) return null
  const normalized = contentType.split(';')[0]?.trim().toLowerCase()
  if (normalized === 'image/jpeg') return '.jpg'
  if (normalized === 'image/png') return '.png'
  if (normalized === 'image/gif') return '.gif'
  if (normalized === 'image/webp') return '.webp'
  if (normalized === 'image/avif') return '.avif'
  if (normalized === 'image/svg+xml') return '.svg'
  return null
}

/**
 * Resolves a relative asset path (like ./listingpage_files/foo.jpg) to an absolute path.
 */
function resolveAssetPath(src: string, assetsDir: string): string | null {
  // Handle relative paths like ./listingpage_files/foo.jpg
  const cleaned = src.replace(/^\.\//, '')
  // If the src starts with listingpage_files/, resolve from the fixture directory
  if (cleaned.startsWith('listingpage_files/')) {
    const filename = cleaned.replace('listingpage_files/', '')
    return join(assetsDir, filename)
  }
  // If it's just a filename, try it directly in the assets dir
  return join(assetsDir, basename(cleaned))
}
