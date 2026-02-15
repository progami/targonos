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
  })

  return (
    <ListingDetail
      listingId={id}
      listing={listing ? { id: listing.id, asin: listing.asin, label: listing.label } : undefined}
    />
  )
}
