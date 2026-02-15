import prisma from '@/lib/db'
import { ListingDetail } from './listing-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params

  // Try to find the listing in the DB by ID or ASIN
  const listing = await prisma.listing.findFirst({
    where: { OR: [{ id }, { asin: id }] },
    include: {
      bulletsRevisions: { orderBy: { seq: 'desc' }, take: 1 },
      galleryRevisions: {
        orderBy: { seq: 'desc' },
        take: 1,
        include: {
          slots: {
            orderBy: { position: 'asc' },
            include: { media: true },
          },
        },
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
                include: {
                  images: {
                    orderBy: { position: 'asc' },
                    include: { media: true },
                  },
                },
              },
            },
          },
        },
      },
      _count: { select: { snapshots: true } },
    },
  })

  // If no DB listing exists, fall back to iframe-only view
  if (!listing) {
    return <ListingDetail listingId={id} />
  }

  // Shape the data for the client
  const activeBullets = listing.bulletsRevisions[0] ?? null
  const activeGallery = listing.galleryRevisions[0] ?? null
  const activeEbc = listing.ebcRevisions[0] ?? null

  const galleryImages = activeGallery?.slots.map((slot: { position: number; media: { filePath: string; sourceUrl: string | null } }) => ({
    position: slot.position,
    src: slot.media.filePath,
    hiRes: slot.media.sourceUrl,
    isVideo: false,
  })) ?? []

  const ebcSections = activeEbc?.sections.map((section: { sectionType: string; heading: string | null; modules: { moduleType: string; headline: string | null; bodyText: string | null; images: { media: { filePath: string }; altText: string | null }[] }[] }) => ({
    sectionType: section.sectionType,
    heading: section.heading,
    modules: section.modules.map((mod: { moduleType: string; headline: string | null; bodyText: string | null; images: { media: { filePath: string }; altText: string | null }[] }) => ({
      moduleType: mod.moduleType,
      headline: mod.headline,
      bodyText: mod.bodyText,
      images: mod.images.map((img: { media: { filePath: string }; altText: string | null }) => ({
        src: img.media.filePath,
        alt: img.altText,
      })),
    })),
  })) ?? []

  return (
    <ListingDetail
      listingId={id}
      listing={{
        id: listing.id,
        asin: listing.asin,
        label: listing.label,
      }}
      bullets={activeBullets ? {
        bullet1: activeBullets.bullet1,
        bullet2: activeBullets.bullet2,
        bullet3: activeBullets.bullet3,
        bullet4: activeBullets.bullet4,
        bullet5: activeBullets.bullet5,
        seq: activeBullets.seq,
        createdAt: activeBullets.createdAt.toISOString(),
      } : null}
      gallery={activeGallery ? {
        images: galleryImages,
        seq: activeGallery.seq,
        createdAt: activeGallery.createdAt.toISOString(),
      } : null}
      ebc={activeEbc ? {
        sections: ebcSections,
        seq: activeEbc.seq,
        createdAt: activeEbc.createdAt.toISOString(),
      } : null}
      totalSnapshots={listing._count.snapshots}
    />
  )
}
