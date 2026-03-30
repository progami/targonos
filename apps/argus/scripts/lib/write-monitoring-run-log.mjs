import fs from 'node:fs'
import path from 'node:path'

const MONITORING_BASE =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring'

function readFlag(argv, flag) {
  const index = argv.indexOf(flag)
  if (index < 0) return null
  return argv[index + 1] ?? null
}

function requireFlag(argv, flag) {
  const value = readFlag(argv, flag)
  if (!value || !value.trim()) {
    throw new Error(`Missing required flag: ${flag}`)
  }
  return value.trim()
}

function parseDurationMs(raw) {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid --duration-ms value: ${raw}`)
  }
  return Math.round(value)
}

function parseStatus(raw) {
  const value = String(raw).trim().toLowerCase()
  if (value !== 'ok' && value !== 'failed') {
    throw new Error(`Invalid --status value: ${raw}`)
  }
  return value
}

function parseList(raw) {
  if (!raw) return []
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
}

function parseTimestamp(raw) {
  if (!raw) return new Date().toISOString()

  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --timestamp value: ${raw}`)
  }

  return date.toISOString()
}

async function main() {
  const argv = process.argv.slice(2)
  const jobId = requireFlag(argv, '--job-id')
  const status = parseStatus(requireFlag(argv, '--status'))
  const summary = requireFlag(argv, '--summary')
  const durationMs = parseDurationMs(requireFlag(argv, '--duration-ms'))
  const timestamp = parseTimestamp(readFlag(argv, '--timestamp'))
  const errorMessage = readFlag(argv, '--error-message')?.trim() || undefined
  const startedAt = readFlag(argv, '--started-at')?.trim() || undefined
  const finishedAt = readFlag(argv, '--finished-at')?.trim() || undefined
  const host = readFlag(argv, '--host')?.trim() || undefined
  const logPath = readFlag(argv, '--log-path')?.trim() || undefined
  const failedSteps = parseList(readFlag(argv, '--failed-steps'))
  const warnSteps = parseList(readFlag(argv, '--warn-steps'))

  const entry = {
    timestamp,
    status,
    summary,
    durationMs,
    ...(errorMessage ? { errorMessage } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(finishedAt ? { finishedAt } : {}),
    ...(host ? { host } : {}),
    ...(logPath ? { logPath } : {}),
    ...(failedSteps.length > 0 ? { failedSteps } : {}),
    ...(warnSteps.length > 0 ? { warnSteps } : {}),
  }

  const targetPath = path.join(MONITORING_BASE, 'Logs', jobId, 'run-log.jsonl')
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
  await fs.promises.appendFile(targetPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

main().catch((error) => {
  if (error instanceof Error) {
    console.error(error.stack || error.message)
  } else {
    console.error(String(error))
  }
  process.exit(1)
})
