import assert from 'node:assert/strict'
import test from 'node:test'

import {
  commandForTask,
  envForTask,
  normalizeExecutionResult,
  selectRunnableTasks,
} from './executor.mjs'
import { buildDefaultTasks, createEmptyLedger, scheduleDueTasks } from './task-store.mjs'

test('command map keeps every existing collector behind the runner boundary', () => {
  const commands = buildDefaultTasks().map((definition) => commandForTask(definition, '/repo/apps/argus'))

  assert.deepEqual(
    commands.map((command) => [command.taskId, command.program, command.args]),
    [
      ['us:tracking-fetch', '/repo/apps/argus/node_modules/.bin/tsx', ['scripts/tracking-fetch.ts', '--market', 'us']],
      ['uk:tracking-fetch', '/repo/apps/argus/node_modules/.bin/tsx', ['scripts/tracking-fetch.ts', '--market', 'uk']],
      ['us:hourly-listing-attributes-api', '/bin/bash', ['/repo/apps/argus/scripts/api/hourly-listing-attributes/collect.sh', '--market', 'us']],
      ['uk:hourly-listing-attributes-api', '/bin/bash', ['/repo/apps/argus/scripts/api/hourly-listing-attributes/collect.sh', '--market', 'uk']],
      ['us:daily-account-health', '/bin/bash', ['/repo/apps/argus/scripts/api/daily-account-health/collect.sh', '--market', 'us']],
      ['uk:daily-account-health', '/bin/bash', ['/repo/apps/argus/scripts/api/daily-account-health/collect.sh', '--market', 'uk']],
      ['us:weekly-api-sources', '/bin/bash', ['/repo/apps/argus/scripts/api/weekly-sources/run.sh', '--market', 'us']],
      ['uk:weekly-api-sources', '/bin/bash', ['/repo/apps/argus/scripts/api/weekly-sources/run.sh', '--market', 'uk']],
      ['us:daily-visuals', '/bin/bash', ['/repo/apps/argus/scripts/browser/daily-visuals/collect.sh', '--market', 'us']],
      ['uk:daily-visuals', '/bin/bash', ['/repo/apps/argus/scripts/browser/daily-visuals/collect.sh', '--market', 'uk']],
      ['us:weekly-browser-sources', '/bin/bash', ['/repo/apps/argus/scripts/browser/run-weekly.sh', '--market', 'us']],
      ['uk:weekly-browser-sources', '/bin/bash', ['/repo/apps/argus/scripts/browser/run-weekly.sh', '--market', 'uk']],
      ['us:drive-sync', process.execPath, ['/repo/apps/argus/scripts/lib/drive-sync.mjs', '--market', 'us']],
      ['uk:drive-sync', process.execPath, ['/repo/apps/argus/scripts/lib/drive-sync.mjs', '--market', 'uk']],
    ],
  )
})

test('browser lane selection permits one browser task per tick', () => {
  const ledger = scheduleDueTasks(createEmptyLedger(), buildDefaultTasks(), new Date('2026-05-11T08:00:00.000Z'))
  const selected = selectRunnableTasks(ledger, {
    now: new Date('2026-05-11T08:00:00.000Z'),
    maxTasks: 14,
  })

  assert.equal(selected.filter((task) => task.kind === 'browser').length, 1)
  assert.equal(selected.filter((task) => task.kind === 'api').length > 1, true)
  assert.equal(selected.find((task) => task.task_id === 'uk:weekly-browser-sources'), undefined)
})

test('runner converts known browser failures to structured blocked states', () => {
  const result = normalizeExecutionResult({
    taskKind: 'browser',
    exitCode: 1,
    stdout: 'Seller Central session expired',
    stderr: 'route stabilized on /ap/signin',
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.lastError, 'browser-auth')
  assert.deepEqual(result.metadata, { outcome: 'blocked-auth', exitCode: 1 })
})

test('runner keeps missing downloads distinct from auth blockers', () => {
  const result = normalizeExecutionResult({
    taskKind: 'browser',
    exitCode: 1,
    stdout: 'download did not create XLSX after timeout',
    stderr: '',
  })

  assert.equal(result.status, 'failed')
  assert.equal(result.lastError, 'download-missing')
  assert.deepEqual(result.metadata, { outcome: 'download-missing', exitCode: 1 })
})

test('runner treats API report timeouts as resumable waiting state', () => {
  const result = normalizeExecutionResult({
    taskKind: 'api',
    exitCode: 1,
    stdout: 'W19 2026-05-03..2026-05-09 SQP: report timed out',
    stderr: '',
  })

  assert.equal(result.status, 'waiting')
  assert.equal(result.lastError, 'api-report-waiting')
  assert.deepEqual(result.metadata, { outcome: 'api-report-waiting', exitCode: 1 })
})

test('runner treats account health report id timeouts as resumable waiting state', () => {
  const result = normalizeExecutionResult({
    taskKind: 'api',
    exitCode: 1,
    stdout: 'Account Health API: report 123456789 timed out',
    stderr: '',
  })

  assert.equal(result.status, 'waiting')
  assert.equal(result.lastError, 'api-report-waiting')
  assert.deepEqual(result.metadata, { outcome: 'api-report-waiting', exitCode: 1 })
})

test('weekly API runner uses a short SP-API polling window', () => {
  const task = buildDefaultTasks().find((definition) => definition.taskId === 'uk:weekly-api-sources')
  const env = envForTask(task, { PATH: '/usr/bin' })

  assert.equal(env.ARGUS_SPAPI_REPORT_WAIT_TIMEOUT_MS, '60000')
  assert.equal(env.PATH, '/usr/bin')
})

test('daily account health runner uses a short report polling window', () => {
  const task = buildDefaultTasks().find((definition) => definition.taskId === 'us:daily-account-health')
  const env = envForTask(task, { PATH: '/usr/bin' })

  assert.equal(env.ARGUS_ACCOUNT_HEALTH_REPORT_WAIT_TIMEOUT_MS, '60000')
  assert.equal(env.PATH, '/usr/bin')
})
