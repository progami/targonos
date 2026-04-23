#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  WORKTREE_DEV_USER_EMAIL,
  WORKTREE_DEV_USER_ID,
  WORKTREE_DEV_USER_NAME,
  stringifyWorktreeDevAuthz,
} from './worktree-dev-auth-config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT_DIR = path.resolve(__dirname, '..')
const GENERATED_DIR = path.join(ROOT_DIR, '.codex', 'generated')
const PORTS_ENV_PATH = path.join(GENERATED_DIR, 'ports.env')
const WORKTREE_APPS_PATH = path.join(GENERATED_DIR, 'dev.worktree.apps.json')
const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

const APP_BASE_PATHS = {
  talos: '/talos',
  atlas: '/atlas',
  xplan: '/xplan',
  kairos: '/kairos',
  plutus: '/plutus',
  hermes: '/hermes',
  argus: '/argus',
}

const APP_ORDER = ['sso', 'talos', 'website', 'atlas', 'xplan', 'kairos', 'plutus', 'hermes', 'argus']
const WORKTREE_DEV_AUTHZ_JSON = stringifyWorktreeDevAuthz()
const ENABLE_SSO_WORKTREE_DEV_AUTH = process.env.TARGON_SSO_WORKTREE_DEV_AUTH?.trim().toLowerCase() === 'true'

function requireFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`)
  }
  return fs.readFileSync(filePath, 'utf8')
}

function parseSimpleEnv(text) {
  const values = new Map()
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const match = ENV_ASSIGNMENT.exec(trimmed)
    if (!match) {
      continue
    }

    values.set(match[1], match[2])
  }

  return values
}

function parseEnvFile(text) {
  const lines = text.split(/\r?\n/)
  const values = new Map()

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const match = ENV_ASSIGNMENT.exec(trimmed)
    if (!match) {
      continue
    }

    values.set(match[1], match[2])
  }

  return { lines, values }
}

function requireEnvValue(values, key, label) {
  const value = values.get(key)
  if (!value || value.trim() === '') {
    throw new Error(`Missing ${key} in ${label}`)
  }
  return value.trim()
}

function stripSchema(databaseUrl) {
  const url = new URL(databaseUrl)
  url.searchParams.delete('schema')
  return url.toString()
}

function withSchema(databaseUrl, schema) {
  const url = new URL(databaseUrl)
  url.searchParams.set('schema', schema)
  return url.toString()
}

function appOrigin(port) {
  return `http://localhost:${port}`
}

function appUrl(port, basePath) {
  if (!basePath) {
    return appOrigin(port)
  }
  return `${appOrigin(port)}${basePath}`
}

function updateEnvText(sourceText, managedEntries, removedKeys) {
  const { lines } = parseEnvFile(sourceText)
  const remaining = new Map(managedEntries)
  const output = []

  for (const line of lines) {
    const trimmed = line.trim()
    const match = ENV_ASSIGNMENT.exec(trimmed)

    if (!match) {
      output.push(line)
      continue
    }

    const key = match[1]
    if (removedKeys.has(key)) {
      continue
    }

    if (remaining.has(key)) {
      output.push(`${key}=${remaining.get(key)}`)
      remaining.delete(key)
      continue
    }

    output.push(line)
  }

  if (remaining.size > 0) {
    if (output.length > 0 && output[output.length - 1] !== '') {
      output.push('')
    }

    for (const [key, value] of managedEntries) {
      if (!remaining.has(key)) {
        continue
      }
      output.push(`${key}=${value}`)
    }
  }

  return `${output.join('\n').replace(/\n+$/g, '')}\n`
}

function materializeEnvFile(filePath, contents) {
  const stat = fs.existsSync(filePath) ? fs.lstatSync(filePath) : null
  if (stat && (stat.isFile() || stat.isSymbolicLink())) {
    fs.unlinkSync(filePath)
  }
  fs.writeFileSync(filePath, contents, 'utf8')
}

function sharedValue(sourceValues, appName, key, fallback) {
  const value = sourceValues[appName]?.values.get(key)
  if (value && value.trim() !== '') {
    return value
  }
  if (fallback !== undefined) {
    return fallback
  }
  throw new Error(`Missing ${key} in ${appName} source env`)
}

function applyWorktreeDevAuth(entries) {
  entries.set('TARGON_WORKTREE_DEV_AUTH', 'true')
  entries.set('TARGON_WORKTREE_DEV_USER_ID', WORKTREE_DEV_USER_ID)
  entries.set('TARGON_WORKTREE_DEV_USER_EMAIL', WORKTREE_DEV_USER_EMAIL)
  entries.set('TARGON_WORKTREE_DEV_USER_NAME', WORKTREE_DEV_USER_NAME)
  entries.set('TARGON_WORKTREE_DEV_AUTHZ_JSON', WORKTREE_DEV_AUTHZ_JSON)
}

