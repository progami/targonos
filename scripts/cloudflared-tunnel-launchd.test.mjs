import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

import {
  CLOUDFLARED_CONFIG_PATH,
  CLOUDFLARED_METRICS_ADDRESS,
  CLOUDFLARED_PROGRAM,
  CLOUDFLARED_TUNNEL_ID,
  cloudflaredTunnelProgramArguments,
  hasRequiredTunnelRunArguments,
  renderCloudflaredTunnelPlist,
} from './cloudflared-tunnel-launchd.mjs'

test('cloudflared tunnel LaunchAgent uses explicit tunnel run command', () => {
  assert.equal(CLOUDFLARED_CONFIG_PATH, path.join(os.homedir(), '.cloudflared', 'config.yml'))

  assert.deepEqual(cloudflaredTunnelProgramArguments(), [
    CLOUDFLARED_PROGRAM,
    'tunnel',
    '--config',
    CLOUDFLARED_CONFIG_PATH,
    '--metrics',
    CLOUDFLARED_METRICS_ADDRESS,
    'run',
    CLOUDFLARED_TUNNEL_ID,
  ])
})

test('cloudflared tunnel argument validator rejects the bare Homebrew service command', () => {
  assert.equal(hasRequiredTunnelRunArguments([CLOUDFLARED_PROGRAM]), false)
})

test('cloudflared tunnel plist contains exact ProgramArguments', () => {
  const plist = renderCloudflaredTunnelPlist()

  for (const token of cloudflaredTunnelProgramArguments()) {
    assert.match(plist, new RegExp(`<string>${token.replaceAll('.', '\\.').replaceAll('/', '\\/')}</string>`))
  }

  assert.match(plist, /<key>KeepAlive<\/key>/)
  assert.match(plist, /<key>KeepAlive<\/key>\s*<true\/>/)
})
