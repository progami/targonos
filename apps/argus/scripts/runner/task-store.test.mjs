import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildDefaultTasks,
  createEmptyLedger,
  loadLedger,
  markTaskFinished,
  markTaskRunning,
  nextDueAtForTask,
  releaseBrowserLaneLock,
  scheduleDueTasks,
  tryAcquireBrowserLaneLock,
  tryAcquireLock,
  saveLedger,
} from './task-store.mjs'

test('scheduler creates one durable task for every Argus source and market', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), now)

  assert.equal(ledger.tasks.length, 14)
  assert.deepEqual(
    ledger.tasks.map((task) => task.task_id).sort(),
    [
      'uk:daily-account-health',
      'uk:daily-visuals',
      'uk:drive-sync',
      'uk:hourly-listing-attributes-api',
      'uk:tracking-fetch',
      'uk:weekly-api-sources',
      'uk:weekly-browser-sources',
      'us:daily-account-health',
      'us:daily-visuals',
      'us:drive-sync',
      'us:hourly-listing-attributes-api',
      'us:tracking-fetch',
      'us:weekly-api-sources',
      'us:weekly-browser-sources',
    ],
  )
  assert.equal(ledger.tasks.every((task) => task.status === 'queued'), true)
})

test('completed tasks move to their next due time instead of staying failed globally', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), now)
  const running = markTaskRunning(ledger, 'us:tracking-fetch', 'runner-1', now)
  const finished = markTaskFinished(running, 'us:tracking-fetch', {
    status: 'succeeded',
    finishedAt: new Date('2026-05-11T08:02:00.000Z'),
    artifactPath: '/tmp/tracking.json',
    metadata: { exitCode: 0 },
  })
  const task = finished.tasks.find((entry) => entry.task_id === 'us:tracking-fetch')

  assert.equal(task.status, 'succeeded')
  assert.equal(task.attempt, 1)
  assert.equal(task.lock_owner, null)
  assert.equal(task.artifact_path, '/tmp/tracking.json')
  assert.equal(task.due_at, '2026-05-11T09:02:00.000Z')
})

test('failed API tasks retry without changing unrelated task state', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), now)
  const running = markTaskRunning(ledger, 'uk:weekly-api-sources', 'runner-1', now)
  const failed = markTaskFinished(running, 'uk:weekly-api-sources', {
    status: 'failed',
    finishedAt: new Date('2026-05-11T08:05:00.000Z'),
    lastError: 'SP-API timed out',
    metadata: { failedStep: 'SP-API' },
  })
  const failedTask = failed.tasks.find((entry) => entry.task_id === 'uk:weekly-api-sources')
  const browserTask = failed.tasks.find((entry) => entry.task_id === 'uk:weekly-browser-sources')

  assert.equal(failedTask.status, 'failed')
  assert.equal(failedTask.due_at, '2026-05-11T08:35:00.000Z')
  assert.equal(browserTask.status, 'queued')
  assert.equal(browserTask.last_error, null)
})

test('waiting API tasks requeue when their polling time arrives', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), now)
  const running = markTaskRunning(ledger, 'us:weekly-api-sources', 'runner-1', now)
  const waiting = markTaskFinished(running, 'us:weekly-api-sources', {
    status: 'waiting',
    finishedAt: new Date('2026-05-11T08:05:00.000Z'),
    lastError: 'api-report-waiting',
    metadata: { outcome: 'api-report-waiting' },
  })
  const rescheduled = scheduleDueTasks(waiting, buildDefaultTasks(), new Date('2026-05-11T08:36:00.000Z'))
  const task = rescheduled.tasks.find((entry) => entry.task_id === 'us:weekly-api-sources')

  assert.equal(task.status, 'queued')
  assert.equal(task.last_error, 'api-report-waiting')
})

test('blocked browser auth tasks stay blocked for operator recovery', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), now)
  const running = markTaskRunning(ledger, 'uk:weekly-browser-sources', 'runner-1', now)
  const blocked = markTaskFinished(running, 'uk:weekly-browser-sources', {
    status: 'blocked',
    finishedAt: new Date('2026-05-11T08:05:00.000Z'),
    lastError: 'browser-auth',
    metadata: { outcome: 'blocked-auth' },
  })
  const rescheduled = scheduleDueTasks(blocked, buildDefaultTasks(), new Date('2026-05-11T09:30:00.000Z'))
  const task = rescheduled.tasks.find((entry) => entry.task_id === 'uk:weekly-browser-sources')

  assert.equal(task.status, 'blocked')
  assert.equal(task.last_error, 'browser-auth')
})

test('global runner lock prevents overlapping ticks', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const first = tryAcquireLock(createEmptyLedger(), 'runner-1', now)
  const second = tryAcquireLock(first.ledger, 'runner-2', new Date('2026-05-11T08:01:00.000Z'))

  assert.equal(first.acquired, true)
  assert.equal(second.acquired, false)
  assert.equal(second.ledger.locks.runner.owner, 'runner-1')
})

test('browser lane lock serializes browser collectors across markets', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const first = tryAcquireBrowserLaneLock(createEmptyLedger(), 'runner-1', now)
  const second = tryAcquireBrowserLaneLock(first.ledger, 'runner-2', new Date('2026-05-11T08:01:00.000Z'))
  const released = releaseBrowserLaneLock(first.ledger, 'runner-1', new Date('2026-05-11T08:02:00.000Z'))
  const third = tryAcquireBrowserLaneLock(released, 'runner-2', new Date('2026-05-11T08:03:00.000Z'))

  assert.equal(first.acquired, true)
  assert.equal(second.acquired, false)
  assert.equal(second.ledger.locks.browser_lane.owner, 'runner-1')
  assert.equal(third.acquired, true)
  assert.equal(third.ledger.locks.browser_lane.owner, 'runner-2')
})

test('browser lane schedules only one browser task while API tasks remain eligible', () => {
  const now = new Date('2026-05-11T08:00:00.000Z')
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), now)
  const eligible = ledger.tasks
    .filter((task) => task.status === 'queued' && task.due_at <= now.toISOString())
    .map((task) => task.task_id)

  assert.deepEqual(
    eligible.filter((taskId) => taskId.includes('weekly-browser-sources')).sort(),
    ['uk:weekly-browser-sources', 'us:weekly-browser-sources'],
  )
  assert.equal(nextDueAtForTask(ledger.tasks.find((task) => task.task_id === 'us:weekly-browser-sources'), new Date('2026-05-11T08:06:00.000Z')), '2026-05-18T08:06:00.000Z')
})

test('ledger persists task metadata for later runner ticks', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-runner-ledger-'))
  const ledgerPath = path.join(tempRoot, 'task-ledger.json')
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), new Date('2026-05-11T08:00:00.000Z'))

  saveLedger(ledgerPath, ledger)
  const reloaded = loadLedger(ledgerPath)

  assert.equal(reloaded.version, 1)
  assert.equal(reloaded.tasks.length, 14)
  assert.equal(reloaded.tasks[0].metadata.constructor, Object)
})
