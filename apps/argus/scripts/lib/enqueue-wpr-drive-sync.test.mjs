import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const moduleUrl = new URL(`./enqueue-wpr-drive-sync.mjs?test=${Date.now()}`, import.meta.url)

test('WPR Drive enqueue publishes canonical week folders and workspace output', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-wpr-enqueue-'))
  const monitoringRoot = path.join(tempRoot, 'monitoring-us')
  const wprRoot = path.join(tempRoot, 'wpr-us', 'WPR')
  const previousEnv = {
    ARGUS_MONITORING_ROOT_US: process.env.ARGUS_MONITORING_ROOT_US,
    WPR_DATA_DIR_US: process.env.WPR_DATA_DIR_US,
  }

  process.env.ARGUS_MONITORING_ROOT_US = monitoringRoot
  process.env.WPR_DATA_DIR_US = path.join(wprRoot, 'wpr-workspace', 'output')

  const weekFile = path.join(wprRoot, 'W01', 'input', 'source.csv')
  const workspaceFile = path.join(wprRoot, 'wpr-workspace', 'output', 'wpr-data-latest.json')
  fs.mkdirSync(path.dirname(weekFile), { recursive: true })
  fs.mkdirSync(path.dirname(workspaceFile), { recursive: true })
  fs.writeFileSync(weekFile, 'wpr\n', 'utf8')
  fs.writeFileSync(workspaceFile, '{}\n', 'utf8')

  try {
    const { enqueueWprWeekTrees } = await import(moduleUrl.href)
    const count = enqueueWprWeekTrees({ market: 'us', root: wprRoot })
    assert.equal(count, 2)

    const queuePath = path.join(monitoringRoot, '.drive-sync', 'wpr-queue.jsonl')
    const queued = fs.readFileSync(queuePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.deepEqual(queued.map((entry) => entry.relativePath).sort(), [
      'W01/input/source.csv',
      'wpr-workspace/output/wpr-data-latest.json',
    ])
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
})
