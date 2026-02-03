#!/usr/bin/env tsx

/**
 * Backfill missing UK batch documents into Talos main schema (main_talos_uk)
 * -----------------------------------------------------------------------
 * This is a second-pass script intended to run AFTER the UK INV POs exist.
 *
 * It:
 * - Finds INV-* purchase orders from `talos_batch_migration_state.csv`
 * - Uploads missing PI docs (stage=ISSUED, document_type=pi_*)
 * - Uploads missing Cube Master docs (stage=WAREHOUSE, document_type=cube_master)
 *
 * Usage:
 *   NODE_ENV=production S3_BUCKET_NAME=wms-production-459288913318 S3_BUCKET_REGION=us-east-1 AWS_REGION=us-east-1 \
 *   pnpm --filter @targon/talos exec tsx scripts/migrations/backfill-uk-batch-documents.ts \
 *     --csv="/abs/path/to/talos_batch_migration_state.csv" \
 *     [--schema=main|dev] \
 *     [--limit=N] \
 *     [--dry-run]
 */

import dotenv from 'dotenv'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { parse as parseCsv } from 'csv-parse/sync'
import * as XLSX from 'xlsx'
import { S3Service } from '@targon/aws-s3'
import { Prisma, PurchaseOrderDocumentStage } from '@targon/prisma-talos'
import { getTenantPrismaClient, disconnectAllTenants } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

type ScriptOptions = {
  csvPath: string
  schemaMode: 'main' | 'dev'
  dryRun: boolean
  limit: number | null
  help?: boolean
}

type CsvRow = Record<string, string>

const MIGRATION_USER_ID = 'system'
const MIGRATION_USER_NAME = 'Talos Migration'

const SHARED_DRIVES_ROOT =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives'

const IGNORE_DIR_NAMES = new Set([
  'inspection',
  'photos',
  'videos',
  'barcodes',
  'pictures',
  'picture',
])

