import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params
  const { searchParams } = new URL(request.url)

  // Default to 7 days of history
  const range = searchParams.get('range') ?? '7d'
  const now = new Date()
  let since: Date

  switch (range) {
    case '24h':
      since = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      break
    case '7d':
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      break
    case '30d':
      since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
      break
    default:
      since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  }

  const snapshots = await prisma.trackingSnapshot.findMany({
    where: {
      trackedAsinId: id,
      capturedAt: { gte: since },
    },
    orderBy: { capturedAt: 'asc' },
  })

  return NextResponse.json(snapshots)
}
