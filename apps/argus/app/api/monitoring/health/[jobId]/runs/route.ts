import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { getArgusMarketConfig, parseArgusMarket, type ArgusMarket } from '@/lib/argus-market'

export const dynamic = 'force-dynamic'

const JOB_LOG_DIRS: Record<string, string> = {
  'tracking-fetch': 'tracking-fetch',
  'hourly-listing-attributes-api': 'hourly-listing-attributes-api',
  'daily-account-health': 'daily-account-health',
  'daily-visuals': 'daily-visuals',
  'weekly-api-sources': 'weekly-api-sources',
  'weekly-browser-sources': 'weekly-browser-sources',
}

function resolveJobLogPath(jobId: string, market: ArgusMarket): string | null {
  const logDir = JOB_LOG_DIRS[jobId]
  if (logDir === undefined) {
    return null
  }

  return path.join(getArgusMarketConfig(market).monitoringRoot, 'Logs', logDir, 'run-log.jsonl')
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const { searchParams } = new URL(request.url)
  const market = parseArgusMarket(searchParams.get('market'))
  const logPath = resolveJobLogPath(jobId, market)

  if (!logPath) {
    return NextResponse.json([])
  }

  try {
    const content = await fs.readFile(logPath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const entries = lines
      .map((line) => {
        try { return JSON.parse(line) }
        catch { return null }
      })
      .filter(Boolean)

    // Return last 10, newest first
    return NextResponse.json(entries.slice(-10).reverse())
  } catch {
    // File doesn't exist yet — no run history
    return NextResponse.json([])
  }
}
