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
  const nextLabel = label ? String(label).trim() : normalizedAsin

  const listing = await prisma.listing.upsert({
    where: {
      marketplace_asin: {
        marketplace: normalizedMarketplace,
        asin: normalizedAsin,
      },
    },
    update: {
      label: nextLabel,
    },
    create: {
      asin: normalizedAsin,
      marketplace: normalizedMarketplace,
      label: nextLabel,
    },
  })

  return NextResponse.json(listing)
}

