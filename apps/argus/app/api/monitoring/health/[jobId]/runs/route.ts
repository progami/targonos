import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const MONITORING_BASE =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring'

const JOB_LOG_PATHS: Record<string, string> = {
  'tracking-fetch': path.join(MONITORING_BASE, 'Logs/tracking-fetch/run-log.jsonl'),
  'hourly-listing-attributes-api': path.join(MONITORING_BASE, 'Logs/hourly-listing-attributes-api/run-log.jsonl'),
  'daily-account-health': path.join(MONITORING_BASE, 'Logs/daily-account-health/run-log.jsonl'),
  'daily-visuals': path.join(MONITORING_BASE, 'Logs/daily-visuals/run-log.jsonl'),
  'weekly-api-sources': path.join(MONITORING_BASE, 'Logs/weekly-api-sources/run-log.jsonl'),
  'weekly-browser-sources': path.join(MONITORING_BASE, 'Logs/weekly-browser-sources/run-log.jsonl'),
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const logPath = JOB_LOG_PATHS[jobId]

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
