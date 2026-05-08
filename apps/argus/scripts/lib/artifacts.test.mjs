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
  const previousWprDataDir = process.env.WPR_DATA_DIR_US

  process.env.ARGUS_MONITORING_ROOT_US = path.join(tempRoot, 'monitoring-us')
  process.env.WPR_DATA_DIR_US = path.join(tempRoot, 'wpr-us', 'WPR', 'wpr-workspace', 'output')
  delete process.env.ARGUS_SALES_ROOT_US

  try {
    const { appendRunLog, enqueueWprDriveSync, monitoringRootForMarket, wprRootForMarket, writeTextArtifact } = await import(moduleUrl.href)

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

    const wprRoot = wprRootForMarket('us')
    assert.equal(wprRoot, path.join(tempRoot, 'wpr-us', 'WPR'))
    const wprArtifactPath = path.join(wprRoot, 'W01', 'input', 'source.csv')
    fs.mkdirSync(path.dirname(wprArtifactPath), { recursive: true })
    fs.writeFileSync(wprArtifactPath, 'wpr\n', 'utf8')
    enqueueWprDriveSync({ market: 'us', localPath: wprArtifactPath })
    const wprQueuePath = path.join(root, '.drive-sync', 'wpr-queue.jsonl')
    const wprQueued = fs.readFileSync(wprQueuePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(wprQueued[0].relativePath, 'W01/input/source.csv')

    const workspaceArtifactPath = path.join(wprRoot, 'wpr-workspace', 'output', 'wpr-data-latest.json')
    fs.mkdirSync(path.dirname(workspaceArtifactPath), { recursive: true })
    fs.writeFileSync(workspaceArtifactPath, '{}\n', 'utf8')
    assert.throws(
      () => enqueueWprDriveSync({ market: 'us', localPath: workspaceArtifactPath }),
      /WPR Drive sync path must start with a canonical WNN week folder: wpr-workspace\/output\/wpr-data-latest\.json/,
    )

    const duplicateNamedArtifactPath = path.join(wprRoot, 'W01', 'input', 'source (1).csv')
    fs.writeFileSync(duplicateNamedArtifactPath, 'wpr\n', 'utf8')
    assert.throws(
      () => enqueueWprDriveSync({ market: 'us', localPath: duplicateNamedArtifactPath }),
      /WPR Drive sync path contains a noncanonical artifact name: W01\/input\/source \(1\)\.csv/,
    )
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
    if (previousWprDataDir === undefined) {
      delete process.env.WPR_DATA_DIR_US
    } else {
      process.env.WPR_DATA_DIR_US = previousWprDataDir
    }
  }
})
