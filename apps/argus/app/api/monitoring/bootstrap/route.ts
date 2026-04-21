import { NextRequest, NextResponse } from 'next/server'
import { getMonitoringBootstrap } from '@/lib/monitoring/reader'
import type {
  MonitoringCategory,
  MonitoringOwner,
  MonitoringSeverity,
  MonitoringWindow,
} from '@/lib/monitoring/types'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const bootstrap = await getMonitoringBootstrap({
      window: readWindow(searchParams.get('window')),
      owner: readOwner(searchParams.get('owner')),
      category: readCategory(searchParams.get('category')),
      severity: readSeverity(searchParams.get('severity')),
      snapshotTimestamp: readSnapshotTimestamp(searchParams.get('snapshot')),
      query: searchParams.get('query') ?? undefined,
    })

    return NextResponse.json(bootstrap)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load monitoring bootstrap.' },
      { status: 500 },
    )
  }
}

function readWindow(value: string | null): MonitoringWindow | undefined {
  if (!value) return undefined
  if (value === '24h' || value === '7d' || value === '30d' || value === 'all') return value
  throw new Error(`Unsupported monitoring window "${value}".`)
}

function readOwner(value: string | null): MonitoringOwner | 'ALL' | undefined {
  if (!value) return undefined
  if (value === 'ALL' || value === 'OURS' || value === 'COMPETITOR' || value === 'UNKNOWN') {
    return value
  }
  throw new Error(`Unsupported monitoring owner filter "${value}".`)
}

function readCategory(value: string | null): MonitoringCategory | 'ALL' | undefined {
  if (!value) return undefined
  if (
    value === 'ALL' ||
    value === 'status' ||
    value === 'content' ||
    value === 'images' ||
    value === 'price' ||
    value === 'offers' ||
    value === 'rank' ||
    value === 'catalog'
  ) {
    return value
  }
  throw new Error(`Unsupported monitoring category "${value}".`)
}

function readSeverity(value: string | null): MonitoringSeverity | 'ALL' | undefined {
  if (!value) return undefined
  if (
    value === 'ALL' ||
    value === 'critical' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low'
  ) {
    return value
  }
  throw new Error(`Unsupported monitoring severity "${value}".`)
}

function readSnapshotTimestamp(value: string | null): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error('Unsupported monitoring snapshot filter "".')
  }

  return trimmed
}
