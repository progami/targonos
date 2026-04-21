const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { parsePortFromEnvText, resolvePortFromAppEnv } = require('./run-next-port.js')

test('parsePortFromEnvText returns the configured port', () => {
  assert.equal(parsePortFromEnvText('NODE_ENV=development\nPORT=41208\n'), 41208)
})

test('parsePortFromEnvText ignores comments and blank lines', () => {
  assert.equal(parsePortFromEnvText('\n# comment\nPORT=41210\n'), 41210)
})

test('resolvePortFromAppEnv prefers the app env file over the fallback port', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-next-port-'))
  fs.writeFileSync(path.join(appDir, '.env.local'), 'PORT=41216\n', 'utf8')

  assert.equal(resolvePortFromAppEnv(appDir, 3216), 41216)
})

test('resolvePortFromAppEnv returns the fallback port when no env file exists', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-next-port-'))
  assert.equal(resolvePortFromAppEnv(appDir, 3214), 3214)
})
