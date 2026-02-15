import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const snapshots = await prisma.snapshot.findMany({
    where: { listingId: id },
    orderBy: { seq: 'desc' },
  })

  return NextResponse.json(snapshots)
}
