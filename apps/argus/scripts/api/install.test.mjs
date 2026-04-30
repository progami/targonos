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

test('API launchd installer writes market env blocks for generated UK collectors', () => {
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

  const hourlyPlist = readGeneratedPlist(fakeHome, 'com.targon.hourly-listing-attributes-api.uk')
  const weeklyPlist = readGeneratedPlist(fakeHome, 'com.targon.weekly-api-sources.uk')

  for (const plist of [hourlyPlist, weeklyPlist]) {
    assert.equal(envValue(plist, 'ARGUS_MARKET'), 'uk')
    assert.equal(
      envValue(plist, 'ARGUS_SALES_ROOT_UK'),
      '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - UK/Sales',
    )
    assert.equal(
      envValue(plist, 'PATH'),
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    )
  }
})
