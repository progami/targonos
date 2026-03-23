#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { MONITORING_BASE, weekContextForEndDate } from './lib/common.mjs'

const WEEKLY_ROOT = path.join(MONITORING_BASE, 'Weekly')
const WEEK_FILE_PATTERN = /^(W\d{2})_(\d{4}-\d{2}-\d{2})_(.+)$/

function parseArgs() {
  return {
    dryRun: process.argv.includes('--dry-run'),
  }
}

function walkFiles(root) {
  const entries = fs.readdirSync(root, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const nextPath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...walkFiles(nextPath))
      continue
    }
    if (entry.isFile()) files.push(nextPath)
  }

  return files
}

function repairJsonText(text, actualCode, expectedCode, oldPrefix, newPrefix) {
  const data = JSON.parse(text)
  let changed = false

  function visit(value, key = '') {
    if (typeof value === 'string') {
      if (key === 'weekCode' && value === actualCode) {
        changed = true
        return expectedCode
      }

      const replaced = value.replaceAll(oldPrefix, newPrefix)
      if (replaced !== value) changed = true
      return replaced
    }

    if (Array.isArray(value)) {
      let arrayChanged = false
      const next = value.map((item) => {
        const updated = visit(item)
        if (updated !== item) arrayChanged = true
        return updated
      })
      if (arrayChanged) changed = true
      return next
    }

    if (!value || typeof value !== 'object') return value

    for (const [childKey, childValue] of Object.entries(value)) {
      const updated = visit(childValue, childKey)
      if (updated !== childValue) {
        value[childKey] = updated
        changed = true
      }
    }
    return value
  }

  visit(data)
  if (!changed) return text
  return `${JSON.stringify(data, null, 2)}\n`
}

function repairCsvText(text, actualCode, expectedCode) {
  const lines = text.split('\n')
  if (!lines[0]?.startsWith('Week Code,')) return text

  let changed = false
  for (let index = 1; index < lines.length; index += 1) {
    if (!lines[index].startsWith(`${actualCode},`)) continue
    lines[index] = `${expectedCode}${lines[index].slice(actualCode.length)}`
    changed = true
  }

  return changed ? lines.join('\n') : text
}

function repairFileContents(file, actualCode, expectedCode, oldPrefix, newPrefix) {
  const ext = path.extname(file).toLowerCase()
  if (ext !== '.json' && ext !== '.csv') return

  const original = fs.readFileSync(file, 'utf8')
  const updated =
    ext === '.json'
      ? repairJsonText(original, actualCode, expectedCode, oldPrefix, newPrefix)
      : repairCsvText(original, actualCode, expectedCode)

  if (updated !== original) fs.writeFileSync(file, updated)
}

function collectMismatches() {
  const mismatches = []

  for (const file of walkFiles(WEEKLY_ROOT)) {
    const name = path.basename(file)
    const match = name.match(WEEK_FILE_PATTERN)
    if (!match) continue

    const actualCode = match[1]
    const weekEnd = match[2]
    const suffix = match[3]
    const { weekCode: expectedCode } = weekContextForEndDate(weekEnd)
    if (actualCode === expectedCode) continue

    const oldPrefix = `${actualCode}_${weekEnd}`
    const newPrefix = `${expectedCode}_${weekEnd}`
    const nextPath = path.join(path.dirname(file), `${newPrefix}_${suffix}`)
    mismatches.push({ file, nextPath, actualCode, expectedCode, oldPrefix, newPrefix, weekEnd })
  }

  return mismatches.sort((left, right) => left.file.localeCompare(right.file))
}

function validateMismatches(mismatches) {
  for (const mismatch of mismatches) {
    if (fs.existsSync(mismatch.nextPath)) {
      throw new Error(`Refusing to overwrite existing file: ${mismatch.nextPath}`)
    }
  }
}

function main() {
  const { dryRun } = parseArgs()
  const mismatches = collectMismatches()
  validateMismatches(mismatches)

  if (!mismatches.length) {
    console.log('[repair-week-labels] No mismatches found.')
    return
  }

  for (const mismatch of mismatches) {
    console.log(`[repair-week-labels] ${mismatch.file} -> ${mismatch.nextPath}`)
    if (dryRun) continue

    repairFileContents(mismatch.file, mismatch.actualCode, mismatch.expectedCode, mismatch.oldPrefix, mismatch.newPrefix)
    fs.renameSync(mismatch.file, mismatch.nextPath)
  }

  console.log(`[repair-week-labels] ${dryRun ? 'Planned' : 'Applied'} ${mismatches.length} rename(s).`)
}

main()
