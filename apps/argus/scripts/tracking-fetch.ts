/**
 * Cron script: POSTs to /api/tracking/fetch to trigger an hourly data fetch.
 * Run via: pnpm tsx scripts/tracking-fetch.ts
 * Or via launchd plist for automated hourly runs.
 */

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://os.targonglobal.com/argus'
const MARKET = parseMarket(readMarketArg())
const LOG_PATH = logPathForMarket(MARKET)
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const REPO_ROOT = path.resolve(SCRIPT_DIR, '../../..')
const RUN_LOG_WRITER = path.join(SCRIPT_DIR, 'lib/write-monitoring-run-log.mjs')

function readMarketArg(): string | undefined {
  const argv = process.argv.slice(2)
  const index = argv.indexOf('--market')
  if (index < 0) return process.env.ARGUS_MARKET
  return argv[index + 1]
}

function parseMarket(raw: string | undefined): 'us' | 'uk' {
  if (raw === undefined) return 'us'
  const value = String(raw).trim().toLowerCase()
  if (value === '') return 'us'
  if (value === 'us') return 'us'
  if (value === 'uk') return 'uk'
  throw new Error(`Unsupported Argus market: ${raw}`)
}

function logPathForMarket(market: 'us' | 'uk'): string {
  if (market === 'us') return '/tmp/argus-tracking-fetch.log'
  return `/tmp/argus-tracking-fetch-${market}.log`
}

function loadEnvFile(file: string) {
  if (!fs.existsSync(file)) return

  const rawLines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const rawLine of rawLines) {
    for (const line of rawLine.split(/\\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const separator = trimmed.indexOf('=')
      if (separator < 0) continue

      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (value.endsWith('$')) value = value.slice(0, -1)

      if (!process.env[key]) process.env[key] = value
    }
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (error.stack) return error.stack
    return error.message
  }

  return String(error)
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function writeRunLog(options: {
  status: 'ok' | 'failed'
  summary: string
  startedAt: Date
  finishedAt: Date
  errorMessage?: string
}) {
  const args = [
    RUN_LOG_WRITER,
    '--job-id',
    'tracking-fetch',
    '--market',
    MARKET,
    '--status',
    options.status,
    '--summary',
    options.summary,
    '--duration-ms',
    String(options.finishedAt.getTime() - options.startedAt.getTime()),
    '--timestamp',
    options.finishedAt.toISOString(),
    '--started-at',
    options.startedAt.toISOString(),
    '--finished-at',
    options.finishedAt.toISOString(),
    '--host',
    os.hostname(),
    '--log-path',
    LOG_PATH,
  ]

  if (options.errorMessage) {
    args.push('--error-message', options.errorMessage)
  }

  execFileSync(process.execPath, args, { stdio: 'inherit' })
}

async function main() {
  const startedAt = new Date()
  let status: 'ok' | 'failed' = 'failed'
  let summary = 'Tracking fetch failed.'
  let errorMessage: string | undefined
  let pendingError: unknown = null

  loadEnvFile(path.join(REPO_ROOT, 'apps/argus/.env.local'))

  try {
    const token = process.env.ARGUS_TRACKING_FETCH_TOKEN?.trim()
    if (!token) {
      throw new Error('Missing ARGUS_TRACKING_FETCH_TOKEN (expected in apps/argus/.env.local)')
    }

    const url = `${APP_URL.replace(/\/+$/g, '')}/api/tracking/fetch?market=${MARKET}`
    console.log(`[tracking-fetch] POSTing to ${url}`)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ triggeredBy: 'cron', market: MARKET }),
    })

    const json = await res.json()
    console.log(`[tracking-fetch] Status: ${res.status}`)
    console.log(`[tracking-fetch] Result:`, JSON.stringify(json, null, 2))

    if (!res.ok) {
      const message =
        readString((json as { error?: unknown }).error) ??
        `Tracking fetch failed with status ${res.status}.`
      throw new Error(message)
    }

    const asinCount = readNumber((json as { asinCount?: unknown }).asinCount)
    const runId = readString((json as { runId?: unknown }).runId)
    status = 'ok'
    summary =
      asinCount === null
        ? 'Tracking fetch completed successfully.'
        : runId
          ? `Tracking fetch completed successfully for ${asinCount} ASINs (${runId}).`
          : `Tracking fetch completed successfully for ${asinCount} ASINs.`
  } catch (error) {
    pendingError = error
    errorMessage = formatError(error)
    summary = `Tracking fetch failed: ${errorMessage}`
  }

  writeRunLog({
    status,
    summary,
    startedAt,
    finishedAt: new Date(),
    errorMessage,
  })

  if (pendingError) {
    throw pendingError
  }
}

main()
