import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  const asins = await prisma.trackedAsin.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      snapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
    },
  })

  const result = asins.map((a) => ({
    ...a,
    latestSnapshot: a.snapshots[0] ?? null,
    snapshots: undefined,
  }))

  return NextResponse.json(result)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { asin, marketplace, ownership, label, brand, imageUrl } = body as {
    asin: string
    marketplace?: string
    ownership?: string
    label: string
    brand?: string
    imageUrl?: string
  }

  const created = await prisma.trackedAsin.create({
    data: {
      asin,
      marketplace: marketplace === 'UK' ? 'UK' : 'US',
      ownership: ownership === 'COMPETITOR' ? 'COMPETITOR' : 'OURS',
      label,
      brand: brand ?? null,
      imageUrl: imageUrl ?? null,
    },
  })

  return NextResponse.json(created, { status: 201 })
}
