import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../../../../')

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return

  const rawLines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  for (const rawLine of rawLines) {
    for (const line of rawLine.split(/\\\\n|\\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const separator = trimmed.indexOf('=')
      if (separator < 0) continue

      const key = trimmed.slice(0, separator).trim()
      let value = trimmed.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  }
}

function loadArgusEnv() {
  loadEnvFile(path.join(REPO_ROOT, 'apps/argus/.env.local'))
}

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

function parseMarket(raw) {
  if (raw === null) return 'us'
  const value = String(raw).trim().toLowerCase()
  if (value === '') return 'us'
  if (value === 'us') return 'us'
  if (value === 'uk') return 'uk'
  throw new Error(`Unsupported market: ${raw}`)
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env var: ${name}`)
  }
  return value.trim()
}

function monitoringRootForMarket(market) {
  const salesRoot = requireEnv(`ARGUS_SALES_ROOT_${market.toUpperCase()}`)
  return path.join(salesRoot, 'Monitoring')
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
  loadArgusEnv()
  const argv = process.argv.slice(2)
  const market = parseMarket(readFlag(argv, '--market'))
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

  const targetPath = path.join(monitoringRootForMarket(market), 'Logs', jobId, 'run-log.jsonl')
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
