#!/usr/bin/env node
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const ENV_FILE_CANDIDATES = ['.env.local', '.env.development', '.env.production', '.env']
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

function resolvePortFromAppEnv(appDir, fallbackPort) {
  for (const candidate of ENV_FILE_CANDIDATES) {
    const envPath = path.join(appDir, candidate)
    if (!fs.existsSync(envPath)) {
      continue
    }

    const port = parsePortFromEnvText(fs.readFileSync(envPath, 'utf8'))
    if (port !== null) {
      return port
    }
  }

  return fallbackPort
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
  if (args.length < 2) {
    console.error('Usage: run-next-port <dev|start> <fallback-port> [next args...]')
    process.exit(1)
  }

  const [mode, fallbackPortRaw, ...nextArgs] = args
  if (mode !== 'dev' && mode !== 'start') {
    console.error(`Unsupported Next mode "${mode}". Expected "dev" or "start".`)
    process.exit(1)
  }

  if (!/^\d+$/.test(fallbackPortRaw)) {
    console.error(`Fallback port must be numeric. Received "${fallbackPortRaw}".`)
    process.exit(1)
  }

  const fallbackPort = Number(fallbackPortRaw)
  const port = resolvePortFromAppEnv(process.cwd(), fallbackPort)
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
  parsePortFromEnvText,
  resolvePortFromAppEnv,
}
