#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { sendArgusAlertEmail } from '../../lib/alert-email.mjs'

const DEST =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Daily/Visuals (Browser)'
const LOG = '/tmp/daily-visuals.log'
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const NODE_BIN = process.execPath
const RUN_LOG_WRITER = path.join(SCRIPT_DIR, '../../lib/write-monitoring-run-log.mjs')
const CAPTURE_CHILD_TIMEOUT_MS = 210_000
const MAX_CAPTURE_ATTEMPTS = 2
const RUN_STARTED_AT = new Date()

function log(message) {
  fs.appendFileSync(LOG, `${timestamp()} — ${message}\n`)
}

function timestamp() {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  return formatter.format(new Date()).replace(' ', ' ')
}

function ensureBinary(name) {
  try {
    execFileSync('which', [name], { stdio: 'ignore' })
  } catch {
    log(`ABORT: Required binary not found: ${name}`)
    throw new Error(`Required binary not found: ${name}`)
  }
}

function runFile(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

function appendErrorOutput(error) {
  const stderr = error?.stderr?.toString().trim()
  const stdout = error?.stdout?.toString().trim()
  if (stdout) log(stdout)
  if (stderr) log(stderr)
}

function resolveAsins() {
  try {
    const output = runFile(NODE_BIN, [path.join(SCRIPT_DIR, 'resolve-asins.mjs')])
    const rows = output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [asin, brand] = line.split('\t')
        if (!asin || !brand) {
          throw new Error(`Invalid ASIN map row: ${line}`)
        }
        return { asin, brand }
      })

    if (!rows.length) {
      throw new Error('No ASINs returned from resolve-asins.mjs')
    }

    return rows
  } catch (error) {
    appendErrorOutput(error)
    log('ABORT: resolve-asins.mjs failed')
    throw error
  }
}

function clearTodayParts(destBaseDir) {
  for (let index = 1; index <= 4; index += 1) {
    fs.rmSync(path.join(destBaseDir, `part${index}`, `${TODAY}.png`), { force: true })
  }
}

function captureListing(asin, brand) {
  const destBaseDir = path.join(DEST, brand, asin)
  for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt += 1) {
    try {
      log(`Capturing ${brand} (${asin}) [attempt ${attempt}/${MAX_CAPTURE_ATTEMPTS}]`)
      clearTodayParts(destBaseDir)
      runFile(
        NODE_BIN,
        [path.join(SCRIPT_DIR, 'capture.mjs'), '--asin', asin, '--output-dir', destBaseDir, '--date', TODAY],
        {
          timeout: CAPTURE_CHILD_TIMEOUT_MS,
          killSignal: 'SIGKILL',
        },
      )
      log(`Saved: ${brand}/${asin}/part{1..4}/${TODAY}.png`)
      return true
    } catch (error) {
      appendErrorOutput(error)
      clearTodayParts(destBaseDir)

      if (attempt === MAX_CAPTURE_ATTEMPTS) {
        log(`WARNING: Daily visuals failed for ${brand} (${asin})`)
        return false
      }

      log(`Retrying ${brand} (${asin}) after failed attempt ${attempt}`)
      sleep(2000)
    }
  }
}

function trimLog() {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n')
  const tail = lines.slice(-201).join('\n')
  fs.writeFileSync(LOG, tail.endsWith('\n') ? tail : `${tail}\n`)
}

function sleep(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

function formatError(error) {
  if (error instanceof Error) {
    if (error.stack) return error.stack
    if (error.message) return error.message
  }

  return String(error)
}

function readLogTail(maxLines) {
  const lines = fs.readFileSync(LOG, 'utf8').split('\n')
  return lines.slice(-maxLines).join('\n')
}

function writeRunLog({ status, summary, finishedAt, errorMessage }) {
  const args = [
    RUN_LOG_WRITER,
    '--job-id',
    'daily-visuals',
    '--status',
    status,
    '--summary',
    summary,
    '--duration-ms',
    String(finishedAt.getTime() - RUN_STARTED_AT.getTime()),
    '--timestamp',
    finishedAt.toISOString(),
    '--started-at',
    RUN_STARTED_AT.toISOString(),
    '--finished-at',
    finishedAt.toISOString(),
    '--host',
    os.hostname(),
    '--log-path',
    LOG,
  ]

  if (errorMessage) {
    args.push('--error-message', errorMessage)
  }

  execFileSync(NODE_BIN, args, { stdio: 'inherit' })
}

async function main() {
  ensureBinary('node')
  log(`Starting daily visuals capture: ${TODAY}`)

  const rows = resolveAsins()
  let failed = 0

  for (const { asin, brand } of rows) {
    if (!captureListing(asin, brand)) {
      failed += 1
    }
    sleep(5000)
  }

  log(`Daily visuals done (${failed} failures)`)
  trimLog()

  if (failed > 0) {
    writeRunLog({
      status: 'failed',
      summary: `Daily visuals finished with ${failed} failure(s).`,
      finishedAt: new Date(),
      errorMessage: `${failed} daily visuals capture(s) failed.`,
    })

    const subject = `Argus: Daily visuals failed (${failed})`
    const logTail = readLogTail(200)
    const text = [
      `Daily visuals capture finished with ${failed} failure(s).`,
      `Date: ${TODAY}`,
      `Host: ${os.hostname()}`,
      `Dest: ${DEST}`,
      `Log: ${LOG}`,
      '',
      'Last log lines:',
      logTail,
      '',
    ].join('\n')

    await sendArgusAlertEmail({ subject, text })
    process.exitCode = 1
    return
  }

  writeRunLog({
    status: 'ok',
    summary: 'Daily visuals completed successfully.',
    finishedAt: new Date(),
  })
}

main().catch(async (error) => {
  appendErrorOutput(error)
  log('ABORT: daily visuals script failed')
  trimLog()

  writeRunLog({
    status: 'failed',
    summary: 'Daily visuals capture aborted.',
    finishedAt: new Date(),
    errorMessage: formatError(error),
  })

  const subject = `Argus: Daily visuals aborted`
  const logTail = readLogTail(200)
  const text = [
    `Daily visuals capture aborted.`,
    `Date: ${TODAY}`,
    `Host: ${os.hostname()}`,
    `Dest: ${DEST}`,
    `Log: ${LOG}`,
    '',
    'Error:',
    formatError(error),
    '',
    'Last log lines:',
    logTail,
    '',
  ].join('\n')

  try {
    await sendArgusAlertEmail({ subject, text })
  } catch (emailError) {
    console.error(formatError(emailError))
  }

  console.error(formatError(error))
  process.exit(1)
})
