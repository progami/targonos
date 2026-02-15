import prisma from '@/lib/db'
import { ListingDetail } from './listing-detail'

interface Props {
  params: Promise<{ id: string }>
}

function looksLikeAsin(value: string): boolean {
  return /^[a-z0-9]{10}$/iu.test(value)
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params

  // Try to find the listing in the DB by ID or ASIN
  const normalizedId = String(id).trim()
  let listing = await prisma.listing.findFirst({
    where: { OR: [{ id: normalizedId }, { asin: normalizedId }] },
  })

  if (!listing && looksLikeAsin(normalizedId)) {
    listing = await prisma.listing.upsert({
      where: {
        marketplace_asin: {
          marketplace: 'US',
          asin: normalizedId,
        },
      },
      update: {},
      create: {
        asin: normalizedId,
        marketplace: 'US',
        label: normalizedId,
      },
    })
  }

  return (
    <ListingDetail
      listingId={normalizedId}
      listing={listing ? { id: listing.id, asin: listing.asin, label: listing.label } : undefined}
    />
  )
}
