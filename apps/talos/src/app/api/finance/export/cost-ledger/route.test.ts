import assert from 'node:assert/strict'
import test from 'node:test'

async function loadRouteModule() {
  process.env.NEXT_PUBLIC_APP_URL = 'https://os.targonglobal.com/talos'
  process.env.PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.NEXT_PUBLIC_PORTAL_AUTH_URL = 'https://os.targonglobal.com'
  process.env.NEXTAUTH_URL = 'https://os.targonglobal.com/talos'
  process.env.NEXTAUTH_SECRET = 'test-nextauth-secret'
  process.env.PORTAL_AUTH_SECRET = 'test-portal-auth-secret'
  process.env.COOKIE_DOMAIN = 'localhost'

  return import('./route')
}

test('cost-ledger export builds a self-fetch URL inside the Talos base path', async () => {
  const { buildCostLedgerRequestUrl } = await loadRouteModule()

  const requestUrl =
    'https://os.targonglobal.com/talos/api/finance/export/cost-ledger?startDate=2026-04-01&endDate=2026-04-30&groupBy=week&warehouseCode=LAX'

  const result = buildCostLedgerRequestUrl(requestUrl)

  assert.equal(
    result,
    'https://os.targonglobal.com/talos/api/finance/cost-ledger?startDate=2026-04-01&endDate=2026-04-30&groupBy=week&warehouseCode=LAX'
  )
})
