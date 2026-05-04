#!/usr/bin/env tsx

/**
 * Audit Inbound documents after the 2026-02 "reshuffle" that moved certain document types one stage earlier.
 *
 * Prints counts of documents that still live in "old" stages, which commonly makes users think the docs were lost
 * because the UI/gates now look for them in the new stage.
 *
 * Usage:
 *   pnpm --filter @targon/talos exec tsx scripts/audits/audit-inbound-document-reshuffle.ts [options]
 *
 * Options:
 *   --tenant=US|UK|ALL   Which tenant(s) to audit (default: ALL)
 *   --limit=NUMBER      How many sample rows to print per finding (default: 10)
 *   --help, -h          Show this help
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PrismaClient } from '@targon/prisma-talos'
import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  limit: number
  help?: boolean
}

function loadEnv() {
  loadTalosScriptEnv()
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = { tenants: ['US', 'UK'], limit: 10 }

  for (const raw of process.argv.slice(2)) {
    const arg = raw.trim()
    if (arg === '--') continue
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    if (arg.startsWith('--tenant=')) {
      const rawValue = arg.split('=')[1]
      const value = typeof rawValue === 'string' ? rawValue.toUpperCase() : ''
      if (value === 'US' || value === 'UK') {
        options.tenants = [value]
        continue
      }
      if (value === 'ALL') {
        options.tenants = ['US', 'UK']
        continue
      }
      throw new Error(`Invalid --tenant value: ${value} (expected US, UK, or ALL)`)
    }
    if (arg.startsWith('--limit=')) {
      const rawValue = arg.split('=')[1]
      const value = Number(rawValue)
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --limit value: ${rawValue} (expected a positive integer)`)
      }
      options.limit = value
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function showHelp() {
  console.log('=== Inbound Document Reshuffle Audit ===\n')
  console.log('Options:')
  console.log('  --tenant=US|UK|ALL   Which tenant(s) to audit (default: ALL)')
  console.log('  --limit=NUMBER      How many sample rows to print per finding (default: 10)')
  console.log('  --help, -h          Show this help')
}

type Finding = {
  label: string
  where: {
    stage: string
    documentType: { equals?: string; startsWith?: string; in?: string[] }
  }
}

const FINDINGS: Finding[] = [
  { label: 'box_artwork* still in MANUFACTURING (should be ISSUED)', where: { stage: 'MANUFACTURING', documentType: { startsWith: 'box_artwork' } } },
  { label: 'packing_list still in OCEAN (should be MANUFACTURING)', where: { stage: 'OCEAN', documentType: { equals: 'packing_list' } } },
  { label: 'bill_of_lading still in OCEAN (should be MANUFACTURING)', where: { stage: 'OCEAN', documentType: { equals: 'bill_of_lading' } } },
  { label: 'commercial_invoice still in OCEAN (should be MANUFACTURING)', where: { stage: 'OCEAN', documentType: { equals: 'commercial_invoice' } } },
  { label: 'grn still in WAREHOUSE (should be OCEAN)', where: { stage: 'WAREHOUSE', documentType: { equals: 'grn' } } },
  { label: 'custom_declaration still in WAREHOUSE (should be OCEAN)', where: { stage: 'WAREHOUSE', documentType: { equals: 'custom_declaration' } } },
  { label: 'pi_* docs not in ISSUED (gates look in ISSUED)', where: { stage: 'MANUFACTURING', documentType: { startsWith: 'pi_' } } },
  { label: 'pi_* docs not in ISSUED (gates look in ISSUED)', where: { stage: 'OCEAN', documentType: { startsWith: 'pi_' } } },
  { label: 'pi_* docs not in ISSUED (gates look in ISSUED)', where: { stage: 'WAREHOUSE', documentType: { startsWith: 'pi_' } } },
]

async function runForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma: PrismaClient = await getTenantPrismaClient(tenant)

  console.log(`\n[${tenant}] Auditing Inbound documents…`)

  for (const finding of FINDINGS) {
    const docTypeFilter =
      finding.where.documentType.equals
        ? { equals: finding.where.documentType.equals }
        : finding.where.documentType.startsWith
          ? { startsWith: finding.where.documentType.startsWith }
          : finding.where.documentType.in
            ? { in: finding.where.documentType.in }
            : undefined

    if (!docTypeFilter) {
      throw new Error(`Invalid finding config for: ${finding.label}`)
    }

    const count = await prisma.inboundOrderDocument.count({
      where: {
        stage: finding.where.stage as never,
        documentType: docTypeFilter as never,
      },
    })

    if (count === 0) continue

    console.log(`\n[${tenant}] ${finding.label}`)
    console.log(`[${tenant}] Count: ${count}`)

    const sample = await prisma.inboundOrderDocument.findMany({
      where: {
        stage: finding.where.stage as never,
        documentType: docTypeFilter as never,
      },
      select: {
        inboundOrderId: true,
        stage: true,
        documentType: true,
        fileName: true,
        uploadedAt: true,
        uploadedByName: true,
      },
      orderBy: [{ uploadedAt: 'desc' }],
      take: options.limit,
    })

    for (const row of sample) {
      console.log(
        `[${tenant}] ${row.inboundOrderId} | ${row.stage} | ${row.documentType} | ${row.fileName} | ${row.uploadedAt.toISOString()} | ${row.uploadedByName ?? '—'}`
      )
    }
  }

  console.log(`\n[${tenant}] Done.`)
}

async function main() {
  loadEnv()
  const options = parseArgs()
  if (options.help) {
    showHelp()
    process.exit(0)
  }

  console.log('=== Inbound Document Reshuffle Audit ===')
  console.log(`Tenants: ${options.tenants.join(', ')}`)
  console.log(`Sample limit: ${options.limit}`)

  for (const tenant of options.tenants) {
    await runForTenant(tenant, options)
  }

  console.log('\nAll done.')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
