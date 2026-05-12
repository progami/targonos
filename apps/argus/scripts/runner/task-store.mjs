import fs from 'node:fs'
import path from 'node:path'

export const TASK_STATUSES = new Set(['queued', 'running', 'waiting', 'succeeded', 'failed', 'blocked', 'stale'])

const LEDGER_VERSION = 1
const MARKETS = ['us', 'uk']
const RUNNER_LOCK_TTL_MS = 20 * 60 * 1000
const BROWSER_LANE_LOCK_TTL_MS = 4 * 60 * 60 * 1000
const RUNNING_TASK_STALE_AFTER_MS = {
  api: 2 * 60 * 60 * 1000,
  browser: 4 * 60 * 60 * 1000,
  publisher: 30 * 60 * 1000,
}
const REQUEUEABLE_STATUSES = new Set(['succeeded', 'failed', 'waiting', 'stale'])

const SOURCE_DEFINITIONS = [
  {
    source: 'tracking-fetch',
    label: 'Tracking fetch',
    kind: 'api',
    cadence: 'hourly',
    freshnessWindowMinutes: 60,
    retryMinutes: 15,
    outputs: ['Argus tracking snapshots (DB)'],
  },
  {
    source: 'hourly-listing-attributes-api',
    label: 'Hourly listing attributes',
    kind: 'api',
    cadence: 'hourly',
    freshnessWindowMinutes: 60,
    retryMinutes: 15,
    outputs: ['Hourly latest state', 'Snapshot history', 'Change Feed -> Email'],
  },
  {
    source: 'daily-account-health',
    label: 'Daily account health',
    kind: 'api',
    cadence: 'daily',
    freshnessWindowMinutes: 24 * 60,
    retryMinutes: 60,
    outputs: ['Account Health Dashboard (API)'],
  },
  {
    source: 'weekly-api-sources',
    label: 'Weekly API sources',
    kind: 'api',
    cadence: 'weekly',
    freshnessWindowMinutes: 7 * 24 * 60,
    retryMinutes: 30,
    outputs: ['Brand Analytics (API)', 'Business Reports (API)', 'Datadive (API)', 'Sellerboard (API)', 'SP - Sponsored Products (API)'],
  },
  {
    source: 'daily-visuals',
    label: 'Daily visuals',
    kind: 'browser',
    cadence: 'daily',
    freshnessWindowMinutes: 24 * 60,
    retryMinutes: 60,
    outputs: ['Visuals (Browser)'],
  },
  {
    source: 'weekly-browser-sources',
    label: 'Weekly browser sources',
    kind: 'browser',
    cadence: 'weekly',
    freshnessWindowMinutes: 7 * 24 * 60,
    retryMinutes: 60,
    outputs: ['Category Insights (Browser)', 'Product Opportunity Explorer (Browser)', 'KeywordRanking (Browser)', 'Brand Metrics (Browser)'],
  },
  {
    source: 'drive-sync',
    label: 'Drive sync publisher',
    kind: 'publisher',
    cadence: 'interval',
    freshnessWindowMinutes: 5,
    retryMinutes: 5,
    outputs: ['Drive API publish queue'],
  },
]

export function buildDefaultTasks() {
  const definitions = []
  for (const sourceDefinition of SOURCE_DEFINITIONS) {
    for (const market of MARKETS) {
      definitions.push({
        ...sourceDefinition,
        market,
        taskId: `${market}:${sourceDefinition.source}`,
      })
    }
  }
  return definitions
}

export function createEmptyLedger() {
  return {
    version: LEDGER_VERSION,
    updated_at: null,
    locks: {
      runner: {
        owner: null,
        acquired_at: null,
      },
      browser_lane: {
        owner: null,
        acquired_at: null,
      },
    },
    tasks: [],
  }
}

export function loadLedger(file) {
  if (!fs.existsSync(file)) {
    return createEmptyLedger()
  }

  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  assertLedger(parsed)
  return parsed
}

