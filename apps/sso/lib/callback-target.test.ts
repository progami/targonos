import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MODULE_URL = pathToFileURL(path.resolve(process.cwd(), 'apps/sso/lib/callback-target.ts')).href
const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_CWD = process.cwd()

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

function createTempWorkspace(config?: object) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sso-callback-target-test-'))
  if (config) {
    fs.writeFileSync(path.join(dir, 'dev.local.apps.json'), JSON.stringify(config, null, 2))
  }
  return dir
}

async function importFreshCallbackTargetModule(cwd: string) {
  process.chdir(cwd)
  return import(`${MODULE_URL}?t=${Date.now()}-${Math.random()}`)
}

test.afterEach(() => {
  process.chdir(ORIGINAL_CWD)
  resetEnv()
})

test('resolvePortalCallbackTarget accepts a hosted registered app target', async () => {
  Object.assign(process.env, { NODE_ENV: 'production' })
  process.env.PORTAL_APPS_BASE_URL = 'https://os.targonglobal.com'

  const cwd = createTempWorkspace()
  const mod = await importFreshCallbackTargetModule(cwd)

  assert.equal(
    mod.resolvePortalCallbackTarget({
      targetUrl: 'https://os.targonglobal.com/argus/wpr',
      portalBaseUrl: 'https://os.targonglobal.com',
    }),
    'https://os.targonglobal.com/argus/wpr',
  )
})

test('resolvePortalCallbackTarget rejects sibling hosts outside the app registry', async () => {
  Object.assign(process.env, { NODE_ENV: 'production' })
  process.env.PORTAL_APPS_BASE_URL = 'https://os.targonglobal.com'

  const cwd = createTempWorkspace()
  const mod = await importFreshCallbackTargetModule(cwd)

  assert.equal(
    mod.resolvePortalCallbackTarget({
      targetUrl: 'https://evil.targonglobal.com/argus/wpr',
      portalBaseUrl: 'https://os.targonglobal.com',
    }),
    null,
  )
})

test('resolvePortalCallbackTarget accepts a registered local dev app target', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3200'

  const cwd = createTempWorkspace({
    host: 'http://localhost',
    apps: {
      argus: 3216,
    },
  })
  const mod = await importFreshCallbackTargetModule(cwd)

  assert.equal(
    mod.resolvePortalCallbackTarget({
      targetUrl: 'http://localhost:3216/argus/wpr',
      portalBaseUrl: 'http://localhost:3200',
    }),
    'http://localhost:3216/argus/wpr',
  )
})

test('resolvePortalCallbackTarget rejects local targets outside the registered app path', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3200'

  const cwd = createTempWorkspace({
    host: 'http://localhost',
    apps: {
      argus: 3216,
    },
  })
  const mod = await importFreshCallbackTargetModule(cwd)

  assert.equal(
    mod.resolvePortalCallbackTarget({
      targetUrl: 'http://localhost:3216/not-argus',
      portalBaseUrl: 'http://localhost:3200',
    }),
    null,
  )
})
