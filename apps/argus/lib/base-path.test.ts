import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBasePath } from './base-path'

test('normalizeBasePath removes duplicated app base paths', () => {
  assert.equal(normalizeBasePath('/argus/argus'), '/argus')
})

test('normalizeBasePath keeps a normal base path unchanged', () => {
  assert.equal(normalizeBasePath('/argus'), '/argus')
})

test('normalizeBasePath collapses empty inputs', () => {
  assert.equal(normalizeBasePath(undefined), '')
  assert.equal(normalizeBasePath(''), '')
  assert.equal(normalizeBasePath('/'), '')
})
