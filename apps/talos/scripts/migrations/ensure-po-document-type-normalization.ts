#!/usr/bin/env tsx

/**
 * Normalize legacy PO document types to match the current UI expectations.
 *
 * Today in main_talos_uk we have:
 * - `transaction_certificate` uploaded as the "GRS TC" document
 * - `box_artwork` uploaded as a single file, but the UI expects per-SKU `box_artwork_<skuSlug>`
 *
 * This script:
 * 1) Renames `transaction_certificate` -> `grs_tc` (idempotent; skips if `grs_tc` already exists)
 * 2) Expands plain `box_artwork` -> per-SKU `box_artwork_<skuSlug>` by duplicating the DB row
 *    (points to the same S3 object; idempotent via unique constraint + skipDuplicates)
 *
 * Usage:
 *   pnpm --filter @targon/talos exec tsx scripts/migrations/ensure-po-document-type-normalization.ts [options]
 *
 * Options:
 *   --tenant=US|UK|ALL   Which tenant(s) to process (default: ALL)
 *   --dry-run            Print what would change without writing
 *   --limit=NUMBER       Limit sample output (default: 10)
 *   --help, -h           Show this help
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '@targon/prisma-talos'
import { PurchaseOrderDocumentStage, PurchaseOrderLineStatus } from '@targon/prisma-talos'
import { getTenantPrismaClient } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

import { loadTalosScriptEnv } from '../load-env'

type ScriptOptions = {
  tenants: TenantCode[]
  dryRun: boolean
  limit: number
  help?: boolean
}

function loadEnv() {
  loadTalosScriptEnv()
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    tenants: ['US', 'UK'],
    dryRun: false,
    limit: 10,
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
  console.log('=== PO Document Type Normalization ===\n')
  console.log('Options:')
  console.log('  --tenant=US|UK|ALL   Which tenant(s) to process (default: ALL)')
  console.log('  --dry-run            Print what would change without writing')
  console.log('  --limit=NUMBER       Limit sample output (default: 10)')
  console.log('  --help, -h           Show this help')
}

function toSkuSlug(skuCode: string): string {
  return skuCode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
}

async function renameTransactionCertificate(params: { prisma: PrismaClient; dryRun: boolean }) {
  const count = await params.prisma.purchaseOrderDocument.count({
    where: {
      stage: PurchaseOrderDocumentStage.OCEAN,
      documentType: 'transaction_certificate',
    },
  })

  if (count === 0) {
    return { renamed: 0 }
  }

  if (params.dryRun) {
    return { renamed: count }
  }

  const rows = await params.prisma.purchaseOrderDocument.findMany({
    where: {
      stage: PurchaseOrderDocumentStage.OCEAN,
      documentType: 'transaction_certificate',
    },
    select: { id: true, purchaseOrderId: true },
  })

  let renamed = 0
  for (const row of rows) {
    const already = await params.prisma.purchaseOrderDocument.findFirst({
      where: {
        purchaseOrderId: row.purchaseOrderId,
        stage: PurchaseOrderDocumentStage.OCEAN,
        documentType: 'grs_tc',
      },
      select: { id: true },
    })
    if (already) continue

    await params.prisma.purchaseOrderDocument.update({
      where: { id: row.id },
      data: { documentType: 'grs_tc' },
    })
    renamed += 1
  }

  return { renamed }
}

async function expandPlainBoxArtwork(params: { prisma: PrismaClient; dryRun: boolean; limit: number }) {
  const baseDocs = await params.prisma.purchaseOrderDocument.findMany({
    where: {
      stage: PurchaseOrderDocumentStage.ISSUED,
      documentType: 'box_artwork',
    },
    select: {
      id: true,
      purchaseOrderId: true,
      stage: true,
      documentType: true,
      fileName: true,
      contentType: true,
      size: true,
      s3Key: true,
      uploadedAt: true,
      uploadedById: true,
      uploadedByName: true,
      metadata: true,
    },
  })

  if (baseDocs.length === 0) {
    return { created: 0, sample: [] as Array<{ purchaseOrderId: string; documentType: string }> }
  }

  let created = 0
  const sample: Array<{ purchaseOrderId: string; documentType: string }> = []

  for (const doc of baseDocs) {
    const lines = await params.prisma.purchaseOrderLine.findMany({
      where: {
        purchaseOrderId: doc.purchaseOrderId,
        status: { not: PurchaseOrderLineStatus.CANCELLED },
      },
      select: { skuCode: true },
    })

    const skuSlugs = Array.from(
      new Set(
        lines
          .map(line => (typeof line.skuCode === 'string' ? line.skuCode.trim() : ''))
          .filter(value => value.length > 0)
          .map(toSkuSlug)
      )
    )

    if (skuSlugs.length === 0) continue

    const rows = skuSlugs.map((slug) => {
      const documentType = `box_artwork_${slug}`
      return {
        id: randomUUID(),
        purchaseOrderId: doc.purchaseOrderId,
        stage: PurchaseOrderDocumentStage.ISSUED,
        documentType,
        fileName: doc.fileName,
        contentType: doc.contentType,
        size: doc.size,
        s3Key: doc.s3Key,
        uploadedAt: doc.uploadedAt,
        uploadedById: doc.uploadedById,
        uploadedByName: doc.uploadedByName,
        metadata: doc.metadata as never,
      }
    })

    if (params.dryRun) {
      created += rows.length
      for (const row of rows) {
        if (sample.length >= params.limit) break
        sample.push({ purchaseOrderId: row.purchaseOrderId, documentType: row.documentType })
      }
      continue
    }

    const result = await params.prisma.purchaseOrderDocument.createMany({
      data: rows,
      skipDuplicates: true,
    })

    created += result.count
    if (sample.length < params.limit) {
      for (const row of rows) {
        if (sample.length >= params.limit) break
        sample.push({ purchaseOrderId: row.purchaseOrderId, documentType: row.documentType })
      }
    }
  }

  return { created, sample }
}

async function applyForTenant(tenant: TenantCode, options: ScriptOptions) {
  const prisma: PrismaClient = await getTenantPrismaClient(tenant)

  console.log(`\n[${tenant}] Normalizing PO document types`)
  console.log(`[${tenant}] Dry run: ${options.dryRun}`)

  const tcResult = await renameTransactionCertificate({ prisma, dryRun: options.dryRun })
  console.log(
    `[${tenant}] transaction_certificate -> grs_tc: ${options.dryRun ? 'would rename' : 'renamed'} ${tcResult.renamed}`
  )

  const artworkResult = await expandPlainBoxArtwork({
    prisma,
    dryRun: options.dryRun,
    limit: options.limit,
  })
  console.log(
    `[${tenant}] box_artwork -> box_artwork_<sku>: ${options.dryRun ? 'would create' : 'created'} ${artworkResult.created}`
  )

  if (artworkResult.sample.length > 0) {
    console.log(`[${tenant}] Sample:`)
    for (const entry of artworkResult.sample) {
      console.log(`[${tenant}] ${entry.purchaseOrderId} -> ${entry.documentType}`)
    }
  }

  console.log(`[${tenant}] Done`)
}

async function main() {
  loadEnv()
  const options = parseArgs()

  if (options.help) {
    showHelp()
    process.exit(0)
  }

  console.log('=== PO Document Type Normalization ===')
  console.log(`Tenants: ${options.tenants.join(', ')}`)
  console.log(`Dry run: ${options.dryRun}`)
  console.log(`Sample limit: ${options.limit}`)

  for (const tenant of options.tenants) {
    await applyForTenant(tenant, options)
  }

  console.log('\nAll done.')
  process.exit(0)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
