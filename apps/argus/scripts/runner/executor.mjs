import { spawn } from 'node:child_process'
import path from 'node:path'

const AUTH_PATTERNS = [
  'session expired',
  '/ap/signin',
  'requires authenticated chrome session',
  'master password',
  'bitwarden',
]

const DOWNLOAD_PATTERNS = [
  'download did not create',
  'missing start date',
  'missing end date',
]

const STATUS_BY_OUTCOME = {
  success: 'succeeded',
  'blocked-auth': 'blocked',
  'download-missing': 'failed',
  'validation-failed': 'failed',
  'site-changed': 'failed',
  'api-report-waiting': 'waiting',
  'process-failed': 'failed',
}

export function commandForTask(task, argusDir) {
  const commandMap = {
    'tracking-fetch': {
      program: path.join(argusDir, 'node_modules/.bin/tsx'),
      args: ['scripts/tracking-fetch.ts', '--market', task.market],
    },
    'hourly-listing-attributes-api': {
      program: '/bin/bash',
      args: [path.join(argusDir, 'scripts/api/hourly-listing-attributes/collect.sh'), '--market', task.market],
    },
    'daily-account-health': {
      program: '/bin/bash',
      args: [path.join(argusDir, 'scripts/api/daily-account-health/collect.sh'), '--market', task.market],
    },
    'weekly-api-sources': {
      program: '/bin/bash',
      args: [path.join(argusDir, 'scripts/api/weekly-sources/run.sh'), '--market', task.market],
    },
    'daily-visuals': {
      program: '/bin/bash',
      args: [path.join(argusDir, 'scripts/browser/daily-visuals/collect.sh'), '--market', task.market],
    },
    'weekly-browser-sources': {
      program: '/bin/bash',
      args: [path.join(argusDir, 'scripts/browser/run-weekly.sh'), '--market', task.market],
    },
    'drive-sync': {
      program: process.execPath,
      args: [path.join(argusDir, 'scripts/lib/drive-sync.mjs'), '--market', task.market],
    },
  }

  const command = commandMap[task.source]
  if (command === undefined) {
    throw new Error(`No Argus runner command mapped for source: ${task.source}`)
  }

  const taskId = task.taskId === undefined ? task.task_id : task.taskId
  return {
    taskId,
    program: command.program,
    args: command.args,
    cwd: argusDir,
  }
}

export function selectRunnableTasks(ledger, { now, maxTasks }) {
  const nowIso = now.toISOString()
  const queued = ledger.tasks
    .filter((task) => task.status === 'queued' && task.due_at <= nowIso)
    .sort(taskSort)

  const selected = []
  let browserSelected = false
  for (const task of queued) {
    if (selected.length >= maxTasks) {
      break
    }
    if (task.kind === 'browser') {
      if (browserSelected) {
        continue
      }
      browserSelected = true
    }
    selected.push(task)
  }

  return selected
}

export async function runTask(task, argusDir, env) {
  const command = commandForTask(task, argusDir)
  const result = await spawnAndCapture(command, envForTask(task, env))
  return normalizeExecutionResult({
    taskKind: task.kind,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
  })
}

export function envForTask(task, baseEnv) {
  const env = { ...baseEnv }
  if (task.source === 'weekly-api-sources') {
    env.ARGUS_SPAPI_REPORT_WAIT_TIMEOUT_MS = '60000'
  }
  if (task.source === 'daily-account-health') {
    env.ARGUS_ACCOUNT_HEALTH_REPORT_WAIT_TIMEOUT_MS = '60000'
  }
  return env
}

export function normalizeExecutionResult({ taskKind, exitCode, stdout, stderr }) {
  if (exitCode === 0) {
    return {
      status: 'succeeded',
      lastError: null,
      metadata: { outcome: 'success', exitCode },
    }
  }

  const text = `${stdout}\n${stderr}`.toLowerCase()
  let outcome = 'process-failed'
  let lastError = `process-exit-${exitCode}`

  if (taskKind === 'api' && text.includes('report') && text.includes('timed out')) {
    outcome = 'api-report-waiting'
    lastError = 'api-report-waiting'
  } else if (taskKind === 'browser' && includesAny(text, AUTH_PATTERNS)) {
    outcome = 'blocked-auth'
    lastError = 'browser-auth'
  } else if (taskKind === 'browser' && includesAny(text, DOWNLOAD_PATTERNS)) {
    outcome = 'download-missing'
    lastError = 'download-missing'
  } else if (text.includes('validation')) {
    outcome = 'validation-failed'
    lastError = 'validation-failed'
  } else if (text.includes('unexpected') && text.includes('route')) {
    outcome = 'site-changed'
    lastError = 'site-changed'
  }

  return {
    status: STATUS_BY_OUTCOME[outcome],
    lastError,
    metadata: { outcome, exitCode },
  }
}

function spawnAndCapture(command, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.program, command.args, {
      cwd: command.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === null) {
        reject(new Error(`Argus runner task terminated without exit code: ${command.taskId}`))
        return
      }
      resolve({ exitCode: code, stdout, stderr })
    })
  })
}

function includesAny(text, patterns) {
  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      return true
    }
  }
  return false
}

function taskSort(left, right) {
  const leftPriority = priorityForKind(left.kind)
  const rightPriority = priorityForKind(right.kind)
  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority
  }
  return left.task_id.localeCompare(right.task_id)
}

function priorityForKind(kind) {
  if (kind === 'api') {
    return 1
  }
  if (kind === 'browser') {
    return 2
  }
  if (kind === 'publisher') {
    return 3
  }
  throw new Error(`Unsupported Argus runner task kind: ${kind}`)
}
