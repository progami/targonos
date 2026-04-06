import test from 'node:test'
import assert from 'node:assert/strict'

import { findMatchingPageTarget, parseHosts, urlMatchesHost } from './chrome-devtools-helper.mjs'

test('parseHosts trims entries and drops empties', () => {
  assert.deepEqual(parseHosts(' sellercentral.amazon.com, amazon.com ,, voice.google.com '), [
    'sellercentral.amazon.com',
    'amazon.com',
    'voice.google.com',
  ])
})

test('urlMatchesHost only matches exact hostnames', () => {
  assert.equal(urlMatchesHost('https://sellercentral.amazon.com/home', 'sellercentral.amazon.com'), true)
  assert.equal(urlMatchesHost('http://voice.google.com/u/0/messages', 'voice.google.com'), true)
  assert.equal(urlMatchesHost('https://sub.sellercentral.amazon.com/home', 'sellercentral.amazon.com'), false)
  assert.equal(urlMatchesHost('not-a-url', 'sellercentral.amazon.com'), false)
})

test('findMatchingPageTarget prefers page targets with a matching host', () => {
  const target = findMatchingPageTarget(
    [
      { id: 'service-worker', type: 'service_worker', url: 'https://sellercentral.amazon.com/sw.js' },
      { id: 'uk-case', type: 'page', url: 'https://sellercentral.amazon.co.uk/cu/case-lobby' },
      { id: 'us-case', type: 'page', url: 'https://sellercentral.amazon.com/cu/case-dashboard/view-case' },
    ],
    ['sellercentral.amazon.com', 'amazon.com'],
  )

  assert.deepEqual(target, {
    id: 'us-case',
    type: 'page',
    url: 'https://sellercentral.amazon.com/cu/case-dashboard/view-case',
  })
})
