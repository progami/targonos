import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cliScript = path.join(__dirname, 'cli.mjs')
const cliSource = fs.readFileSync(cliScript, 'utf8')

test('runner tick bootstraps the scheduled ledger before collector execution', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-runner-cli-'))
  const ledgerPath = path.join(tempRoot, 'ledger.json')

  execFileSync(process.execPath, [cliScript, 'tick', '--max-tasks', '0'], {
    env: {
      ...process.env,
      ARGUS_RUNNER_LEDGER_PATH: ledgerPath,
      HOME: tempRoot,
    },
    stdio: 'pipe',
  })

  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'))
  assert.equal(ledger.locks.runner.owner, null)
  assert.equal(ledger.tasks.length, 14)
  assert.equal(ledger.tasks.every((task) => task.status === 'queued'), true)
})

test('runner tick persists the global lock before doing scheduled work', () => {
  assert.match(
    cliSource,
    /if \(!lock\.acquired\) \{[\s\S]*return\n  \}\n  saveLedger\(ledgerPath, ledger\)\n\n  try \{/,
  )
})
