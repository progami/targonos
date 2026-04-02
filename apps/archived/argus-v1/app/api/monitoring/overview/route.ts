import { NextResponse } from 'next/server'
import { getMonitoringOverview } from '@/lib/monitoring/reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const overview = await getMonitoringOverview()
    return NextResponse.json(overview)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load monitoring overview.' },
      { status: 500 },
    )
  }
}
