import test from 'node:test'
import assert from 'node:assert/strict'

import { buildHostedAppUrl, normalizeBasePath } from './topology'

test('buildHostedAppUrl returns os talos url', () => {
  assert.equal(
    buildHostedAppUrl('https://os.targonglobal.com', '/talos'),
    'https://os.targonglobal.com/talos',
  )
})

test('buildHostedAppUrl returns os root url for website', () => {
  assert.equal(
    buildHostedAppUrl('https://os.targonglobal.com', '/'),
    'https://os.targonglobal.com',
  )
})

test('buildHostedAppUrl trims whitespace and trailing slashes from base path', () => {
  assert.equal(
    buildHostedAppUrl('https://os.targonglobal.com/app?x=1#hash', '  atlas///  '),
    'https://os.targonglobal.com/atlas',
  )
})

test('normalizeBasePath returns empty string for blank and root values', () => {
  assert.equal(normalizeBasePath('   '), '')
  assert.equal(normalizeBasePath('/'), '')
})
