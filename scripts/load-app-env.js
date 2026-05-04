#!/usr/bin/env node
const {
  defaultRepoRoot,
  formatShellExports,
  loadEnvForApp,
} = require('./lib/shared-env.cjs')

function parseArgs(argv) {
  const args = new Map()
  let index = 0
  while (index < argv.length) {
    const entry = argv[index]
    if (!entry.startsWith('--')) {
      throw new Error(`Unexpected argument: ${entry}`)
    }

    const key = entry.slice(2)
    const next = argv[index + 1]
    if (!next) {
      throw new Error(`Missing value for --${key}`)
    }
    if (next.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }

    args.set(key, next)
    index += 2
  }
  return args
}

function requiredArg(args, name) {
  const value = args.get(name)
  if (!value) {
    throw new Error(`Missing required --${name}`)
  }
  return value
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const appName = requiredArg(args, 'app')
  const mode = requiredArg(args, 'mode')
  const repoRoot = args.get('repo-root') ? args.get('repo-root') : defaultRepoRoot()
  const getKey = args.get('get')

  const result = loadEnvForApp({
    repoRoot,
    appName,
    mode,
    targetEnv: {},
  })

  if (getKey) {
    const value = result.entries.get(getKey)
    if (value === undefined) {
      throw new Error(`${getKey} is not set for ${appName} ${mode}`)
    }
    process.stdout.write(value)
    return
  }

  process.stdout.write(formatShellExports(result.entries))
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
