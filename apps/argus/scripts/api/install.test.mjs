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

test('API launchd installer writes shared env runtime blocks for generated UK collectors', () => {
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
  const dailyPlist = readGeneratedPlist(fakeHome, 'com.targon.daily-account-health.uk')
  const weeklyPlist = readGeneratedPlist(fakeHome, 'com.targon.weekly-api-sources.uk')
  const trackingPlist = readGeneratedPlist(fakeHome, 'com.targon.argus.tracking-fetch.uk')
  const driveSyncPlist = readGeneratedPlist(fakeHome, 'com.targon.argus.drive-sync.uk')

  for (const plist of [trackingPlist, hourlyPlist, dailyPlist, weeklyPlist, driveSyncPlist]) {
    assert.equal(envValue(plist, 'HOME'), fakeHome)
    assert.equal(envValue(plist, 'TARGONOS_ENV_MODE'), 'local')
    assert.equal(envValue(plist, 'ARGUS_MARKET'), 'uk')
    assert.equal(envValue(plist, 'ARGUS_MONITORING_ROOT_UK'), path.join(fakeHome, '.local/share/targon/argus-monitoring/uk'))
    assert.equal(envValue(plist, 'WPR_DATA_DIR_UK'), path.join(fakeHome, '.local/share/targon/argus-wpr/uk/WPR/wpr-workspace/output'))
    assert.equal(envValue(plist, 'ARGUS_DRIVE_MONITORING_FOLDER_ID_UK'), '1_0tNhEbgVo2DfbD3w6qbatxA98u15b3W')
    assert.equal(envValue(plist, 'ARGUS_DRIVE_WPR_FOLDER_ID_UK'), '1zJgmdxN09aX4ij-y67wyC8qoRcVRrOC9')
    assert.equal(envValue(plist, 'ARGUS_DRIVE_PROFILE'), 'targon')
    assert.equal(envValue(plist, 'GWORKSPACE_API_BIN'), path.join(fakeHome, '.local/bin/gworkspace-api'))
    assert.equal(envValue(plist, 'GWORKSPACE_API_PYTHON'), '/opt/homebrew/bin/python3')
    assert.equal(
      envValue(plist, 'PATH'),
      '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin',
    )
    assert.equal(envValue(plist, 'AMAZON_SP_API_REGION_UK'), null)
    assert.equal(envValue(plist, 'AMAZON_REFRESH_TOKEN_UK'), null)
    assert.equal(envValue(plist, 'AMAZON_SP_APP_CLIENT_ID'), null)
    assert.equal(envValue(plist, 'AMAZON_SP_APP_CLIENT_SECRET'), null)
  }

  assert.equal(
    envValue(trackingPlist, 'ARGUS_SALES_ROOT_UK'),
    '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - UK/Sales',
  )
  assert.match(driveSyncPlist, /scripts\/lib\/drive-sync\.mjs/)
  assert.match(driveSyncPlist, /<string>--market<\/string>\s*<string>uk<\/string>/)
})
