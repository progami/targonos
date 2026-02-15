import { NextResponse } from 'next/server'
import { join } from 'path'
import prisma from '@/lib/db'
import { ingestSnapshot } from '@/lib/ingest'

const FIXTURE_MARKETPLACE = 'US'
const FIXTURE_ASIN = 'B09HXC3NL8'
const FIXTURE_LABEL = "6 Pack Extra Large Clear Painter's Drop Cloth for Painting"
const FIXTURE_BRAND = 'CS Fabric Woven'

export async function POST() {
  const listing = await prisma.listing.upsert({
    where: { marketplace_asin: { marketplace: FIXTURE_MARKETPLACE, asin: FIXTURE_ASIN } },
    create: {
      marketplace: FIXTURE_MARKETPLACE,
      asin: FIXTURE_ASIN,
      label: FIXTURE_LABEL,
      brandName: FIXTURE_BRAND,
      enabled: true,
    },
    update: {},
  })

  const snapshotCount = await prisma.snapshot.count({ where: { listingId: listing.id } })
  if (snapshotCount > 0) {
    return NextResponse.json({ listingId: listing.id, seeded: false })
  }

  const htmlPath = join(process.cwd(), 'fixtures', 'amazon-pdp', 'replica.html')
  const assetsDir = join(process.cwd(), 'fixtures', 'amazon-pdp', 'listingpage_files')

  const result = await ingestSnapshot(listing.id, htmlPath, assetsDir, new Date())
  return NextResponse.json({ listingId: listing.id, seeded: true, result })
}

