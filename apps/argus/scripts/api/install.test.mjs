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

function readGeneratedPlist(homeDir, label) {
  return fs.readFileSync(
    path.join(homeDir, 'Library', 'LaunchAgents', `${label}.plist`),
    'utf8',
  )
}

function envValue(plist, key) {
  const match = new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`).exec(plist)
  return match ? match[1] : null
}

test('API launchd installer delegates to the unified Argus runner installer', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-api-install-'))
  const fakeBin = path.join(tempRoot, 'bin')
  const fakeHome = path.join(tempRoot, 'home')
  fs.mkdirSync(fakeBin, { recursive: true })
  fs.mkdirSync(fakeHome, { recursive: true })
  writeFakeLaunchctl(fakeBin)

  execFileSync('/bin/bash', [installScript, '--market', 'uk'], {
    env: {
      ...process.env,
      HOME: fakeHome,
      PATH: `${fakeBin}:${process.env.PATH}`,
    },
    stdio: 'pipe',
  })

  assert.deepEqual(fs.readdirSync(path.join(fakeHome, 'Library', 'LaunchAgents')), ['com.targon.argus.runner.plist'])
  const runnerPlist = readGeneratedPlist(fakeHome, 'com.targon.argus.runner')
  assert.equal(envValue(runnerPlist, 'HOME'), fakeHome)
  assert.equal(envValue(runnerPlist, 'TARGONOS_ENV_MODE'), 'local')
  assert.equal(envValue(runnerPlist, 'ARGUS_MARKET'), null)
  assert.equal(envValue(runnerPlist, 'ARGUS_MONITORING_ROOT_UK'), null)
  assert.match(runnerPlist, /<string>runner<\/string>\s*<string>tick<\/string>/)
})
