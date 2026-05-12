#!/usr/bin/env node

import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runTask, selectRunnableTasks } from './executor.mjs'
import {
  buildDefaultTasks,
  ledgerPathFromEnv,
  loadLedger,
  markTaskFinished,
  markTaskWaiting,
  markTaskRunning,
  releaseBrowserLaneLock,
  releaseLock,
  saveLedger,
  scheduleDueTasks,
  tryAcquireBrowserLaneLock,
  tryAcquireLock,
} from './task-store.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ARGUS_DIR = path.resolve(__dirname, '../..')

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.command === 'tick') {
    await tick(args)
    return
  }
  if (args.command === 'health') {
    health(args)
    return
  }
  throw new Error(`Unsupported Argus runner command: ${args.command}`)
}

function parseArgs(argv) {
  const command = argv[0]
  if (command === undefined) {
    throw new Error('Usage: runner tick|health')
  }

  const args = {
    command,
    dryRun: false,
    maxTasks: 14,
  }

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (arg === '--max-tasks') {
      const value = argv[index + 1]
      if (value === undefined) {
        throw new Error('--max-tasks requires a number.')
      }
      args.maxTasks = Number(value)
      index += 1
      continue
    }
    throw new Error(`Unknown runner argument: ${arg}`)
  }

  return args
}

async function tick(args) {
  const now = new Date()
  const owner = `${os.hostname()}:${process.pid}`
  const ledgerPath = ledgerPathFromEnv()
  let ledger = loadLedger(ledgerPath)
  const lock = tryAcquireLock(ledger, owner, now)
  ledger = lock.ledger

  if (!lock.acquired) {
    saveLedger(ledgerPath, ledger)
    console.log('Argus runner tick skipped: runner lock already held.')
    return
  }
  saveLedger(ledgerPath, ledger)

  try {
    ledger = scheduleDueTasks(ledger, buildDefaultTasks(), now)
    const runnable = selectRunnableTasks(ledger, { now, maxTasks: args.maxTasks })
    if (args.dryRun) {
      console.log(JSON.stringify({ selected: runnable.map((task) => task.task_id) }, null, 2))
      return
    }
    saveLedger(ledgerPath, ledger)

    for (const task of runnable) {
      if (task.kind === 'browser') {
        ledger = loadLedger(ledgerPath)
        const browserLaneLock = tryAcquireBrowserLaneLock(ledger, owner, new Date())
        ledger = browserLaneLock.ledger
        if (!browserLaneLock.acquired) {
          ledger = markTaskWaiting(ledger, task.task_id, {
            finishedAt: new Date(),
            lastError: 'browser-lane-busy',
            retryMinutes: 5,
            metadata: { outcome: 'browser-lane-busy' },
          })
          saveLedger(ledgerPath, ledger)
          continue
        }
        saveLedger(ledgerPath, ledger)
      }

      try {
        await executeTask({ task, owner, ledgerPath })
      } finally {
        if (task.kind === 'browser') {
          ledger = loadLedger(ledgerPath)
          ledger = releaseBrowserLaneLock(ledger, owner, new Date())
          saveLedger(ledgerPath, ledger)
        }
      }
    }
  } finally {
    ledger = loadLedger(ledgerPath)
    ledger = releaseLock(ledger, owner, new Date())
    saveLedger(ledgerPath, ledger)
  }
}

async function executeTask({ task, owner, ledgerPath }) {
  let ledger = loadLedger(ledgerPath)
  const startedAt = new Date()
  ledger = markTaskRunning(ledger, task.task_id, owner, startedAt)
  saveLedger(ledgerPath, ledger)
  let result
  try {
    result = await runTask(task, ARGUS_DIR, process.env)
  } catch (error) {
    result = {
      status: 'failed',
      lastError: error instanceof Error ? error.message : String(error),
      metadata: { outcome: 'process-error' },
    }
  }
  ledger = loadLedger(ledgerPath)
  ledger = markTaskFinished(ledger, task.task_id, {
    ...result,
    finishedAt: new Date(),
  })
  saveLedger(ledgerPath, ledger)
}

function health() {
  const ledger = loadLedger(ledgerPathFromEnv())
  console.log(JSON.stringify(ledger, null, 2))
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
