import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from '@playwright/test'

const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
const atlasEnvPath = path.resolve(__dirname, '..', '.env.local')

if (!fs.existsSync(atlasEnvPath)) {
  throw new Error(`Atlas test env file is missing: ${atlasEnvPath}`)
}

const atlasEnvText = fs.readFileSync(atlasEnvPath, 'utf8')

for (const line of atlasEnvText.split(/\r?\n/)) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed.startsWith('#')) {
    continue
  }

  const match = ENV_ASSIGNMENT.exec(trimmed)
  if (!match) {
    throw new Error(`Atlas test env file contains an invalid line: ${trimmed}`)
  }

  const [, key, rawValue] = match
  process.env[key] = rawValue.trim()
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
  },
  reporter: [['list']],
})
