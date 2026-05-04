import prisma from '@/lib/db'
import { buildListingsViewModel } from '@/lib/listings/view-model'
import { ListingsTable } from '@/components/listings/listings-table'

export const dynamic = 'force-dynamic'

export default async function ListingsPage() {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      asin: true,
      marketplace: true,
      label: true,
      brandName: true,
      enabled: true,
      createdAt: true,
      updatedAt: true,
      titleRevisions: {
        orderBy: { seq: 'desc' },
        take: 1,
        select: { title: true },
      },
      _count: {
        select: {
          snapshots: true,
          titleRevisions: true,
          bulletsRevisions: true,
          galleryRevisions: true,
          videoRevisions: true,
          ebcRevisions: true,
        },
      },
    },
  })

  const viewModel = buildListingsViewModel(listings)

  return <ListingsTable viewModel={viewModel} />
}
