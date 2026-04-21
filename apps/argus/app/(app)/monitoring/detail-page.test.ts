import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('monitoring detail page uses the shared JSON reader', () => {
  const source = readFileSync(new URL('./[id]/page.tsx', import.meta.url), 'utf8')

  assert.match(source, /readAppJsonOrThrow/)
  assert.doesNotMatch(source, /process\.env\.NEXT_PUBLIC_BASE_PATH/)
  assert.doesNotMatch(source, /response\.json\(\)/)
})
