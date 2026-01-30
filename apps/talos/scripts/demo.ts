#!/usr/bin/env npx tsx

/**
 * Demo Seed Script
 * Uses public API endpoints to create demo users, warehouses, cost rates,
 * purchase orders, and inventory transactions. No direct database access.
 */

const args = process.argv.slice(2)
const baseUrl = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL
if (!baseUrl) {
  throw new Error('Set BASE_URL or NEXT_PUBLIC_APP_URL before running the Talos demo script.')
}
const force = !args.includes('--no-force')
const verbose = args.includes('--verbose')

async function main() {
  const setupUrl = new URL('/api/demo/setup', baseUrl)
  if (force) {
    setupUrl.searchParams.set('force', 'true')
  }

  console.log('==================================================')
  console.log('TALOS DEMO DATA SEED (API)')
  console.log('==================================================')
  console.log(`Target: ${setupUrl.toString()}`)
  console.log(`Force recreate: ${force ? 'yes' : 'no (existing demo data kept)'}`)
  console.log('==================================================\n')

  const response = await fetch(setupUrl.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Demo setup failed (${response.status}): ${body}`)
  }

  const payload = await response.json()
  if (verbose) {
    console.log(JSON.stringify(payload, null, 2))
  }

  if (!payload?.success) {
    throw new Error(payload?.message || 'Demo setup did not complete successfully')
  }

  console.log('==================================================')
  console.log('✅ DEMO DATA READY')
  console.log('==================================================')
  if (payload.transactionsCreated !== undefined) {
    console.log(`Transactions created: ${payload.transactionsCreated}`)
  }
  if (payload.message) {
    console.log(payload.message)
  }
  console.log('==================================================\n')
  console.log('Next steps:')
  console.log('  • Open /operations/inventory to review purchase orders and stock levels')
  console.log('  • Open /operations/transactions to inspect RECEIVE/SHIP history')
  console.log('==================================================')
}

main().catch(error => {
  console.error('Demo seed failed:', error)
  process.exit(1)
})

export {}
