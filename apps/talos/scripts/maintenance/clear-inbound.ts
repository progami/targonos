#!/usr/bin/env tsx

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  dryRun: boolean
  help?: boolean
}

function loadEnv() {
  loadTalosScriptEnv()
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    tenants: ['US', 'UK'],
    dryRun: false,
  }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (arg.startsWith('--tenant=')) {
      const value = arg.split('=')[1]?.toUpperCase()
      if (value === 'US' || value === 'UK') {
        options.tenants = [value]
        continue
      }
      if (value === 'ALL') {
        options.tenants = ['US', 'UK']
        continue
      }
      throw new Error(`Invalid --tenant value: ${value ?? ''} (expected US, UK, or ALL)`)
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log(`
Clear Inbound

Deletes all inbound and Inbound-linked inventory transactions in the target tenant(s).

Usage:
  pnpm --filter @targon/talos exec tsx scripts/maintenance/clear-inbound.ts [options]

Options:
  --tenant=US|UK|ALL        Which tenant(s) to process (default: ALL)
  --dry-run                Print counts without deleting
  --help, -h               Show this help
`)
}

async function clearTenant(tenant: TenantCode, dryRun: boolean) {
  const prisma = await getTenantPrismaClient(tenant)

  try {
    const poCount = await prisma.inboundOrder.count()
    const txCount = await prisma.inventoryTransaction.count({
      where: {
        OR: [{ inboundOrderId: { not: null } }, { inboundOrderLineId: { not: null } }],
      },
    })

    if (dryRun) {
      console.log(`[${tenant}] Inbounds=${poCount} Inbound transactions=${txCount}`)
      return
    }

    const txResult = await prisma.inventoryTransaction.deleteMany({
      where: {
        OR: [{ inboundOrderId: { not: null } }, { inboundOrderLineId: { not: null } }],
      },
    })
    const poResult = await prisma.inboundOrder.deleteMany()

    console.log(
      `[${tenant}] Deleted ${poResult.count} inbound and ${txResult.count} inventory transactions`
    )
  } finally {
    await prisma.$disconnect()
  }
}

async function main() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    return
  }

  for (const tenant of options.tenants) {
    await clearTenant(tenant, options.dryRun)
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})

export {}
