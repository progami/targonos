#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  WPR_NONCANONICAL_NAME_RE,
  driveSyncQueuePath,
  isPublishableWprRelativePath,
  marketEnvSuffix,
  monitoringRootForMarket,
  normalizeArtifactRelativePath,
  parseArgusMarket,
  requireEnv,
  wprDriveSyncQueuePath,
  wprRootForMarket,
} from './artifacts.mjs'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 1024 * 1024
const DRIVE_SYNC_PUBLISHED_RELATIVE_PATH = '.drive-sync/published.json'
const WPR_DRIVE_SYNC_PUBLISHED_RELATIVE_PATH = '.drive-sync/wpr-published.json'
const DRIVE_SYNC_REJECTED_RELATIVE_PATH = '.drive-sync/rejected.jsonl'
const WPR_DRIVE_SYNC_REJECTED_RELATIVE_PATH = '.drive-sync/wpr-rejected.jsonl'
const DRIVE_SYNC_SCOPES = new Set(['monitoring', 'wpr'])
const WPR_WORKSPACE_LOCK_FILE = '/tmp/argus-wpr-workspace.lock'
const WPR_DRIVE_SYNC_LOCK_ENV = 'ARGUS_WPR_DRIVE_SYNC_LOCKED'

function driveApiUrl(pathname, params = {}) {
  const url = new URL(pathname, 'https://www.googleapis.com')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

export function driveChildSearchUrl({ parentId, name, mimeType }) {
  const queryParts = [
    `'${escapeDriveQueryValue(parentId)}' in parents`,
    `name = '${escapeDriveQueryValue(name)}'`,
    'trashed = false',
  ]
  if (mimeType !== undefined) {
    queryParts.push(`mimeType = '${escapeDriveQueryValue(mimeType)}'`)
  }

  return driveApiUrl('/drive/v3/files', {
    q: queryParts.join(' and '),
    fields: 'files(id,name,mimeType,modifiedTime)',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    pageSize: '10',
  })
}

export function parseDriveSyncScope(raw) {
  const value = String(raw).trim().toLowerCase()
  if (DRIVE_SYNC_SCOPES.has(value)) return value
  throw new Error(`Unsupported Drive sync scope: ${raw}`)
}

export function driveRootFolderIdForMarket(market, scope = 'monitoring') {
  const parsedScope = parseDriveSyncScope(scope)
  const prefix = parsedScope === 'wpr' ? 'ARGUS_DRIVE_WPR_FOLDER_ID' : 'ARGUS_DRIVE_MONITORING_FOLDER_ID'
  return requireEnv(`${prefix}_${marketEnvSuffix(market)}`)
}

export function buildDriveSyncPlan({ market, relativePath, size, scope = 'monitoring' }) {
  const parsedMarket = parseArgusMarket(market)
  const parsedScope = parseDriveSyncScope(scope)
  const normalizedRelativePath = normalizeArtifactRelativePath(relativePath)
  const segments = normalizedRelativePath.split('/')
  if (segments.length < 1) {
    throw new Error(`Invalid Drive sync path: ${relativePath}`)
  }

  const fileName = segments[segments.length - 1]
  if (fileName === '') {
    throw new Error(`Invalid Drive sync file path: ${relativePath}`)
  }

  const uploadType = Number(size) >= RESUMABLE_UPLOAD_THRESHOLD_BYTES ? 'resumable' : 'media'
  return {
    market: parsedMarket,
    scope: parsedScope,
    rootFolderId: driveRootFolderIdForMarket(parsedMarket, parsedScope),
    relativePath: normalizedRelativePath,
    folderSegments: segments.slice(0, -1),
    fileName,
    uploadType,
  }
}

function contentTypeForFile(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  if (extension === '.csv') return 'text/csv'
  if (extension === '.json') return 'application/json'
  if (extension === '.jsonl') return 'application/x-ndjson'
  if (extension === '.png') return 'image/png'
  if (extension === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (extension === '.html') return 'text/html'
  if (extension === '.txt') return 'text/plain'
  return 'application/octet-stream'
}

function gworkspaceApiArgs(command, args) {
  return [
    requireEnv('GWORKSPACE_API_BIN'),
    command,
    ...args,
    '--profile',
    requireEnv('ARGUS_DRIVE_PROFILE'),
    '--scope',
    DRIVE_SCOPE,
  ]
}

function accessToken() {
  return execFileSync(
    requireEnv('GWORKSPACE_API_PYTHON'),
    gworkspaceApiArgs('token', []),
    { encoding: 'utf8' },
  ).trim()
}

async function driveJsonRequest({ method, url, token, body }) {
  const headers = { Authorization: `Bearer ${token}` }
  const options = { method, headers }
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    options.body = JSON.stringify(body)
  }

  const response = await fetch(url, options)
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Drive API ${method} failed ${response.status}: ${text}`)
  }
  if (text.trim() === '') {
    return {}
  }
  return JSON.parse(text)
}

async function findChild({ token, parentId, name, mimeType }) {
  const data = await driveJsonRequest({
    method: 'GET',
    url: driveChildSearchUrl({ parentId, name, mimeType }),
    token,
  })
  const files = Array.isArray(data.files) ? data.files : []
  return files[0] ?? null
}

async function createFolder({ token, parentId, name }) {
  return driveJsonRequest({
    method: 'POST',
    url: driveApiUrl('/drive/v3/files', {
      fields: 'id,name,mimeType,modifiedTime',
      supportsAllDrives: 'true',
    }),
    token,
    body: {
      name,
      mimeType: FOLDER_MIME_TYPE,
      parents: [parentId],
    },
  })
}

async function listChildren({ token, parentId }) {
  const files = []
  let pageToken = null
  do {
    const params = {
      q: [
        `'${escapeDriveQueryValue(parentId)}' in parents`,
        'trashed = false',
      ].join(' and '),
      fields: 'nextPageToken,files(id,name,mimeType,modifiedTime)',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      pageSize: '1000',
    }
    if (pageToken !== null) {
      params.pageToken = pageToken
    }
    const data = await driveJsonRequest({
      method: 'GET',
      url: driveApiUrl('/drive/v3/files', params),
      token,
    })
    files.push(...(Array.isArray(data.files) ? data.files : []))
    pageToken = typeof data.nextPageToken === 'string' ? data.nextPageToken : null
  } while (pageToken !== null)
  return files
}

async function ensureFolderPath({ token, rootFolderId, folderSegments }) {
  let parentId = rootFolderId
  for (const name of folderSegments) {
    const existing = await findChild({ token, parentId, name, mimeType: FOLDER_MIME_TYPE })
    if (existing !== null) {
      parentId = existing.id
      continue
    }
    const created = await createFolder({ token, parentId, name })
    parentId = created.id
  }
  return parentId
}

async function trashDriveFile({ token, fileId }) {
  return driveJsonRequest({
    method: 'PATCH',
    url: driveApiUrl(`/drive/v3/files/${encodeURIComponent(fileId)}`, {
      fields: 'id,name,trashed',
      supportsAllDrives: 'true',
    }),
    token,
    body: { trashed: true },
  })
}

export async function pruneRemoteWprTree({ token, market }) {
  const localRoot = wprRootForMarket(market)
  const rootFolderId = driveRootFolderIdForMarket(market, 'wpr')

  async function pruneFolder(parentId, relativeSegments) {
    const children = [...await listChildren({ token, parentId })].sort((left, right) => {
      const leftKey = `${left.name}\0${left.mimeType}`
      const rightKey = `${right.name}\0${right.mimeType}`
      if (leftKey !== rightKey) {
        return leftKey.localeCompare(rightKey)
      }
      return String(right.modifiedTime ?? '').localeCompare(String(left.modifiedTime ?? ''))
    })
    const seenRemoteChildren = new Set()
    for (const child of children) {
      const remoteChildKey = `${child.name}\0${child.mimeType}`
      if (seenRemoteChildren.has(remoteChildKey)) {
        await trashDriveFile({ token, fileId: child.id })
        continue
      }
      seenRemoteChildren.add(remoteChildKey)

      const relativePath = path.join(...relativeSegments, child.name)
      const localPath = path.join(localRoot, relativePath)
      const isRemoteFolder = child.mimeType === FOLDER_MIME_TYPE
      if (!fs.existsSync(localPath)) {
        await trashDriveFile({ token, fileId: child.id })
        continue
      }

      const localStat = fs.statSync(localPath)
      if (isRemoteFolder) {
        if (!localStat.isDirectory()) {
          await trashDriveFile({ token, fileId: child.id })
          continue
        }
        await pruneFolder(child.id, [...relativeSegments, child.name])
        continue
      }

      if (!localStat.isFile()) {
        await trashDriveFile({ token, fileId: child.id })
      }
    }
  }

  await pruneFolder(rootFolderId, [])
}

async function createEmptyFile({ token, parentId, fileName, contentType }) {
  return driveJsonRequest({
    method: 'POST',
    url: driveApiUrl('/drive/v3/files', {
      fields: 'id,name,mimeType,modifiedTime',
      supportsAllDrives: 'true',
    }),
    token,
    body: {
      name: fileName,
      mimeType: contentType,
      parents: [parentId],
    },
  })
}

async function uploadMedia({ token, fileId, filePath, contentType }) {
  const body = fs.readFileSync(filePath)
  const response = await fetch(
    driveApiUrl(`/upload/drive/v3/files/${encodeURIComponent(fileId)}`, {
      uploadType: 'media',
      supportsAllDrives: 'true',
      fields: 'id,name,modifiedTime',
    }),
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
      },
      body,
    },
  )
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`Drive media upload failed ${response.status}: ${text}`)
  }
  if (text.trim() === '') {
    return {}
  }
  return JSON.parse(text)
}

async function uploadResumable({ token, fileId, filePath, contentType }) {
  const stat = fs.statSync(filePath)
  const startResponse = await fetch(
    driveApiUrl(`/upload/drive/v3/files/${encodeURIComponent(fileId)}`, {
      uploadType: 'resumable',
      supportsAllDrives: 'true',
      fields: 'id,name,modifiedTime',
    }),
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(stat.size),
      },
      body: JSON.stringify({ mimeType: contentType }),
    },
  )

  if (!startResponse.ok) {
    throw new Error(`Drive resumable upload start failed ${startResponse.status}: ${await startResponse.text()}`)
  }

  const uploadUrl = startResponse.headers.get('location')
  if (uploadUrl === null) {
    throw new Error('Drive resumable upload did not return a Location header.')
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(stat.size),
    },
    body: fs.readFileSync(filePath),
  })
  const text = await uploadResponse.text()
  if (!uploadResponse.ok) {
    throw new Error(`Drive resumable upload failed ${uploadResponse.status}: ${text}`)
  }
  if (text.trim() === '') {
    return {}
  }
  return JSON.parse(text)
}

export async function syncDriveFile({ token, market, localPath, relativePath, scope = 'monitoring' }) {
  const stat = fs.statSync(localPath)
  const plan = buildDriveSyncPlan({ market, relativePath, size: stat.size, scope })
  const parentId = await ensureFolderPath({
    token,
    rootFolderId: plan.rootFolderId,
    folderSegments: plan.folderSegments,
  })
  const contentType = contentTypeForFile(localPath)
  const existing = await findChild({ token, parentId, name: plan.fileName })
  const file = existing !== null
    ? existing
    : await createEmptyFile({ token, parentId, fileName: plan.fileName, contentType })

  if (plan.uploadType === 'resumable') {
    return uploadResumable({ token, fileId: file.id, filePath: localPath, contentType })
  }

  return uploadMedia({ token, fileId: file.id, filePath: localPath, contentType })
}

function queuePathForScope(market, scope) {
  const parsedScope = parseDriveSyncScope(scope)
  if (parsedScope === 'wpr') {
    return wprDriveSyncQueuePath(market)
  }
  return driveSyncQueuePath(market)
}

function rejectedQueuePathForScope(market, scope) {
  const parsedScope = parseDriveSyncScope(scope)
  const relativePath = parsedScope === 'wpr'
    ? WPR_DRIVE_SYNC_REJECTED_RELATIVE_PATH
    : DRIVE_SYNC_REJECTED_RELATIVE_PATH
  return path.join(monitoringRootForMarket(market), relativePath)
}

function readQueueEntries(market, scope) {
  const queuePath = queuePathForScope(market, scope)
  if (!fs.existsSync(queuePath)) {
    return { queuePath, entries: [] }
  }

  const entries = fs.readFileSync(queuePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line))

  return { queuePath, entries }
}

function readEntriesFile(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line))
}

function processingQueueOwnerPid(queueBaseName, processingFileName) {
  const prefix = `${queueBaseName}.`
  const suffix = '.processing'
  if (!processingFileName.startsWith(prefix)) {
    return null
  }
  if (!processingFileName.endsWith(suffix)) {
    return null
  }

  const remainder = processingFileName.slice(prefix.length, -suffix.length)
  const [pidText] = remainder.split('.')
  const pid = Number.parseInt(pidText, 10)
  if (!Number.isInteger(pid)) {
    return null
  }
  if (pid <= 0) {
    return null
  }
  return pid
}

function processIsActive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') {
      return false
    }
    if (error?.code === 'EPERM') {
      return true
    }
    throw error
  }
}

function recoverProcessingQueues(queuePath) {
  const queueDir = path.dirname(queuePath)
  const queueBaseName = path.basename(queuePath)
  if (!fs.existsSync(queueDir)) {
    return
  }

  const processingFiles = fs.readdirSync(queueDir)
    .filter((name) => name.startsWith(`${queueBaseName}.`) && name.endsWith('.processing'))
    .sort()

  if (processingFiles.length === 0) {
    return
  }

  const recoveredEntries = []
  for (const name of processingFiles) {
    const ownerPid = processingQueueOwnerPid(queueBaseName, name)
    if (ownerPid !== null && processIsActive(ownerPid)) {
      continue
    }
    const processingPath = path.join(queueDir, name)
    recoveredEntries.push(...readEntriesFile(processingPath))
    fs.rmSync(processingPath, { force: true })
  }

  if (recoveredEntries.length > 0) {
    fs.appendFileSync(queuePath, recoveredEntries.map((entry) => JSON.stringify(entry)).join('\n') + '\n', 'utf8')
  }
}

function claimQueueEntries(market, scope) {
  const queuePath = queuePathForScope(market, scope)
  const processingPath = `${queuePath}.${process.pid}.${Date.now()}.processing`
  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  recoverProcessingQueues(queuePath)

  try {
    fs.renameSync(queuePath, processingPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { queuePath, processingPath: null, entries: [] }
    }
    throw error
  }

  const entries = readEntriesFile(processingPath)

  return { queuePath, processingPath, entries }
}

function publishedStatePath(market, scope) {
  const relativePath = parseDriveSyncScope(scope) === 'wpr'
    ? WPR_DRIVE_SYNC_PUBLISHED_RELATIVE_PATH
    : DRIVE_SYNC_PUBLISHED_RELATIVE_PATH
  return path.join(monitoringRootForMarket(market), relativePath)
}

function readPublishedState(market, scope) {
  const statePath = publishedStatePath(market, scope)
  if (!fs.existsSync(statePath)) {
    return { version: 1, items: {} }
  }

  return JSON.parse(fs.readFileSync(statePath, 'utf8'))
}

function writePublishedState(market, scope, state) {
  const statePath = publishedStatePath(market, scope)
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function recordPublishedArtifact({ market, scope, entry, result }) {
  const state = readPublishedState(market, scope)
  const items = state.items ?? {}
  items[entry.relativePath] = {
    relativePath: entry.relativePath,
    localPath: entry.localPath,
    fileId: result.id ?? null,
    driveModifiedTime: result.modifiedTime ?? null,
    publishedAt: new Date().toISOString(),
    size: entry.size,
    mtimeMs: entry.mtimeMs,
  }
  writePublishedState(market, scope, { version: 1, items })
}

function entryMatchesPublishedArtifact({ market, scope, entry }) {
  if (parseDriveSyncScope(scope) === 'wpr') return false
  const state = readPublishedState(market, scope)
  const item = state.items?.[entry.relativePath]
  if (item === undefined) return false
  if (item.localPath !== entry.localPath) return false
  if (item.size !== entry.size) return false
  if (item.mtimeMs !== entry.mtimeMs) return false
  if (item.fileId === null) return false
  if (item.driveModifiedTime === null) return false
  return true
}

function compactEntries(entries) {
  const byRelativePath = new Map()
  for (const entry of entries) {
    byRelativePath.set(entry.relativePath, entry)
  }
  return [...byRelativePath.values()]
}

function rejectReasonForQueueEntry(entry, scope) {
  let normalizedRelativePath
  try {
    normalizedRelativePath = normalizeArtifactRelativePath(entry.relativePath)
  } catch (error) {
    if (error instanceof Error) {
      return error.message
    }
    return String(error)
  }

  if (scope === 'wpr') {
    if (!isPublishableWprRelativePath(normalizedRelativePath)) {
      return `noncanonical WPR Drive sync path: ${normalizedRelativePath}`
    }
    const badSegment = normalizedRelativePath.split('/').find((segment) => WPR_NONCANONICAL_NAME_RE.test(segment))
    if (badSegment !== undefined) {
      return `noncanonical WPR Drive sync artifact name: ${badSegment}`
    }
  }

  let stat
  try {
    stat = fs.statSync(entry.localPath)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return `missing local file: ${entry.localPath}`
    }
    throw error
  }

  if (!stat.isFile()) {
    return `local path is not a file: ${entry.localPath}`
  }
  return null
}

function partitionQueueEntries(entries, scope) {
  const valid = []
  const rejected = []
  for (const entry of entries) {
    const reason = rejectReasonForQueueEntry(entry, scope)
    if (reason === null) {
      valid.push(entry)
      continue
    }
    rejected.push({ entry, reason })
  }
  return { valid, rejected }
}

function recordRejectedQueueEntries({ market, scope, rejected }) {
  if (rejected.length === 0) {
    return
  }
  const rejectedPath = rejectedQueuePathForScope(market, scope)
  fs.mkdirSync(path.dirname(rejectedPath), { recursive: true })
  const rejectedAt = new Date().toISOString()
  const lines = rejected.map(({ entry, reason }) => JSON.stringify({
    rejectedAt,
    market,
    scope,
    reason,
    entry,
  }))
  fs.appendFileSync(rejectedPath, `${lines.join('\n')}\n`, 'utf8')
}

function parseCliArgs(argv) {
  const args = { dryRun: false, market: null, scope: 'all' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--dry-run') {
      args.dryRun = true
      continue
    }
    if (arg === '--market') {
      args.market = argv[index + 1]
      index += 1
      continue
    }
    if (arg === '--scope') {
      const scope = argv[index + 1]
      if (scope === 'all') {
        args.scope = 'all'
      } else {
        args.scope = parseDriveSyncScope(scope)
      }
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (args.market === null) {
    throw new Error('--market is required.')
  }
  args.market = parseArgusMarket(args.market)
  return args
}

function driveSyncScopeNeedsWprLock(scope) {
  return scope === 'all' || parseDriveSyncScope(scope) === 'wpr'
}

function rerunCliUnderWprWorkspaceLock(args) {
  if (!driveSyncScopeNeedsWprLock(args.scope)) {
    return false
  }
  if (process.env[WPR_DRIVE_SYNC_LOCK_ENV] === '1') {
    return false
  }

  const result = spawnSync(
    '/usr/bin/lockf',
    [
      WPR_WORKSPACE_LOCK_FILE,
      process.execPath,
      process.argv[1],
      ...process.argv.slice(2),
    ],
    {
      env: { ...process.env, [WPR_DRIVE_SYNC_LOCK_ENV]: '1' },
      stdio: 'inherit',
    },
  )

  if (result.error !== undefined) {
    throw result.error
  }
  if (result.signal !== null) {
    throw new Error(`Drive sync lock wrapper terminated by signal: ${result.signal}`)
  }
  if (result.status === null) {
    throw new Error('Drive sync lock wrapper exited without a status.')
  }

  process.exit(result.status)
}

export async function drainDriveSyncQueue({ market, dryRun }) {
  return drainScopedDriveSyncQueue({ market, dryRun, scope: 'monitoring' })
}

export async function drainScopedDriveSyncQueue({ market, dryRun, scope }) {
  const parsedScope = parseDriveSyncScope(scope)
  const queue = dryRun ? readQueueEntries(market, parsedScope) : claimQueueEntries(market, parsedScope)
  const { queuePath, processingPath, entries } = queue
  const compacted = compactEntries(entries)
  const partitioned = partitionQueueEntries(compacted, parsedScope)
  if (dryRun) {
    return partitioned.valid.map((entry) => {
      const stat = fs.statSync(entry.localPath)
      return buildDriveSyncPlan({ market, relativePath: entry.relativePath, size: stat.size, scope: parsedScope })
    })
  }
  recordRejectedQueueEntries({ market, scope: parsedScope, rejected: partitioned.rejected })

  const pending = partitioned.valid.filter((entry) => !entryMatchesPublishedArtifact({ market, scope: parsedScope, entry }))
  const shouldPruneWpr = parsedScope === 'wpr' && compacted.length > 0
  const token = pending.length === 0 && !shouldPruneWpr ? null : accessToken()
  const failed = []
  for (const entry of pending) {
    try {
      const result = await syncDriveFile({
        token,
        market,
        localPath: entry.localPath,
        relativePath: entry.relativePath,
        scope: parsedScope,
      })
      recordPublishedArtifact({ market, scope: parsedScope, entry, result })
    } catch (error) {
      failed.push({ entry, error })
    }
  }

  fs.mkdirSync(path.dirname(queuePath), { recursive: true })
  if (processingPath !== null) {
    fs.rmSync(processingPath, { force: true })
  }

  if (failed.length === 0) {
    if (shouldPruneWpr) {
      await pruneRemoteWprTree({ token, market })
    }
    return []
  }

  fs.appendFileSync(queuePath, failed.map((item) => JSON.stringify(item.entry)).join('\n') + '\n', 'utf8')
  const messages = failed.map((item) => {
    if (item.error instanceof Error) {
      return `${item.entry.relativePath}: ${item.error.message}`
    }
    return `${item.entry.relativePath}: ${String(item.error)}`
  })
  throw new Error(`Drive sync failed for ${failed.length} artifact(s): ${messages.join('; ')}`)
}

export async function drainAllDriveSyncQueues({ market, dryRun }) {
  const results = []
  for (const scope of DRIVE_SYNC_SCOPES) {
    const scopeResults = await drainScopedDriveSyncQueue({ market, dryRun, scope })
    if (dryRun) {
      results.push(...scopeResults)
    }
  }
  return results
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2))
  rerunCliUnderWprWorkspaceLock(args)
  monitoringRootForMarket(args.market)
  const result = args.scope === 'all'
    ? await drainAllDriveSyncQueues(args)
    : await drainScopedDriveSyncQueue(args)
  if (args.dryRun) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    if (error instanceof Error) {
      console.error(error.stack)
    } else {
      console.error(String(error))
    }
    process.exit(1)
  })
}
