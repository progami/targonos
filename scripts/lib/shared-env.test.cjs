const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  getEnvFileSelection,
  loadEnvForApp,
  parseBwRef,
  validateSharedEnvEntries,
} = require('./shared-env.cjs')

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, text, 'utf8')
}

function tempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shared-env-'))
}

test('getEnvFileSelection uses exact env files for each mode', () => {
  const repoRoot = '/repo'

  assert.deepEqual(getEnvFileSelection({ repoRoot, appName: 'talos', mode: 'local' }), {
    sharedEnvPath: '/repo/env/shared.local.env',
    appEnvPath: '/repo/apps/talos/.env.local',
  })
  assert.deepEqual(getEnvFileSelection({ repoRoot, appName: 'talos', mode: 'dev' }), {
    sharedEnvPath: '/repo/env/shared.dev.env',
    appEnvPath: '/repo/apps/talos/.env.dev',
  })
  assert.deepEqual(getEnvFileSelection({ repoRoot, appName: 'talos', mode: 'production' }), {
    sharedEnvPath: '/repo/env/shared.production.env',
    appEnvPath: '/repo/apps/talos/.env.production',
  })
  assert.deepEqual(getEnvFileSelection({ repoRoot, appName: 'talos', mode: 'ci' }), {
    sharedEnvPath: '/repo/env/shared.dev.ci.env',
    appEnvPath: '/repo/apps/talos/.env.dev.ci',
  })
})

test('loadEnvForApp fails when the selected shared env file is missing', () => {
  const repoRoot = tempRepo()
  writeFile(path.join(repoRoot, 'apps/talos/.env.local'), 'PORT=4100\n')

  assert.throws(
    () => loadEnvForApp({ repoRoot, appName: 'talos', mode: 'local', targetEnv: {} }),
    /Missing required shared env file: .*env\/shared\.local\.env/
  )
})

test('loadEnvForApp fails when the selected app env file is missing', () => {
  const repoRoot = tempRepo()
  writeFile(path.join(repoRoot, 'env/shared.local.env'), 'AMAZON_REFRESH_TOKEN_US=shared\n')

  assert.throws(
    () => loadEnvForApp({ repoRoot, appName: 'talos', mode: 'local', targetEnv: {} }),
    /Missing required app env file: .*apps\/talos\/.env\.local/
  )
})

test('loadEnvForApp fails on duplicate shared and app env keys', () => {
  const repoRoot = tempRepo()
  writeFile(path.join(repoRoot, 'env/shared.local.env'), 'AMAZON_REFRESH_TOKEN_US=shared\n')
  writeFile(path.join(repoRoot, 'apps/talos/.env.local'), 'AMAZON_REFRESH_TOKEN_US=app\n')

  assert.throws(
    () => loadEnvForApp({ repoRoot, appName: 'talos', mode: 'local', targetEnv: {} }),
    /Duplicate env key AMAZON_REFRESH_TOKEN_US/
  )
})

test('validateSharedEnvEntries rejects public and app-owned keys', () => {
  const entries = new Map([
    ['NEXT_PUBLIC_APP_URL', 'https://example.test/talos'],
    ['DATABASE_URL', 'postgresql://localhost:5432/portal_db'],
    ['QBO_CLIENT_ID', 'client'],
  ])

  assert.deepEqual(validateSharedEnvEntries(entries, 'env/shared.local.env'), [
    'env/shared.local.env: NEXT_PUBLIC_APP_URL is not allowed in shared env',
    'env/shared.local.env: DATABASE_URL is not allowed in shared env',
    'env/shared.local.env: QBO_CLIENT_ID is not allowed in shared env',
  ])
})

test('validateSharedEnvEntries allows tenant Amazon SP-API app credential keys', () => {
  const entries = new Map([
    ['AMAZON_SP_APP_CLIENT_ID_US', 'client-id-us'],
    ['AMAZON_SP_APP_CLIENT_ID_UK', 'client-id-uk'],
    ['AMAZON_SP_APP_CLIENT_SECRET_US', 'client-secret-us'],
    ['AMAZON_SP_APP_CLIENT_SECRET_UK', 'client-secret-uk'],
  ])

  assert.deepEqual(validateSharedEnvEntries(entries, 'env/shared.local.env'), [])
})

test('parseBwRef decodes Bitwarden item and field names', () => {
  assert.deepEqual(
    parseBwRef('bw://Amazon%20SP-API%20credentials%20-%20plutus/AMAZON_REFRESH_TOKEN_US'),
    {
      itemName: 'Amazon SP-API credentials - plutus',
      fieldName: 'AMAZON_REFRESH_TOKEN_US',
    }
  )
})

test('loadEnvForApp resolves bw refs before export', () => {
  const repoRoot = tempRepo()
  writeFile(
    path.join(repoRoot, 'env/shared.local.env'),
    'AMAZON_REFRESH_TOKEN_US=bw://Amazon%20SP-API%20credentials%20-%20plutus/AMAZON_REFRESH_TOKEN_US\n'
  )
  writeFile(path.join(repoRoot, 'apps/talos/.env.local'), 'PORT=4100\n')

  const targetEnv = {}
  loadEnvForApp({
    repoRoot,
    appName: 'talos',
    mode: 'local',
    targetEnv,
    resolveBitwardenRef(ref) {
      assert.equal(ref, 'bw://Amazon%20SP-API%20credentials%20-%20plutus/AMAZON_REFRESH_TOKEN_US')
      return 'resolved-token'
    },
  })

  assert.equal(targetEnv.AMAZON_REFRESH_TOKEN_US, 'resolved-token')
  assert.equal(targetEnv.PORT, '4100')
})
