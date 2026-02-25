/**
 * Cron script: POSTs to /api/tracking/fetch to trigger an hourly data fetch.
 * Run via: pnpm tsx scripts/tracking-fetch.ts
 * Or via launchd plist for automated hourly runs.
 */

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://os.targonglobal.com/argus'

async function main() {
  const url = `${APP_URL}/api/tracking/fetch`
  console.log(`[tracking-fetch] POSTing to ${url}`)

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
