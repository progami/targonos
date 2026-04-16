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

  return import('./[id]/route')
}

test('transaction delete builds a validation URL inside the Talos base path', async () => {
  const { buildTransactionValidationUrl } = await loadRouteModule()

  const result = buildTransactionValidationUrl(
    'https://os.targonglobal.com/talos/api/transactions/tx_123'
  )

  assert.equal(result, 'https://os.targonglobal.com/talos/api/transactions/tx_123/validate-edit')
})
