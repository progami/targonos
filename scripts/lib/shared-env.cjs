const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ENV_FILE_BY_MODE = new Map([
  ['local', { shared: 'shared.local.env', app: '.env.local' }],
  ['dev', { shared: 'shared.dev.env', app: '.env.dev' }],
  ['production', { shared: 'shared.production.env', app: '.env.production' }],
  ['ci', { shared: 'shared.dev.ci.env', app: '.env.dev.ci' }],
])

const SHARED_ENV_ALLOWED_KEYS = new Set([
  'AMAZON_SP_APP_CLIENT_ID',
  'AMAZON_SP_APP_CLIENT_SECRET',
  'AMAZON_REFRESH_TOKEN',
  'AMAZON_REFRESH_TOKEN_US',
  'AMAZON_REFRESH_TOKEN_UK',
  'AMAZON_MARKETPLACE_ID',
  'AMAZON_MARKETPLACE_ID_US',
  'AMAZON_MARKETPLACE_ID_UK',
  'AMAZON_SP_API_REGION',
  'AMAZON_SP_API_REGION_US',
  'AMAZON_SP_API_REGION_UK',
  'AMAZON_SELLER_ID',
  'AMAZON_SELLER_ID_US',
  'AMAZON_SELLER_ID_UK',
])

const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

function normalizeAppName(appName) {
  if (appName === 'targon') return 'sso'
  if (appName === 'targonos') return 'sso'
  return appName
}

function normalizeMode(mode) {
  if (mode === 'main') return 'production'
  return mode
}

function requireMode(mode) {
  const normalized = normalizeMode(mode)
  const files = ENV_FILE_BY_MODE.get(normalized)
  if (!files) {
    throw new Error(`Unsupported env mode: ${mode}`)
  }
  return { mode: normalized, files }
}

function getEnvFileSelection({ repoRoot, appName, mode }) {
  const result = requireMode(mode)
  const normalizedAppName = normalizeAppName(appName)
  return {
    sharedEnvPath: path.join(repoRoot, 'env', result.files.shared),
    appEnvPath: path.join(repoRoot, 'apps', normalizedAppName, result.files.app),
  }
}

function unquoteValue(value) {
  const trimmed = value.trim()
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseEnvText(text, filePath) {
  const entries = new Map()
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '') {
      continue
    }
    if (line.startsWith('#')) {
      continue
    }

    const match = ENV_ASSIGNMENT.exec(line)
    if (!match) {
      throw new Error(`${filePath} contains invalid env assignment: ${line}`)
    }

    const key = match[1]
    if (entries.has(key)) {
      throw new Error(`${filePath} contains duplicate env key: ${key}`)
    }
    entries.set(key, unquoteValue(match[2]))
  }
  return entries
}

function readRequiredEnvFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required ${label} env file: ${filePath}`)
  }
  return parseEnvText(fs.readFileSync(filePath, 'utf8'), filePath)
}

function validateSharedEnvEntries(entries, filePath) {
  const errors = []
  for (const key of entries.keys()) {
    if (!SHARED_ENV_ALLOWED_KEYS.has(key)) {
      errors.push(`${filePath}: ${key} is not allowed in shared env`)
    }
  }
  return errors
}

function parseBwRef(ref) {
  if (!ref.startsWith('bw://')) {
    throw new Error(`Invalid Bitwarden ref: ${ref}`)
  }
  const body = ref.slice('bw://'.length)
  const slashIndex = body.indexOf('/')
  if (slashIndex <= 0) {
    throw new Error(`Invalid Bitwarden ref: ${ref}`)
  }
  if (slashIndex === body.length - 1) {
    throw new Error(`Invalid Bitwarden ref: ${ref}`)
  }
  return {
    itemName: decodeURIComponent(body.slice(0, slashIndex)),
    fieldName: decodeURIComponent(body.slice(slashIndex + 1)),
  }
}

function readCachedBitwardenSession(env) {
  const explicitSession = env.BW_SESSION
  if (explicitSession) {
    const trimmed = explicitSession.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }

  const home = env.HOME
  if (!home) {
    throw new Error('BW_SESSION is required to resolve bw:// env refs')
  }

  const sessionPath = path.join(home, '.config', 'codex', 'secrets', 'bitwarden-cli-session')
  if (!fs.existsSync(sessionPath)) {
    throw new Error('BW_SESSION is required to resolve bw:// env refs')
  }

  const cachedSession = fs.readFileSync(sessionPath, 'utf8').trim()
  if (cachedSession.length === 0) {
    throw new Error('BW_SESSION is required to resolve bw:// env refs')
  }
  return cachedSession
}

function createBitwardenResolver(env = process.env) {
  const itemCache = new Map()

  return function resolveBitwardenRef(ref) {
    const parsed = parseBwRef(ref)
    let item = itemCache.get(parsed.itemName)
    if (!item) {
      const session = readCachedBitwardenSession(env)
      const result = spawnSync('bw', ['get', 'item', parsed.itemName, '--session', session], {
        encoding: 'utf8',
      })
      if (result.status !== 0) {
        throw new Error(`Failed to read Bitwarden item "${parsed.itemName}": ${result.stderr.trim()}`)
      }
      const output = result.stdout.trim()
      if (output.length === 0) {
        throw new Error(`Failed to read Bitwarden item "${parsed.itemName}": empty response from bw`)
      }
      try {
        item = JSON.parse(output)
      } catch (error) {
        throw new Error(`Failed to parse Bitwarden item "${parsed.itemName}" as JSON`)
      }
      itemCache.set(parsed.itemName, item)
    }

    const fields = item.fields
    if (!Array.isArray(fields)) {
      throw new Error(`Bitwarden item "${parsed.itemName}" has no fields`)
    }

    const field = fields.find((entry) => {
      if (!entry) return false
      return entry.name === parsed.fieldName
    })
    if (!field) {
      throw new Error(`Bitwarden field "${parsed.fieldName}" is missing from "${parsed.itemName}"`)
    }
    if (typeof field.value !== 'string') {
      throw new Error(`Bitwarden field "${parsed.fieldName}" is empty in "${parsed.itemName}"`)
    }
    if (field.value.trim().length === 0) {
      throw new Error(`Bitwarden field "${parsed.fieldName}" is empty in "${parsed.itemName}"`)
    }
    return field.value
  }
}

function resolveEnvEntries(entries, resolveBitwardenRef) {
  const resolved = new Map()
  for (const [key, value] of entries.entries()) {
    if (value.startsWith('bw://')) {
      const resolvedValue = resolveBitwardenRef(value)
      if (typeof resolvedValue !== 'string') {
        throw new Error(`Bitwarden ref for ${key} did not resolve to a string`)
      }
      if (resolvedValue.trim().length === 0) {
        throw new Error(`Bitwarden ref for ${key} resolved to an empty value`)
      }
      resolved.set(key, resolvedValue)
      continue
    }
    resolved.set(key, value)
  }
  return resolved
}

function mergeEntries(sharedEntries, appEntries, sharedEnvPath, appEnvPath) {
  const merged = new Map()
  for (const [key, value] of sharedEntries.entries()) {
    if (appEntries.has(key)) {
      throw new Error(`Duplicate env key ${key} in ${sharedEnvPath} and ${appEnvPath}`)
    }
    merged.set(key, value)
  }
  for (const [key, value] of appEntries.entries()) {
    merged.set(key, value)
  }
  return merged
}

function applyEntries(entries, targetEnv) {
  for (const [key, value] of entries.entries()) {
    targetEnv[key] = value
  }
}

function loadEnvForApp({
  repoRoot,
  appName,
  mode,
  targetEnv = process.env,
  resolveBitwardenRef,
}) {
  const selection = getEnvFileSelection({ repoRoot, appName, mode })
  const sharedEntries = readRequiredEnvFile(selection.sharedEnvPath, 'shared')
  const sharedErrors = validateSharedEnvEntries(sharedEntries, selection.sharedEnvPath)
  if (sharedErrors.length > 0) {
    throw new Error(sharedErrors.join('\n'))
  }

  const appEntries = readRequiredEnvFile(selection.appEnvPath, 'app')
  const resolver = resolveBitwardenRef ? resolveBitwardenRef : createBitwardenResolver(process.env)
  const resolvedShared = resolveEnvEntries(sharedEntries, resolver)
  const resolvedApp = resolveEnvEntries(appEntries, resolver)
  const merged = mergeEntries(
    resolvedShared,
    resolvedApp,
    selection.sharedEnvPath,
    selection.appEnvPath
  )

  applyEntries(merged, targetEnv)
  return {
    ...selection,
    entries: merged,
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function formatShellExports(entries) {
  const lines = []
  for (const [key, value] of entries.entries()) {
    lines.push(`export ${key}=${shellQuote(value)}`)
  }
  return `${lines.join('\n')}\n`
}

function defaultRepoRoot() {
  return path.resolve(__dirname, '..', '..')
}

module.exports = {
  ENV_FILE_BY_MODE,
  SHARED_ENV_ALLOWED_KEYS,
  applyEntries,
  createBitwardenResolver,
  defaultRepoRoot,
  formatShellExports,
  getEnvFileSelection,
  loadEnvForApp,
  normalizeAppName,
  normalizeMode,
  parseBwRef,
  parseEnvText,
  readRequiredEnvFile,
  validateSharedEnvEntries,
}