function loadEnv() {
  const candidates = ['.env.local', '.env.dev', '.env']
  const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
  for (const candidate of candidates) {
    const fullPath = path.join(appDir, candidate)
    if (!fs.existsSync(fullPath)) continue
    dotenv.config({ path: fullPath })
    return
  }
  dotenv.config({ path: path.join(appDir, '.env') })
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    csvPath: '',
    schemaMode: 'main',
    dryRun: false,
    limit: null,
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
    if (arg.startsWith('--csv=')) {
      options.csvPath = arg.split('=')[1] ?? ''
      continue
    }
    if (arg.startsWith('--schema=')) {
      const value = (arg.split('=')[1] ?? '').toLowerCase()
      if (value === 'main' || value === 'dev') {
        options.schemaMode = value
        continue
      }
      throw new Error(`Invalid --schema value: ${value} (expected main|dev)`)
    }
    if (arg.startsWith('--limit=')) {
      const value = Number(arg.split('=')[1] ?? '')
      if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --limit: ${arg} (expected positive integer)`)
      }
      options.limit = value
      continue
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  if (!options.help && !options.csvPath) {
    throw new Error('Missing required --csv argument')
  }

  return options
}

function showHelp() {
  console.log(`
Backfill UK batch documents into Talos main schema

Usage:
  pnpm --filter @targon/talos exec tsx scripts/migrations/backfill-uk-batch-documents.ts --csv=/abs/path/to/talos_batch_migration_state.csv [options]

Options:
  --schema=main|dev         Target schema mode (default: main)
  --limit=N                 Only process first N UK rows
  --dry-run                 No DB writes / no S3 uploads
  --help, -h                Show help
`)
}

function rewriteSchema(urlString: string, schema: string): string {
  const url = new URL(urlString)
  url.searchParams.set('schema', schema)
  return url.toString()
}

function applySchemaMode(mode: ScriptOptions['schemaMode']) {
  if (mode === 'dev') return

  const uk = process.env.DATABASE_URL_UK
  const fallback = process.env.DATABASE_URL

  if (typeof uk === 'string' && uk.length > 0) {
    process.env.DATABASE_URL_UK = rewriteSchema(uk, 'main_talos_uk')
  }
  if (typeof fallback === 'string' && fallback.length > 0) {
    process.env.DATABASE_URL = rewriteSchema(fallback, 'main_talos_uk')
  }
}

function normalizeCsvValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function isPathLike(value: string): boolean {
  if (!value) return false
  if (value === '0') return false
  return value.startsWith('/')
}

function extractTextFromPdf(filePath: string): string {
  const plain = execFileSync('pdftotext', [filePath, '-'], { encoding: 'utf8' })
  if (plain.trim().length >= 80) return plain

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-pdf-ocr-'))
  try {
    const imagePath = path.join(tmpDir, 'page.png')
    execFileSync('magick', ['-density', '250', `${filePath}[0]`, imagePath], { stdio: 'ignore' })
    const ocr = execFileSync('tesseract', [imagePath, 'stdout', '-l', 'eng'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return ocr
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

function extractTextFromDocx(filePath: string): string {
  const code = [
    'from docx import Document',
    'import sys',
    'doc = Document(sys.argv[1])',
    "print('\\n'.join(p.text for p in doc.paragraphs if p.text))",
  ].join('; ')
  return execFileSync('python3', ['-c', code, filePath], { encoding: 'utf8' })
}

function extractTextFromXlsx(filePath: string): string {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][]
    for (const row of rows) {
      for (const cell of row) {
        if (typeof cell === 'string') {
          const trimmed = cell.trim()
          if (trimmed) parts.push(trimmed)
        }
        if (typeof cell === 'number' && Number.isFinite(cell)) {
          parts.push(String(cell))
        }
      }
    }
  }
  return parts.join('\n')
}

function extractTextForFile(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return extractTextFromPdf(filePath)
  if (ext === '.docx') return extractTextFromDocx(filePath)
  if (ext === '.xlsx' || ext === '.xls') return extractTextFromXlsx(filePath)
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    return execFileSync('tesseract', [filePath, 'stdout', '-l', 'eng'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  }
  return fs.readFileSync(filePath, 'utf8')
}

function extractPiNumberFromText(text: string): string | null {
  const normalize = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, '')
  const lines = text
    .split(/\r?\n/g)
    .map((l) => l.trim())
    .filter(Boolean)

  const piNumberMatch =
    text.match(
      /(?:P[-/ ]?I(?:\s*(?:No\.?|#))?|PI(?:\s*(?:No\.?|#))?|PINo\.?|P\.I\.(?:\s*No\.?)?|INVOICE\s*NO\.?|INVOICE\s*NO|PO#)\s*[:#：]?\s*([A-Z0-9- ./]{5,})/i
    ) ?? null
  if (piNumberMatch) {
    const cleaned = normalize(piNumberMatch[1])
    if (cleaned.length > 0) return cleaned
  }

  const pivotIndex = lines.findIndex((line) => line.toLowerCase().includes('port/airport of loading'))
  if (pivotIndex >= 0) {
    const start = Math.max(0, pivotIndex - 10)
    for (let i = pivotIndex - 1; i >= start; i -= 1) {
      const candidate = lines[i] ?? ''
      const match = candidate.match(/[:：]\s*([0-9][0-9 -]{6,})/)
      if (!match) continue
      const cleaned = normalize(match[1])
      if (cleaned.length > 0) return cleaned
    }
  }

  return null
}

function walkFiles(rootDir: string): string[] {
  const out: string[] = []
  const stack: string[] = [rootDir]

  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (IGNORE_DIR_NAMES.has(entry.name.toLowerCase())) continue
        stack.push(fullPath)
        continue
      }
      out.push(fullPath)
    }
  }

  return out
}

function scorePiCandidate(filePath: string): number {
  const lower = path.basename(filePath).toLowerCase()
  const ext = path.extname(lower)
  const hasPiKeyword =
    lower.includes('proforma') ||
    lower.includes('performa') ||
    /(^|[^a-z0-9])p[- ]?i([^a-z0-9]|$)/i.test(lower)

  if (!hasPiKeyword) return 0

  let score = 0

  if (lower.includes('proforma') || lower.includes('performa')) score += 20
  if (/(^|[^a-z0-9])p[- ]?i([^a-z0-9]|$)/i.test(lower)) score += 15

  if (ext === '.pdf') score += 10
  if (ext === '.docx') score += 6
  if (ext === '.xlsx' || ext === '.xls') score += 4

  if (lower.includes('packing') && lower.includes('list')) score -= 20
  if (lower.includes('commercial') && lower.includes('invoice')) score -= 20
  if (lower.includes('bill') && lower.includes('lading')) score -= 20
  if (lower.includes('shipping marks') || lower.includes('shipping mark')) score -= 20

  const fullLower = filePath.toLowerCase()
  if (fullLower.includes(`${path.sep}01 rfq${path.sep}`)) score += 10
  if (fullLower.includes(`${path.sep}rfq${path.sep}`)) score += 3

  return score
}

function scoreCubeCandidate(filePath: string): number {
  const lower = path.basename(filePath).toLowerCase()
  const ext = path.extname(lower)
  const hasKeyword =
    lower.includes('cube master') ||
    lower.includes('cube') ||
    lower.includes('stacking') ||
    (lower.includes('container') && lower.includes('stack'))

  if (!hasKeyword) return 0

  let score = 0
  if (lower.includes('cube master')) score += 30
  if (lower.includes('stacking')) score += 20
  if (lower.includes('container') && lower.includes('stack')) score += 20
  if (lower.includes('cube')) score += 10

  if (ext === '.xlsx' || ext === '.xls') score += 10
  if (ext === '.pdf') score += 6
  if (lower.includes('copy')) score -= 5
  return score
}

function pickBest(files: string[], score: (filePath: string) => number): string | null {
  let bestPath: string | null = null
  let bestScore = Number.NEGATIVE_INFINITY
  for (const filePath of files) {
    const s = score(filePath)
    if (s <= bestScore) continue
    bestScore = s
    bestPath = filePath
  }
  if (!bestPath) return null
  if (bestScore < 1) return null
  return bestPath
}

function buildOrderNumber(batchIdRaw: string, variant: string): string {
  const normalizedBatch = batchIdRaw.trim().toUpperCase()
  const normalizedVariant = variant.trim().toUpperCase()
  if (!normalizedBatch) throw new Error('batch_id_raw is required')
  if (!normalizedVariant) throw new Error('variant is required')
  return `INV-${normalizedBatch}-${normalizedVariant}`
}

async function uploadPurchaseOrderDocument(params: {
  prisma: Prisma.TransactionClient
  tenant: TenantCode
  s3: S3Service | null
  purchaseOrderId: string
  purchaseOrderNumber: string
  stage: PurchaseOrderDocumentStage
  documentType: string
  filePath: string
  dryRun: boolean
}) {
  if (!fs.existsSync(params.filePath)) {
    throw new Error(`Missing file for ${params.purchaseOrderNumber} ${params.documentType}: ${params.filePath}`)
  }

  const existingDoc = await params.prisma.purchaseOrderDocument.findUnique({
    where: {
      purchaseOrderId_stage_documentType: {
        purchaseOrderId: params.purchaseOrderId,
        stage: params.stage,
        documentType: params.documentType,
      },
    },
    select: { id: true },
  })
  if (existingDoc) return false

  if (params.dryRun) return true
  if (!params.s3) throw new Error('S3 service not available')

  const fileName = path.basename(params.filePath)
  const fileBuffer = fs.readFileSync(params.filePath)
  const s3Key = params.s3.generateKey(
    {
      type: 'purchase-order',
      purchaseOrderId: params.purchaseOrderId,
      tenantCode: params.tenant,
      purchaseOrderNumber: params.purchaseOrderNumber,
      stage: params.stage,
      documentType: params.documentType,
    },
    fileName
  )
  const uploadResult = await params.s3.uploadFile(fileBuffer, s3Key, {
    metadata: {
      tenantCode: params.tenant,
      purchaseOrderId: params.purchaseOrderId,
      orderNumber: params.purchaseOrderNumber,
      stage: params.stage,
      documentType: params.documentType,
      sourcePath: params.filePath,
    },
  })

  await params.prisma.purchaseOrderDocument.create({
    data: {
      purchaseOrderId: params.purchaseOrderId,
      stage: params.stage,
      documentType: params.documentType,
      fileName,
      contentType: uploadResult.contentType,
      size: uploadResult.size,
      s3Key: uploadResult.key,
      uploadedById: MIGRATION_USER_ID,
      uploadedByName: MIGRATION_USER_NAME,
      metadata: { sourcePath: params.filePath } as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  })

  return true
}

async function main() {
  loadEnv()
  const options = parseArgs()
  if (options.help) {
    showHelp()
    return
  }

  applySchemaMode(options.schemaMode)

  if (!fs.existsSync(options.csvPath)) {
    throw new Error(`CSV not found: ${options.csvPath}`)
  }

  const csvRaw = fs.readFileSync(options.csvPath, 'utf8')
  const records = parseCsv(csvRaw, { columns: true, skip_empty_lines: true }) as CsvRow[]

  const ukRowsAll = records.filter((row) => normalizeCsvValue(row.region).toUpperCase() === 'UK')
  const ukRows = typeof options.limit === 'number' ? ukRowsAll.slice(0, options.limit) : ukRowsAll

  const tenant: TenantCode = 'UK'
  const prisma = await getTenantPrismaClient(tenant)
  const s3 = options.dryRun ? null : new S3Service()

  const stats = { piDocs: 0, cubeMasters: 0 }

  for (const row of ukRows) {
    const batchIdRaw = normalizeCsvValue(row.batch_id_raw)
    const variant = normalizeCsvValue(row.variant)
    const orderNumber = buildOrderNumber(batchIdRaw, variant)

    const folderRel = normalizeCsvValue(row.folder)
    const batchFolder = path.join(SHARED_DRIVES_ROOT, folderRel)
    if (!fs.existsSync(batchFolder)) {
      throw new Error(`Batch folder not found for ${orderNumber}: ${batchFolder}`)
    }

    const order = await prisma.purchaseOrder.findUnique({
      where: { orderNumber },
      select: { id: true, orderNumber: true },
    })
    if (!order) {
      throw new Error(`Purchase order not found for ${orderNumber}`)
    }

    const existingPi = await prisma.purchaseOrderDocument.findFirst({
      where: {
        purchaseOrderId: order.id,
        stage: PurchaseOrderDocumentStage.ISSUED,
        documentType: { startsWith: 'pi_' },
      },
      select: { id: true },
    })

    if (!existingPi) {
      const allFiles = walkFiles(batchFolder)
      const piCandidates = allFiles.filter((filePath) => {
        const ext = path.extname(filePath).toLowerCase()
        if (ext !== '.pdf' && ext !== '.docx' && ext !== '.xlsx' && ext !== '.xls') return false
        return scorePiCandidate(filePath) > 0
      })
      const pickedPi = pickBest(piCandidates, scorePiCandidate)
      if (pickedPi) {
        const piText = extractTextForFile(pickedPi)
        const piNumber = extractPiNumberFromText(piText)
        const piDocType = piNumber ? `pi_${piNumber.toLowerCase()}` : 'pi_unknown'

        const created = await uploadPurchaseOrderDocument({
          prisma,
          tenant,
          s3,
          purchaseOrderId: order.id,
          purchaseOrderNumber: order.orderNumber,
          stage: PurchaseOrderDocumentStage.ISSUED,
          documentType: piDocType,
          filePath: pickedPi,
          dryRun: options.dryRun,
        })
        if (created) stats.piDocs += 1
      }
    }

    const existingCube = await prisma.purchaseOrderDocument.findFirst({
      where: {
        purchaseOrderId: order.id,
        stage: PurchaseOrderDocumentStage.WAREHOUSE,
        documentType: 'cube_master',
      },
      select: { id: true },
    })
    if (!existingCube) {
      const allFiles = walkFiles(batchFolder)
      const cubeCandidates = allFiles.filter((filePath) => {
        const ext = path.extname(filePath).toLowerCase()
        if (ext !== '.pdf' && ext !== '.xlsx' && ext !== '.xls') return false
        return scoreCubeCandidate(filePath) > 0
      })
      const pickedCube = pickBest(cubeCandidates, scoreCubeCandidate)
      if (pickedCube) {
        const created = await uploadPurchaseOrderDocument({
          prisma,
          tenant,
          s3,
          purchaseOrderId: order.id,
          purchaseOrderNumber: order.orderNumber,
          stage: PurchaseOrderDocumentStage.WAREHOUSE,
          documentType: 'cube_master',
          filePath: pickedCube,
          dryRun: options.dryRun,
        })
        if (created) stats.cubeMasters += 1
      }
    }

    console.log(`[UK] Pass2 checked ${orderNumber}`)
  }

  await disconnectAllTenants()

  console.log(`\n[UK] Pass2 complete (schema=${options.schemaMode}, dryRun=${options.dryRun})`)
  console.log(`[UK] piDocsAdded=${stats.piDocs} cubeMastersAdded=${stats.cubeMasters}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

export {}
