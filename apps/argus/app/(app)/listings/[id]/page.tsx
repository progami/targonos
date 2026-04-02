import { ListingDetail } from './listing-detail'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ListingDetailPage({ params }: Props) {
  const { id } = await params
  return <ListingDetail listingId={id} />
}
