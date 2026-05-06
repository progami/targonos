import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const moduleUrl = new URL(`./drive-sync.mjs?test=${Date.now()}`, import.meta.url)

test('Drive sync planner targets Shared Drive folders with supportsAllDrives', async () => {
  const previousRoot = process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US
  const previousWprRoot = process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US
  process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US = 'monitoring-root-us'
  process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US = 'wpr-root-us'

  try {
    const { buildDriveSyncPlan, driveChildSearchUrl } = await import(moduleUrl.href)
    const plan = buildDriveSyncPlan({
      market: 'us',
      relativePath: 'Daily/Visuals (Browser)/Caelum Star/B09HXC3NL8/part1/2026-05-05.png',
      size: 2_000_000,
    })

    assert.equal(plan.rootFolderId, 'monitoring-root-us')
    assert.deepEqual(plan.folderSegments, ['Daily', 'Visuals (Browser)', 'Caelum Star', 'B09HXC3NL8', 'part1'])
    assert.equal(plan.fileName, '2026-05-05.png')
    assert.equal(plan.uploadType, 'resumable')

    const wprPlan = buildDriveSyncPlan({
      market: 'us',
      relativePath: 'Week 1 - 2025-12-28 (Sun)/input/source.csv',
      size: 10,
      scope: 'wpr',
    })
    assert.equal(wprPlan.rootFolderId, 'wpr-root-us')
    assert.equal(wprPlan.scope, 'wpr')

    const searchUrl = driveChildSearchUrl({
      parentId: 'parent-folder',
      name: 'Visuals (Browser)',
      mimeType: 'application/vnd.google-apps.folder',
    })
    assert.match(searchUrl, /supportsAllDrives=true/)
    assert.match(searchUrl, /includeItemsFromAllDrives=true/)
    assert.match(new URL(searchUrl).searchParams.get('q'), /'parent-folder' in parents/)
  } finally {
    if (previousRoot === undefined) {
      delete process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US
    } else {
      process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US = previousRoot
    }
    if (previousWprRoot === undefined) {
      delete process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US
    } else {
      process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US = previousWprRoot
    }
  }
})

