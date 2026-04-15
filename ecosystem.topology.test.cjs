const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')
const fs = require('fs')
const os = require('os')

const ROOT_DIR = __dirname
process.env.TARGONOS_DEV_DIR = ROOT_DIR
process.env.TARGONOS_MAIN_DIR = ROOT_DIR
process.env.HOME = process.env.HOME || process.env.USERPROFILE || ROOT_DIR
process.env.PORTAL_AUTH_SECRET = process.env.PORTAL_AUTH_SECRET || 'test-hosted-shared-secret'

const ecosystem = require('./ecosystem.config.js')

const hostedAppExpectations = [
  { name: 'dev-talos', appUrl: 'https://dev-os.targonglobal.com/talos', portalUrl: 'https://dev-os.targonglobal.com' },
  { name: 'dev-atlas', appUrl: 'https://dev-os.targonglobal.com/atlas', portalUrl: 'https://dev-os.targonglobal.com' },
  { name: 'dev-xplan', appUrl: 'https://dev-os.targonglobal.com/xplan', portalUrl: 'https://dev-os.targonglobal.com' },
  { name: 'dev-kairos', appUrl: 'https://dev-os.targonglobal.com/kairos', portalUrl: 'https://dev-os.targonglobal.com' },
  { name: 'dev-plutus', appUrl: 'https://dev-os.targonglobal.com/plutus', portalUrl: 'https://dev-os.targonglobal.com' },
  { name: 'dev-hermes', appUrl: 'https://dev-os.targonglobal.com/hermes', portalUrl: 'https://dev-os.targonglobal.com' },
  { name: 'dev-argus', appUrl: 'https://dev-os.targonglobal.com/argus', portalUrl: 'https://dev-os.targonglobal.com' },
  { name: 'main-talos', appUrl: 'https://os.targonglobal.com/talos', portalUrl: 'https://os.targonglobal.com' },
  { name: 'main-atlas', appUrl: 'https://os.targonglobal.com/atlas', portalUrl: 'https://os.targonglobal.com' },
  { name: 'main-xplan', appUrl: 'https://os.targonglobal.com/xplan', portalUrl: 'https://os.targonglobal.com' },
  { name: 'main-kairos', appUrl: 'https://os.targonglobal.com/kairos', portalUrl: 'https://os.targonglobal.com' },
  { name: 'main-plutus', appUrl: 'https://os.targonglobal.com/plutus', portalUrl: 'https://os.targonglobal.com' },
  { name: 'main-hermes', appUrl: 'https://os.targonglobal.com/hermes', portalUrl: 'https://os.targonglobal.com' },
  { name: 'main-argus', appUrl: 'https://os.targonglobal.com/argus', portalUrl: 'https://os.targonglobal.com' },
]

test('hosted child apps use canonical app and portal origins', () => {
  for (const expectation of hostedAppExpectations) {
    const app = ecosystem.apps.find((entry) => entry.name === expectation.name)

    assert.ok(app, `missing app ${expectation.name}`)
    assert.equal(app.env.NEXT_PUBLIC_APP_URL, expectation.appUrl)
    assert.equal(app.env.BASE_URL, expectation.appUrl)
    assert.equal(app.env.PORTAL_AUTH_URL, expectation.portalUrl)
    assert.equal(app.env.NEXT_PUBLIC_PORTAL_AUTH_URL, expectation.portalUrl)
    assert.equal(app.env.PORTAL_APPS_BASE_URL, expectation.portalUrl)
    assert.equal(app.env.NEXT_PUBLIC_PORTAL_APPS_BASE_URL, expectation.portalUrl)
  }
})

test('hosted child apps use environment cookie domains and hosted launchers', () => {
  const devHermes = ecosystem.apps.find((app) => app.name === 'dev-hermes')
  const devArgus = ecosystem.apps.find((app) => app.name === 'dev-argus')
  const mainHermes = ecosystem.apps.find((app) => app.name === 'main-hermes')
  const mainArgus = ecosystem.apps.find((app) => app.name === 'main-argus')

  assert.ok(devHermes)
  assert.ok(devArgus)
  assert.ok(mainHermes)
  assert.ok(mainArgus)

  assert.equal(devHermes.script, 'node_modules/next/dist/bin/next')
  assert.equal(devHermes.args, 'start -p 3114')
  assert.equal(devArgus.script, '.next/standalone/apps/argus/server.js')
  assert.equal(mainHermes.script, 'node_modules/next/dist/bin/next')
  assert.equal(mainHermes.args, 'start -p 3014')
  assert.equal(mainArgus.script, '.next/standalone/apps/argus/server.js')
  assert.equal(devHermes.env.HERMES_AUTO_MIGRATE, '0')
  assert.equal(mainHermes.env.HERMES_AUTO_MIGRATE, '0')

  assert.equal(devHermes.env.COOKIE_DOMAIN, '.dev-os.targonglobal.com')
  assert.equal(devArgus.env.COOKIE_DOMAIN, '.dev-os.targonglobal.com')
  assert.equal(mainHermes.env.COOKIE_DOMAIN, '.os.targonglobal.com')
  assert.equal(mainArgus.env.COOKIE_DOMAIN, '.os.targonglobal.com')
})

test('talos hosted runtimes skip server dotenv loading', () => {
  const devTalos = ecosystem.apps.find((app) => app.name === 'dev-talos')
  const mainTalos = ecosystem.apps.find((app) => app.name === 'main-talos')

  assert.ok(devTalos)
  assert.ok(mainTalos)
  assert.equal(devTalos.env.SKIP_DOTENV, '1')
  assert.equal(mainTalos.env.SKIP_DOTENV, '1')
})

