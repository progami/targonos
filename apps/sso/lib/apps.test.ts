import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MODULE_URL = pathToFileURL(path.resolve(process.cwd(), 'apps/sso/lib/apps.ts')).href
const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_CWD = process.cwd()

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    delete process.env[key]
  }
  Object.assign(process.env, ORIGINAL_ENV)
}

async function importFreshAppsModule(cwd: string) {
  process.chdir(cwd)
  return import(`${MODULE_URL}?t=${Date.now()}-${Math.random()}`)
}

function createTempWorkspace(config?: object) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sso-apps-test-'))
  if (config) {
    fs.writeFileSync(path.join(dir, 'dev.local.apps.json'), JSON.stringify(config, null, 2))
  }
  return dir
}

test.afterEach(() => {
  process.chdir(ORIGINAL_CWD)
  resetEnv()
})

test('resolveAppUrl preserves the xplan base path when using the local dev app map', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3000'

  const cwd = createTempWorkspace({
    host: 'http://localhost',
    apps: {
      xplan: 3008,
    },
  })

  const mod = await importFreshAppsModule(cwd)
  const app = mod.ALL_APPS.find((entry: { id: string }) => entry.id === 'xplan')

  assert.ok(app)
  assert.equal(mod.resolveAppUrl(app), 'http://localhost:3008/xplan')
})

test('resolveAppUrl fails loudly in development when no local app mapping exists', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3000'

  const cwd = createTempWorkspace()
  const mod = await importFreshAppsModule(cwd)
  const app = mod.ALL_APPS.find((entry: { id: string }) => entry.id === 'talos')

  assert.ok(app)
  assert.throws(
    () => mod.resolveAppUrl(app),
    /Talos local development URL is not configured/,
  )
})
