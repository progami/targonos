import test from 'node:test'
import assert from 'node:assert/strict'

import {
  assertPromotionReady,
  findSuccessfulPushRun,
} from './verify-promotion-ready.mjs'

test('findSuccessfulPushRun ignores undefined entries and matches the exact head sha', () => {
  const matchingRun = findSuccessfulPushRun([
    undefined,
    { head_sha: 'older-sha', conclusion: 'success' },
    { head_sha: 'target-sha', conclusion: 'failure' },
    { head_sha: 'target-sha', conclusion: 'success', html_url: 'https://github.com/progami/targonos/actions/runs/1' },
  ], 'target-sha')

  assert.deepEqual(matchingRun, {
    head_sha: 'target-sha',
    conclusion: 'success',
    html_url: 'https://github.com/progami/targonos/actions/runs/1',
  })
})

test('assertPromotionReady rejects a promotion pr when dev moved after the pr was opened', () => {
  const result = assertPromotionReady({
    branchSha: 'newer-dev-tip',
    headSha: 'older-pr-head',
    workflowRuns: [],
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /does not match the current dev tip/)
})

test('assertPromotionReady rejects when no successful push ci run exists for the exact sha', () => {
  const result = assertPromotionReady({
    branchSha: 'target-sha',
    headSha: 'target-sha',
    workflowRuns: [
      { head_sha: 'target-sha', conclusion: 'cancelled' },
      { head_sha: 'older-sha', conclusion: 'success' },
    ],
  })

  assert.equal(result.ok, false)
  assert.match(result.reason, /No successful dev push CI run found/)
})

test('assertPromotionReady accepts an exact-sha successful dev push ci run', () => {
  const result = assertPromotionReady({
    branchSha: 'target-sha',
    headSha: 'target-sha',
    workflowRuns: [
      undefined,
      { head_sha: 'target-sha', conclusion: 'success', html_url: 'https://github.com/progami/targonos/actions/runs/2' },
    ],
  })

  assert.equal(result.ok, true)
  assert.equal(result.matchingRun?.html_url, 'https://github.com/progami/targonos/actions/runs/2')
})
