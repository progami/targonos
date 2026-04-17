import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import { globSync } from 'glob'

const talosRoot = path.resolve(__dirname, '..', '..')
const allowlist = new Set(['src/app/api/tenant/select/route.ts'])

const bannedPatterns = [
  /fetch\((['"`])\/api\//,
  /new URL\((['"`])\/api\//,
  /pathname\s*=\s*.*\/api\//,
]

test('Talos source does not hardcode internal api roots outside the allowlist', () => {
  const offenders: string[] = []
  const files = globSync('src/**/*.{ts,tsx,js,jsx}', {
    cwd: talosRoot,
    nodir: true,
  })

  for (const relativePath of files) {
    if (allowlist.has(relativePath)) continue

    const source = readFileSync(path.join(talosRoot, relativePath), 'utf8')
    if (bannedPatterns.some((pattern) => pattern.test(source))) {
      offenders.push(relativePath)
    }
  }

  assert.deepEqual(offenders, [])
})
