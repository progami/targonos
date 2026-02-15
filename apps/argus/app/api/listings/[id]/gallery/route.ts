import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const revisions = await prisma.galleryRevision.findMany({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
    include: {
      slots: {
        orderBy: { position: 'asc' },
        include: { media: true },
      },
    },
  })

  return NextResponse.json(revisions)
}