export function saveLedger(file, ledger) {
  assertLedger(ledger)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`)
  fs.renameSync(tmp, file)
}

export function scheduleDueTasks(ledger, definitions, now) {
  const next = cloneLedger(ledger)
  const nowIso = now.toISOString()
  const knownTaskIds = new Set(next.tasks.map((task) => task.task_id))

  for (const definition of definitions) {
    if (!knownTaskIds.has(definition.taskId)) {
      next.tasks.push(createTask(definition, nowIso))
      continue
    }

    const task = findTask(next, definition.taskId)
    task.label = definition.label
    task.kind = definition.kind
    task.cadence = definition.cadence
    task.freshness_window = `${definition.freshnessWindowMinutes}m`
    task.outputs = [...definition.outputs]
    if (isRunningTaskStale(task, now)) {
      markTaskStale(task, nowIso)
      continue
    }
    if (REQUEUEABLE_STATUSES.has(task.status) && task.due_at <= nowIso) {
      task.status = 'queued'
      task.lock_owner = null
    }
  }

  next.updated_at = nowIso
  next.tasks.sort((left, right) => left.task_id.localeCompare(right.task_id))
  return next
}

export function markTaskRunning(ledger, taskId, lockOwner, startedAt) {
  const next = cloneLedger(ledger)
  const task = findTask(next, taskId)
  task.status = 'running'
  task.started_at = startedAt.toISOString()
  task.finished_at = null
  task.lock_owner = lockOwner
  task.attempt += 1
  task.last_error = null
  next.updated_at = startedAt.toISOString()
  return next
}

export function markTaskWaiting(ledger, taskId, result) {
  const next = cloneLedger(ledger)
  const task = findTask(next, taskId)
  const finishedAt = result.finishedAt
  task.status = 'waiting'
  task.finished_at = finishedAt.toISOString()
  task.lock_owner = null
  task.last_error = result.lastError
  task.due_at = addMinutes(finishedAt, result.retryMinutes).toISOString()
  task.metadata = mergeMetadata(task.metadata, result.metadata)
  next.updated_at = finishedAt.toISOString()
  return next
}

export function markTaskFinished(ledger, taskId, result) {
  const next = cloneLedger(ledger)
  const task = findTask(next, taskId)
  const finishedAt = result.finishedAt
  task.status = result.status
  task.finished_at = finishedAt.toISOString()
  task.lock_owner = null
  task.last_error = result.lastError ?? null
  if (result.artifactPath !== undefined) {
    task.artifact_path = result.artifactPath
  }
  if (result.status === 'succeeded') {
    task.due_at = nextDueAtForTask(task, finishedAt)
  } else {
    const retryMinutes = retryMinutesForTask(task)
    task.due_at = addMinutes(finishedAt, retryMinutes).toISOString()
  }
  task.metadata = mergeMetadata(task.metadata, result.metadata)
  next.updated_at = finishedAt.toISOString()
  return next
}

export function nextDueAtForTask(task, finishedAt) {
  const minutes = minutesFromFreshnessWindow(task.freshness_window)
  return addMinutes(finishedAt, minutes).toISOString()
}

export function tryAcquireLock(ledger, owner, now) {
  const next = cloneLedger(ledger)
  const runner = next.locks.runner
  if (runner.owner !== null && runner.acquired_at !== null) {
    const acquiredAt = new Date(runner.acquired_at)
    const ageMs = now.getTime() - acquiredAt.getTime()
    if (ageMs <= RUNNER_LOCK_TTL_MS) {
      return { acquired: false, ledger: next }
    }
  }

  runner.owner = owner
  runner.acquired_at = now.toISOString()
  next.updated_at = now.toISOString()
  return { acquired: true, ledger: next }
}

export function releaseLock(ledger, owner, now) {
  const next = cloneLedger(ledger)
  if (next.locks.runner.owner === owner) {
    next.locks.runner.owner = null
    next.locks.runner.acquired_at = null
    next.updated_at = now.toISOString()
  }
  return next
}

export function tryAcquireBrowserLaneLock(ledger, owner, now) {
  const next = cloneLedger(ledger)
  const browserLane = next.locks.browser_lane
  if (browserLane.owner !== null && browserLane.acquired_at !== null) {
    const acquiredAt = new Date(browserLane.acquired_at)
    const ageMs = now.getTime() - acquiredAt.getTime()
    if (ageMs <= BROWSER_LANE_LOCK_TTL_MS) {
      return { acquired: false, ledger: next }
    }
  }

  browserLane.owner = owner
  browserLane.acquired_at = now.toISOString()
  next.updated_at = now.toISOString()
  return { acquired: true, ledger: next }
}

export function releaseBrowserLaneLock(ledger, owner, now) {
  const next = cloneLedger(ledger)
  if (next.locks.browser_lane.owner === owner) {
    next.locks.browser_lane.owner = null
    next.locks.browser_lane.acquired_at = null
    next.updated_at = now.toISOString()
  }
  return next
}

export function ledgerPathFromEnv() {
  const explicit = process.env.ARGUS_RUNNER_LEDGER_PATH
  if (explicit !== undefined && explicit.trim() !== '') {
    return explicit
  }

  const home = process.env.HOME
  if (home === undefined) {
    throw new Error('Missing HOME environment variable.')
  }
  if (home.trim() === '') {
    throw new Error('Missing HOME environment variable.')
  }
  return path.join(home, '.local/share/targon/argus-runner/task-ledger.json')
}

function createTask(definition, dueAt) {
  return {
    task_id: definition.taskId,
    market: definition.market,
    source: definition.source,
    label: definition.label,
    kind: definition.kind,
    cadence: definition.cadence,
    status: 'queued',
    due_at: dueAt,
    started_at: null,
    finished_at: null,
    attempt: 0,
    lock_owner: null,
    last_error: null,
    artifact_path: null,
    freshness_window: `${definition.freshnessWindowMinutes}m`,
    retry_minutes: definition.retryMinutes,
    outputs: [...definition.outputs],
    metadata: {},
  }
}

function findTask(ledger, taskId) {
  const task = ledger.tasks.find((entry) => entry.task_id === taskId)
  if (task === undefined) {
    throw new Error(`Unknown Argus runner task: ${taskId}`)
  }
  return task
}

function cloneLedger(ledger) {
  return JSON.parse(JSON.stringify(ledger))
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000)
}

function minutesFromFreshnessWindow(value) {
  const match = /^(\d+)m$/.exec(value)
  if (match === null) {
    throw new Error(`Unsupported freshness window: ${value}`)
  }
  return Number(match[1])
}

function retryMinutesForTask(task) {
  if (typeof task.retry_minutes === 'number') {
    return task.retry_minutes
  }
  return 30
}

function isRunningTaskStale(task, now) {
  if (task.status !== 'running') {
    return false
  }
  if (task.started_at === null) {
    return true
  }

  const startedAtMs = Date.parse(task.started_at)
  if (Number.isNaN(startedAtMs)) {
    return true
  }

  const ageMs = now.getTime() - startedAtMs
  return ageMs > staleAfterMsForTaskKind(task.kind)
}

function staleAfterMsForTaskKind(kind) {
  const staleAfterMs = RUNNING_TASK_STALE_AFTER_MS[kind]
  if (staleAfterMs === undefined) {
    throw new Error(`Unsupported Argus runner task kind: ${kind}`)
  }
  return staleAfterMs
}

function markTaskStale(task, finishedAt) {
  const staleStartedAt = task.started_at
  const staleLockOwner = task.lock_owner
  task.status = 'stale'
  task.finished_at = finishedAt
  task.lock_owner = null
  task.last_error = 'stale-running-task'
  task.due_at = finishedAt
  task.metadata = mergeMetadata(task.metadata, {
    outcome: 'stale-running-task',
    staleStartedAt,
    staleLockOwner,
  })
}

function mergeMetadata(existing, updates) {
  const result = { ...existing }
  if (updates !== undefined) {
    for (const [key, value] of Object.entries(updates)) {
      result[key] = value
    }
  }
  return result
}

function assertLedger(ledger) {
  if (ledger.version !== LEDGER_VERSION) {
    throw new Error(`Unsupported Argus runner ledger version: ${ledger.version}`)
  }
  if (!Array.isArray(ledger.tasks)) {
    throw new Error('Argus runner ledger tasks must be an array.')
  }
  for (const task of ledger.tasks) {
    if (!TASK_STATUSES.has(task.status)) {
      throw new Error(`Unsupported Argus runner task status: ${task.status}`)
    }
  }
}
