import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('login page always renders the sign-in form instead of preflight redirecting', () => {
  const source = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /from 'next\/navigation'/)
  assert.doesNotMatch(source, /auth\(\)/)
  assert.match(source, /<form action="\/login\/google" method="get"/)
})
