import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(request: Request) {
  const body = await request.json()
  const { asin, marketplace, label } = body as { asin: string; marketplace?: string; label?: string }

  const normalizedAsin = String(asin).trim()
  if (normalizedAsin.length === 0) {
    return NextResponse.json({ error: 'asin is required' }, { status: 400 })
  }

  const normalizedMarketplace = marketplace ? String(marketplace).trim() : 'US'
  const normalizedLabel = label ? String(label).trim() : ''

  const updateData: { label?: string } = {}
  if (label !== undefined) {
    updateData.label = normalizedLabel.length > 0 ? normalizedLabel : normalizedAsin
  }

  const listing = await prisma.listing.upsert({
    where: {
      marketplace_asin: {
        marketplace: normalizedMarketplace,
        asin: normalizedAsin,
      },
    },
    update: updateData,
    create: {
      asin: normalizedAsin,
      marketplace: normalizedMarketplace,
      label: normalizedLabel.length > 0 ? normalizedLabel : normalizedAsin,
    },
  })

  return NextResponse.json(listing)
}
