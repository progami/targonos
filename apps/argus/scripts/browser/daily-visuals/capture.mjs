#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const CAPTURE_TIMEOUT_MS = 180_000
const AUTOSCROLL_MAX_MS = 25_000

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

function requiredArg(name, value) {
  if (!value) throw new Error(`Missing required arg: ${name}`)
  return value
}

async function autoScroll(page) {
  await page.evaluate(async (maxDurationMs) => {
    await new Promise((resolve) => {
      const start = Date.now()
      const distance = Math.max(600, Math.floor(window.innerHeight * 0.9))
      let lastScrollTop = window.scrollY
      const timer = window.setInterval(() => {
        window.scrollBy(0, distance)
        const scrollTop = window.scrollY
        const reachedBottom = scrollTop + window.innerHeight >= document.body.scrollHeight - 2
        const stalled = scrollTop === lastScrollTop
        lastScrollTop = scrollTop

        if (reachedBottom || stalled || Date.now() - start >= maxDurationMs) {
          window.clearInterval(timer)
          resolve(undefined)
        }
      }, 250)
    })
  }, AUTOSCROLL_MAX_MS)
}

function killChromeForUserDataDir(userDataDir) {
  try {
    execFileSync('pkill', ['-TERM', '-f', userDataDir], { stdio: 'ignore' })
  } catch (error) {
    if (error.status !== 1) throw error
  }

  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000)

  try {
    execFileSync('pkill', ['-KILL', '-f', userDataDir], { stdio: 'ignore' })
  } catch (error) {
    if (error.status !== 1) throw error
  }
}

async function main() {
  const asin = requiredArg('--asin', argValue('--asin'))
  const outputPath = requiredArg('--output', argValue('--output'))

  const outputDir = path.dirname(outputPath)
  fs.mkdirSync(outputDir, { recursive: true })

  const url = `https://www.amazon.com/dp/${encodeURIComponent(asin)}`

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-daily-visuals-'))
  let timeoutId
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Capture timed out after ${CAPTURE_TIMEOUT_MS}ms for ${asin}`))
      }, CAPTURE_TIMEOUT_MS)
      if (typeof timeoutId.unref === 'function') timeoutId.unref()
    })

    await Promise.race([
      (async () => {
        const context = await chromium.launchPersistentContext(userDataDir, {
          headless: true,
          channel: 'chrome',
          viewport: { width: 1400, height: 900 },
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          locale: 'en-US',
        })
        try {
          const page = context.pages()[0] ?? await context.newPage()
          page.setDefaultTimeout(90_000)
          page.setDefaultNavigationTimeout(90_000)

          await page.route('**/*', (route) => {
            if (route.request().resourceType() === 'media') return route.abort()
            return route.continue()
          })

          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
          await page.waitForSelector('#productTitle', { timeout: 60_000 })

          await page.waitForTimeout(1500)
          await autoScroll(page)
          await page.waitForTimeout(1500)

          await page.screenshot({ path: outputPath, fullPage: true, timeout: 30_000 })
        } finally {
          await context.close().catch(() => {})
        }
      })(),
      timeoutPromise,
    ])
  } finally {
    clearTimeout(timeoutId)
    killChromeForUserDataDir(userDataDir)
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
