import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('monitoring page bootstraps overview and changes from the shared bootstrap endpoint', () => {
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

  assert.match(source, /\/api\/monitoring\/bootstrap/)
  assert.doesNotMatch(source, /fetch\(`\$\{basePath\}\/api\/monitoring\/overview`\)/)
})
