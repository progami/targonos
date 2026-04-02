import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params

  const asin = await prisma.trackedAsin.findUnique({
    where: { id },
    include: {
      snapshots: {
        orderBy: { capturedAt: 'desc' },
        take: 1,
      },
    },
  })

  if (!asin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...asin,
    latestSnapshot: asin.snapshots[0] ?? null,
    snapshots: undefined,
  })
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await request.json()
  const { label, ownership, enabled, brand, imageUrl } = body as {
    label?: string
    ownership?: string
    enabled?: boolean
    brand?: string
    imageUrl?: string
  }

  const data: Record<string, unknown> = {}
  if (label !== undefined) data.label = label
  if (ownership !== undefined) data.ownership = ownership === 'COMPETITOR' ? 'COMPETITOR' : 'OURS'
  if (enabled !== undefined) data.enabled = enabled
  if (brand !== undefined) data.brand = brand
  if (imageUrl !== undefined) data.imageUrl = imageUrl

  const updated = await prisma.trackedAsin.update({
    where: { id },
    data,
  })

  return NextResponse.json(updated)
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params

  await prisma.trackedAsin.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