test('Drive sync preserves entries enqueued while a drain is running', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-'))
  const previousEnv = {
    ARGUS_MONITORING_ROOT_US: process.env.ARGUS_MONITORING_ROOT_US,
    ARGUS_DRIVE_MONITORING_FOLDER_ID_US: process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US,
    ARGUS_DRIVE_PROFILE: process.env.ARGUS_DRIVE_PROFILE,
    GWORKSPACE_API_BIN: process.env.GWORKSPACE_API_BIN,
    GWORKSPACE_API_PYTHON: process.env.GWORKSPACE_API_PYTHON,
  }

  process.env.ARGUS_MONITORING_ROOT_US = tempRoot
  process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US = 'monitoring-root-us'
  process.env.ARGUS_DRIVE_PROFILE = 'targon'
  process.env.GWORKSPACE_API_BIN = 'gworkspace-api'
  process.env.GWORKSPACE_API_PYTHON = '/bin/echo'

  const queuePath = path.join(tempRoot, '.drive-sync', 'queue.jsonl')
  const firstRelativePath = 'Logs/tracking-fetch/run-log.jsonl'
  const secondRelativePath = 'Logs/daily-account-health/run-log.jsonl'
  const firstLocalPath = path.join(tempRoot, firstRelativePath)
  const secondLocalPath = path.join(tempRoot, secondRelativePath)
  fs.mkdirSync(path.dirname(firstLocalPath), { recursive: true })
  fs.mkdirSync(path.dirname(secondLocalPath), { recursive: true })
  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  fs.writeFileSync(firstLocalPath, 'first\n', 'utf8')
  fs.writeFileSync(secondLocalPath, 'second\n', 'utf8')

  function queueEntry(relativePath, localPath) {
    const stat = fs.statSync(localPath)
    return {
      enqueuedAt: '2026-05-05T17:00:00.000Z',
      market: 'us',
      localPath,
      relativePath,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    }
  }

  fs.writeFileSync(queuePath, `${JSON.stringify(queueEntry(firstRelativePath, firstLocalPath))}\n`, 'utf8')

  let appendedDuringUpload = false
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const requestUrl = new URL(String(url))
    const method = options.method
    if (method === 'PATCH' && requestUrl.pathname.startsWith('/upload/drive/v3/files/')) {
      if (!appendedDuringUpload) {
        appendedDuringUpload = true
        fs.appendFileSync(queuePath, `${JSON.stringify(queueEntry(secondRelativePath, secondLocalPath))}\n`, 'utf8')
      }
      return new Response(JSON.stringify({
        id: 'uploaded-file',
        name: path.basename(firstRelativePath),
        modifiedTime: '2026-05-05T17:01:00.000Z',
      }), { status: 200 })
    }

    return new Response(JSON.stringify({
      files: [{
        id: 'existing-file',
        name: 'existing',
        mimeType: 'application/octet-stream',
        modifiedTime: '2026-05-05T17:00:30.000Z',
      }],
    }), { status: 200 })
  })

  try {
    const { drainDriveSyncQueue } = await import(moduleUrl.href)
    await drainDriveSyncQueue({ market: 'us', dryRun: false })

    const remaining = fs.readFileSync(queuePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(remaining.length, 1)
    assert.equal(remaining[0].relativePath, secondRelativePath)

    const processingFiles = fs.readdirSync(path.dirname(queuePath)).filter((name) => name.includes('.processing'))
    assert.deepEqual(processingFiles, [])
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

test('Drive sync recovers claimed processing queues after early abort', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-recover-'))
  const previousEnv = {
    ARGUS_MONITORING_ROOT_US: process.env.ARGUS_MONITORING_ROOT_US,
    ARGUS_DRIVE_MONITORING_FOLDER_ID_US: process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US,
    ARGUS_DRIVE_PROFILE: process.env.ARGUS_DRIVE_PROFILE,
    GWORKSPACE_API_BIN: process.env.GWORKSPACE_API_BIN,
    GWORKSPACE_API_PYTHON: process.env.GWORKSPACE_API_PYTHON,
  }

  process.env.ARGUS_MONITORING_ROOT_US = tempRoot
  process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US = 'monitoring-root-us'
  process.env.ARGUS_DRIVE_PROFILE = 'targon'
  process.env.GWORKSPACE_API_BIN = 'gworkspace-api'

  const queuePath = path.join(tempRoot, '.drive-sync', 'queue.jsonl')
  const relativePath = 'Logs/hourly-listing-attributes-api/run-log.jsonl'
  const localPath = path.join(tempRoot, relativePath)
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  fs.writeFileSync(localPath, 'hourly\n', 'utf8')

  const stat = fs.statSync(localPath)
  const entry = {
    enqueuedAt: '2026-05-05T17:00:00.000Z',
    market: 'us',
    localPath,
    relativePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  }
  fs.writeFileSync(queuePath, `${JSON.stringify(entry)}\n`, 'utf8')

  try {
    const { drainDriveSyncQueue } = await import(moduleUrl.href)

    process.env.GWORKSPACE_API_PYTHON = '/usr/bin/false'
    await assert.rejects(
      drainDriveSyncQueue({ market: 'us', dryRun: false }),
      /Command failed: \/usr\/bin\/false/,
    )

    assert.equal(fs.existsSync(queuePath), false)
    const queueDir = path.dirname(queuePath)
    const [processingName] = fs.readdirSync(queueDir).filter((name) => name.endsWith('.processing'))
    assert.notEqual(processingName, undefined)
    fs.renameSync(
      path.join(queueDir, processingName),
      path.join(queueDir, processingName.replace(`.${process.pid}.`, '.999999.')),
    )

    process.env.GWORKSPACE_API_PYTHON = '/bin/echo'
    t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
      const requestUrl = new URL(String(url))
      const method = options.method
      if (method === 'PATCH' && requestUrl.pathname.startsWith('/upload/drive/v3/files/')) {
        return new Response(JSON.stringify({
          id: 'uploaded-file',
          name: path.basename(relativePath),
          modifiedTime: '2026-05-05T17:01:00.000Z',
        }), { status: 200 })
      }

      return new Response(JSON.stringify({
        files: [{
          id: 'existing-file',
          name: 'existing',
          mimeType: 'application/octet-stream',
          modifiedTime: '2026-05-05T17:00:30.000Z',
        }],
      }), { status: 200 })
    })

    await drainDriveSyncQueue({ market: 'us', dryRun: false })

    assert.equal(fs.existsSync(queuePath), false)
    assert.deepEqual(
      fs.readdirSync(path.dirname(queuePath)).filter((name) => name.endsWith('.processing')),
      [],
    )
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

test('Drive sync leaves active processing queues owned by a running process', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-active-'))
  const previousEnv = {
    ARGUS_MONITORING_ROOT_US: process.env.ARGUS_MONITORING_ROOT_US,
    ARGUS_DRIVE_MONITORING_FOLDER_ID_US: process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US,
    ARGUS_DRIVE_PROFILE: process.env.ARGUS_DRIVE_PROFILE,
    GWORKSPACE_API_BIN: process.env.GWORKSPACE_API_BIN,
    GWORKSPACE_API_PYTHON: process.env.GWORKSPACE_API_PYTHON,
  }

  process.env.ARGUS_MONITORING_ROOT_US = tempRoot
  process.env.ARGUS_DRIVE_MONITORING_FOLDER_ID_US = 'monitoring-root-us'
  process.env.ARGUS_DRIVE_PROFILE = 'targon'
  process.env.GWORKSPACE_API_BIN = 'gworkspace-api'
  process.env.GWORKSPACE_API_PYTHON = '/bin/echo'

  const queuePath = path.join(tempRoot, '.drive-sync', 'queue.jsonl')
  const processingPath = `${queuePath}.${process.pid}.1778104187891.processing`
  const relativePath = 'Logs/hourly-listing-attributes-api/run-log.jsonl'
  const localPath = path.join(tempRoot, relativePath)
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  fs.writeFileSync(localPath, 'hourly\n', 'utf8')

  const stat = fs.statSync(localPath)
  fs.writeFileSync(processingPath, `${JSON.stringify({
    enqueuedAt: '2026-05-05T17:00:00.000Z',
    market: 'us',
    localPath,
    relativePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  })}\n`, 'utf8')

  try {
    const { drainDriveSyncQueue } = await import(moduleUrl.href)
    await drainDriveSyncQueue({ market: 'us', dryRun: false })

    assert.equal(fs.existsSync(processingPath), true)
    assert.equal(fs.existsSync(queuePath), false)
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
