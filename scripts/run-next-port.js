#!/usr/bin/env node
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const { defaultRepoRoot, loadEnvForApp } = require('./lib/shared-env.cjs')

const ENV_ASSIGNMENT = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/

function parsePortFromEnvText(text) {
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const match = ENV_ASSIGNMENT.exec(trimmed)
    if (!match || match[1] !== 'PORT') {
      continue
    }

    const value = match[2].trim()
    if (!/^\d+$/.test(value)) {
      throw new Error(`Invalid PORT value "${value}" in env file.`)
    }

    return Number(value)
  }

  return null
}

function resolvePortFromAppEnv(appDir) {
  const envPath = path.join(appDir, '.env.local')
  if (!fs.existsSync(envPath)) {
    throw new Error('PORT must be defined in an app env file.')
  }

  const port = parsePortFromEnvText(fs.readFileSync(envPath, 'utf8'))
  if (port === null) {
    throw new Error('PORT must be defined in an app env file.')
  }
  return port
}

function resolveAppName(appDir, repoRoot) {
  const relativePath = path.relative(path.join(repoRoot, 'apps'), appDir)
  const parts = relativePath.split(path.sep)
  if (parts.length > 0) {
    if (parts[0]) {
      return parts[0]
    }
  }
  return path.basename(appDir)
}

function loadEnvAndResolvePort({
  repoRoot = defaultRepoRoot(),
  appName,
  appDir = process.cwd(),
  targetEnv = process.env,
}) {
  const resolvedAppName = appName ? appName : resolveAppName(appDir, repoRoot)
  loadEnvForApp({
    repoRoot,
    appName: resolvedAppName,
    mode: 'local',
    targetEnv,
  })

  const port = targetEnv.PORT
  if (!port) {
    throw new Error('PORT must be defined in an app env file.')
  }
  if (!/^\d+$/.test(port)) {
    throw new Error(`Invalid PORT value "${port}" in env file.`)
  }
  return Number(port)
}

function resolveNextCommand() {
  const localBin = path.resolve(__dirname, '..', 'node_modules', '.bin', 'next')
  if (fs.existsSync(localBin)) {
    return localBin
  }
  return 'next'
}

function runCli() {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error('Usage: run-next-port <dev|start> [next args...]')
    process.exit(1)
  }

  const [mode, ...nextArgs] = args
  if (mode !== 'dev' && mode !== 'start') {
    console.error(`Unsupported Next mode "${mode}". Expected "dev" or "start".`)
    process.exit(1)
  }

  let port
  try {
    port = loadEnvAndResolvePort({
      repoRoot: defaultRepoRoot(),
      appDir: process.cwd(),
      targetEnv: process.env,
    })
  } catch (error) {
    console.error(`[run-next-port] ${error.message}`)
    process.exit(1)
  }

  const child = spawn(resolveNextCommand(), [mode, '-p', String(port), ...nextArgs], {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: false,
  })

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal)
      return
    }
    process.exit(code ?? 0)
  })

  child.on('error', (error) => {
    console.error(`[run-next-port] Failed to start Next.js: ${error.message}`)
    process.exit(1)
  })
}

if (require.main === module) {
  runCli()
}

module.exports = {
  loadEnvAndResolvePort,
  parsePortFromEnvText,
  resolvePortFromAppEnv,
}
