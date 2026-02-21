#!/usr/bin/env node

import readline from 'node:readline'

const [fromSchema, toSchema] = process.argv.slice(2)

if (!fromSchema || !toSchema) {
  console.error('Usage: rewrite-pgdump-schema.mjs <fromSchema> <toSchema>')
  process.exit(1)
}

let inCopyData = false

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const schemaToken = new RegExp(`\\b${escapeRegExp(fromSchema)}\\b`, 'g')

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
})

rl.on('line', (line) => {
  if (inCopyData) {
    process.stdout.write(`${line}\n`)
    if (line === '\\.') {
      inCopyData = false
    }
    return
  }

  const rewritten = line.replace(schemaToken, toSchema)
  process.stdout.write(`${rewritten}\n`)

  if (rewritten.startsWith('COPY ') && rewritten.includes(' FROM stdin;')) {
    inCopyData = true
  }
})

rl.on('close', () => {
  process.stdout.write('')
})