test('hosted Hermes workers load production env files', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'targonos-hermes-worker-env-'))
  const hermesDir = path.join(fixtureRoot, 'apps', 'hermes')
  fs.mkdirSync(hermesDir, { recursive: true })

  fs.writeFileSync(
    path.join(hermesDir, '.env.production'),
    [
      'DATABASE_URL=postgresql://portal_hermes:secret@localhost:5432/portal_db?schema=main_hermes',
      'HERMES_DB_SCHEMA=main_hermes',
      '',
    ].join('\n'),
  )

  try {
    const env = ecosystem.createHermesWorkerEnv(fixtureRoot, 'production', {
      NODE_ENV: 'production',
    })

    assert.equal(
      env.DATABASE_URL,
      'postgresql://portal_hermes:secret@localhost:5432/portal_db?schema=main_hermes',
    )
    assert.equal(env.HERMES_DB_SCHEMA, 'main_hermes')
    assert.equal(env.NODE_ENV, 'production')
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('hosted child app env strips local hosted overrides and uses portal-managed values', () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'targonos-hosted-env-'))
  const ssoDir = path.join(fixtureRoot, 'apps', 'sso')
  const plutusDir = path.join(fixtureRoot, 'apps', 'plutus')
  fs.mkdirSync(ssoDir, { recursive: true })
  fs.mkdirSync(plutusDir, { recursive: true })

  fs.writeFileSync(
    path.join(ssoDir, '.env.local'),
    [
      'PORTAL_AUTH_SECRET=portal-shared-secret',
      'NEXTAUTH_SECRET=portal-nextauth-secret',
      'PORTAL_DB_URL=postgresql://portal_auth:secret@localhost:5432/portal_db?schema=auth',
      'COOKIE_DOMAIN=localhost',
      'NEXTAUTH_URL=http://localhost:3200',
      '',
    ].join('\n'),
  )

  fs.writeFileSync(
    path.join(plutusDir, '.env.local'),
    [
      'PORTAL_AUTH_SECRET=wrong-plutus-secret',
      'NEXTAUTH_SECRET=wrong-plutus-secret',
      'COOKIE_DOMAIN=.targonglobal.com',
      'NEXTAUTH_URL=http://localhost:3112',
      'NEXT_PUBLIC_APP_URL=http://localhost:3112',
      'BASE_URL=http://localhost:3112',
      'NEXT_PUBLIC_VERSION=1.0.0-stale',
      'NEXT_PUBLIC_COMMIT_SHA=deadbeef',
      'BUILD_TIME=2025-01-01T00:00:00Z',
      'DATABASE_URL=postgresql://portal_dev_external:secret@localhost:6432/portal_db_dev?schema=plutus_dev&pgbouncer=true',
      '',
    ].join('\n'),
  )

  const previousEnv = {
    PORTAL_AUTH_SECRET: process.env.PORTAL_AUTH_SECRET,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXT_PUBLIC_VERSION: process.env.NEXT_PUBLIC_VERSION,
    NEXT_PUBLIC_RELEASE_URL: process.env.NEXT_PUBLIC_RELEASE_URL,
    NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA,
    BUILD_TIME: process.env.BUILD_TIME,
    NEXT_PUBLIC_BUILD_TIME: process.env.NEXT_PUBLIC_BUILD_TIME,
  }

  delete process.env.PORTAL_AUTH_SECRET
  delete process.env.NEXTAUTH_SECRET
  process.env.NEXT_PUBLIC_VERSION = '9.9.9'
  process.env.NEXT_PUBLIC_RELEASE_URL = 'https://github.com/progami/targonos/commit/test'
  process.env.NEXT_PUBLIC_COMMIT_SHA = 'feedbeef'
  process.env.BUILD_TIME = '2026-04-13T12:00:00Z'
  process.env.NEXT_PUBLIC_BUILD_TIME = '2026-04-13T12:00:00Z'

  try {
    const env = ecosystem.createNextAppEnvWithPortal(fixtureRoot, 'plutus', 'dev', {
      BASE_PATH: '/plutus',
      NEXT_PUBLIC_BASE_PATH: '/plutus',
      PORT: 3112,
    })

    assert.equal(env.PORTAL_AUTH_SECRET, 'portal-shared-secret')
    assert.equal(env.NEXTAUTH_SECRET, 'portal-shared-secret')
    assert.equal(env.PORTAL_DB_URL, 'postgresql://portal_auth:secret@localhost:5432/portal_db?schema=auth')
    assert.equal(env.COOKIE_DOMAIN, '.dev-os.targonglobal.com')
    assert.equal(env.NEXTAUTH_URL, 'https://dev-os.targonglobal.com/plutus')
    assert.equal(env.NEXT_PUBLIC_APP_URL, 'https://dev-os.targonglobal.com/plutus')
    assert.equal(env.BASE_URL, 'https://dev-os.targonglobal.com/plutus')
    assert.equal(env.NEXT_PUBLIC_VERSION, '9.9.9')
    assert.equal(env.NEXT_PUBLIC_COMMIT_SHA, 'feedbeef')
    assert.equal(env.BUILD_TIME, '2026-04-13T12:00:00Z')
    assert.equal(
      env.DATABASE_URL,
      'postgresql://portal_dev_external:secret@localhost:6432/portal_db_dev?schema=plutus_dev&pgbouncer=true',
    )
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    fs.rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
