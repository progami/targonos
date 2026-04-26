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
  loadEnvForApp({
    repoRoot: REPO_ROOT,
    appName,
    mode: resolveScriptEnvMode(),
    targetEnv: process.env,
  })
}

export function loadTalosScriptEnv() {
  loadAppScriptEnv('talos')
}
