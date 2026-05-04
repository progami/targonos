const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  loadEnvAndResolvePort,
  parsePortFromEnvText,
  resolvePortFromAppEnv,
} = require('./run-next-port.js')

test('parsePortFromEnvText returns the configured port', () => {
  assert.equal(parsePortFromEnvText('NODE_ENV=development\nPORT=41208\n'), 41208)
})

test('parsePortFromEnvText ignores comments and blank lines', () => {
  assert.equal(parsePortFromEnvText('\n# comment\nPORT=41210\n'), 41210)
})

test('resolvePortFromAppEnv returns the exact app env port', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-next-port-'))
  fs.writeFileSync(path.join(appDir, '.env.local'), 'PORT=41216\n', 'utf8')
  fs.writeFileSync(path.join(appDir, '.env.production'), 'PORT=51216\n', 'utf8')

  assert.equal(resolvePortFromAppEnv(appDir), 41216)
})

test('resolvePortFromAppEnv fails when no app env port exists', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-next-port-'))
  assert.throws(
    () => resolvePortFromAppEnv(appDir),
    /PORT must be defined in an app env file/,
  )
})

test('loadEnvAndResolvePort loads shared and app local env before resolving port', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'run-next-port-repo-'))
  const appDir = path.join(repoRoot, 'apps/talos')
  fs.mkdirSync(path.join(repoRoot, 'env'), { recursive: true })
  fs.mkdirSync(appDir, { recursive: true })
  fs.writeFileSync(path.join(repoRoot, 'env/shared.local.env'), 'AMAZON_REFRESH_TOKEN_US=shared\n', 'utf8')
  fs.writeFileSync(path.join(appDir, '.env.local'), 'PORT=41218\n', 'utf8')

  const targetEnv = {}
  const port = loadEnvAndResolvePort({
    repoRoot,
    appName: 'talos',
    appDir,
    targetEnv,
  })

  assert.equal(port, 41218)
  assert.equal(targetEnv.AMAZON_REFRESH_TOKEN_US, 'shared')
  assert.equal(targetEnv.PORT, '41218')
})
