import { NextRequest, NextResponse } from 'next/server'
import { getMonitoringAsinDetail } from '@/lib/monitoring/reader'

type Params = { params: Promise<{ asin: string }> }

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { asin } = await params
    const detail = await getMonitoringAsinDetail(asin)

    if (!detail.current) {
      return NextResponse.json({ error: 'ASIN not found in monitoring state.' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load ASIN detail.' },
      { status: 500 },
    )
  }
}
