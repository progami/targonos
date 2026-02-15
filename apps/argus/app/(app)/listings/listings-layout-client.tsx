'use client'

import type { ReactNode } from 'react'
import { useSelectedLayoutSegment } from 'next/navigation'
import { ListingDetail } from './[id]/listing-detail'

export function ListingsLayoutClient({ children }: { children: ReactNode }) {
  const segment = useSelectedLayoutSegment()
  if (!segment) return children
  return <ListingDetail listingId={segment} />
}

