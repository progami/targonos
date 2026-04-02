import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const listing = await prisma.listing.findUnique({
    where: { id },
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

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  return NextResponse.json(listing)
}
