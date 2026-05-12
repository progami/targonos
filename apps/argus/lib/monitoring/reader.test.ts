import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('monitoring reader reports Argus runner tasks instead of legacy per-source LaunchAgents', () => {
  const source = readFileSync(new URL('./reader.ts', import.meta.url), 'utf8')

  assert.match(source, /const ARGUS_RUNNER_LAUNCHD_LABEL = 'com\.targon\.argus\.runner'/)
  assert.match(source, /taskId: schedulerTaskId\(market, 'tracking-fetch'\)/)
  assert.match(source, /launchdLabel: ARGUS_RUNNER_LAUNCHD_LABEL/)
  assert.match(source, /readRunnerLedgerTask\(spec\.taskId\)/)
  assert.match(source, /const HEALTHY_RUNNER_TASK_STATUSES = new Set<MonitoringSchedulerJob\['taskStatus'\]>\(\['succeeded'\]\)/)
  assert.doesNotMatch(source, /schedulerLaunchdLabel\(market, 'com\.targon\.weekly-api-sources'\)/)
})