function buildManagedEntries(context) {
  const {
    appName,
    port,
    portalOrigin,
    sharedSecret,
    baseDevDbUrl,
    sourceValues,
    worktreeAppMapPath,
  } = context

  const basePath = APP_BASE_PATHS[appName]
  const currentAppUrl = appUrl(port, basePath)
  const currentAppOrigin = appOrigin(port)
  const entries = new Map()

  switch (appName) {
    case 'sso':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      if (ENABLE_SSO_WORKTREE_DEV_AUTH) {
        applyWorktreeDevAuth(entries)
      }
      entries.set('AUTH_TRUST_HOST', 'true')
      entries.set('PORTAL_RUNTIME_ENV', 'local')
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('NEXTAUTH_URL', portalOrigin)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_APP_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('PORTAL_APPS_CONFIG', worktreeAppMapPath)
      entries.set('PORTAL_DB_URL', withSchema(baseDevDbUrl, 'auth_dev'))
      entries.set('ALLOW_CALLBACK_REDIRECT', 'true')
      return entries
    case 'website':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      return entries
    case 'talos':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      applyWorktreeDevAuth(entries)
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('TALOS_SUPER_ADMIN_EMAILS', WORKTREE_DEV_USER_EMAIL)
      entries.set('BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_APP_URL', currentAppUrl)
      entries.set('NEXTAUTH_URL', currentAppUrl)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('CSRF_ALLOWED_ORIGINS', `${portalOrigin},${currentAppOrigin}`)
      entries.set('DATABASE_URL', withSchema(baseDevDbUrl, 'dev_talos_us'))
      entries.set('DATABASE_URL_US', withSchema(baseDevDbUrl, 'dev_talos_us'))
      entries.set('DATABASE_URL_UK', withSchema(baseDevDbUrl, 'dev_talos_uk'))
      entries.set('REDIS_URL', sharedValue(sourceValues, appName, 'REDIS_URL', 'redis://localhost:6379'))
      entries.set('S3_BUCKET_NAME', sharedValue(sourceValues, appName, 'S3_BUCKET_NAME', 'ci-talos-bucket'))
      entries.set('S3_BUCKET_REGION', sharedValue(sourceValues, appName, 'S3_BUCKET_REGION', 'us-east-1'))
      return entries
    case 'atlas':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      applyWorktreeDevAuth(entries)
      entries.set('ATLAS_SUPER_ADMIN_EMAILS', WORKTREE_DEV_USER_EMAIL)
      entries.set('ATLAS_PORT', String(port))
      entries.set('BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_APP_URL', currentAppUrl)
      entries.set('NEXTAUTH_URL', currentAppUrl)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('DATABASE_URL', withSchema(baseDevDbUrl, 'dev_atlas'))
      entries.set('NEXT_PUBLIC_API_BASE', basePath)
      return entries
    case 'xplan':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      applyWorktreeDevAuth(entries)
      entries.set('XPLAN_SUPER_ADMIN_EMAILS', WORKTREE_DEV_USER_EMAIL)
      entries.set('BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_APP_URL', currentAppUrl)
      entries.set('NEXTAUTH_URL', currentAppUrl)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('DATABASE_URL', withSchema(baseDevDbUrl, 'dev_xplan'))
      entries.set('PORTAL_DB_URL', withSchema(baseDevDbUrl, 'auth_dev'))
      entries.set('TALOS_DATABASE_URL_US', withSchema(baseDevDbUrl, 'dev_talos_us'))
      entries.set('TALOS_DATABASE_URL_UK', withSchema(baseDevDbUrl, 'dev_talos_uk'))
      entries.set('BASE_URL', currentAppUrl)
      return entries
    case 'kairos':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      applyWorktreeDevAuth(entries)
      entries.set('KAIROS_SUPER_ADMIN_EMAILS', WORKTREE_DEV_USER_EMAIL)
      entries.set('BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_APP_URL', currentAppUrl)
      entries.set('NEXTAUTH_URL', currentAppUrl)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('DATABASE_URL', withSchema(baseDevDbUrl, 'kairos'))
      entries.set('BASE_URL', currentAppUrl)
      return entries
    case 'plutus':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      applyWorktreeDevAuth(entries)
      entries.set('BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_APP_URL', currentAppUrl)
      entries.set('NEXTAUTH_URL', currentAppUrl)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('DATABASE_URL', withSchema(baseDevDbUrl, 'plutus_dev'))
      entries.set('PORTAL_DB_URL', withSchema(baseDevDbUrl, 'auth_dev'))
      entries.set('BASE_URL', currentAppUrl)
      if (
        sourceValues[appName].values.has('QBO_REDIRECT_URI') ||
        sourceValues[appName].values.has('QBO_CLIENT_ID')
      ) {
        entries.set('QBO_REDIRECT_URI', `${currentAppUrl}/api/qbo/callback`)
      }
      return entries
    case 'hermes':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      applyWorktreeDevAuth(entries)
      entries.set('BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_APP_URL', currentAppUrl)
      entries.set('NEXTAUTH_URL', currentAppUrl)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('DATABASE_URL', stripSchema(baseDevDbUrl))
      entries.set('HERMES_DB_SCHEMA', 'dev_hermes')
      return entries
    case 'argus':
      entries.set('NODE_ENV', 'development')
      entries.set('PORT', String(port))
      entries.set('HOST', '0.0.0.0')
      applyWorktreeDevAuth(entries)
      entries.set('COOKIE_DOMAIN', 'localhost')
      entries.set('BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_BASE_PATH', basePath)
      entries.set('NEXT_PUBLIC_APP_URL', currentAppUrl)
      entries.set('NEXTAUTH_URL', currentAppUrl)
      entries.set('NEXTAUTH_SECRET', sharedSecret)
      entries.set('PORTAL_AUTH_URL', portalOrigin)
      entries.set('NEXT_PUBLIC_PORTAL_AUTH_URL', portalOrigin)
      entries.set('PORTAL_AUTH_SECRET', sharedSecret)
      entries.set('CSRF_ALLOWED_ORIGINS', `${portalOrigin},${currentAppOrigin}`)
      entries.set('DATABASE_URL', withSchema(baseDevDbUrl, 'argus_dev'))
      return entries
    default:
      throw new Error(`Unsupported app: ${appName}`)
  }
}

