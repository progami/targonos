#!/usr/bin/env node

/**
 * Version Synchronization Script
 *
 * Single source of truth: Root package.json version
 * Syncs version to all app package.json files
 *
 * Usage:
 *   node scripts/sync-versions.js           # Sync versions
 *   node scripts/sync-versions.js --check   # Validate only (CI mode)
 *   node scripts/sync-versions.js --bump patch|minor|major  # Bump and sync
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const ROOT_PKG_PATH = path.join(ROOT, 'package.json')

// Apps that should have their version synced
const APPS_TO_SYNC = [
  'apps/talos',
  'apps/website',
  'apps/sso',
  'apps/xplan',
  'apps/atlas',
  'apps/plutus',
]

function readJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function bumpVersion(currentVersion, type) {
  const [major, minor, patch] = currentVersion.split('.').map(Number)

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
      return `${major}.${minor}.${patch + 1}`
    default:
      throw new Error(`Invalid bump type: ${type}. Use patch|minor|major`)
  }
}

function main() {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check')
  const bumpIndex = args.indexOf('--bump')
  const bumpType = bumpIndex !== -1 ? args[bumpIndex + 1] : null

  // Read root package.json
  const rootPkg = readJSON(ROOT_PKG_PATH)
  let sourceVersion = rootPkg.version

  // Handle version bump if requested
  if (bumpType) {
    sourceVersion = bumpVersion(sourceVersion, bumpType)
    rootPkg.version = sourceVersion

    if (!checkOnly) {
      writeJSON(ROOT_PKG_PATH, rootPkg)
      console.log(`✓ Bumped root version to ${sourceVersion}`)
    }
  }

  console.log(`\n📦 Source version: ${sourceVersion} (from root package.json)\n`)

  const results = []
  let hasErrors = false

  // Check/sync each app
  for (const appPath of APPS_TO_SYNC) {
    const pkgPath = path.join(ROOT, appPath, 'package.json')

    if (!fs.existsSync(pkgPath)) {
      console.log(`⚠️  Skipping ${appPath} - package.json not found`)
      continue
    }

    const appPkg = readJSON(pkgPath)
    const currentVersion = appPkg.version

    if (currentVersion === sourceVersion) {
      results.push({ app: appPath, status: '✓', version: sourceVersion, action: 'already in sync' })
    } else {
      if (checkOnly) {
        results.push({ app: appPath, status: '✗', version: currentVersion, action: `needs update to ${sourceVersion}` })
        hasErrors = true
      } else {
        appPkg.version = sourceVersion
        writeJSON(pkgPath, appPkg)
        results.push({ app: appPath, status: '✓', version: sourceVersion, action: `updated from ${currentVersion}` })
      }
    }
  }

  // Print results
  console.log('App Versions:')
  console.log('─'.repeat(80))
  for (const result of results) {
    const statusIcon = result.status === '✓' ? '✓' : '✗'
    const appName = result.app.padEnd(30)
    const version = result.version.padEnd(10)
    console.log(`${statusIcon} ${appName} ${version} ${result.action}`)
  }
  console.log('─'.repeat(80))

  if (checkOnly && hasErrors) {
    console.error('\n❌ Version mismatch detected! Run `node scripts/sync-versions.js` to fix.\n')
    process.exit(1)
  }

  if (!checkOnly && results.some(r => r.action.includes('updated'))) {
    console.log('\n✓ All versions synchronized to', sourceVersion)
    console.log('\nNext steps:')
    console.log('  1. Review the changes')
    console.log('  2. Commit: git add . && git commit -m "chore: bump version to ' + sourceVersion + '"')
    console.log('  3. Push to trigger deployment and release\n')
  } else if (!checkOnly) {
    console.log('\n✓ All versions already in sync\n')
  }
}

main()
