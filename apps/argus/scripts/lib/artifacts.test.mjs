import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const moduleUrl = new URL(`./artifacts.mjs?test=${Date.now()}`, import.meta.url)

test('Argus artifacts write to local monitoring roots and enqueue Drive sync', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-artifacts-'))
  const previousRoot = process.env.ARGUS_MONITORING_ROOT_US
  const previousSalesRoot = process.env.ARGUS_SALES_ROOT_US

  process.env.ARGUS_MONITORING_ROOT_US = path.join(tempRoot, 'monitoring-us')
  delete process.env.ARGUS_SALES_ROOT_US

  try {
    const { appendRunLog, monitoringRootForMarket, writeTextArtifact } = await import(moduleUrl.href)

    const root = monitoringRootForMarket('us')
    assert.equal(root, path.join(tempRoot, 'monitoring-us'))
    assert.doesNotMatch(root, /CloudStorage/)

    const artifact = writeTextArtifact({
      market: 'us',
      relativePath: 'Hourly/Listing Attributes (API)/latest_state.json',
      content: '{"ok":true}\n',
    })
    assert.equal(fs.readFileSync(artifact.localPath, 'utf8'), '{"ok":true}\n')

    appendRunLog({
      market: 'us',
      jobId: 'tracking-fetch',
      entry: {
        timestamp: '2026-05-05T16:00:00.000Z',
        status: 'ok',
        summary: 'probe',
        durationMs: 1,
      },
    })

    const queuePath = path.join(root, '.drive-sync', 'queue.jsonl')
    const queued = fs.readFileSync(queuePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))

    assert.deepEqual(
      queued.map((entry) => entry.relativePath),
      [
        'Hourly/Listing Attributes (API)/latest_state.json',
        'Logs/tracking-fetch/run-log.jsonl',
      ],
    )
    assert.ok(queued.every((entry) => entry.market === 'us'))
  } finally {
    if (previousRoot === undefined) {
      delete process.env.ARGUS_MONITORING_ROOT_US
    } else {
      process.env.ARGUS_MONITORING_ROOT_US = previousRoot
    }
    if (previousSalesRoot === undefined) {
      delete process.env.ARGUS_SALES_ROOT_US
    } else {
      process.env.ARGUS_SALES_ROOT_US = previousSalesRoot
    }
  }
})
