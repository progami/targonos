const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('path')

const ROOT_DIR = __dirname
process.env.TARGONOS_DEV_DIR = ROOT_DIR
process.env.TARGONOS_MAIN_DIR = ROOT_DIR
process.env.HOME = process.env.HOME || process.env.USERPROFILE || ROOT_DIR

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

test('talos hosted runtimes skip server dotenv loading', () => {
  const devTalos = ecosystem.apps.find((app) => app.name === 'dev-talos')
  const mainTalos = ecosystem.apps.find((app) => app.name === 'main-talos')

  assert.ok(devTalos)
  assert.ok(mainTalos)
  assert.equal(devTalos.env.SKIP_DOTENV, '1')
  assert.equal(mainTalos.env.SKIP_DOTENV, '1')
})
