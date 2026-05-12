import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const installScript = path.join(__dirname, 'install.sh')

function writeFakeLaunchctl(binDir) {
  const launchctlPath = path.join(binDir, 'launchctl')
  fs.writeFileSync(
    launchctlPath,
    [
      '#!/bin/sh',
      'if [ "$1" = "print" ]; then',
      '  exit 1',
      'fi',
      'exit 0',
      '',
    ].join('\n'),
  )
  fs.chmodSync(launchctlPath, 0o755)
}

function envValue(plist, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`).exec(plist)
  return match ? match[1] : null
}

test('runner installer writes one minimal Argus runner LaunchAgent', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-runner-install-'))
  const fakeBin = path.join(tempRoot, 'bin')
  const fakeHome = path.join(tempRoot, 'home')
  fs.mkdirSync(fakeBin, { recursive: true })
  fs.mkdirSync(fakeHome, { recursive: true })
  writeFakeLaunchctl(fakeBin)

  execFileSync('/bin/bash', [installScript], {
    env: {
      ...process.env,
      HOME: fakeHome,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
    stdio: 'pipe',
  })

  const launchAgents = fs.readdirSync(path.join(fakeHome, 'Library', 'LaunchAgents')).sort()
  assert.deepEqual(launchAgents, ['com.targon.argus.runner.plist'])

  const plist = fs.readFileSync(path.join(fakeHome, 'Library', 'LaunchAgents', 'com.targon.argus.runner.plist'), 'utf8')
  assert.equal(envValue(plist, 'HOME'), fakeHome)
  assert.equal(envValue(plist, 'TARGONOS_ENV_MODE'), 'local')
  assert.equal(envValue(plist, 'PATH'), '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin')
  assert.equal(envValue(plist, 'ARGUS_MARKET'), null)
  assert.equal(envValue(plist, 'ARGUS_MONITORING_ROOT_US'), null)
  assert.match(plist, /<string>runner<\/string>\s*<string>tick<\/string>/)
  assert.match(plist, /<key>StartInterval<\/key>\s*<integer>300<\/integer>/)
  assert.match(plist, /<key>RunAtLoad<\/key>\s*<true\/>/)
})

test('runner installer removes legacy Argus collector LaunchAgents', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-runner-legacy-'))
  const fakeBin = path.join(tempRoot, 'bin')
  const fakeHome = path.join(tempRoot, 'home')
  const launchAgents = path.join(fakeHome, 'Library', 'LaunchAgents')
  fs.mkdirSync(fakeBin, { recursive: true })
  fs.mkdirSync(launchAgents, { recursive: true })
  writeFakeLaunchctl(fakeBin)

  for (const label of [
    'com.targon.argus.tracking-fetch',
    'com.targon.argus.tracking-fetch.uk',
    'com.targon.hourly-listing-attributes-api',
    'com.targon.hourly-listing-attributes-api.uk',
    'com.targon.daily-account-health',
    'com.targon.daily-account-health.uk',
    'com.targon.weekly-api-sources',
    'com.targon.weekly-api-sources.uk',
    'com.targon.daily-visuals',
    'com.targon.daily-visuals.uk',
    'com.targon.weekly-browser-sources',
    'com.targon.weekly-browser-sources.uk',
    'com.targon.argus.drive-sync',
    'com.targon.argus.drive-sync.uk',
  ]) {
    fs.writeFileSync(path.join(launchAgents, `${label}.plist`), 'old')
  }

  execFileSync('/bin/bash', [installScript], {
    env: {
      ...process.env,
      HOME: fakeHome,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
    stdio: 'pipe',
  })

  assert.deepEqual(fs.readdirSync(launchAgents).sort(), ['com.targon.argus.runner.plist'])
})

test('runner uninstall removes only the unified runner plist', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-runner-uninstall-'))
  const fakeBin = path.join(tempRoot, 'bin')
  const fakeHome = path.join(tempRoot, 'home')
  const launchAgents = path.join(fakeHome, 'Library', 'LaunchAgents')
  fs.mkdirSync(fakeBin, { recursive: true })
  fs.mkdirSync(launchAgents, { recursive: true })
  writeFakeLaunchctl(fakeBin)
  fs.writeFileSync(path.join(launchAgents, 'com.targon.argus.runner.plist'), 'old')

  execFileSync('/bin/bash', [installScript, '--uninstall'], {
    env: {
      ...process.env,
      HOME: fakeHome,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
    stdio: 'pipe',
  })

  assert.deepEqual(fs.readdirSync(launchAgents), [])
})
