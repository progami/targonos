import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { SERVICE_LINES, SERVICE_STATIONS, type ServiceLineId } from './service-map'

const repoRoot = path.resolve(__dirname, '../../..')
const ecosystemSource = fs.readFileSync(path.join(repoRoot, 'ecosystem.config.js'), 'utf8')
const sourceExtensions = new Set(['.ts', '.tsx', '.mjs', '.js'])
const skippedDirectories = new Set(['node_modules', '.next', 'dist', 'out', 'tests', 'fixtures'])

function readSources(directory: string): string {
  let combined = ''
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!skippedDirectories.has(entry.name)) {
        combined += readSources(path.join(directory, entry.name))
      }
      continue
    }
    if (sourceExtensions.has(path.extname(entry.name)) && !entry.name.includes('.test.')) {
      combined += fs.readFileSync(path.join(directory, entry.name), 'utf8')
    }
  }
  return combined
}

type AppEvidence = {
  dependencies: Record<string, string>
  sources: string
  hasRunner: boolean
}

function loadEvidence(appId: string): AppEvidence {
  const appDir = path.join(repoRoot, 'apps', appId)
  const pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'))
  return {
    dependencies: pkg.dependencies,
    sources: readSources(appDir),
    hasRunner: fs.existsSync(path.join(appDir, 'scripts', 'runner')),
  }
}

const detectors: Record<ServiceLineId, (appId: string, evidence: AppEvidence) => boolean> = {
  session: (_appId, evidence) => '@targon/auth' in evidence.dependencies,
  postgres: (_appId, evidence) =>
    'pg' in evidence.dependencies || Object.keys(evidence.dependencies).some((name) => name.startsWith('@targon/prisma-')),
  'sp-api': (_appId, evidence) => /sellingpartnerapi|amazon-sp-api/.test(evidence.sources),
  s3: (_appId, evidence) => /@aws-sdk\/client-s3|@targon\/aws-s3/.test(evidence.sources),
  google: (_appId, evidence) => /googleapis\.com|google-trends-api/.test(evidence.sources),
  redis: (_appId, evidence) => /from ['"]ioredis['"]/.test(evidence.sources),
  jobs: (appId, evidence) => ecosystemSource.includes(`name: 'main-${appId}-`) || evidence.hasRunner,
}

const workspaceStations = SERVICE_STATIONS.filter((station) => station.id !== 'sso')

for (const station of workspaceStations) {
  test(`${station.name} links match what its code uses`, () => {
    const evidence = loadEvidence(station.id)
    for (const line of SERVICE_LINES) {
      const used = detectors[line.id](station.id, evidence)
      const mapped = station.links[line.id] !== undefined
      assert.equal(
        mapped,
        used,
        `${station.name} ${used ? 'uses' : 'does not use'} ${line.name}, but the system map ${mapped ? 'links' : 'does not link'} it`,
      )
    }
  })
}

test('every workspace mounted on the portal host has a station', () => {
  const hostStackSource = fs.readFileSync(path.join(repoRoot, 'scripts', 'verify-host-stack.mjs'), 'utf8')
  const mounts = [...hostStackSource.matchAll(/\['main-([a-z]+)', '(\/[a-z]+)?'\]/g)].map((match) => match[2] ?? '/')
  assert.deepEqual(
    SERVICE_STATIONS.map((station) => station.mount).sort(),
    [...new Set(mounts)].sort(),
  )
})

test('the portal station signs users in with Google', () => {
  const portalSources = readSources(path.join(repoRoot, 'apps', 'sso', 'lib'))
  assert.match(portalSources, /next-auth\/providers\/google/)
})
