#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { chromium } from 'playwright'

const CAPTURE_TIMEOUT_MS = 180_000
const CLOSE_TIMEOUT_MS = 5_000
const PART_COUNT = 4
const PART_WIDTH = 1400
const PART_HEIGHT = 4300

function argValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return null
  return process.argv[index + 1] ?? null
}

function requiredArg(name, value) {
  if (!value) throw new Error(`Missing required arg: ${name}`)
  return value
}

function buildOutputPath(outputDir, date, partIndex) {
  return path.join(outputDir, `part${partIndex}`, `${date}.png`)
}

function ensureOutputDirs(outputDir) {
  for (let partIndex = 1; partIndex <= PART_COUNT; partIndex += 1) {
    fs.mkdirSync(path.join(outputDir, `part${partIndex}`), { recursive: true })
  }
}

async function waitForNextPaint(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      }),
  )
}

async function captureParts(page, outputDir, date) {
  for (let partIndex = 1; partIndex <= PART_COUNT; partIndex += 1) {
    const scrollTop = (partIndex - 1) * PART_HEIGHT
    await page.evaluate((top) => {
      window.scrollTo(0, top)
    }, scrollTop)
    await waitForNextPaint(page)
    await page.screenshot({
      path: buildOutputPath(outputDir, date, partIndex),
      timeout: 30_000,
    })
  }
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

async function closeContextWithTimeout(context) {
  let timeoutId
  try {
    await Promise.race([
      context.close(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`Closing browser context timed out after ${CLOSE_TIMEOUT_MS}ms`))
        }, CLOSE_TIMEOUT_MS)
        if (typeof timeoutId.unref === 'function') timeoutId.unref()
      }),
    ])
  } finally {
    clearTimeout(timeoutId)
  }
}

async function main() {
  const asin = requiredArg('--asin', argValue('--asin'))
  const outputDir = requiredArg('--output-dir', argValue('--output-dir'))
  const date = requiredArg('--date', argValue('--date'))

  ensureOutputDirs(outputDir)

  const url = `https://www.amazon.com/dp/${encodeURIComponent(asin)}`

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-daily-visuals-'))
  let captureCompleted = false
  let captureError = null
  let stage = 'launch'
  let timeoutId
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Capture timed out after ${CAPTURE_TIMEOUT_MS}ms for ${asin} during ${stage}`))
      }, CAPTURE_TIMEOUT_MS)
      if (typeof timeoutId.unref === 'function') timeoutId.unref()
    })

    await Promise.race([
      (async () => {
        const context = await chromium.launchPersistentContext(userDataDir, {
          headless: true,
          channel: 'chrome',
          viewport: { width: PART_WIDTH, height: PART_HEIGHT },
          deviceScaleFactor: 1,
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          locale: 'en-US',
        })
        try {
          stage = 'page'
          const page = context.pages()[0] ?? await context.newPage()
          page.setDefaultTimeout(90_000)
          page.setDefaultNavigationTimeout(90_000)

          await page.route('**/*', (route) => {
            if (route.request().resourceType() === 'media') return route.abort()
            return route.continue()
          })

          stage = 'goto'
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
          stage = 'stabilize-layout'
          await page.addStyleTag({
            content: `
              html { scroll-behavior: auto !important; }
              *, *::before, *::after {
                animation: none !important;
                transition: none !important;
              }
            `,
          })

          stage = 'capture-parts'
          await captureParts(page, outputDir, date)
          captureCompleted = true
        } catch (error) {
          captureError = error
          throw error
        } finally {
          stage = 'close-context'
          try {
            await closeContextWithTimeout(context)
          } catch (error) {
            if (!captureCompleted && !captureError) {
              throw error
            }
          }
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
