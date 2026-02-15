import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const listing = await prisma.listing.findUniqueOrThrow({
    where: { id },
    select: {
      priceCents: true,
      pricePerUnitCents: true,
      pricePerUnitUnit: true,
    },
  })

  return NextResponse.json(listing)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const body = await request.json()

  const { priceCents, pricePerUnitCents, pricePerUnitUnit } = body as {
    priceCents: number
    pricePerUnitCents?: number | null
    pricePerUnitUnit?: string | null
  }

  if (!Number.isFinite(priceCents) || !Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json({ error: 'priceCents must be a non-negative integer' }, { status: 400 })
  }

  const nextPerUnitCents = typeof pricePerUnitCents === 'number' ? pricePerUnitCents : null
  if (nextPerUnitCents !== null && (!Number.isFinite(nextPerUnitCents) || !Number.isInteger(nextPerUnitCents) || nextPerUnitCents < 0)) {
    return NextResponse.json({ error: 'pricePerUnitCents must be a non-negative integer' }, { status: 400 })
  }

  const nextPerUnitUnit = nextPerUnitCents !== null && typeof pricePerUnitUnit === 'string'
    ? pricePerUnitUnit.trim()
    : null

  if (nextPerUnitCents !== null && (nextPerUnitUnit === null || nextPerUnitUnit.length === 0)) {
    return NextResponse.json({ error: 'pricePerUnitUnit is required when pricePerUnitCents is set' }, { status: 400 })
  }

  const listing = await prisma.listing.update({
    where: { id },
    data: {
      priceCents,
      pricePerUnitCents: nextPerUnitCents,
      pricePerUnitUnit: nextPerUnitUnit,
    },
    select: {
      priceCents: true,
      pricePerUnitCents: true,
      pricePerUnitUnit: true,
    },
  })

  return NextResponse.json(listing)
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const listing = await prisma.listing.update({
    where: { id },
    data: {
      priceCents: null,
      pricePerUnitCents: null,
      pricePerUnitUnit: null,
    },
    select: {
      priceCents: true,
      pricePerUnitCents: true,
      pricePerUnitUnit: true,
    },
  })

  return NextResponse.json(listing)
}