function main() {
  const portsEnv = parseSimpleEnv(requireFile(PORTS_ENV_PATH))
  const worktreeApps = JSON.parse(requireFile(WORKTREE_APPS_PATH))
  const portalOrigin = requireEnvValue(portsEnv, 'SHARED_PORTAL_ORIGIN', PORTS_ENV_PATH)
  const worktreeAppMapPath = requireEnvValue(portsEnv, 'WORKTREE_APP_MAP_PATH', PORTS_ENV_PATH)

  const sourceValues = {}
  for (const appName of APP_ORDER) {
    const envPath = path.join(ROOT_DIR, 'apps', appName, '.env.local')
    const sourceText = requireFile(envPath)
    sourceValues[appName] = parseEnvFile(sourceText)
  }

  const sharedSecret =
    sourceValues.sso.values.get('NEXTAUTH_SECRET')?.trim() ||
    sourceValues.sso.values.get('PORTAL_AUTH_SECRET')?.trim()
  if (!sharedSecret) {
    throw new Error('SSO shared secret is missing from apps/sso/.env.local')
  }

  const portalDbUrl = requireEnvValue(sourceValues.sso.values, 'PORTAL_DB_URL', 'apps/sso/.env.local')
  const baseDevDbUrl = stripSchema(portalDbUrl)

  const written = []

  for (const appName of APP_ORDER) {
    const appDir = path.join(ROOT_DIR, 'apps', appName)
    const envPath = path.join(appDir, '.env.local')
    const sourceText = requireFile(envPath)
    const port = appName === 'sso'
      ? Number(requireEnvValue(portsEnv, 'PORT_SSO', PORTS_ENV_PATH))
      : Number(worktreeApps.apps?.[appName])

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Missing worktree port for ${appName} in ${WORKTREE_APPS_PATH}`)
    }

    const managedEntries = buildManagedEntries({
      appName,
      port,
      portalOrigin,
      sharedSecret,
      baseDevDbUrl,
      sourceValues,
      worktreeAppMapPath,
    })

    const removedKeys = new Set(appName === 'talos' ? ['PRISMA_SCHEMA'] : [])
    const nextEnvText = updateEnvText(sourceText, managedEntries, removedKeys)
    materializeEnvFile(envPath, nextEnvText)
    written.push({ appName, envPath, port })
  }

  for (const item of written) {
    process.stdout.write(`${item.appName} ${item.port} ${item.envPath}\n`)
  }
}

main()
