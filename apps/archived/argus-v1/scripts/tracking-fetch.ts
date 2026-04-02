/**
 * Cron script: POSTs to /api/tracking/fetch to trigger an hourly data fetch.
 * Run via: pnpm tsx scripts/tracking-fetch.ts
 * Or via launchd plist for automated hourly runs.
 */

import fs from 'node:fs'
import path from 'node:path'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://os.targonglobal.com/argus'

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

async function main() {
  loadEnvFile(path.join(process.cwd(), '.env.local'))

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
    process.exit(1)
  }
}

main()
