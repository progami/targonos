import { NextResponse } from 'next/server'
import { parseArgusMarket } from '@/lib/argus-market'
import { getMonitoringHealth } from '@/lib/monitoring/reader'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const market = parseArgusMarket(searchParams.get('market'))
    const health = await getMonitoringHealth(market)
    return NextResponse.json(health)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load monitoring health.' },
      { status: 500 },
    )
  }
}
