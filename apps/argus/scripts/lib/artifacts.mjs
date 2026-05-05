import fs from 'node:fs'
import path from 'node:path'

export const DRIVE_SYNC_QUEUE_RELATIVE_PATH = '.drive-sync/queue.jsonl'

export function parseArgusMarket(raw) {
  const value = String(raw).trim().toLowerCase()
  if (value === 'us') return 'us'
  if (value === 'uk') return 'uk'
  throw new Error(`Unsupported Argus market: ${raw}`)
}

export function marketEnvSuffix(market) {
  return parseArgusMarket(market).toUpperCase()
}

export function requireEnv(name) {
  const value = process.env[name]
  if (value === undefined) {
    throw new Error(`Missing required env var: ${name}`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`Missing required env var: ${name}`)
  }

  return trimmed
}

export function monitoringRootForMarket(market) {
  const root = requireEnv(`ARGUS_MONITORING_ROOT_${marketEnvSuffix(market)}`)
  if (root.includes('/Library/CloudStorage/')) {
    throw new Error(`ARGUS_MONITORING_ROOT_${marketEnvSuffix(market)} must be local, not a Google Drive mount.`)
  }
  return path.resolve(root)
}

export function normalizeArtifactRelativePath(relativePath) {
  const value = String(relativePath).trim()
  if (value === '') {
    throw new Error('Artifact relative path is required.')
  }
  if (path.isAbsolute(value)) {
    throw new Error(`Artifact path must be relative: ${relativePath}`)
  }

  const normalized = path.normalize(value)
  if (normalized === '.') {
    throw new Error('Artifact relative path is required.')
  }
  if (normalized.startsWith('..')) {
    throw new Error(`Artifact path escapes monitoring root: ${relativePath}`)
  }

  return normalized.split(path.sep).join('/')
}

export function localPathForArtifact({ market, relativePath }) {
  return path.join(monitoringRootForMarket(market), normalizeArtifactRelativePath(relativePath))
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function relativePathForLocalArtifact({ market, localPath }) {
  const root = monitoringRootForMarket(market)
  const relativePath = path.relative(root, path.resolve(localPath))
  return normalizeArtifactRelativePath(relativePath)
}

export function driveSyncQueuePath(market) {
  return localPathForArtifact({ market, relativePath: DRIVE_SYNC_QUEUE_RELATIVE_PATH })
}

export function enqueueDriveSync({ market, localPath }) {
  const parsedMarket = parseArgusMarket(market)
  const relativePath = relativePathForLocalArtifact({ market: parsedMarket, localPath })
  if (relativePath === DRIVE_SYNC_QUEUE_RELATIVE_PATH) {
    return null
  }

  const stat = fs.statSync(localPath)
  if (!stat.isFile()) {
    throw new Error(`Drive sync target is not a file: ${localPath}`)
  }

  const entry = {
    enqueuedAt: new Date().toISOString(),
    market: parsedMarket,
    localPath: path.resolve(localPath),
    relativePath,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  }
  const queuePath = driveSyncQueuePath(parsedMarket)
  ensureParentDir(queuePath)
  fs.appendFileSync(queuePath, `${JSON.stringify(entry)}\n`, 'utf8')
  return entry
}

export function writeTextArtifact({ market, relativePath, content }) {
  const localPath = localPathForArtifact({ market, relativePath })
  ensureParentDir(localPath)
  fs.writeFileSync(localPath, content, 'utf8')
  enqueueDriveSync({ market, localPath })
  return { localPath }
}

export function writeBinaryArtifact({ market, relativePath, content }) {
  const localPath = localPathForArtifact({ market, relativePath })
  ensureParentDir(localPath)
  fs.writeFileSync(localPath, content)
  enqueueDriveSync({ market, localPath })
  return { localPath }
}

export function appendRunLog({ market, jobId, entry }) {
  const relativePath = normalizeArtifactRelativePath(path.join('Logs', jobId, 'run-log.jsonl'))
  const localPath = localPathForArtifact({ market, relativePath })
  ensureParentDir(localPath)
  fs.appendFileSync(localPath, `${JSON.stringify(entry)}\n`, 'utf8')
  enqueueDriveSync({ market, localPath })
  return { localPath }
}
