import test from 'node:test'
import assert from 'node:assert/strict'

import { evaluateReviewThreads } from './assert-resolved-review-threads.mjs'

test('evaluateReviewThreads passes when every thread is resolved', () => {
  const result = evaluateReviewThreads([
    {
      isResolved: true,
      isOutdated: false,
      path: 'apps/talos/src/middleware.ts',
      line: 16,
      comments: [
        {
          author: { login: 'chatgpt-codex-connector' },
          body: 'Looks good.',
        },
      ],
    },
  ])

  assert.deepEqual(result, { ok: true, message: 'ok' })
})

test('evaluateReviewThreads ignores outdated unresolved threads', () => {
  const result = evaluateReviewThreads([
    {
      isResolved: false,
      isOutdated: true,
      path: 'apps/talos/src/lib/utils/base-path.ts',
      line: 32,
      comments: [
        {
          author: { login: 'chatgpt-codex-connector' },
          body: 'Outdated warning.',
        },
      ],
    },
  ])

  assert.deepEqual(result, { ok: true, message: 'ok' })
})

test('evaluateReviewThreads fails when a non-outdated thread is unresolved', () => {
  const result = evaluateReviewThreads([
    {
      isResolved: false,
      isOutdated: false,
      path: 'apps/talos/src/lib/utils/base-path.ts',
      line: 32,
      comments: [
        {
          author: { login: 'chatgpt-codex-connector' },
          body: 'Preserve fallback when BASE_PATH is an empty string.',
        },
      ],
    },
  ])

  assert.equal(result.ok, false)
  assert.match(result.message, /apps\/talos\/src\/lib\/utils\/base-path\.ts:32/)
  assert.match(result.message, /chatgpt-codex-connector/)
  assert.match(result.message, /Preserve fallback/)
})

test('evaluateReviewThreads throws when a blocking thread has no first comment', () => {
  assert.throws(() => evaluateReviewThreads([
    {
      isResolved: false,
      isOutdated: false,
      path: 'apps/talos/src/lib/utils/base-path.ts',
      line: 32,
      comments: [],
    },
  ]), /must include a first comment/)
})

test('evaluateReviewThreads throws when a blocking thread comment is missing author metadata', () => {
  assert.throws(() => evaluateReviewThreads([
    {
      isResolved: false,
      isOutdated: false,
      path: 'apps/talos/src/lib/utils/base-path.ts',
      line: 32,
      comments: [
        {
          body: 'Missing author should fail loudly.',
        },
      ],
    },
  ]), /author login must be a non-empty string/)
})
