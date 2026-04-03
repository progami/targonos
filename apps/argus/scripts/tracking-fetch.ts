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
const LOG_PATH = '/tmp/argus-tracking-fetch.log'
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const RUN_LOG_WRITER = path.join(SCRIPT_DIR, 'lib/write-monitoring-run-log.mjs')

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
    return error.stack || error.message
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

  loadEnvFile(path.join(process.cwd(), '.env.local'))

  try {
    const token = process.env.ARGUS_TRACKING_FETCH_TOKEN?.trim()
    if (!token) {
      throw new Error('Missing ARGUS_TRACKING_FETCH_TOKEN (expected in apps/argus/.env.local)')
    }

    const url = `${APP_URL}/api/tracking/fetch`
    console.log(`[tracking-fetch] POSTing to ${url}`)

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ triggeredBy: 'cron' }),
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
