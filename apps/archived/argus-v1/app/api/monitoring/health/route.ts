import { NextResponse } from 'next/server'
import { getMonitoringHealth } from '@/lib/monitoring/reader'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const health = await getMonitoringHealth()
    return NextResponse.json(health)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load monitoring health.' },
      { status: 500 },
    )
  }
}
