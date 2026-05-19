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

function createTempWorkspaceWithWorktreeConfig(config: object) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sso-apps-worktree-test-'))
  const generatedDir = path.join(dir, '.codex', 'generated')
  fs.mkdirSync(generatedDir, { recursive: true })
  fs.writeFileSync(
    path.join(generatedDir, 'dev.worktree.apps.json'),
    JSON.stringify(config, null, 2),
  )
  return dir
}

test.afterEach(() => {
  process.chdir(ORIGINAL_CWD)
  resetEnv()
})

test('resolveAppUrl preserves the talos base path when using the local dev app map', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3000'

  const cwd = createTempWorkspace({
    host: 'http://localhost',
    apps: {
      talos: 3001,
    },
  })

  const mod = await importFreshAppsModule(cwd)
  const app = mod.ALL_APPS.find((entry: { id: string }) => entry.id === 'talos')

  assert.ok(app)
  assert.equal(mod.resolveAppUrl(app), 'http://localhost:3001/talos')
})

test('resolveAppUrl prefers the codex worktree app map when present', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3000'

  const cwd = createTempWorkspaceWithWorktreeConfig({
    host: 'http://localhost',
    apps: {
      argus: 41216,
    },
  })

  const mod = await importFreshAppsModule(cwd)
  const app = mod.ALL_APPS.find((entry: { id: string }) => entry.id === 'argus')

  assert.ok(app)
  assert.equal(mod.resolveAppUrl(app), 'http://localhost:41216/argus')
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

test('ALL_APPS does not expose legacy hardcoded devUrl fields', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3000'

  const cwd = createTempWorkspace({
    host: 'http://localhost',
    apps: {
      talos: 3001,
      atlas: 3006,
      website: 3005,
      kairos: 3010,
      hermes: 3014,
      argus: 3016,
    },
  })

  const mod = await importFreshAppsModule(cwd)

  for (const app of mod.ALL_APPS) {
    assert.equal(
      Object.prototype.hasOwnProperty.call(app, 'devUrl'),
      false,
      `${app.id} should resolve dev URLs from the app map, not a hardcoded devUrl field`,
    )
  }
})

test('ALL_APPS marks only Website and Argus as active by default', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3000'

  const cwd = createTempWorkspace({
    host: 'http://localhost',
    apps: {
      talos: 3001,
      atlas: 3006,
      website: 3005,
      kairos: 3010,
      hermes: 3014,
      argus: 3016,
    },
  })

  const mod = await importFreshAppsModule(cwd)
  const lifecycles = Object.fromEntries(
    mod.ALL_APPS.map((app: { id: string; lifecycle: string }) => [app.id, app.lifecycle]),
  )

  assert.deepEqual(lifecycles, {
    talos: 'dev',
    atlas: 'dev',
    website: 'active',
    kairos: 'dev',
    hermes: 'dev',
    argus: 'active',
  })
})

test('ALL_APPS does not expose Plutus as a portal-owned app', async () => {
  Object.assign(process.env, { NODE_ENV: 'development' })
  process.env.PORTAL_APPS_BASE_URL = 'http://localhost:3000'

  const cwd = createTempWorkspace({
    host: 'http://localhost',
    apps: {
      talos: 3001,
      atlas: 3006,
      website: 3005,
      kairos: 3010,
      hermes: 3014,
      argus: 3016,
    },
  })

  const mod = await importFreshAppsModule(cwd)

  assert.equal(
    mod.ALL_APPS.some((entry: { id: string }) => entry.id === 'plutus'),
    false,
  )
})
