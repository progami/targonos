#!/usr/bin/env node

import { enqueueDriveSync, parseArgusMarket } from './artifacts.mjs'

function readFlag(argv, flag) {
  const index = argv.indexOf(flag)
  if (index < 0) return null
  return argv[index + 1] ?? null
}

function requireFlag(argv, flag) {
  const value = readFlag(argv, flag)
  if (value === null || String(value).trim() === '') {
    throw new Error(`Missing required flag: ${flag}`)
  }
  return String(value).trim()
}

function main() {
  const argv = process.argv.slice(2)
  const market = parseArgusMarket(requireFlag(argv, '--market'))
  const localPath = requireFlag(argv, '--path')
  enqueueDriveSync({ market, localPath })
}

main()
