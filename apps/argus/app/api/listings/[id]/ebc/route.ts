import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const revisions = await prisma.ebcRevision.findMany({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
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
  })

  return NextResponse.json(revisions)
}
