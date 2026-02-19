import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const listings = await prisma.listing.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      asin: true,
      marketplace: true,
      label: true,
      brandName: true,
      enabled: true,
      activeBulletsId: true,
      activeGalleryId: true,
      activeEbcId: true,
      createdAt: true,
      _count: { select: { snapshots: true } },
    },
  })

  return NextResponse.json(listings)
}
