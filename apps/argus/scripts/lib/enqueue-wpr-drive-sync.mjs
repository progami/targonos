#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { WPR_CANONICAL_WEEK_FOLDER_RE, enqueueWprDriveSync, parseArgusMarket, wprRootForMarket } from './artifacts.mjs'

function parseCliArgs(argv) {
  const args = { market: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--market') {
      args.market = argv[index + 1]
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

function shouldSkipFile(filePath) {
  return filePath.name === '.DS_Store'
}

function enqueueTree({ market, root }) {
  let count = 0
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      if (shouldSkipFile({ name: entry.name })) {
        continue
      }
      enqueueWprDriveSync({ market, localPath: entryPath })
      count += 1
    }
  }
  return count
}

export function enqueueWprWeekTrees({ market, root }) {
  let count = 0
  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    if (!WPR_CANONICAL_WEEK_FOLDER_RE.test(entry.name)) {
      continue
    }
    count += enqueueTree({ market, root: path.join(root, entry.name) })
  }
  return count
}

function main() {
  const args = parseCliArgs(process.argv.slice(2))
  const root = wprRootForMarket(args.market)
  const count = enqueueWprWeekTrees({ market: args.market, root })
  process.stdout.write(`Queued ${count} WPR artifact(s) for Drive sync from ${root}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main()
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.stack)
    } else {
      console.error(String(error))
    }
    process.exit(1)
  }
}
