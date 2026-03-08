#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

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
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0
      const distance = Math.max(400, Math.floor(window.innerHeight * 0.8))
      const timer = window.setInterval(() => {
        window.scrollBy(0, distance)
        totalHeight += distance
        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
          window.clearInterval(timer)
          resolve(undefined)
        }
      }, 450)
    })
  })
}

async function main() {
  const asin = requiredArg('--asin', argValue('--asin'))
  const outputPath = requiredArg('--output', argValue('--output'))

  const outputDir = path.dirname(outputPath)
  fs.mkdirSync(outputDir, { recursive: true })

  const url = `https://www.amazon.com/dp/${encodeURIComponent(asin)}`

  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  })
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    locale: 'en-US',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(90_000)

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('#productTitle', { timeout: 60_000 })

    // Trigger lazy-loaded sections (reviews, A+ / EBD, etc.)
    await page.waitForTimeout(1500)
    await autoScroll(page)
    await page.waitForTimeout(1500)

    await page.screenshot({ path: outputPath, fullPage: true })
  } finally {
    await context.close().catch(() => {})
    await browser.close().catch(() => {})
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})
