import test from 'node:test'
import assert from 'node:assert/strict'

import {
  extractPortalVersionBadge,
  httpCodeIsAvailable,
  httpCodeIsSuccess,
  nextBuildManifestUrl,
  parseCloudflaredReady,
  parseLaunchdArguments,
  parsePm2Processes,
  processIsOnline,
} from './verify-host-stack.mjs'

test('parseCloudflaredReady returns ready connection count', () => {
  assert.equal(parseCloudflaredReady('{"readyConnections":4}'), 4)
})

test('parseCloudflaredReady rejects missing readyConnections', () => {
  assert.throws(() => parseCloudflaredReady('{}'), /readyConnections/)
})

test('http status classifiers separate internal availability from external success', () => {
  assert.equal(httpCodeIsAvailable(308), true)
  assert.equal(httpCodeIsAvailable(502), false)
  assert.equal(httpCodeIsSuccess(308), true)
  assert.equal(httpCodeIsSuccess(530), false)
})

test('parsePm2Processes indexes process entries by name', () => {
  const processes = parsePm2Processes(JSON.stringify([
    { name: 'main-targonos', pid: 123, pm2_env: { status: 'online' } },
  ]))

  assert.equal(processes.get('main-targonos').pid, 123)
})

test('parseLaunchdArguments reads exact ProgramArguments order', () => {
  const args = parseLaunchdArguments(`
gui/501/com.targonglobal.cloudflared-tunnel = {
  arguments = {
    /opt/homebrew/opt/cloudflared/bin/cloudflared
    tunnel
    --config
    /Users/example/.cloudflared/config.yml
    --metrics
    127.0.0.1:20241
    run
    cdb60dd3-b875-4735-9f5d-21ebc0f42b46
  }
}
`)

  assert.deepEqual(args, [
    '/opt/homebrew/opt/cloudflared/bin/cloudflared',
    'tunnel',
    '--config',
    '/Users/example/.cloudflared/config.yml',
    '--metrics',
    '127.0.0.1:20241',
    'run',
    'cdb60dd3-b875-4735-9f5d-21ebc0f42b46',
  ])
})

test('parseLaunchdArguments rejects missing arguments block', () => {
  assert.throws(() => parseLaunchdArguments('state = running'), /arguments block/)
})

test('processIsOnline rejects errored workers with pid 0', () => {
  assert.equal(processIsOnline({ pid: 0, pm2_env: { status: 'errored' } }), false)
  assert.equal(processIsOnline({ pid: 123, pm2_env: { status: 'online' } }), true)
})

test('extractPortalVersionBadge reads the fixed portal version badge', () => {
  const badge = extractPortalVersionBadge(`
    <a href="https://github.com/progami/targonos/commit/abc123" aria-label="TargonOS version v1.2.3">TargonOS v<!-- -->1.2.3</a>
  `)

  assert.deepEqual(badge, {
    version: '1.2.3',
    href: 'https://github.com/progami/targonos/commit/abc123',
  })
})

test('nextBuildManifestUrl requires an existing BUILD_ID', () => {
  assert.throws(
    () => nextBuildManifestUrl({ baseUrl: 'http://127.0.0.1:8080', basePath: '', cwd: '/path/that/does/not/exist' }),
    /missing BUILD_ID/,
  )
})
