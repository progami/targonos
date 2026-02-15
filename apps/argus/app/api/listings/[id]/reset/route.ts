import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { deleteOrphanMediaAssets } from '@/lib/media-gc'

export const runtime = 'nodejs'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  await prisma.listing.findUniqueOrThrow({ where: { id } })

  const [gallerySlots, ebcImages, videoRevisions] = await Promise.all([
    prisma.gallerySlot.findMany({
      where: { revision: { listingId: id } },
      select: { mediaId: true },
    }),
    prisma.ebcImage.findMany({
      where: { module: { section: { revision: { listingId: id } } } },
      select: { mediaId: true },
    }),
    prisma.videoRevision.findMany({
      where: { listingId: id },
      select: { mediaId: true, posterMediaId: true },
    }),
  ])

  const mediaIds = [
    ...gallerySlots.map((slot) => slot.mediaId),
    ...ebcImages.map((img) => img.mediaId),
    ...videoRevisions.flatMap((rev) => [rev.mediaId, rev.posterMediaId ?? ''].filter((val) => val.length > 0)),
  ]

  const result = await prisma.$transaction(async (tx) => {
    const deletedPointers = await tx.ebcModulePointer.deleteMany({ where: { listingId: id } })

    const deletedEbcImages = await tx.ebcImage.deleteMany({
      where: { module: { section: { revision: { listingId: id } } } },
    })
    const deletedEbcModules = await tx.ebcModule.deleteMany({
      where: { section: { revision: { listingId: id } } },
    })
    const deletedEbcSections = await tx.ebcSection.deleteMany({
      where: { revision: { listingId: id } },
    })
    const deletedEbcRevisions = await tx.ebcRevision.deleteMany({ where: { listingId: id } })

    const deletedGallerySlots = await tx.gallerySlot.deleteMany({ where: { revision: { listingId: id } } })
    const deletedGalleryRevisions = await tx.galleryRevision.deleteMany({ where: { listingId: id } })

    const deletedVideoRevisions = await tx.videoRevision.deleteMany({ where: { listingId: id } })

    const deletedTitles = await tx.titleRevision.deleteMany({ where: { listingId: id } })
    const deletedBullets = await tx.bulletsRevision.deleteMany({ where: { listingId: id } })
    const deletedSnapshots = await tx.snapshot.deleteMany({ where: { listingId: id } })

    await tx.listing.update({
      where: { id },
      data: {
        priceCents: null,
        pricePerUnitCents: null,
        pricePerUnitUnit: null,
        activeTitleId: null,
        activeBulletsId: null,
        activeGalleryId: null,
        activeEbcId: null,
        activeVideoId: null,
      },
    })

    return {
      deletedPointers: deletedPointers.count,
      deletedTitles: deletedTitles.count,
      deletedBullets: deletedBullets.count,
      deletedGalleryRevisions: deletedGalleryRevisions.count,
      deletedGallerySlots: deletedGallerySlots.count,
      deletedVideoRevisions: deletedVideoRevisions.count,
      deletedEbcRevisions: deletedEbcRevisions.count,
      deletedEbcSections: deletedEbcSections.count,
      deletedEbcModules: deletedEbcModules.count,
      deletedEbcImages: deletedEbcImages.count,
      deletedSnapshots: deletedSnapshots.count,
    }
  })

  await deleteOrphanMediaAssets(mediaIds)

  return NextResponse.json({ ok: true, ...result })
}

