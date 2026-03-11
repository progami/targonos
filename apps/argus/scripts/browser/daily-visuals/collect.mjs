#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const DEST =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring/Daily/Visuals'
const LOG = '/tmp/daily-visuals.log'
const TODAY = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname)
const NODE_BIN = process.execPath
const CAPTURE_CHILD_TIMEOUT_MS = 210_000

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
    process.exit(1)
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
    process.exit(1)
  }
}

function identifySize(filePath) {
  const dims = runFile('magick', ['identify', '-format', '%w %h', filePath]).trim()
  const [widthRaw, heightRaw] = dims.split(/\s+/)
  const width = Number(widthRaw)
  const height = Number(heightRaw)
  if (!width || !height) {
    throw new Error(`Failed to parse screenshot dimensions: ${dims}`)
  }
  return { width, height }
}

function cropScreenshot(sourcePath, destDir, width, height) {
  const partHeight = Math.floor(height / 4)
  for (let index = 1; index <= 4; index += 1) {
    const top = (index - 1) * partHeight
    const cropHeight = index === 4 ? height - top : partHeight
    runFile('magick', [
      sourcePath,
      '-crop',
      `${width}x${cropHeight}+0+${top}`,
      '+repage',
      path.join(destDir, `part${index}.png`),
    ])
  }
}

function captureListing(asin, brand) {
  const destDir = path.join(DEST, brand, asin, TODAY)
  fs.mkdirSync(destDir, { recursive: true })

  const tmpPng = path.join(os.tmpdir(), `${asin}.png`)
  try {
    log(`Capturing ${brand} (${asin})`)
    runFile(NODE_BIN, [path.join(SCRIPT_DIR, 'capture.mjs'), '--asin', asin, '--output', tmpPng], {
      timeout: CAPTURE_CHILD_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    })

    const { width, height } = identifySize(tmpPng)
    cropScreenshot(tmpPng, destDir, width, height)
    log(`Saved: ${brand}/${asin}/${TODAY}/part{1..4}.png`)
    return true
  } catch (error) {
    appendErrorOutput(error)
    log(`WARNING: Daily visuals failed for ${brand} (${asin})`)
    return false
  } finally {
    fs.rmSync(tmpPng, { force: true })
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

function main() {
  ensureBinary('node')
  ensureBinary('magick')
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
    process.exit(1)
  }
}

main()
