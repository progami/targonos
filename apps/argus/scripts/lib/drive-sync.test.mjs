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
      relativePath: 'W01/input/source.csv',
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

test('Drive sync skips queue entries already matching the published ledger', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-published-'))
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
  process.env.GWORKSPACE_API_PYTHON = '/usr/bin/false'

  const queuePath = path.join(tempRoot, '.drive-sync', 'queue.jsonl')
  const publishedPath = path.join(tempRoot, '.drive-sync', 'published.json')
  const relativePath = 'Logs/tracking-fetch/run-log.jsonl'
  const localPath = path.join(tempRoot, relativePath)
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  fs.writeFileSync(localPath, 'already uploaded\n', 'utf8')

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
  fs.writeFileSync(publishedPath, `${JSON.stringify({
    version: 1,
    items: {
      [relativePath]: {
        relativePath,
        localPath,
        fileId: 'existing-drive-file',
        driveModifiedTime: '2026-05-05T17:01:00.000Z',
        publishedAt: '2026-05-05T17:01:01.000Z',
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      },
    },
  }, null, 2)}\n`, 'utf8')

  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('Already-published queue entries must not call Drive API')
  })

  try {
    const { drainDriveSyncQueue } = await import(moduleUrl.href)
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

test('WPR Drive sync does not touch Drive when the queue is empty', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-wpr-empty-'))
  const wprRoot = path.join(tempRoot, 'WPR')
  const previousEnv = {
    ARGUS_MONITORING_ROOT_US: process.env.ARGUS_MONITORING_ROOT_US,
    ARGUS_DRIVE_WPR_FOLDER_ID_US: process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US,
    WPR_DATA_DIR_US: process.env.WPR_DATA_DIR_US,
    ARGUS_DRIVE_PROFILE: process.env.ARGUS_DRIVE_PROFILE,
    GWORKSPACE_API_BIN: process.env.GWORKSPACE_API_BIN,
    GWORKSPACE_API_PYTHON: process.env.GWORKSPACE_API_PYTHON,
  }

  process.env.ARGUS_MONITORING_ROOT_US = tempRoot
  process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US = 'wpr-root-us'
  process.env.WPR_DATA_DIR_US = path.join(wprRoot, 'wpr-workspace', 'output')
  process.env.ARGUS_DRIVE_PROFILE = 'targon'
  process.env.GWORKSPACE_API_BIN = 'gworkspace-api'
  process.env.GWORKSPACE_API_PYTHON = '/usr/bin/false'

  t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('Empty WPR queues must not call Drive API')
  })

  try {
    const { drainScopedDriveSyncQueue } = await import(moduleUrl.href)
    await drainScopedDriveSyncQueue({ market: 'us', dryRun: false, scope: 'wpr' })
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

test('WPR Drive sync quarantines stale and noncanonical queue entries before publishing', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-wpr-reject-'))
  const wprRoot = path.join(tempRoot, 'WPR')
  const previousEnv = {
    ARGUS_MONITORING_ROOT_US: process.env.ARGUS_MONITORING_ROOT_US,
    ARGUS_DRIVE_WPR_FOLDER_ID_US: process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US,
    WPR_DATA_DIR_US: process.env.WPR_DATA_DIR_US,
    ARGUS_DRIVE_PROFILE: process.env.ARGUS_DRIVE_PROFILE,
    GWORKSPACE_API_BIN: process.env.GWORKSPACE_API_BIN,
    GWORKSPACE_API_PYTHON: process.env.GWORKSPACE_API_PYTHON,
  }

  process.env.ARGUS_MONITORING_ROOT_US = tempRoot
  process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US = 'wpr-root-us'
  process.env.WPR_DATA_DIR_US = path.join(wprRoot, 'wpr-workspace', 'output')
  process.env.ARGUS_DRIVE_PROFILE = 'targon'
  process.env.GWORKSPACE_API_BIN = 'gworkspace-api'
  process.env.GWORKSPACE_API_PYTHON = '/bin/echo'

  const queuePath = path.join(tempRoot, '.drive-sync', 'wpr-queue.jsonl')
  const staleLocalPath = path.join(tempRoot, 'missing.csv')
  const invalidLocalPath = path.join(tempRoot, 'legacy.csv')
  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  fs.writeFileSync(invalidLocalPath, 'legacy\n', 'utf8')

  const staleEntry = {
    enqueuedAt: '2026-05-05T17:00:00.000Z',
    market: 'us',
    localPath: staleLocalPath,
    relativePath: 'W16/input/source.csv',
    size: 12,
    mtimeMs: 1,
  }
  const invalidEntry = {
    enqueuedAt: '2026-05-05T17:00:00.000Z',
    market: 'us',
    localPath: invalidLocalPath,
    relativePath: 'Week 16 - 2026-04-12 (Sun)/input/source.csv',
    size: fs.statSync(invalidLocalPath).size,
    mtimeMs: fs.statSync(invalidLocalPath).mtimeMs,
  }
  fs.writeFileSync(queuePath, `${JSON.stringify(staleEntry)}\n${JSON.stringify(invalidEntry)}\n`, 'utf8')

  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const requestUrl = new URL(String(url))
    assert.equal(options.method, 'GET')
    assert.equal(requestUrl.pathname, '/drive/v3/files')
    return new Response(JSON.stringify({ files: [] }), { status: 200 })
  })

  try {
    const { drainScopedDriveSyncQueue } = await import(moduleUrl.href)
    await drainScopedDriveSyncQueue({ market: 'us', dryRun: false, scope: 'wpr' })

    assert.equal(fs.existsSync(queuePath), false)
    const rejectedPath = path.join(tempRoot, '.drive-sync', 'wpr-rejected.jsonl')
    const rejectedEntries = fs.readFileSync(rejectedPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
    assert.equal(rejectedEntries.length, 2)
    assert.match(rejectedEntries[0].reason, /missing local file/)
    assert.match(rejectedEntries[1].reason, /noncanonical WPR Drive sync path/)
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

test('WPR Drive sync prunes remote files missing from the local WPR tree', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-wpr-prune-'))
  const wprRoot = path.join(tempRoot, 'WPR')
  const previousEnv = {
    ARGUS_DRIVE_WPR_FOLDER_ID_US: process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US,
    WPR_DATA_DIR_US: process.env.WPR_DATA_DIR_US,
  }

  process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US = 'wpr-root-us'
  process.env.WPR_DATA_DIR_US = path.join(wprRoot, 'wpr-workspace', 'output')

  const localFile = path.join(wprRoot, 'W01', 'input', 'source.csv')
  fs.mkdirSync(path.dirname(localFile), { recursive: true })
  fs.writeFileSync(localFile, 'source\n', 'utf8')
  fs.mkdirSync(path.join(wprRoot, 'wpr-workspace', 'output'), { recursive: true })

  const trashedIds = []
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const requestUrl = new URL(String(url))
    if (options.method === 'GET') {
      const query = requestUrl.searchParams.get('q') ?? ''
      if (query.includes("'wpr-root-us' in parents")) {
        return new Response(JSON.stringify({
          files: [
            {
              id: 'remote-w01-old',
              name: 'W01',
              mimeType: 'application/vnd.google-apps.folder',
              modifiedTime: '2026-05-05T17:00:00.000Z',
            },
            {
              id: 'remote-w01',
              name: 'W01',
              mimeType: 'application/vnd.google-apps.folder',
              modifiedTime: '2026-05-05T18:00:00.000Z',
            },
            { id: 'remote-w41', name: 'W41', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'remote-snapshot', name: 'Listings-Snapshot-History.csv', mimeType: 'text/csv' },
          ],
        }), { status: 200 })
      }
      if (query.includes("'remote-w01' in parents")) {
        return new Response(JSON.stringify({
          files: [
            { id: 'remote-input', name: 'input', mimeType: 'application/vnd.google-apps.folder' },
            { id: 'remote-stale-folder', name: 'Sellerboard (API)', mimeType: 'application/vnd.google-apps.folder' },
          ],
        }), { status: 200 })
      }
      if (query.includes("'remote-input' in parents")) {
        return new Response(JSON.stringify({
          files: [
            { id: 'remote-source', name: 'source.csv', mimeType: 'text/csv' },
            { id: 'remote-stale-source', name: 'Listings-Snapshot-History.csv', mimeType: 'text/csv' },
          ],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }
    if (options.method === 'PATCH' && requestUrl.pathname.startsWith('/drive/v3/files/')) {
      const body = JSON.parse(options.body)
      assert.equal(body.trashed, true)
      trashedIds.push(decodeURIComponent(requestUrl.pathname.split('/').at(-1)))
      return new Response(JSON.stringify({ id: trashedIds.at(-1), trashed: true }), { status: 200 })
    }
    assert.fail(`Unexpected Drive API request: ${options.method} ${requestUrl.pathname}`)
  })

  try {
    const { pruneRemoteWprTree } = await import(moduleUrl.href)
    await pruneRemoteWprTree({ token: 'token', market: 'us' })

    assert.deepEqual(
      trashedIds.sort(),
      ['remote-snapshot', 'remote-stale-folder', 'remote-stale-source', 'remote-w01-old', 'remote-w41'].sort(),
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

test('WPR Drive sync republishes queued entries even when the ledger says published', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'argus-drive-sync-wpr-republish-'))
  const wprRoot = path.join(tempRoot, 'WPR')
  const previousEnv = {
    ARGUS_MONITORING_ROOT_US: process.env.ARGUS_MONITORING_ROOT_US,
    ARGUS_DRIVE_WPR_FOLDER_ID_US: process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US,
    WPR_DATA_DIR_US: process.env.WPR_DATA_DIR_US,
    ARGUS_DRIVE_PROFILE: process.env.ARGUS_DRIVE_PROFILE,
    GWORKSPACE_API_BIN: process.env.GWORKSPACE_API_BIN,
    GWORKSPACE_API_PYTHON: process.env.GWORKSPACE_API_PYTHON,
  }

  process.env.ARGUS_MONITORING_ROOT_US = tempRoot
  process.env.ARGUS_DRIVE_WPR_FOLDER_ID_US = 'wpr-root-us'
  process.env.WPR_DATA_DIR_US = path.join(wprRoot, 'wpr-workspace', 'output')
  process.env.ARGUS_DRIVE_PROFILE = 'targon'
  process.env.GWORKSPACE_API_BIN = 'gworkspace-api'
  process.env.GWORKSPACE_API_PYTHON = '/bin/echo'

  const relativePath = 'W01/input/source.csv'
  const localPath = path.join(wprRoot, relativePath)
  const queuePath = path.join(tempRoot, '.drive-sync', 'wpr-queue.jsonl')
  const publishedPath = path.join(tempRoot, '.drive-sync', 'wpr-published.json')
  fs.mkdirSync(path.dirname(localPath), { recursive: true })
  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  fs.mkdirSync(path.join(wprRoot, 'wpr-workspace', 'output'), { recursive: true })
  fs.writeFileSync(localPath, 'source\n', 'utf8')

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
  fs.writeFileSync(publishedPath, `${JSON.stringify({
    version: 1,
    items: {
      [relativePath]: {
        ...entry,
        fileId: 'remote-source',
        driveModifiedTime: '2026-05-05T17:01:00.000Z',
        publishedAt: '2026-05-05T17:01:01.000Z',
      },
    },
  }, null, 2)}\n`, 'utf8')

  let uploaded = false
  t.mock.method(globalThis, 'fetch', async (url, options = {}) => {
    const requestUrl = new URL(String(url))
    if (options.method === 'GET') {
      const query = requestUrl.searchParams.get('q') ?? ''
      if (query.includes("'wpr-root-us' in parents") && query.includes("name = 'W01'")) {
        return new Response(JSON.stringify({
          files: [{ id: 'remote-w01', name: 'W01', mimeType: 'application/vnd.google-apps.folder' }],
        }), { status: 200 })
      }
      if (query.includes("'remote-w01' in parents") && query.includes("name = 'input'")) {
        return new Response(JSON.stringify({
          files: [{ id: 'remote-input', name: 'input', mimeType: 'application/vnd.google-apps.folder' }],
        }), { status: 200 })
      }
      if (query.includes("'remote-input' in parents") && query.includes("name = 'source.csv'")) {
        return new Response(JSON.stringify({
          files: [{ id: 'remote-source', name: 'source.csv', mimeType: 'text/csv' }],
        }), { status: 200 })
      }
      if (query.includes("'wpr-root-us' in parents")) {
        return new Response(JSON.stringify({
          files: [{ id: 'remote-w01', name: 'W01', mimeType: 'application/vnd.google-apps.folder' }],
        }), { status: 200 })
      }
      if (query.includes("'remote-w01' in parents")) {
        return new Response(JSON.stringify({
          files: [{ id: 'remote-input', name: 'input', mimeType: 'application/vnd.google-apps.folder' }],
        }), { status: 200 })
      }
      if (query.includes("'remote-input' in parents")) {
        return new Response(JSON.stringify({
          files: [{ id: 'remote-source', name: 'source.csv', mimeType: 'text/csv' }],
        }), { status: 200 })
      }
      return new Response(JSON.stringify({ files: [] }), { status: 200 })
    }
    if (options.method === 'PATCH' && requestUrl.pathname.startsWith('/upload/drive/v3/files/')) {
      uploaded = true
      return new Response(JSON.stringify({
        id: 'remote-source',
        name: 'source.csv',
        modifiedTime: '2026-05-05T17:02:00.000Z',
      }), { status: 200 })
    }
    assert.fail(`Unexpected Drive API request: ${options.method} ${requestUrl.pathname}`)
  })

  try {
    const { drainScopedDriveSyncQueue } = await import(moduleUrl.href)
    await drainScopedDriveSyncQueue({ market: 'us', dryRun: false, scope: 'wpr' })

    assert.equal(uploaded, true)
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
