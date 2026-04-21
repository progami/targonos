import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEV_PORTAL_ORIGIN = 'https://dev-os.targonglobal.com'
export const DEV_COOKIE_DOMAIN = '.dev-os.targonglobal.com'

const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
const EXACT_ORIGIN_KEYS = new Set([
  'PORTAL_AUTH_URL',
  'NEXT_PUBLIC_PORTAL_AUTH_URL',
  'BASE_URL',
  'CSRF_ALLOWED_ORIGINS',
])
const PREFIX_ORIGIN_KEYS = new Set([
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'QBO_REDIRECT_URI',
])

export function parseEnvFile(text, filePath = '.env.dev.ci') {
  const entries = new Map()

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) {
      continue
    }

    const match = ENV_ASSIGNMENT.exec(trimmed)
    if (!match) {
      throw new Error(`${filePath} contains an invalid env assignment: ${trimmed}`)
    }

    const [, key, rawValue] = match
    entries.set(key, rawValue.trim())
  }

  return entries
}

export function validateCiEnvEntries(entries, filePath) {
  const errors = []

  for (const [key, value] of entries.entries()) {
    if (value.includes('https://os.targonglobal.com')) {
      errors.push(`${filePath}: ${key} must not point at the main hosted origin`)
    }

    if (value.includes('http://localhost')) {
      errors.push(`${filePath}: ${key} must not point at localhost in CI`)
    }

    if (EXACT_ORIGIN_KEYS.has(key) && value !== DEV_PORTAL_ORIGIN) {
      errors.push(`${filePath}: ${key} must equal ${DEV_PORTAL_ORIGIN}`)
    }

    if (PREFIX_ORIGIN_KEYS.has(key) && !value.startsWith(DEV_PORTAL_ORIGIN)) {
      errors.push(`${filePath}: ${key} must start with ${DEV_PORTAL_ORIGIN}`)
    }

    if (key === 'COOKIE_DOMAIN' && value !== DEV_COOKIE_DOMAIN) {
      errors.push(`${filePath}: COOKIE_DOMAIN must equal ${DEV_COOKIE_DOMAIN}`)
    }
  }

  return errors
}

export function collectCiEnvFiles(repoRoot) {
  const appsDir = path.join(repoRoot, 'apps')
  return fs.readdirSync(appsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(appsDir, entry.name, '.env.dev.ci'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort()
}

export function verifyCiEnvContracts(repoRoot) {
  const envFiles = collectCiEnvFiles(repoRoot)
  const errors = []

  for (const filePath of envFiles) {
    const relativePath = path.relative(repoRoot, filePath)
    const text = fs.readFileSync(filePath, 'utf8')
    const entries = parseEnvFile(text, relativePath)
    errors.push(...validateCiEnvEntries(entries, relativePath))
  }

  return { envFiles, errors }
}

const modulePath = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  const repoRoot = path.resolve(path.dirname(modulePath), '..')
  const result = verifyCiEnvContracts(repoRoot)

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(`::error::${error}`)
    }
    process.exit(1)
  }

  process.stdout.write(`Verified ${result.envFiles.length} CI env contract files.\n`)
}
