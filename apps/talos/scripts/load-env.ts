import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { loadEnvForApp } = require('../../../scripts/lib/shared-env.cjs') as {
  loadEnvForApp: (options: {
    repoRoot: string
    appName: string
    mode: string
    targetEnv: NodeJS.ProcessEnv
  }) => void
}

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const PRESERVED_DATABASE_ENV_KEYS = [
  'TALOS_ADMIN_DATABASE_URL',
  'DATABASE_URL',
  'DATABASE_URL_US',
  'DATABASE_URL_UK',
] as const

function resolveScriptEnvMode() {
  if (process.env.TALOS_ENV_MODE && process.env.TALOS_ENV_MODE.trim().length > 0) {
    return process.env.TALOS_ENV_MODE
  }
  if (process.env.TARGONOS_ENV_MODE && process.env.TARGONOS_ENV_MODE.trim().length > 0) {
    return process.env.TARGONOS_ENV_MODE
  }
  return 'local'
}

export function loadAppScriptEnv(appName: string) {
  const preservedDatabaseEnv = captureDatabaseEnvForMigration()
  loadEnvForApp({
    repoRoot: REPO_ROOT,
    appName,
    mode: resolveScriptEnvMode(),
    targetEnv: process.env,
  })
  restoreDatabaseEnvForMigration(preservedDatabaseEnv)
}

export function loadTalosScriptEnv() {
  loadAppScriptEnv('talos')
}

function captureDatabaseEnvForMigration() {
  const captured: Array<[string, string]> = []
  if (process.env.TALOS_PRESERVE_DATABASE_ENV !== '1') {
    return captured
  }

  for (const key of PRESERVED_DATABASE_ENV_KEYS) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      captured.push([key, value])
    }
  }

  return captured
}

function restoreDatabaseEnvForMigration(captured: Array<[string, string]>) {
  for (const [key, value] of captured) {
    process.env[key] = value
  }
}
