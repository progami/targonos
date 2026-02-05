#!/usr/bin/env tsx

/**
 * Backfill safe INV-* purchase order fields from existing documents (UK/US)
 * ------------------------------------------------------------------------
 *
 * Goals:
 * - Do NOT assume values.
 * - Only backfill fields when the value is explicitly present in a document.
 * - Only write to DB when the destination field is currently null.
 * - Produce a JSON mapping file of extracted values + sources to aid further migration work.
 *
 * Current safe backfills (only when explicitly present in docs):
 * - From Bill of Lading: actual_departure (SHIPPED ON BOARD <date>), house_bill_of_lading, receive_type, total_cartons, total_weight_kg, total_volume_cbm
 * - From Packing List: packing_list_ref (PACKING NO), vessel_name (PER <vessel> V.<voyage>), ports (FROM <pol> TO <pod>), estimated_departure (SAILING ON / ABOUT <date>)
 * - From Commercial Invoice: commercial_invoice_number (INVOICE NO.)
 * - From Customs Declaration (CDS): customs_entry_number (MRN format, when present), customs_cleared_date (only when date is unambiguous)
 * - From GRN/Delivery Note: received_date (only when date is unambiguous)
 *
 * Usage:
 *   NODE_ENV=production \
 *   pnpm --filter @targon/talos exec tsx scripts/migrations/backfill-uk-inv-fields-from-documents.ts \
 *     --tenant=UK|US \
 *     --csv="/abs/path/to/talos_batch_migration_state.csv" \
 *     --out="/abs/path/to/output.json" \
 *     [--schema=main|dev] \
 *     [--limit=N] \
 *     [--ocr=off|auto|always] \
 *     [--ocr-pages=N] \
 *     [--apply] \
 *     [--apply-ocr] \
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
import { InboundReceiveType, Prisma, PurchaseOrderDocumentStage } from '@targon/prisma-talos'
import { getTenantPrismaClient, disconnectAllTenants } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

type OcrMode = 'off' | 'auto' | 'always'

type ScriptOptions = {
  tenant: TenantCode
  all: boolean
  csvPath: string
  outPath: string
  schemaMode: 'main' | 'dev'
  dryRun: boolean
  apply: boolean
  applyOcr: boolean
  limit: number | null
  offset: number
  ocrMode: OcrMode
  ocrPages: number
  help?: boolean
}

type CsvRow = Record<string, string>

type ExtractedValue<T> = {
  value: T
  raw: string
  context: string
  sourcePath: string
  extractionMethod: 'pdftotext' | 'ocr' | 'text'
  docId: string | null
  documentType: string
  stage: PurchaseOrderDocumentStage | null
}

type PurchaseOrderDocRow = {
  id: string
  documentType: string
  stage: PurchaseOrderDocumentStage
  fileName: string
  contentType: string
  size: number
  metadata: Prisma.JsonValue
}

type PurchaseOrderLineRow = {
  id: string
  skuCode: string
  unitsOrdered: number
  unitsPerCarton: number
  quantity: number
  unitCost: Prisma.Decimal | null
  totalCost: Prisma.Decimal | null
  piNumber: string | null
  commodityCode: string | null
  countryOfOrigin: string | null
  netWeightKg: Prisma.Decimal | null
  cartonDimensionsCm: string | null
  cartonSide1Cm: Prisma.Decimal | null
  cartonSide2Cm: Prisma.Decimal | null
  cartonSide3Cm: Prisma.Decimal | null
  cartonWeightKg: Prisma.Decimal | null
  packagingType: string | null
  storageCartonsPerPallet: number | null
  shippingCartonsPerPallet: number | null
}

type MappingLineRow = {
  lineId: string
  skuCode: string
  unitsOrdered: number
  unitsPerCarton: number
  cartons: number
  current: {
    unitCost: string | null
    totalCost: string | null
    piNumber: string | null
    commodityCode: string | null
    countryOfOrigin: string | null
    netWeightKg: string | null
    cartonWeightKg: string | null
    cartonDimensionsCm: string | null
    cartonSide1Cm: string | null
    cartonSide2Cm: string | null
    cartonSide3Cm: string | null
    packagingType: string | null
    storageCartonsPerPallet: number | null
    shippingCartonsPerPallet: number | null
  }
  applied: {
    unitCost?: string
    totalCost?: string
    piNumber?: string
    commodityCode?: string
    countryOfOrigin?: string
    netWeightKg?: string
    cartonWeightKg?: string
    cartonDimensionsCm?: string
    cartonSide1Cm?: string
    cartonSide2Cm?: string
    cartonSide3Cm?: string
    packagingType?: string
    storageCartonsPerPallet?: number
    shippingCartonsPerPallet?: number
  }
  created?: boolean
  warnings: string[]
}

type MappingOrderRow = {
  purchaseOrderId: string
  orderNumber: string
  current: {
    expectedDate: string | null
    incoterms: string | null
    paymentTerms: string | null
    counterpartyName: string | null
    counterpartyAddress: string | null
    proformaInvoiceNumber: string | null
    proformaInvoiceDate: string | null
    actualDeparture: string | null
    estimatedDeparture: string | null
    totalCartons: number | null
    totalWeightKg: string | null
    totalVolumeCbm: string | null
    houseBillOfLading: string | null
    commercialInvoiceNumber: string | null
    packingListRef: string | null
    vesselName: string | null
    voyageNumber: string | null
    portOfLoading: string | null
    portOfDischarge: string | null
    receiveType: string | null
    warehouseCode: string | null
    warehouseName: string | null
    customsEntryNumber: string | null
    customsClearedDate: string | null
    receivedDate: string | null
  }
  extracted: {
    expectedDateCandidates: ExtractedValue<string>[]
    incotermsCandidates: ExtractedValue<string>[]
    paymentTermsCandidates: ExtractedValue<string>[]
    counterpartyNameCandidates: ExtractedValue<string>[]
    counterpartyAddressCandidates: ExtractedValue<string>[]
    proformaInvoiceNumberCandidates: ExtractedValue<string>[]
    proformaInvoiceDateCandidates: ExtractedValue<string>[]
    actualDepartureCandidates: ExtractedValue<string>[]
    estimatedDepartureCandidates: ExtractedValue<string>[]
    totalCartonsCandidates: ExtractedValue<number>[]
    totalWeightKgCandidates: ExtractedValue<string>[]
    totalVolumeCbmCandidates: ExtractedValue<string>[]
    houseBillOfLadingCandidates: ExtractedValue<string>[]
    commercialInvoiceNumberCandidates: ExtractedValue<string>[]
    packingListRefCandidates: ExtractedValue<string>[]
    vesselNameCandidates: ExtractedValue<string>[]
    voyageNumberCandidates: ExtractedValue<string>[]
    portOfLoadingCandidates: ExtractedValue<string>[]
    portOfDischargeCandidates: ExtractedValue<string>[]
    receiveTypeCandidates: ExtractedValue<string>[]
    warehouseCodeCandidates: ExtractedValue<string>[]
    warehouseNameCandidates: ExtractedValue<string>[]
    customsEntryNumberCandidates: ExtractedValue<string>[]
    customsClearedDateCandidates: ExtractedValue<string>[]
    receivedDateCandidates: ExtractedValue<string>[]
  }
  applied: {
    expectedDate?: string
    incoterms?: string
    paymentTerms?: string
    counterpartyName?: string
    counterpartyAddress?: string
    proformaInvoiceNumber?: string
    proformaInvoiceDate?: string
    actualDeparture?: string
    estimatedDeparture?: string
    totalCartons?: number
    totalWeightKg?: string
    totalVolumeCbm?: string
    houseBillOfLading?: string
    commercialInvoiceNumber?: string
    packingListRef?: string
    vesselName?: string
    voyageNumber?: string
    portOfLoading?: string
    portOfDischarge?: string
    receiveType?: string
    warehouseCode?: string
    warehouseName?: string
    customsEntryNumber?: string
    customsClearedDate?: string
    receivedDate?: string
  }
  warnings: string[]
  lines: MappingLineRow[]
  plannedLineCreates?: Omit<MappingLineRow, 'lineId' | 'current' | 'applied'>[]
}

const SHARED_DRIVES_ROOT =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives'

const BATCHES_ROOT_BY_TENANT: Record<TenantCode, string> = {
  US: path.join(SHARED_DRIVES_ROOT, 'Dust Sheets - US', '01 Batches'),
  UK: path.join(SHARED_DRIVES_ROOT, 'Dust Sheets - UK', '01 Batches'),
}

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

function rewriteSchema(urlString: string, schema: string): string {
  const url = new URL(urlString)
  url.searchParams.set('schema', schema)
  return url.toString()
}

function applySchemaMode(mode: ScriptOptions['schemaMode'], tenant: TenantCode) {
  const envKey = tenant === 'UK' ? 'DATABASE_URL_UK' : 'DATABASE_URL_US'
  const urlValue = process.env[envKey]
  if (!urlValue) {
    throw new Error(`Missing required env var: ${envKey}`)
  }

  const schema = mode === 'main' ? `main_talos_${tenant.toLowerCase()}` : `dev_talos_${tenant.toLowerCase()}`
  process.env[envKey] = rewriteSchema(urlValue, schema)
}

function parseOrderNumberParts(orderNumber: string): { batchIdRaw: string; variant: string } | null {
  const normalized = orderNumber.trim().toUpperCase()
  if (!normalized.startsWith('INV-')) return null
  const rest = normalized.slice('INV-'.length)
  const dashIndex = rest.lastIndexOf('-')
  if (dashIndex < 1) return null
  const batchIdRaw = rest.slice(0, dashIndex).trim()
  const variant = rest.slice(dashIndex + 1).trim()
  if (!batchIdRaw) return null
  if (!variant) return null
  return { batchIdRaw, variant }
}

function findBatchFolderPath(tenant: TenantCode, orderNumber: string): string | null {
  const root = BATCHES_ROOT_BY_TENANT[tenant]
  const parts = parseOrderNumberParts(orderNumber)
  if (!parts) return null
  const prefix = `BATCH ${parts.batchIdRaw} - ${parts.variant}`.toUpperCase()

  const entries = fs.readdirSync(root, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const candidate = entry.name.toUpperCase()
    if (!candidate.startsWith(prefix)) continue
    return path.join(root, entry.name)
  }

  return null
}

function findPurchaseOrderPdfPath(batchFolderPath: string): string | null {
  const matches: string[] = []

  const walk = (dirPath: string, depth: number) => {
    if (depth > 4) return
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1)
        continue
      }
      const lower = entry.name.toLowerCase()
      if (!lower.endsWith('.pdf')) continue
      if (!lower.includes('purchase order')) continue
      matches.push(fullPath)
    }
  }

  walk(batchFolderPath, 0)
  matches.sort((a, b) => a.length - b.length)
  return matches[0] ?? null
}

function findBatchPiFilePaths(batchFolderPath: string, options: { piNumberHint: string | null }): string[] {
  const rfqDir = path.join(batchFolderPath, '01 RFQ')
  const startDir = fs.existsSync(rfqDir) ? rfqDir : batchFolderPath

  const allowedExt = new Set(['.pdf', '.xlsx', '.xlsm', '.xls', '.png', '.jpg', '.jpeg'])

  const withHint: string[] = []
  const withoutHint: string[] = []

  const hint = options.piNumberHint ? options.piNumberHint.trim().toUpperCase() : null

  const walk = (dirPath: string, depth: number) => {
    if (depth > 4) return
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (!allowedExt.has(ext)) continue
      const upper = entry.name.toUpperCase()
      const isPiFile =
        /\bPI\b/i.test(upper) ||
        /\bPROFORMA\b/i.test(upper) ||
        (upper.includes('INVOICE') && upper.includes('PI'))
      if (!isPiFile) continue

      if (hint && upper.includes(hint)) {
        withHint.push(fullPath)
      } else {
        withoutHint.push(fullPath)
      }
    }
  }

  walk(startDir, 0)

  withHint.sort((a, b) => a.length - b.length)
  withoutHint.sort((a, b) => a.length - b.length)

  if (withHint.length > 0) return withHint
  return [...withHint, ...withoutHint]
}

function findTenantPiFilePathsByHint(tenant: TenantCode, options: { piNumberHint: string }): string[] {
  const root = BATCHES_ROOT_BY_TENANT[tenant]
  const hint = options.piNumberHint.trim().toUpperCase()
  if (!hint) return []

  const digitsOnly = hint.replace(/\D/g, '')
  const hints = new Set([hint])
  if (digitsOnly && digitsOnly.length >= 5) hints.add(digitsOnly)

  const allowedExt = new Set(['.pdf', '.xlsx', '.xlsm', '.xls', '.png', '.jpg', '.jpeg'])

  const matches: string[] = []

  const walk = (dirPath: string, depth: number) => {
    if (depth > 5) return
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      if (!allowedExt.has(ext)) continue

      const upper = entry.name.toUpperCase()
      if (!/\bPI\b/i.test(upper) && !/\bPROFORMA\b/i.test(upper)) continue
      const hasHint = Array.from(hints).some((h) => upper.includes(h))
      if (!hasHint) continue
      matches.push(fullPath)
    }
  }

  walk(root, 0)
  matches.sort((a, b) => a.length - b.length)
  return matches
}

function findVendorPiNumberFromPurchaseOrder(text: string): string | null {
  const match = text.match(/\bVENDOR\s+PI\b\s*[:：]?\s*PI\s*[-#:_ ]\s*([A-Z0-9][A-Z0-9-]{3,})\b/i)
  if (!match) return null
  const raw = (match[1] ?? '').trim().toUpperCase()
  const cleaned = raw.replace(/[^A-Z0-9-]+/g, '')
  if (cleaned.length < 4) return null
  return cleaned
}

function findPoDeliveryDate(text: string): { raw: string; iso: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/\bDELIVERY\b\s*[:：]?\s*(.+)$/i)
    if (!match) continue
    const raw = (match[1] ?? '').trim()
    const date = parseUnambiguousDate(raw)
    if (!date) continue
    return { raw, iso: date.toISOString(), context: line }
  }

  return null
}

function findPoPaymentTerms(text: string): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const match = line.match(/^\s*PAYMENT\s+TERMS?\b\s*[:：]?\s*(.*)$/i)
    if (!match) continue

    const rest = (match[1] ?? '').trim()
    if (rest) return { raw: rest, value: rest, context: line }

    const next = (lines[i + 1] ?? '').trim()
    if (next) return { raw: next, value: next, context: `${line} ${next}` }
  }

  return null
}

function extractPurchaseOrderLineItems(text: string): PiLineItem[] {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const out: PiLineItem[] = []

  for (const line of lines) {
    if (!/\bCS\b/i.test(line)) continue
    const match = line.match(
      /\bCS\s+([0-9A-Z-]+)\b.*?\b(\d[\d,]*)\b\s+\$([0-9]+(?:\.[0-9]+)?)\s+\$([0-9][0-9,]*(?:\.[0-9]+)?)\b/i
    )
    if (!match) continue

    const skuRaw = `CS ${match[1] ?? ''}`
    const sku = normalizeSkuCode(skuRaw)
    if (!sku) continue

    const unitsOrdered = Number(String(match[2] ?? '').replace(/,/g, ''))
    const unitCost = String(match[3] ?? '').trim()
    const totalCost = String(match[4] ?? '').trim().replace(/,/g, '')

    if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) continue
    if (!unitCost || !totalCost) continue

    out.push({
      itemNumber: null,
      unitsOrdered,
      unitCost,
      totalCost,
      unitsPerCarton: null,
      cartons: null,
      context: `sku=${sku} ${line}`,
    })
  }

  return out
}

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    tenant: 'UK',
    all: false,
    csvPath: '',
    outPath: '',
    schemaMode: 'main',
    dryRun: false,
    apply: false,
    applyOcr: false,
    limit: null,
    offset: 0,
    ocrMode: 'auto',
    ocrPages: 1,
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
    if (arg === '--apply') {
      options.apply = true
      continue
    }
    if (arg === '--apply-ocr') {
      options.applyOcr = true
      continue
    }
    if (arg.startsWith('--tenant=')) {
      const value = (arg.split('=')[1] ?? '').trim().toUpperCase()
      if (value === 'US' || value === 'UK') {
        options.tenant = value
        continue
      }
      throw new Error(`Invalid --tenant value: ${value} (expected US|UK)`)
    }
    if (arg === '--all') {
      options.all = true
      continue
    }
    if (arg.startsWith('--csv=')) {
      options.csvPath = arg.split('=')[1] ?? ''
      continue
    }
    if (arg.startsWith('--out=')) {
      options.outPath = arg.split('=')[1] ?? ''
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
    if (arg.startsWith('--offset=')) {
      const value = Number(arg.split('=')[1] ?? '')
      if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid --offset: ${arg} (expected integer >= 0)`)
      }
      options.offset = value
      continue
    }
    if (arg.startsWith('--ocr=')) {
      const value = (arg.split('=')[1] ?? '').toLowerCase()
      if (value === 'off' || value === 'auto' || value === 'always') {
        options.ocrMode = value
        continue
      }
      throw new Error(`Invalid --ocr value: ${value} (expected off|auto|always)`)
    }
    if (arg.startsWith('--ocr-pages=')) {
      const value = Number(arg.split('=')[1] ?? '')
      if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        throw new Error(`Invalid --ocr-pages: ${arg} (expected positive integer)`)
      }
      options.ocrPages = value
      continue
    }

    throw new Error(`Unknown arg: ${arg}`)
  }

  if (!options.help) {
    if (!options.all && !options.csvPath) throw new Error('Missing required --csv argument (or pass --all)')

    if (!options.outPath) {
      const baseDir = options.csvPath ? path.dirname(options.csvPath) : process.cwd()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      options.outPath = path.join(
        baseDir,
        `talos_${options.tenant.toLowerCase()}_inv_backfill_map_${stamp}.json`
      )
    }
  }

  return options
}

function showHelp() {
  console.log(`
Backfill safe INV-* PO fields from documents (UK/US)

Usage:
  pnpm --filter @targon/talos exec tsx scripts/migrations/backfill-uk-inv-fields-from-documents.ts --tenant=UK|US --csv=/abs/path/to/talos_batch_migration_state.csv --out=/abs/path/to/output.json [options]

Options:
  --tenant=UK|US            Which tenant to process (default: UK)
  --all                     Process all INV-* POs in the schema (ignores --csv/--offset/--limit behavior based on CSV)
  --schema=main|dev         Target schema mode (default: main)
  --limit=N                 Only process first N matching rows
  --offset=N                Skip first N matching rows (default: 0)
  --ocr=off|auto|always     OCR mode when PDFs have no selectable text (default: auto)
  --ocr-pages=N             OCR first N pages when OCR runs (default: 1)
  --apply                   Apply DB updates (fills only null fields)
  --apply-ocr               Allow applying OCR-derived values (still requires explicit labels)
  --dry-run                 No DB writes
  --help, -h                Show help
`)
}

function normalizeCsvValue(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function buildOrderNumber(batchIdRaw: string, variant: string): string {
  const normalizedBatch = batchIdRaw.trim().toUpperCase()
  const normalizedVariant = variant.trim().toUpperCase()
  if (!normalizedBatch) throw new Error('batch_id_raw is required')
  if (!normalizedVariant) throw new Error('variant is required')
  return `INV-${normalizedBatch}-${normalizedVariant}`
}

function safeString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed
}

function extractPiNumberFromFileName(fileName: string): string | null {
  const base = fileName.trim()
  if (!base) return null

  const match =
    base.match(/\bPI\s*[-#:_ ]\s*([A-Z0-9][A-Z0-9-]{3,})\b/i) ??
    base.match(/\bPROFORMA\s+INVOICE\s*[-#:_ ]\s*([A-Z0-9][A-Z0-9-]{3,})\b/i)
  if (!match) return null

  const raw = (match[1] ?? '').trim().toUpperCase()
  const cleaned = raw.replace(/[^A-Z0-9-]+/g, '')
  if (cleaned.length < 4) return null
  return cleaned
}

function extractPiNumberFromDocumentRow(doc: PurchaseOrderDocRow): string | null {
  const type = doc.documentType.trim()
  if (type.startsWith('pi_') && type !== 'pi_docs' && type !== 'pi_unknown') {
    const raw = type.slice('pi_'.length).trim()
    const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]+/g, '')
    if (cleaned.length < 4) return null
    return cleaned
  }

  return extractPiNumberFromFileName(doc.fileName)
}

function extractPackingListRefFromFileName(fileName: string): string | null {
  const base = fileName.trim()
  if (!base) return null

  const match = base.match(/#\s*([A-Z0-9][A-Z0-9-]{3,})\b/i)
  if (!match) return null
  const raw = (match[1] ?? '').trim().toUpperCase()
  const cleaned = raw.replace(/[^A-Z0-9-]+/g, '')
  if (cleaned.length < 3) return null
  return cleaned
}

function getDocSourcePath(doc: PurchaseOrderDocRow): string | null {
  if (!doc.metadata) return null
  if (typeof doc.metadata !== 'object') return null
  if (Array.isArray(doc.metadata)) return null
  const record = doc.metadata as Record<string, unknown>
  return safeString(record.sourcePath)
}

function extractTextFromPdf(
  filePath: string,
  options: { ocrMode: OcrMode; ocrPages: number }
): { text: string; method: 'pdftotext' | 'ocr'; errors: string[] } {
  const errors: string[] = []

  let plain = ''
  try {
    plain = execFileSync('pdftotext', ['-layout', '-nopgbrk', filePath, '-'], { encoding: 'utf8' })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(`pdftotext failed: ${message}`)
    plain = ''
  }

  const trimmed = plain.trim()

  const shouldOcr =
    options.ocrMode === 'always' ? true : options.ocrMode === 'off' ? false : trimmed.length < 80

  if (!shouldOcr) return { text: plain, method: 'pdftotext', errors }

  const baseTmpDir = os.tmpdir().startsWith('/tmp') ? '/private/tmp' : os.tmpdir()
  const tmpDir = fs.mkdtempSync(path.join(baseTmpDir, 'talos-pdf-ocr-'))
  try {
    try {
      execFileSync(
        'pdftoppm',
        ['-f', '1', '-l', String(options.ocrPages), '-r', '200', '-png', filePath, path.join(tmpDir, 'page')],
        { stdio: 'ignore' }
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`pdftoppm failed: ${message}`)
      return { text: '', method: 'ocr', errors }
    }

    const parts: string[] = []
    for (let i = 1; i <= options.ocrPages; i += 1) {
      const imagePath = path.join(tmpDir, `page-${i}.png`)
      if (!fs.existsSync(imagePath)) continue
      try {
        const ocr = execFileSync('tesseract', [imagePath, 'stdout', '-l', 'eng'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        const out = ocr.trim()
        if (out.length > 0) parts.push(out)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        errors.push(`tesseract failed (page ${i}): ${message}`)
      }
    }

    return { text: parts.join('\n'), method: 'ocr', errors }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
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

function extractTextForFile(
  filePath: string,
  options: { ocrMode: OcrMode; ocrPages: number }
): { text: string; method: 'pdftotext' | 'ocr' | 'text'; errors: string[] } {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return extractTextFromPdf(filePath, options)
  if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') {
    const errors: string[] = []
    try {
      const text = extractTextFromXlsx(filePath)
      return { text, method: 'text', errors }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`xlsx parse failed: ${message}`)
      return { text: '', method: 'text', errors }
    }
  }
  if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') {
    const errors: string[] = []
    try {
      const ocr = execFileSync('tesseract', [filePath, 'stdout', '-l', 'eng', '--psm', '4'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return { text: ocr, method: 'ocr', errors }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`tesseract failed: ${message}`)
      return { text: '', method: 'ocr', errors }
    }
  }
  const text = fs.readFileSync(filePath, 'utf8')
  return { text, method: 'text', errors: [] }
}

function monthTokenToNumber(token: string): number | null {
  const cleaned = token.trim().toLowerCase().replace(/\./g, '')
  if (cleaned === 'jan' || cleaned === 'january') return 1
  if (cleaned === 'feb' || cleaned === 'february') return 2
  if (cleaned === 'mar' || cleaned === 'march') return 3
  if (cleaned === 'apr' || cleaned === 'april') return 4
  if (cleaned === 'may') return 5
  if (cleaned === 'jun' || cleaned === 'june') return 6
  if (cleaned === 'jul' || cleaned === 'july') return 7
  if (cleaned === 'aug' || cleaned === 'august') return 8
  if (cleaned === 'sep' || cleaned === 'sept' || cleaned === 'september') return 9
  if (cleaned === 'oct' || cleaned === 'october') return 10
  if (cleaned === 'nov' || cleaned === 'november') return 11
  if (cleaned === 'dec' || cleaned === 'december') return 12
  return null
}

function parseUnambiguousDate(raw: string): Date | null {
  const trimmed = raw.trim()

  const isoMatch = trimmed.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/)
  if (isoMatch) {
    const year = Number(isoMatch[1])
    const month = Number(isoMatch[2])
    const day = Number(isoMatch[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(Date.UTC(year, month - 1, day))
  }

  const ymdMatch = trimmed.match(/\b(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})\b/)
  if (ymdMatch) {
    const year = Number(ymdMatch[1])
    const month = Number(ymdMatch[2])
    const day = Number(ymdMatch[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return new Date(Date.UTC(year, month - 1, day))
  }

  const monthMatch = trimmed.match(/\b([A-Za-z]{3,9})[.\s-]*(\d{1,2})[,\s-]*(20\d{2})\b/)
  if (monthMatch) {
    const month = monthTokenToNumber(monthMatch[1] ?? '')
    const day = Number(monthMatch[2])
    const year = Number(monthMatch[3])
    if (month && day >= 1 && day <= 31) return new Date(Date.UTC(year, month - 1, day))
  }

  const dayMonthMatch = trimmed.match(/\b(\d{1,2})[.\s-]*([A-Za-z]{3,9})[.\s-]*(20\d{2})\b/)
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1])
    const month = monthTokenToNumber(dayMonthMatch[2] ?? '')
    const year = Number(dayMonthMatch[3])
    if (month && day >= 1 && day <= 31) return new Date(Date.UTC(year, month - 1, day))
  }

  const numericMatch = trimmed.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/)
  if (numericMatch) {
    const a = Number(numericMatch[1])
    const b = Number(numericMatch[2])
    const year = Number(numericMatch[3])

    const aIsDay = a > 12 && b >= 1 && b <= 12
    const bIsDay = b > 12 && a >= 1 && a <= 12

    if (aIsDay) return new Date(Date.UTC(year, b - 1, a))
    if (bIsDay) return new Date(Date.UTC(year, a - 1, b))
  }

  return null
}

function findUniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function isMissingTextValue(value: string | null): boolean {
  if (value === null) return true
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed === '.') return true
  return false
}

function chooseWeightCandidates(values: string[]): string[] {
  const cleaned = values
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0)

  if (cleaned.length === 0) return []

  const parsed = cleaned
    .map((value) => ({ raw: value, numeric: Number(value.replace(/,/g, '')) }))
    .filter((entry) => Number.isFinite(entry.numeric) && entry.numeric > 0)

  if (parsed.length === 0) return findUniqueStrings(cleaned)

  const uniqueByNumeric = new Map<number, string>()
  for (const entry of parsed) {
    if (!uniqueByNumeric.has(entry.numeric)) uniqueByNumeric.set(entry.numeric, entry.raw)
  }

  if (uniqueByNumeric.size === 1) {
    return [Array.from(uniqueByNumeric.values())[0] as string]
  }

  const numerics = Array.from(uniqueByNumeric.keys()).sort((a, b) => a - b)
  const min = numerics[0] as number
  const max = numerics[numerics.length - 1] as number

  if (max >= min * 5) {
    const chosen = uniqueByNumeric.get(max)
    return chosen ? [chosen] : []
  }

  return findUniqueStrings(cleaned)
}

const CANONICAL_JIANGSU_SUPPLIER_NAME = 'Jiangsu Zhiwei Electromechanical Co., Ltd.'
const CANONICAL_HIRECH_SUPPLIER_NAME = 'HIRECH INDUSTRIAL CO., LTD'
const CANONICAL_KINTEX_SUPPLIER_NAME = 'ABDULLAH TEXTILE / KINTEX'
const CANONICAL_BARI_SUPPLIER_NAME = 'BARI TEXTILE MILLS'

function canonicalizeCounterpartyName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return normalized

  if (normalized.includes('青岛合力瑞科贸易有限公司')) return CANONICAL_HIRECH_SUPPLIER_NAME

  const key = normalized.toUpperCase().replace(/[^A-Z0-9]+/g, '')
  if (!key) return normalized

  if (key.includes('BARI') && key.includes('TEXTILE') && key.includes('MILL')) return CANONICAL_BARI_SUPPLIER_NAME
  if (key.includes('ABDULLAH') || key.includes('KINTEX')) return CANONICAL_KINTEX_SUPPLIER_NAME
  if (key.includes('HIRECH')) return CANONICAL_HIRECH_SUPPLIER_NAME
  if (key.includes('TIMEVALUE')) return CANONICAL_JIANGSU_SUPPLIER_NAME
  if (key.includes('JIANGSU') && key.includes('GUANGYUN')) return CANONICAL_JIANGSU_SUPPLIER_NAME
  if (key.includes('JIANGSU') && key.includes('ZHIWEI')) return CANONICAL_JIANGSU_SUPPLIER_NAME
  return normalized
}

function selectLikelyProformaNumbers(values: string[]): string[] {
  const cleaned = findUniqueStrings(
    values
      .map((value) => String(value).trim().toUpperCase())
      .filter((value) => value.length > 0)
  )

  if (cleaned.length <= 1) return cleaned

  const filtered = cleaned.filter((value) => {
    if (!/[0-9]/.test(value)) return false
    if (!/[A-Z]/.test(value)) return false
    if (value.length < 5) return false
    if (!/[-/]/.test(value) && !/^(PI|PL|P1|ZS|PH|BTML|KINT|BL|RECH)/.test(value)) return false
    if (/^(STAMPED|TRADEMAN|UNIT|NGMARKS)$/.test(value)) return false
    return true
  })

  return filtered.length > 0 ? filtered : cleaned
}

function findUniqueNumbers(values: number[]): number[] {
  const seen = new Set<number>()
  const out: number[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)
  }
  return out
}

function allowCandidateForApply(method: ExtractedValue<unknown>['extractionMethod'], applyOcr: boolean): boolean {
  if (method !== 'ocr') return true
  return applyOcr
}

function isClearlyInvalidPortValue(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return true
  if (normalized.length > 40) return true
  const upper = normalized.toUpperCase()
  if (upper.includes('NUMBER OF')) return true
  if (upper === 'PRECARRIAGE') return true
  if (upper.includes('PLACE OF')) return true
  if (upper.includes('PORT OF')) return true
  if (upper.includes('FAX') || upper.includes('TEL') || upper.includes('PHONE')) return true
  if (upper.includes(':')) return true
  if ((upper.match(/,/g) ?? []).length > 1) return true
  if (/\bV\.\s*[A-Z0-9]/i.test(upper)) return true
  return false
}

function findBillOfLadingShippedOnBoard(text: string): { raw: string; context: string; iso: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/\bSHIPPED\s+ON\s+BOARD\b\s*(.+)$/i)
    if (!match) continue
    const raw = (match[1] ?? '').trim()
    const date = parseUnambiguousDate(raw)
    if (!date) continue
    return { raw, context: line, iso: date.toISOString() }
  }

  return null
}

function findInvoiceNumber(text: string): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/\bINVOICE\s*NO\.?\s*[:：]?\s*([A-Z0-9-]{3,})\b/i)
    if (!match) continue
    const value = (match[1] ?? '').trim().toUpperCase()
    if (!value) continue
    return { raw: value, value, context: line }
  }

  return null
}

function findPiExpectedDate(text: string): { raw: string; iso: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/\bDELIVERY\b\s*[:：]?\s*(.+)$/i)
    if (!match) continue
    const raw = (match[1] ?? '').trim()
    const date = parseUnambiguousDate(raw)
    if (!date) continue
    return { raw, iso: date.toISOString(), context: line }
  }

  return null
}

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'] as const

function findPiIncoterms(text: string): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const found: { term: string; context: string }[] = []
  for (const line of lines) {
    const upper = line.toUpperCase()
    for (const term of INCOTERMS) {
      if (!new RegExp(`\\b${term}\\b`, 'i').test(upper)) continue
      found.push({ term, context: line })
    }
  }

  const unique = findUniqueStrings(found.map((f) => f.term))
  if (unique.length !== 1) return null
  const term = unique[0] as string
  const context = found.find((f) => f.term === term)?.context ?? term
  return { raw: term, value: term, context }
}

function findPiSeller(text: string): { rawName: string; name: string; rawAddress: string | null; address: string | null; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (lines.length === 0) return null

  const invoiceIndex = lines.findIndex((line) => /\bPROFORMA\b.*\bINVOICE\b/i.test(line) || /\bPROFORMA\s+INVOICE\b/i.test(line))
  const headerEnd = invoiceIndex >= 0 ? invoiceIndex : Math.min(lines.length, 18)

  const header = lines.slice(0, headerEnd)
  if (header.length === 0) return null

  const looksLikeCompany = (line: string): boolean => {
    if (/^\s*(TO|ATTN)\b/i.test(line)) return false
    if (/\bTARGON\b/i.test(line)) return false
    return /\b(CO\.?\s*,?\s*LTD|LTD\.?\b|LIMITED\b|COMPANY\b|CORP\.?\b|INC\.?\b|LLC\b)\b/i.test(line)
  }

  const nameIndex = header.findIndex((line) => looksLikeCompany(line))
  if (nameIndex < 0) return null

  const rawName = header[nameIndex] ?? ''
  const name = rawName.replace(/\s+/g, ' ').trim()
  if (!name) return null

  const addressLines: string[] = []
  for (let i = nameIndex + 1; i < header.length; i += 1) {
    const line = header[i] ?? ''
    if (/^\s*(PROFORMA|INVOICE)\b/i.test(line)) break
    if (/^\s*TO\b/i.test(line)) break
    if (/\b(TEL|FAX|PHONE)\b/i.test(line) || /\bE-?MAIL\b/i.test(line) || /@/.test(line)) break
    addressLines.push(line)
  }

  const rawAddress = addressLines.length > 0 ? addressLines.join('\n') : null
  const address = rawAddress ? rawAddress.replace(/\s+/g, ' ').trim() : null

  const contextParts = header.slice(nameIndex, Math.min(header.length, nameIndex + 3))
  const context = contextParts.join(' ')
  return { rawName, name, rawAddress, address, context }
}

function findPiPaymentTerms(text: string): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const isLabelLine = (line: string): boolean => {
    return (
      /^\s*(DATE|PI\s*NO|PINo|INVOICE|SHIPMENT|DELIVERY|TOTAL|AMOUNT|CURRENCY)\b/i.test(line) ||
      /^\s*(SELLER|BUYER|BILL\s*TO|SHIP\s*TO)\b/i.test(line)
    )
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const match = line.match(/\bPAYMENT(?:\s+TERMS?)?\b\s*[:：]?\s*(.*)$/i)
    if (!match) continue

    const rest = (match[1] ?? '').trim()
    if (rest) return { raw: rest, value: rest, context: line }

    const next = (lines[i + 1] ?? '').trim()
    if (next && !isLabelLine(next)) return { raw: next, value: next, context: `${line} ${next}` }
  }

  return null
}

function findVendorFromPurchaseOrder(text: string): { rawName: string; name: string; rawAddress: string | null; address: string | null; context: string } | null {
  const rawLines = text.split(/\r?\n/g)
  const headingIndex = rawLines.findIndex((line) => /\bVENDOR\b/i.test(line) && /\bSHIP\s+TO\b/i.test(line))
  if (headingIndex < 0) return null

  const vendorLines: string[] = []
  for (let i = headingIndex + 1; i < rawLines.length; i += 1) {
    const raw = rawLines[i] ?? ''
    if (raw.trim().length === 0) {
      if (vendorLines.length > 0) break
      continue
    }
    if (/\bDESCRIPTION\b/i.test(raw) || /\bTERMS\b/i.test(raw)) break

    const vendorPart = (raw.split(/\s{3,}/)[0] ?? '').trim()
    if (!vendorPart) continue
    if (/^\s*(VENDOR|SHIP\s+TO)\b/i.test(vendorPart)) continue
    vendorLines.push(vendorPart)
    if (vendorLines.length >= 12) break
  }

  if (vendorLines.length === 0) return null

  let nameEnd = vendorLines.length
  for (let i = 0; i < vendorLines.length; i += 1) {
    const line = vendorLines[i] ?? ''
    if (/\b(TEL|FAX|PHONE)\b/i.test(line)) {
      nameEnd = Math.min(nameEnd, i)
      break
    }
    if (/\d/.test(line) || /^NO\./i.test(line)) {
      nameEnd = Math.min(nameEnd, i)
      break
    }
  }

  const rawName = vendorLines.slice(0, Math.max(1, nameEnd)).join(' ').trim()
  const name = rawName.replace(/\s+/g, ' ').trim()
  if (!name) return null

  const addressLines: string[] = []
  for (let i = nameEnd; i < vendorLines.length; i += 1) {
    const line = vendorLines[i] ?? ''
    if (/\b(TEL|FAX|PHONE)\b/i.test(line) || /\bE-?MAIL\b/i.test(line) || /@/.test(line)) break
    addressLines.push(line)
  }

  const rawAddress = addressLines.length > 0 ? addressLines.join('\n') : null
  const address = rawAddress ? rawAddress.replace(/\s+/g, ' ').trim() : null

  const context = vendorLines.slice(0, Math.min(vendorLines.length, 4)).join(' ')
  return { rawName, name, rawAddress, address, context }
}

function findPiDocumentDate(text: string): { raw: string; iso: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/\bDATE\b\s*[:：]?\s*(.+)$/i)
    if (!match) continue
    const raw = (match[1] ?? '').trim()
    const date = parseUnambiguousDate(raw)
    if (!date) continue
    return { raw, iso: date.toISOString(), context: line }
  }

  return null
}

type PiLineItem = {
  itemNumber: string | null
  unitsOrdered: number
  unitCost: string
  totalCost: string
  unitsPerCarton: number | null
  cartons: number | null
  context: string
}

function parseSpreadsheetNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const cleaned = value.trim().replace(/,/g, '')
  if (!cleaned) return null
  const match = cleaned.match(/[-+]?\d+(?:\.\d+)?/)
  if (!match) return null
  const num = Number(match[0])
  if (!Number.isFinite(num)) return null
  return num
}

function extractPiLineItemsFromSpreadsheet(filePath: string): PiLineItem[] {
  const workbook = XLSX.readFile(filePath, { cellDates: true })
  const out: PiLineItem[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][]
    if (rows.length === 0) continue

    const headerRowIndex = rows.findIndex((row) => {
      const cells = row.filter((cell) => typeof cell === 'string') as string[]
      const hasQty = cells.some((cell) => /\bq'?t?y\b/i.test(cell) || /^\s*qty\b/i.test(cell))
      const hasPrice = cells.some((cell) => /\bprice\b/i.test(cell) || /\bunit\s*price\b/i.test(cell))
      const hasAmount = cells.some((cell) => /\bamount\b/i.test(cell) || /\btotal\b/i.test(cell))
      return hasQty && hasPrice && hasAmount
    })
    if (headerRowIndex < 0) continue

    const headerRow = rows[headerRowIndex] ?? []
    const pickCol = (pattern: RegExp): number => {
      for (let i = 0; i < headerRow.length; i += 1) {
        const cell = headerRow[i]
        if (typeof cell !== 'string') continue
        if (pattern.test(cell)) return i
      }
      return -1
    }

    const qtyCol = pickCol(/\bq'?t?y\b/i)
    const unitCostCol = pickCol(/\bprice\b/i)
    const totalCostCol = pickCol(/\bamount\b/i)
    const itemNoCol = pickCol(/\bitem\b.*\bno\b/i)
    if (qtyCol < 0 || unitCostCol < 0 || totalCostCol < 0) continue

    const subHeaderRows = [rows[headerRowIndex + 1] ?? [], rows[headerRowIndex + 2] ?? []]
    const findColInRows = (pattern: RegExp): number => {
      for (const row of subHeaderRows) {
        for (let i = 0; i < row.length; i += 1) {
          const cell = row[i]
          if (typeof cell !== 'string') continue
          if (pattern.test(cell)) return i
        }
      }
      return -1
    }

    const unitsPerCartonCol = findColInRows(/\b(SET|SETS|PCS|UNITS|BAGS|BOXES?)\s*\/\s*(CTN|CARTON)\b/i)
    const cartonsCol = findColInRows(/\bCTNS?\b/i)

    for (let r = headerRowIndex + 1; r < rows.length; r += 1) {
      const row = rows[r] ?? []
      const first = row[0]
      if (typeof first === 'string' && /^\s*total\b/i.test(first)) continue

      const qtyRaw = parseSpreadsheetNumber(row[qtyCol])
      const unitCostRaw = parseSpreadsheetNumber(row[unitCostCol])
      const totalCostRaw = parseSpreadsheetNumber(row[totalCostCol])

      if (qtyRaw === null || unitCostRaw === null || totalCostRaw === null) continue

      const itemNoRaw = itemNoCol >= 0 ? parseSpreadsheetNumber(row[itemNoCol]) : null
      const itemNumber =
        typeof itemNoRaw === 'number' && Number.isFinite(itemNoRaw) ? String(Math.round(itemNoRaw)) : null

      const unitsOrdered = Math.abs(qtyRaw - Math.round(qtyRaw)) < 1e-6 ? Math.round(qtyRaw) : Math.trunc(qtyRaw)
      if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) continue

      const unitCost = String(unitCostRaw)
      const totalCost = String(totalCostRaw)

      const unitsPerCartonRaw = unitsPerCartonCol >= 0 ? parseSpreadsheetNumber(row[unitsPerCartonCol]) : null
      const cartonsRaw = cartonsCol >= 0 ? parseSpreadsheetNumber(row[cartonsCol]) : null

      const unitsPerCarton =
        typeof unitsPerCartonRaw === 'number' && Number.isFinite(unitsPerCartonRaw)
          ? Math.round(unitsPerCartonRaw)
          : null
      const cartons = typeof cartonsRaw === 'number' && Number.isFinite(cartonsRaw) ? Math.round(cartonsRaw) : null

      out.push({
        itemNumber,
        unitsOrdered,
        unitCost,
        totalCost,
        unitsPerCarton,
        cartons,
        context: `${path.basename(filePath)}#${sheetName}:R${r + 1}`,
      })
    }
  }

  return out
}

function normalizeSkuCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase()
  if (!trimmed) return null
  const cleaned = trimmed.replace(/[^A-Z0-9-\s]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null

  let normalized = cleaned.replace(/\s+/g, '-').replace(/-+/g, '-')
  if (normalized.startsWith('CS') && !normalized.startsWith('CS-')) {
    const rest = normalized.slice('CS'.length)
    if (/\d/.test(rest)) normalized = `CS-${rest}`
  }

  if (!/^CS-[A-Z0-9-]+$/.test(normalized)) return null
  if (!/\d/.test(normalized)) return null
  return normalized
}

function normalizeShippingMarksSku(raw: string): string | null {
  const normalized = normalizeSkuCode(raw)
  if (!normalized) return null

  const seaIndex = normalized.indexOf('-SEA-')
  if (seaIndex > 0) return normalizeSkuCode(normalized.slice(0, seaIndex))

  const airIndex = normalized.indexOf('-AIR-')
  if (airIndex > 0) return normalizeSkuCode(normalized.slice(0, airIndex))

  return normalized
}

function parseCartonDimensionsText(raw: string): { text: string; side1: string; side2: string; side3: string } | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*[Xx*]\s*(\d+(?:\.\d+)?)\s*[Xx*]\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  const side1 = (match[1] ?? '').trim()
  const side2 = (match[2] ?? '').trim()
  const side3 = (match[3] ?? '').trim()
  if (!side1 || !side2 || !side3) return null
  return { text: `${side1} x ${side2} x ${side3}`, side1, side2, side3 }
}

function extractPiLineItems(text: string): PiLineItem[] {
  const normalized = text
    .replace(/\u00a0/g, ' ')
    .replace(/\bUS\$\b/gi, 'US$')
    .replace(/\bUS{2}(?=\s*[0-9])/gi, 'US$')
    .replace(/\bUss(?=\s*[0-9])/gi, 'US$')
    .replace(/\bUSS(?=\s*[0-9])/gi, 'US$')
    .replace(/\bUS\$(?=[0-9])/gi, 'US$')

  const out: PiLineItem[] = []

  const findItemNumber = (matchIndex: number | undefined): string | null => {
    if (typeof matchIndex !== 'number' || matchIndex < 0) return null
    const lineStart = normalized.lastIndexOf('\n', matchIndex)
    const prefix = normalized.slice(lineStart >= 0 ? lineStart + 1 : 0, matchIndex)
    const hits = Array.from(prefix.matchAll(/\b(\d{5,})\b/g)).map((m) => (m[1] ?? '').trim())
    const last = hits.length > 0 ? hits[hits.length - 1] : null
    return last && last.length >= 5 ? last : null
  }

  const patternWithPacking =
    /\b(\d{3,})\s+US\$\s*([0-9]+(?:\.[0-9]+)?)\s+US\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s+(\d{1,4})\s+(\d{1,5})\b/g
  for (const match of normalized.matchAll(patternWithPacking)) {
    const unitsOrdered = Number(match[1] ?? '')
    const unitCost = String(match[2] ?? '').trim()
    const totalCost = String(match[3] ?? '').trim().replace(/,/g, '')
    const unitsPerCarton = Number(match[4] ?? '')
    const cartons = Number(match[5] ?? '')
    if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) continue
    if (!unitCost || !totalCost) continue
    const itemNumber = findItemNumber(match.index)
    out.push({
      itemNumber,
      unitsOrdered,
      unitCost,
      totalCost,
      unitsPerCarton: Number.isInteger(unitsPerCarton) && unitsPerCarton > 0 ? unitsPerCarton : null,
      cartons: Number.isInteger(cartons) && cartons > 0 ? cartons : null,
      context: match[0],
    })
  }

  const patternSimple =
    /\b(\d{3,})\s+US\$\s*([0-9]+(?:\.[0-9]+)?)\s+US\$\s*([0-9][0-9,]*(?:\.[0-9]+)?)\b/g
  for (const match of normalized.matchAll(patternSimple)) {
    const unitsOrdered = Number(match[1] ?? '')
    const unitCost = String(match[2] ?? '').trim()
    const totalCost = String(match[3] ?? '').trim().replace(/,/g, '')
    if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) continue
    if (!unitCost || !totalCost) continue
    const itemNumber = findItemNumber(match.index)
    out.push({ itemNumber, unitsOrdered, unitCost, totalCost, unitsPerCarton: null, cartons: null, context: match[0] })
  }

  return out
}

type ShippingMarksCandidatesBySku = Map<
  string,
  {
    productNumberCandidates: ExtractedValue<string>[]
    commodityCodeCandidates: ExtractedValue<string>[]
    countryOfOriginCandidates: ExtractedValue<string>[]
    netWeightKgCandidates: ExtractedValue<string>[]
    cartonWeightKgCandidates: ExtractedValue<string>[]
    cartonDimensionsCandidates: ExtractedValue<string>[]
    unitsPerCartonCandidates: ExtractedValue<number>[]
    cartonsCandidates: ExtractedValue<number>[]
  }
>

function ensureShippingMarksEntry(map: ShippingMarksCandidatesBySku, skuCode: string) {
  if (map.has(skuCode)) return
  map.set(skuCode, {
    productNumberCandidates: [],
    commodityCodeCandidates: [],
    countryOfOriginCandidates: [],
    netWeightKgCandidates: [],
    cartonWeightKgCandidates: [],
    cartonDimensionsCandidates: [],
    unitsPerCartonCandidates: [],
    cartonsCandidates: [],
  })
}

function mergeShippingMarksCandidates(target: ShippingMarksCandidatesBySku, source: ShippingMarksCandidatesBySku) {
  for (const [skuCode, incoming] of source.entries()) {
    ensureShippingMarksEntry(target, skuCode)
    const entry = target.get(skuCode)
    if (!entry) continue
    entry.productNumberCandidates.push(...incoming.productNumberCandidates)
    entry.commodityCodeCandidates.push(...incoming.commodityCodeCandidates)
    entry.countryOfOriginCandidates.push(...incoming.countryOfOriginCandidates)
    entry.netWeightKgCandidates.push(...incoming.netWeightKgCandidates)
    entry.cartonWeightKgCandidates.push(...incoming.cartonWeightKgCandidates)
    entry.cartonDimensionsCandidates.push(...incoming.cartonDimensionsCandidates)
    entry.unitsPerCartonCandidates.push(...incoming.unitsPerCartonCandidates)
    entry.cartonsCandidates.push(...incoming.cartonsCandidates)
  }
}

function extractShippingMarksCandidates(
  text: string,
  meta: Pick<
    ExtractedValue<unknown>,
    'sourcePath' | 'extractionMethod' | 'docId' | 'documentType' | 'stage'
  >
): ShippingMarksCandidatesBySku {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const result: ShippingMarksCandidatesBySku = new Map()

  const parseLineIntoSku = (skuCode: string, line: string) => {
    ensureShippingMarksEntry(result, skuCode)
    const entry = result.get(skuCode)
    if (!entry) return

    const productMatch =
      line.match(/(?:产品编号|PRODUCT\s*(?:NO\.?|NUMBER)|ITEM\s*(?:NO\.?|NUMBER))\s*[:：]?\s*([0-9][0-9\s]{3,})\b/i)
    if (productMatch) {
      const digits = (productMatch[1] ?? '').replace(/\D/g, '')
      if (digits.length >= 4 && digits.length <= 12) {
        entry.productNumberCandidates.push({ value: digits, raw: digits, context: line, ...meta })
      }
      return
    }

    const cartonsMatch = line.match(/\bCARTON\s+NUMBER\b\s*\/\s*(\d{1,6})\b/i)
    if (cartonsMatch) {
      const cartons = Number(cartonsMatch[1] ?? '')
      if (Number.isInteger(cartons) && cartons > 0) {
        entry.cartonsCandidates.push({ value: cartons, raw: String(cartons), context: line, ...meta })
      }
      return
    }

    const unitsMatch =
      line.match(/#\s*OF\s*UNITS\b\s*[:：]?\s*(\d{1,6})\b/i) ??
      line.match(/\bUNITS\s*\/\s*CTN\b\s*[:：]?\s*(\d{1,6})\b/i) ??
      line.match(/\bSETS\s*\/\s*CTN\b\s*[:：]?\s*(\d{1,6})\b/i)
    if (unitsMatch) {
      const units = Number(unitsMatch[1] ?? '')
      if (Number.isInteger(units) && units > 0) {
        entry.unitsPerCartonCandidates.push({ value: units, raw: String(units), context: line, ...meta })
      }
      return
    }

    const commodityMatch = line.match(/\bCOMMODITY\s+CODE\b\s*([0-9][0-9\s]{5,})/i)
    if (commodityMatch) {
      const digits = (commodityMatch[1] ?? '').replace(/\D/g, '')
      if (digits.length >= 6 && digits.length <= 12) {
        entry.commodityCodeCandidates.push({ value: digits, raw: digits, context: line, ...meta })
      }
      return
    }

    const netMatch = line.match(/\bNET\s+WEIGHT\b\s*([0-9]+(?:\.[0-9]+)?)\s*KG\b/i)
    if (netMatch) {
      const kg = String(netMatch[1] ?? '').trim()
      if (kg) {
        entry.netWeightKgCandidates.push({ value: kg, raw: kg, context: line, ...meta })
      }
      return
    }

    const grossMatch = line.match(/\bGROSS\s+WEIGHT\b\s*([0-9]+(?:\.[0-9]+)?)\s*KG\b/i)
    if (grossMatch) {
      const kg = String(grossMatch[1] ?? '').trim()
      if (kg) {
        entry.cartonWeightKgCandidates.push({ value: kg, raw: kg, context: line, ...meta })
      }
      return
    }

    if (/\bDIMENSIONS\b/i.test(line)) {
      const parsed = parseCartonDimensionsText(line)
      if (parsed) {
        entry.cartonDimensionsCandidates.push({ value: parsed.text, raw: parsed.text, context: line, ...meta })
      }
      return
    }

    const madeMatch = line.match(/\bMADE\s+IN\s+([A-Z][A-Z ]{2,})\b/i)
    if (madeMatch) {
      const country = (madeMatch[1] ?? '').trim()
      if (country) {
        entry.countryOfOriginCandidates.push({
          value: country.replace(/\s+/g, ' '),
          raw: country,
          context: line,
          ...meta,
        })
      }
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (!/\bSHIPPING\s+MARK\b/i.test(line)) continue
    const skuMatch = line.match(/\bCS[-\s]*[A-Z0-9-]{2,}\b/i)
    const sku = skuMatch ? normalizeShippingMarksSku(skuMatch[0]) : null
    if (!sku) continue

    let end = Math.min(lines.length - 1, i + 20)
    for (let j = i + 1; j <= end; j += 1) {
      const maybeNext = lines[j] ?? ''
      if (!/\bSHIPPING\s+MARK\b/i.test(maybeNext)) continue
      const nextSkuMatch = maybeNext.match(/\bCS[-\s]*[A-Z0-9-]{2,}\b/i)
      const nextSku = nextSkuMatch ? normalizeShippingMarksSku(nextSkuMatch[0]) : null
      if (!nextSku) continue
      end = j - 1
      break
    }

    const start = Math.max(0, i - 12)
    for (let j = start; j <= end; j += 1) {
      parseLineIntoSku(sku, lines[j] ?? '')
    }
  }

  return result
}

function findPackingListRef(text: string): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match =
      line.match(/\bPACKING\s*(?:LIST\s*)?(?:NO\.?|NO|#)\s*[:：]?\s*([A-Z0-9-]{3,})\b/i) ??
      line.match(/\bP\/?L\s*(?:NO\.?|NO|#)\s*[:：]?\s*([A-Z0-9-]{3,})\b/i)
    if (!match) continue
    const value = (match[1] ?? '').trim().toUpperCase()
    if (!value) continue
    return { raw: value, value, context: line }
  }

  return null
}

function findSailingOnAboutDate(text: string): { raw: string; iso: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/\bSAILING\s+ON\s*\/?\s*ABOUT\b\s*(.+)$/i)
    if (!match) continue
    const raw = (match[1] ?? '').trim()
    const date = parseUnambiguousDate(raw)
    if (!date) continue
    return { raw, iso: date.toISOString(), context: line }
  }

  return null
}

function findVesselName(text: string): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/\bPER\s+([A-Z0-9][A-Z0-9 .'-]{2,})\s+V[.\s]*[A-Z0-9-]{3,}\b/i)
    if (!match) continue
    const vessel = (match[1] ?? '').trim()
    if (!vessel) continue
    return { raw: vessel, value: vessel, context: line }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (!/^VESSEL\s*\/\s*VOY(?:AGE)?\b/i.test(line) && !/^VESSEL\s*\/\s*VOY\b/i.test(line)) continue
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      const candidate = lines[j] ?? ''
      const match = candidate.match(
        /^([A-Z0-9][A-Z0-9 .'-]{2,}?)\s*\/\s*([A-Z0-9-]{2,})\b/i
      )
      if (!match) continue
      const vessel = (match[1] ?? '').trim()
      if (!vessel) continue
      return { raw: vessel, value: vessel, context: `${line} ${candidate}` }
    }
  }

  for (const line of lines) {
    const match = line.match(
      /\bVESSEL\s*\/\s*VOYAGE\b\s*[:：]?\s*([A-Z0-9][A-Z0-9 .'-]{2,}?)\s*\/\s*([A-Z0-9-]{3,})\b/i
    )
    if (!match) continue
    const vessel = (match[1] ?? '').trim()
    if (!vessel) continue
    return { raw: vessel, value: vessel, context: line }
  }

  for (const line of lines) {
    const match = line.match(/\bVESSEL(?:\s+NAME)?\b\s*[:：]\s*([A-Z0-9][A-Z0-9 .'-]{2,})\b/i)
    if (!match) continue
    const vessel = (match[1] ?? '').trim()
    if (!vessel) continue
    return { raw: vessel, value: vessel, context: line }
  }

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z .'-]{3,})\s*\/\s*([0-9]{2,4}[A-Z]?)\b/i)
    if (!match) continue
    const vessel = (match[1] ?? '').trim().replace(/\s+/g, ' ')
    if (!vessel) continue
    if (/\b(CARTON|NOTIFY|PARTY|VESSELAND|POLYTHENE|PLACE OF)\b/i.test(vessel)) continue
    if (/[0-9]{3,}/.test(vessel)) continue
    return { raw: vessel, value: vessel, context: line }
  }

  return null
}

function findVoyageNumber(text: string): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    if (!/^VESSEL\s*\/\s*VOY(?:AGE)?\b/i.test(line) && !/^VESSEL\s*\/\s*VOY\b/i.test(line)) continue
    for (let j = i + 1; j < Math.min(lines.length, i + 5); j += 1) {
      const candidate = lines[j] ?? ''
      const match = candidate.match(
        /^([A-Z0-9][A-Z0-9 .'-]{2,}?)\s*\/\s*([A-Z0-9-]{2,})\b/i
      )
      if (!match) continue
      const voyage = (match[2] ?? '').trim().toUpperCase()
      if (!voyage) continue
      return { raw: voyage, value: voyage, context: `${line} ${candidate}` }
    }
  }

  for (const line of lines) {
    const match = line.match(/\bPER\s+[A-Z0-9][A-Z0-9 .'-]{2,}\s+V[.\s]*([A-Z0-9-]{2,})\b/i)
    if (!match) continue
    const voyage = (match[1] ?? '').trim().toUpperCase()
    if (!voyage) continue
    return { raw: voyage, value: voyage, context: line }
  }

  for (const line of lines) {
    const match = line.match(/^([A-Z][A-Z .'-]{3,})\s*\/\s*([0-9]{2,4}[A-Z]?)\b/i)
    if (!match) continue
    const vessel = (match[1] ?? '').trim()
    if (/\b(CARTON|NOTIFY|PARTY|VESSELAND|POLYTHENE|PLACE OF)\b/i.test(vessel)) continue
    if (/[0-9]{3,}/.test(vessel)) continue
    const voyage = (match[2] ?? '').trim().toUpperCase()
    if (!voyage) continue
    return { raw: voyage, value: voyage, context: line }
  }

  return null
}

function findPortsFromText(
  text: string
): { portOfLoading: string; portOfDischarge: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const splitColumns = (line: string): string[] => {
    return line
      .split(/\s{2,}/g)
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }

  const findPortLikeLocation = (segment: string): string | null => {
    const upper = segment.toUpperCase()
    const match = upper.match(
      /\b([A-Z][A-Z0-9' -]{2,}?)\s*,\s*(CHINA|UNITED\s+KINGDOM|UK|UNITED\s+STATES|USA|VIETNAM|INDIA)\b/
    )
    if (match) {
      const city = (match[1] ?? '')
        .trim()
        .replace(/^[^A-Z0-9]+/g, '')
        .replace(/\bNUMBER\s+OF\b/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      const country = (match[2] ?? '').trim().replace(/\s+/g, ' ')
      const combined = `${city}, ${country}`
      return combined.length > 3 ? combined : null
    }

    const simplePort = upper.match(
      /\b([A-Z][A-Z0-9' -]{2,}(?:PORT|HARBOR|HARBOUR|TERMINAL|FELIXSTOWE|SOUTHAMPTON|NINGBO|QINGDAO|SHANGHAI|KARACHI|LONDON\s+GATEWAY|LONDON))\b/
    )
    if (!simplePort) return null
    const value = (simplePort[1] ?? '').trim().replace(/\s+/g, ' ')
    if (!value) return null
    if (/\b(PORT OF|PLACE OF|NUMBER OF)\b/i.test(value)) return null
    return value
  }

  let portOfLoading: string | null = null
  let portOfDischarge: string | null = null
  let context: string | null = null

  for (let i = 0; i < lines.length; i += 1) {
    if (portOfLoading !== null && portOfDischarge !== null) break
    const line = lines[i] ?? ''
    const next = lines[i + 1] ?? ''
    const next2 = lines[i + 2] ?? ''

    if (portOfLoading === null && /PORT\s+OF\s+LOADING\b/i.test(line)) {
      const segment = `${line} ${next} ${next2}`
        .replace(/\bFAX\b\s*[:：]?\s*[+0-9() .-]{6,}/gi, ' ')
        .replace(/\bTEL\b\s*[:：]?\s*[+0-9() .-]{6,}/gi, ' ')
        .replace(/\bVAT\b\s*[:：]?\s*[A-Z0-9]{6,}/gi, ' ')
      const loc = findPortLikeLocation(segment)
      if (loc) {
        portOfLoading = loc
        context = context ? `${context} | ${line} ${next}` : `${line} ${next}`
      }
    }

    if (portOfDischarge === null && /PORT\s+OF\s+DISCHARGE\b/i.test(line)) {
      const segment = `${line} ${next} ${next2}`
        .replace(/\bFAX\b\s*[:：]?\s*[+0-9() .-]{6,}/gi, ' ')
        .replace(/\bTEL\b\s*[:：]?\s*[+0-9() .-]{6,}/gi, ' ')
        .replace(/\bVAT\b\s*[:：]?\s*[A-Z0-9]{6,}/gi, ' ')
      const loc = findPortLikeLocation(segment)
      if (loc) {
        portOfDischarge = loc
        context = context ? `${context} | ${line} ${next}` : `${line} ${next}`
      }
    }
  }

  for (const line of lines) {
    const match = line.match(/^FROM\s+(.+?)\s+TO\s*[:：]?\s*(.+)$/i)
    if (!match) continue
    const loading = (match[1] ?? '').trim()
    const discharge = (match[2] ?? '').trim()
    if (!loading || !discharge) continue
    return { portOfLoading: loading, portOfDischarge: discharge, context: line }
  }

  const isProbablyHeading = (candidate: string): boolean => {
    return /\bPORT\s+OF\b|\bPLACE\s+OF\b|\bVESSEL\b|\bVOY\b|\bBILL\b/i.test(candidate)
  }

  const normalizePort = (candidate: string): string | null => {
    const firstColumn = candidate.split(/\s{2,}/g)[0]?.trim() ?? ''
    return firstColumn.length > 0 ? firstColumn : null
  }

  for (let i = 0; i < lines.length; i += 1) {
    const headerLine = lines[i] ?? ''
    const headerCols = splitColumns(headerLine)
    if (headerCols.length < 2) continue

    if (portOfLoading === null && /PORT\s+OF\s+LOADING\b/i.test(headerLine) && /PRECARRIAGE\b/i.test(headerLine)) {
      const loadingIndex = headerCols.findIndex((col) => /PORT\s+OF\s+LOADING\b/i.test(col))
      if (loadingIndex >= 0) {
        const next = lines[i + 1] ?? ''
        const nextCols = splitColumns(next)
        const candidate = (nextCols[loadingIndex] ?? '').trim()
        if (candidate && !isProbablyHeading(candidate)) {
          portOfLoading = candidate
          context = context ? `${context} | ${headerLine} ${next}` : `${headerLine} ${next}`
        }
      }
    }

    if (portOfDischarge === null && /PORT\s+OF\s+DISCHARGE\b/i.test(headerLine) && /PLACE\s+OF\s+DELIVERY\b/i.test(headerLine)) {
      const dischargeIndex = headerCols.findIndex((col) => /PORT\s+OF\s+DISCHARGE\b/i.test(col))
      if (dischargeIndex >= 0) {
        const next = lines[i + 1] ?? ''
        const nextCols = splitColumns(next)
        const candidate = (nextCols[dischargeIndex] ?? '').trim()
        if (candidate && !isProbablyHeading(candidate)) {
          portOfDischarge = candidate
          context = context ? `${context} | ${headerLine} ${next}` : `${headerLine} ${next}`
        }
      }
    }
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''

    if (portOfLoading === null && /PORT\s+OF\s+LOADING\b/i.test(line)) {
      const afterLabel = line.replace(/^.*PORT\s+OF\s+LOADING\b\s*[:：]?\s*/i, '').trim()
      const isBadInline = afterLabel.length > 0 && (afterLabel.toLowerCase() === 'precarriage' || isProbablyHeading(afterLabel))
      if (afterLabel && !isBadInline) {
        const normalized = normalizePort(afterLabel)
        if (normalized) {
          portOfLoading = normalized
          context = context ? `${context} | ${line}` : line
        }
      } else {
        const next = lines[i + 1] ?? ''
        if (next && !isProbablyHeading(next)) {
          const normalized = normalizePort(next)
          if (normalized) {
            portOfLoading = normalized
            context = context ? `${context} | ${line} ${next}` : `${line} ${next}`
          }
        }
      }
    }

    if (portOfDischarge === null && /PORT\s+OF\s+DISCHARGE\b/i.test(line)) {
      const afterLabel = line.replace(/^.*PORT\s+OF\s+DISCHARGE\b\s*[:：]?\s*/i, '').trim()
      const isBadInline = afterLabel.length > 0 && (/\bV\./i.test(afterLabel) || isProbablyHeading(afterLabel))
      if (afterLabel && !isBadInline) {
        const normalized = normalizePort(afterLabel)
        if (normalized) {
          portOfDischarge = normalized
          context = context ? `${context} | ${line}` : line
        }
      } else {
        const next = lines[i + 1] ?? ''
        if (next && !isProbablyHeading(next)) {
          const normalized = normalizePort(next)
          if (normalized) {
            portOfDischarge = normalized
            context = context ? `${context} | ${line} ${next}` : `${line} ${next}`
          }
        }
      }
    }
  }

  if (portOfLoading && portOfDischarge) {
    return { portOfLoading, portOfDischarge, context: context ?? 'ports' }
  }

  return null
}

function findReceiveTypeFromText(text: string): { value: InboundReceiveType; context: string } | null {
  const normalized = text.toUpperCase().replace(/\s+/g, ' ')

  if (/\bLCL\b/.test(normalized)) return { value: InboundReceiveType.LCL, context: 'LCL' }

  if (/\b45'\s*H?Q\b|\b45\s*H?Q\b/.test(normalized))
    return { value: InboundReceiveType.CONTAINER_45_HQ, context: '45 HQ' }
  if (/\b40'\s*H?Q\b|\b40\s*H?Q\b/.test(normalized))
    return { value: InboundReceiveType.CONTAINER_40_HQ, context: '40 HQ' }

  if (/\b40'\b|\b40\s*FT\b|\b40FT\b/.test(normalized)) return { value: InboundReceiveType.CONTAINER_40, context: '40' }
  if (/\b20'\b|\b20\s*FT\b|\b20FT\b/.test(normalized)) return { value: InboundReceiveType.CONTAINER_20, context: '20' }

  return null
}

function findShipperNameFromBillOfLading(
  text: string
): { raw: string; value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const shipperIndex = lines.findIndex((line) => /^SHIPPER\b/i.test(line))
  if (shipperIndex < 0) return null

  for (let i = shipperIndex + 1; i < Math.min(lines.length, shipperIndex + 8); i += 1) {
    const candidate = lines[i] ?? ''
    if (!candidate) continue
    if (/^SHIPPER'?S\b/i.test(candidate)) continue
    if (/^SHIPPER\b/i.test(candidate)) continue
    if (/^CONSIGNEE\b/i.test(candidate)) break
    if (/^NOTIFY\b/i.test(candidate)) break

    const value = candidate.trim()
    if (!value) continue
    return { raw: value, value, context: `SHIPPER → ${value}` }
  }

  return null
}

function findHouseBillOfLading(text: string): { value: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match =
      line.match(/\b(?:B\/L|BILL\s+OF\s+LADING)\s*(?:NO\.?|NO|#)?\s*[:：]?\s*([A-Z0-9-]{6,})\b/i) ??
      line.match(/\bHBL\s*(?:NO\.?|NO|#)?\s*[:：]?\s*([A-Z0-9-]{6,})\b/i)
    if (!match) continue
    const value = (match[1] ?? '').trim().toUpperCase()
    if (!value) continue
    return { value, context: line }
  }

  const isIsoContainer = (value: string) => /^[A-Z]{4}[0-9]{7}$/.test(value)

  const candidates = new Map<string, string>()
  const scanLimit = Math.min(lines.length, 30)
  for (let i = 0; i < scanLimit; i += 1) {
    const line = lines[i] ?? ''
    const tokens = line.split(/\s+/g)
    for (const token of tokens) {
      const cleaned = token.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      if (!cleaned) continue
      if (cleaned.startsWith('NO')) continue
      if (cleaned.startsWith('TEL')) continue
      if (cleaned.startsWith('FAX')) continue
      if (cleaned.startsWith('PHONE')) continue
      if (isIsoContainer(cleaned)) continue
      if (!/^[A-Z]{2,8}[0-9]{6,14}$/.test(cleaned)) continue
      candidates.set(cleaned, line)
    }
  }

  if (candidates.size !== 1) return null
  const [value, context] = Array.from(candidates.entries())[0] ?? []
  if (!value || !context) return null
  return { value, context }
}

function findMrnCandidates(text: string): Array<{ value: string; context: string }> {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const out: Array<{ value: string; context: string }> = []

  for (const line of lines) {
    const tokens = line.split(/\s+/g)
    for (const token of tokens) {
      const cleaned = token.replace(/[^A-Z0-9]/gi, '').toUpperCase()
      if (!/^[0-9]{2}[A-Z]{2}[A-Z0-9]{14}$/.test(cleaned)) continue
      out.push({ value: cleaned, context: line })
    }
  }

  return out
}

function findDateCandidatesByKeyword(text: string, keyword: RegExp): Array<{ iso: string; raw: string; context: string }> {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const out: Array<{ iso: string; raw: string; context: string }> = []
  for (const line of lines) {
    if (!keyword.test(line)) continue
    const date = parseUnambiguousDate(line)
    if (!date) continue
    out.push({ iso: date.toISOString(), raw: line, context: line })
  }
  return out
}

function findTotalsFromBillOfLading(text: string): {
  cartons: { raw: string; value: number; context: string }[]
  weightKg: { raw: string; value: string; context: string }[]
  volumeCbm: { raw: string; value: string; context: string }[]
} {
  const cartons: { raw: string; value: number; context: string }[] = []
  const weightKg: { raw: string; value: string; context: string }[] = []
  const volumeCbm: { raw: string; value: string; context: string }[] = []

  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const cartonMatch =
      line.match(/\b(\d{1,10})\s*CARTONS\b/i) ??
      line.match(/\b(\d{1,10})\s*CTNS\b/i) ??
      line.match(/\b(\d{1,10})\s*CTN\b/i)
    if (cartonMatch) {
      const raw = cartonMatch[1] ?? ''
      const value = Number(raw)
      if (Number.isInteger(value) && value > 0) cartons.push({ raw, value, context: line })
    }

    const weightMatch = line.match(/\b(\d{1,10}(?:\.\d{1,6})?)\s*KGS\b/i)
    if (weightMatch) {
      const raw = weightMatch[1] ?? ''
      const value = raw.trim()
      if (value) weightKg.push({ raw, value, context: line })
    }

    const volumeMatch = line.match(/\b(\d{1,10}(?:\.\d{1,6})?)\s*CBM\b/i)
    if (volumeMatch) {
      const raw = volumeMatch[1] ?? ''
      const value = raw.trim()
      if (value) volumeCbm.push({ raw, value, context: line })
    }
  }

  return { cartons, weightKg, volumeCbm }
}

async function main() {
  loadEnv()
  const options = parseArgs()
  if (options.help) {
    showHelp()
    return
  }

  applySchemaMode(options.schemaMode, options.tenant)

  const tenant: TenantCode = options.tenant
  const prisma = await getTenantPrismaClient(tenant)

  const orders = await (async () => {
    if (options.all) {
      return prisma.purchaseOrder.findMany({
        where: { isLegacy: false, orderNumber: { startsWith: 'INV-' } },
        select: {
          id: true,
          orderNumber: true,
          expectedDate: true,
          incoterms: true,
          paymentTerms: true,
          counterpartyName: true,
          counterpartyAddress: true,
          proformaInvoiceNumber: true,
          proformaInvoiceDate: true,
          actualDeparture: true,
          estimatedDeparture: true,
          totalCartons: true,
          totalWeightKg: true,
          totalVolumeCbm: true,
          houseBillOfLading: true,
          commercialInvoiceNumber: true,
          packingListRef: true,
          vesselName: true,
          voyageNumber: true,
          portOfLoading: true,
          portOfDischarge: true,
          receiveType: true,
          warehouseCode: true,
          warehouseName: true,
          customsEntryNumber: true,
          customsClearedDate: true,
          receivedDate: true,
          lines: {
            select: {
              id: true,
              skuCode: true,
              unitsOrdered: true,
              unitsPerCarton: true,
              quantity: true,
              unitCost: true,
              totalCost: true,
              piNumber: true,
              commodityCode: true,
              countryOfOrigin: true,
              netWeightKg: true,
              cartonDimensionsCm: true,
              cartonSide1Cm: true,
              cartonSide2Cm: true,
              cartonSide3Cm: true,
              cartonWeightKg: true,
              packagingType: true,
              storageCartonsPerPallet: true,
              shippingCartonsPerPallet: true,
            },
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              stage: true,
              fileName: true,
              contentType: true,
              size: true,
              metadata: true,
            },
          },
        },
        orderBy: { orderNumber: 'asc' },
        skip: options.offset,
        take: typeof options.limit === 'number' ? options.limit : undefined,
      })
    }

    if (!fs.existsSync(options.csvPath)) {
      throw new Error(`CSV not found: ${options.csvPath}`)
    }

    const csvRaw = fs.readFileSync(options.csvPath, 'utf8')
    const records = parseCsv(csvRaw, { columns: true, skip_empty_lines: true }) as CsvRow[]
    const rowsAll = records.filter(
      (row) => normalizeCsvValue(row.region).toUpperCase() === options.tenant
    )
    const start = options.offset
    const rows =
      typeof options.limit === 'number' ? rowsAll.slice(start, start + options.limit) : rowsAll.slice(start)

    const csvOrderNumbers: string[] = []
    for (const row of rows) {
      const batchIdRaw = normalizeCsvValue(row.batch_id_raw)
      const variant = normalizeCsvValue(row.variant)
      if (!batchIdRaw || !variant) continue
      const orderNumber = buildOrderNumber(batchIdRaw, variant)
      csvOrderNumbers.push(orderNumber)
    }

    return prisma.purchaseOrder.findMany({
      where: { orderNumber: { in: csvOrderNumbers } },
      select: {
        id: true,
        orderNumber: true,
        expectedDate: true,
        incoterms: true,
        paymentTerms: true,
        counterpartyName: true,
        counterpartyAddress: true,
        proformaInvoiceNumber: true,
        proformaInvoiceDate: true,
        actualDeparture: true,
        estimatedDeparture: true,
        totalCartons: true,
        totalWeightKg: true,
        totalVolumeCbm: true,
        houseBillOfLading: true,
        commercialInvoiceNumber: true,
        packingListRef: true,
        vesselName: true,
        voyageNumber: true,
        portOfLoading: true,
        portOfDischarge: true,
        receiveType: true,
        warehouseCode: true,
        warehouseName: true,
        customsEntryNumber: true,
        customsClearedDate: true,
        receivedDate: true,
        lines: {
          select: {
            id: true,
            skuCode: true,
            unitsOrdered: true,
            unitsPerCarton: true,
            quantity: true,
            unitCost: true,
            totalCost: true,
            piNumber: true,
            commodityCode: true,
            countryOfOrigin: true,
            netWeightKg: true,
            cartonDimensionsCm: true,
            cartonSide1Cm: true,
            cartonSide2Cm: true,
            cartonSide3Cm: true,
            cartonWeightKg: true,
            packagingType: true,
            storageCartonsPerPallet: true,
            shippingCartonsPerPallet: true,
          },
        },
        documents: {
          select: {
            id: true,
            documentType: true,
            stage: true,
            fileName: true,
            contentType: true,
            size: true,
            metadata: true,
          },
        },
      },
      orderBy: { orderNumber: 'asc' },
    })
  })()

  const mapping: MappingOrderRow[] = []

  let updatedOrders = 0
  const updatedFields = {
    expectedDate: 0,
    incoterms: 0,
    paymentTerms: 0,
    counterpartyName: 0,
    counterpartyAddress: 0,
    proformaInvoiceNumber: 0,
    proformaInvoiceDate: 0,
    actualDeparture: 0,
    estimatedDeparture: 0,
    totalCartons: 0,
    totalWeightKg: 0,
    totalVolumeCbm: 0,
    houseBillOfLading: 0,
    commercialInvoiceNumber: 0,
    packingListRef: 0,
    vesselName: 0,
    voyageNumber: 0,
    portOfLoading: 0,
    portOfDischarge: 0,
    receiveType: 0,
    warehouseCode: 0,
    warehouseName: 0,
    customsEntryNumber: 0,
    customsClearedDate: 0,
    receivedDate: 0,
  }

  let createdLines = 0
  const updatedLineFields = {
    unitCost: 0,
    totalCost: 0,
    piNumber: 0,
    commodityCode: 0,
    countryOfOrigin: 0,
    netWeightKg: 0,
    cartonWeightKg: 0,
    cartonDimensionsCm: 0,
    cartonSide1Cm: 0,
    cartonSide2Cm: 0,
    cartonSide3Cm: 0,
    packagingType: 0,
    storageCartonsPerPallet: 0,
    shippingCartonsPerPallet: 0,
  }

  for (const order of orders) {
    const warnings: string[] = []

    const piDocs = order.documents.filter((doc) => doc.documentType === 'pi_docs' || doc.documentType.startsWith('pi_'))
    const billDocs = order.documents.filter((doc) => doc.documentType === 'bill_of_lading')
    const ciDocs = order.documents.filter((doc) => doc.documentType === 'commercial_invoice')
    const packingDocs = order.documents.filter((doc) => doc.documentType === 'packing_list')
    const shippingMarksDocs = order.documents.filter(
      (doc) => doc.documentType === 'shipping_marks' || doc.documentType === 'shipping_marks_xlsx'
    )
    const customsDocs = order.documents.filter((doc) => doc.documentType === 'custom_declaration')
    const grnDocs = order.documents.filter((doc) => doc.documentType === 'grn')

    const expectedDateCandidates: ExtractedValue<string>[] = []
    const incotermsCandidates: ExtractedValue<string>[] = []
    const paymentTermsCandidates: ExtractedValue<string>[] = []
    const counterpartyNameCandidates: ExtractedValue<string>[] = []
    const counterpartyAddressCandidates: ExtractedValue<string>[] = []
    const proformaInvoiceNumberCandidates: ExtractedValue<string>[] = []
    const proformaInvoiceDateCandidates: ExtractedValue<string>[] = []
    const actualDepartureCandidates: ExtractedValue<string>[] = []
    const estimatedDepartureCandidates: ExtractedValue<string>[] = []
    const totalCartonsCandidates: ExtractedValue<number>[] = []
    const totalWeightKgCandidates: ExtractedValue<string>[] = []
    const totalVolumeCbmCandidates: ExtractedValue<string>[] = []
    const houseBillOfLadingCandidates: ExtractedValue<string>[] = []
    const commercialInvoiceNumberCandidates: ExtractedValue<string>[] = []
    const packingListRefCandidates: ExtractedValue<string>[] = []
    const vesselNameCandidates: ExtractedValue<string>[] = []
    const voyageNumberCandidates: ExtractedValue<string>[] = []
    const portOfLoadingCandidates: ExtractedValue<string>[] = []
    const portOfDischargeCandidates: ExtractedValue<string>[] = []
    const receiveTypeCandidates: ExtractedValue<string>[] = []
    const warehouseCodeCandidates: ExtractedValue<string>[] = []
    const warehouseNameCandidates: ExtractedValue<string>[] = []
    const customsEntryNumberCandidates: ExtractedValue<string>[] = []
    const customsClearedDateCandidates: ExtractedValue<string>[] = []
    const receivedDateCandidates: ExtractedValue<string>[] = []

    const piLineItemCandidates: ExtractedValue<PiLineItem>[] = []
    const shippingMarksBySku: ShippingMarksCandidatesBySku = new Map()

    for (const doc of piDocs) {
      const piNumber = extractPiNumberFromDocumentRow(doc)
      if (piNumber) {
        proformaInvoiceNumberCandidates.push({
          value: piNumber,
          raw: piNumber,
          context: `fileName=${doc.fileName}`,
          sourcePath: doc.fileName,
          extractionMethod: 'text',
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const sourcePath = getDocSourcePath(doc)
      if (!sourcePath) {
        warnings.push(`pi doc missing metadata.sourcePath: ${doc.id}`)
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`pi sourcePath missing on disk: ${sourcePath}`)
        continue
      }

      const { text, method, errors } = extractTextForFile(sourcePath, {
        ocrMode: options.ocrMode,
        ocrPages: options.ocrPages,
      })
      for (const error of errors) warnings.push(`pi extract: ${error} (${sourcePath})`)
      if (text.trim().length < 40) {
        warnings.push(`pi produced too little text (${method}): ${sourcePath}`)
        continue
      }

      const seller = findPiSeller(text)
      if (seller) {
        counterpartyNameCandidates.push({
          value: seller.name,
          raw: seller.rawName,
          context: seller.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
        if (seller.address) {
          counterpartyAddressCandidates.push({
            value: seller.address,
            raw: seller.rawAddress ?? seller.address,
            context: seller.context,
            sourcePath,
            extractionMethod: method,
            docId: doc.id,
            documentType: doc.documentType,
            stage: doc.stage,
          })
        }
      }

      const docDate = findPiDocumentDate(text)
      if (docDate) {
        proformaInvoiceDateCandidates.push({
          value: docDate.iso,
          raw: docDate.raw,
          context: docDate.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const expected = findPiExpectedDate(text)
      if (expected) {
        expectedDateCandidates.push({
          value: expected.iso,
          raw: expected.raw,
          context: expected.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const terms = findPiPaymentTerms(text)
      if (terms) {
        paymentTermsCandidates.push({
          value: terms.value,
          raw: terms.raw,
          context: terms.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const incoterms = findPiIncoterms(text)
      if (incoterms) {
        incotermsCandidates.push({
          value: incoterms.value,
          raw: incoterms.raw,
          context: incoterms.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const ext = path.extname(sourcePath).toLowerCase()
      let spreadsheetLineItems: PiLineItem[] = []
      if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') {
        try {
          spreadsheetLineItems = extractPiLineItemsFromSpreadsheet(sourcePath)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          warnings.push(`pi spreadsheet line parse failed: ${message} (${sourcePath})`)
        }
      }

      const piLineItems = spreadsheetLineItems.length > 0 ? spreadsheetLineItems : extractPiLineItems(text)
      for (const item of piLineItems) {
        piLineItemCandidates.push({
          value: item,
          raw: item.context,
          context: item.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
    }

    for (const doc of shippingMarksDocs) {
      const sourcePath = getDocSourcePath(doc)
      if (!sourcePath) {
        warnings.push(`shipping_marks doc missing metadata.sourcePath: ${doc.id}`)
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`shipping_marks sourcePath missing on disk: ${sourcePath}`)
        continue
      }

      const { text, method, errors } = extractTextForFile(sourcePath, {
        ocrMode: options.ocrMode,
        ocrPages: options.ocrPages,
      })
      for (const error of errors) warnings.push(`shipping_marks extract: ${error} (${sourcePath})`)
      if (text.trim().length < 10) {
        warnings.push(`shipping_marks produced too little text (${method}): ${sourcePath}`)
        continue
      }

      const bySku = extractShippingMarksCandidates(text, {
        sourcePath,
        extractionMethod: method,
        docId: doc.id,
        documentType: doc.documentType,
        stage: doc.stage,
      })
      mergeShippingMarksCandidates(shippingMarksBySku, bySku)
    }

    const shouldScanBatchFolder =
      piLineItemCandidates.length === 0 ||
      order.lines.length === 0 ||
      order.expectedDate === null ||
      isMissingTextValue(order.incoterms) ||
      isMissingTextValue(order.paymentTerms) ||
      isMissingTextValue(order.counterpartyName) ||
      isMissingTextValue(order.counterpartyAddress) ||
      isMissingTextValue(order.proformaInvoiceNumber) ||
      order.proformaInvoiceDate === null

    if (shouldScanBatchFolder) {
      const batchFolderPath = findBatchFolderPath(tenant, order.orderNumber)
      if (batchFolderPath && fs.existsSync(batchFolderPath)) {
        const purchaseOrderPdfPath = findPurchaseOrderPdfPath(batchFolderPath)
        if (purchaseOrderPdfPath && fs.existsSync(purchaseOrderPdfPath)) {
          const { text, method, errors } = extractTextForFile(purchaseOrderPdfPath, {
            ocrMode: options.ocrMode,
            ocrPages: Math.max(options.ocrPages, 2),
          })
          for (const error of errors) warnings.push(`purchase_order_pdf extract: ${error} (${purchaseOrderPdfPath})`)
          if (text.trim().length >= 40) {
            const vendorPi = findVendorPiNumberFromPurchaseOrder(text)
            if (vendorPi) {
              proformaInvoiceNumberCandidates.push({
                value: vendorPi,
                raw: vendorPi,
                context: 'purchase_order_pdf VENDOR PI',
                sourcePath: purchaseOrderPdfPath,
                extractionMethod: method,
                docId: null,
                documentType: 'purchase_order_pdf',
                stage: null,
              })
            }

            const delivery = findPoDeliveryDate(text)
            if (delivery) {
              expectedDateCandidates.push({
                value: delivery.iso,
                raw: delivery.raw,
                context: delivery.context,
                sourcePath: purchaseOrderPdfPath,
                extractionMethod: method,
                docId: null,
                documentType: 'purchase_order_pdf',
                stage: null,
              })
            }

            const payment = findPoPaymentTerms(text)
            if (payment) {
              paymentTermsCandidates.push({
                value: payment.value,
                raw: payment.raw,
                context: payment.context,
                sourcePath: purchaseOrderPdfPath,
                extractionMethod: method,
                docId: null,
                documentType: 'purchase_order_pdf',
                stage: null,
              })
            }

            const poIncoterms = findPiIncoterms(text)
            if (poIncoterms) {
              incotermsCandidates.push({
                value: poIncoterms.value,
                raw: poIncoterms.raw,
                context: poIncoterms.context,
                sourcePath: purchaseOrderPdfPath,
                extractionMethod: method,
                docId: null,
                documentType: 'purchase_order_pdf',
                stage: null,
              })
            }

            const vendor = findVendorFromPurchaseOrder(text)
            if (vendor) {
              counterpartyNameCandidates.push({
                value: vendor.name,
                raw: vendor.rawName,
                context: vendor.context,
                sourcePath: purchaseOrderPdfPath,
                extractionMethod: method,
                docId: null,
                documentType: 'purchase_order_pdf',
                stage: null,
              })
              if (vendor.address) {
                counterpartyAddressCandidates.push({
                  value: vendor.address,
                  raw: vendor.rawAddress ?? vendor.address,
                  context: vendor.context,
                  sourcePath: purchaseOrderPdfPath,
                  extractionMethod: method,
                  docId: null,
                  documentType: 'purchase_order_pdf',
                  stage: null,
                })
              }
            }

            const poLineItems = extractPurchaseOrderLineItems(text)
            for (const item of poLineItems) {
              piLineItemCandidates.push({
                value: item,
                raw: item.context,
                context: item.context,
                sourcePath: purchaseOrderPdfPath,
                extractionMethod: method,
                docId: null,
                documentType: 'purchase_order_pdf',
                stage: null,
              })
            }
          }
        }

        const piNumberHintRaw = order.proformaInvoiceNumber ? order.proformaInvoiceNumber.trim().toUpperCase() : null
        const piNumberHintDigits = piNumberHintRaw ? (piNumberHintRaw.match(/\d/g) ?? []).length : 0
        const piNumberHint = piNumberHintRaw && piNumberHintDigits >= 3 ? piNumberHintRaw : null

        const batchPiPaths = findBatchPiFilePaths(batchFolderPath, { piNumberHint })
        for (const piPath of batchPiPaths) {
          if (!fs.existsSync(piPath)) continue

          const piNumber = extractPiNumberFromFileName(path.basename(piPath))
          if (piNumber) {
            proformaInvoiceNumberCandidates.push({
              value: piNumber,
              raw: piNumber,
              context: `fileName=${path.basename(piPath)}`,
              sourcePath: piPath,
              extractionMethod: 'text',
              docId: null,
              documentType: 'batch_pi_file',
              stage: null,
            })
          }

          const { text, method, errors } = extractTextForFile(piPath, {
            ocrMode: options.ocrMode,
            ocrPages: options.ocrPages,
          })
          for (const error of errors) warnings.push(`batch_pi_file extract: ${error} (${piPath})`)
          if (text.trim().length < 40) continue

          const seller = findPiSeller(text)
          if (seller) {
            counterpartyNameCandidates.push({
              value: seller.name,
              raw: seller.rawName,
              context: seller.context,
              sourcePath: piPath,
              extractionMethod: method,
              docId: null,
              documentType: 'batch_pi_file',
              stage: null,
            })
            if (seller.address) {
              counterpartyAddressCandidates.push({
                value: seller.address,
                raw: seller.rawAddress ?? seller.address,
                context: seller.context,
                sourcePath: piPath,
                extractionMethod: method,
                docId: null,
                documentType: 'batch_pi_file',
                stage: null,
              })
            }
          }

          const docDate = findPiDocumentDate(text)
          if (docDate) {
            proformaInvoiceDateCandidates.push({
              value: docDate.iso,
              raw: docDate.raw,
              context: docDate.context,
              sourcePath: piPath,
              extractionMethod: method,
              docId: null,
              documentType: 'batch_pi_file',
              stage: null,
            })
          }

          const expected = findPiExpectedDate(text)
          if (expected) {
            expectedDateCandidates.push({
              value: expected.iso,
              raw: expected.raw,
              context: expected.context,
              sourcePath: piPath,
              extractionMethod: method,
              docId: null,
              documentType: 'batch_pi_file',
              stage: null,
            })
          }

          const terms = findPiPaymentTerms(text)
          if (terms) {
            paymentTermsCandidates.push({
              value: terms.value,
              raw: terms.raw,
              context: terms.context,
              sourcePath: piPath,
              extractionMethod: method,
              docId: null,
              documentType: 'batch_pi_file',
              stage: null,
            })
          }

          const incoterms = findPiIncoterms(text)
          if (incoterms) {
            incotermsCandidates.push({
              value: incoterms.value,
              raw: incoterms.raw,
              context: incoterms.context,
              sourcePath: piPath,
              extractionMethod: method,
              docId: null,
              documentType: 'batch_pi_file',
              stage: null,
            })
          }

          const ext = path.extname(piPath).toLowerCase()
          let spreadsheetLineItems: PiLineItem[] = []
          if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') {
            try {
              spreadsheetLineItems = extractPiLineItemsFromSpreadsheet(piPath)
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error)
              warnings.push(`batch pi spreadsheet line parse failed: ${message} (${piPath})`)
            }
          }

          const piLineItems = spreadsheetLineItems.length > 0 ? spreadsheetLineItems : extractPiLineItems(text)
          for (const item of piLineItems) {
            piLineItemCandidates.push({
              value: item,
              raw: item.context,
              context: item.context,
              sourcePath: piPath,
              extractionMethod: method,
              docId: null,
              documentType: 'batch_pi_file',
              stage: null,
            })
          }
        }

        if (piNumberHint && order.incoterms === null && incotermsCandidates.length === 0) {
          const tenantPiPaths = findTenantPiFilePathsByHint(tenant, { piNumberHint })
          for (const piPath of tenantPiPaths.slice(0, 5)) {
            if (!fs.existsSync(piPath)) continue
            if (batchPiPaths.includes(piPath)) continue

            const piNumber = extractPiNumberFromFileName(path.basename(piPath))
            if (piNumber) {
              proformaInvoiceNumberCandidates.push({
                value: piNumber,
                raw: piNumber,
                context: `fileName=${path.basename(piPath)}`,
                sourcePath: piPath,
                extractionMethod: 'text',
                docId: null,
                documentType: 'tenant_pi_search',
                stage: null,
              })
            }

            const { text, method, errors } = extractTextForFile(piPath, {
              ocrMode: options.ocrMode,
              ocrPages: options.ocrPages,
            })
            for (const error of errors) warnings.push(`tenant_pi_search extract: ${error} (${piPath})`)
            if (text.trim().length < 40) continue

            const incoterms = findPiIncoterms(text)
            if (incoterms) {
              incotermsCandidates.push({
                value: incoterms.value,
                raw: incoterms.raw,
                context: incoterms.context,
                sourcePath: piPath,
                extractionMethod: method,
                docId: null,
                documentType: 'tenant_pi_search',
                stage: null,
              })
            }
          }
        }
      }
    }

    for (const doc of billDocs) {
      const sourcePath = getDocSourcePath(doc)
      if (!sourcePath) {
        warnings.push(`bill_of_lading doc missing metadata.sourcePath: ${doc.id}`)
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`bill_of_lading sourcePath missing on disk: ${sourcePath}`)
        continue
      }

      const { text, method, errors } = extractTextForFile(sourcePath, {
        ocrMode: options.ocrMode,
        ocrPages: options.ocrPages,
      })
      for (const error of errors) warnings.push(`bill_of_lading extract: ${error} (${sourcePath})`)
      if (text.trim().length < 20) {
        warnings.push(`bill_of_lading produced too little text (${method}): ${sourcePath}`)
        continue
      }

      const shipper = findShipperNameFromBillOfLading(text)
      if (shipper) {
        counterpartyNameCandidates.push({
          value: shipper.value,
          raw: shipper.raw,
          context: shipper.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const shipped = findBillOfLadingShippedOnBoard(text)
      if (shipped) {
        actualDepartureCandidates.push({
          value: shipped.iso,
          raw: shipped.raw,
          context: shipped.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const billRef = findHouseBillOfLading(text)
      if (billRef) {
        houseBillOfLadingCandidates.push({
          value: billRef.value,
          raw: billRef.value,
          context: billRef.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const receiveType = findReceiveTypeFromText(text)
      if (receiveType) {
        receiveTypeCandidates.push({
          value: receiveType.value,
          raw: receiveType.value,
          context: receiveType.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const vessel = findVesselName(text)
      if (vessel) {
        vesselNameCandidates.push({
          value: vessel.value,
          raw: vessel.raw,
          context: vessel.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const voyage = findVoyageNumber(text)
      if (voyage) {
        voyageNumberCandidates.push({
          value: voyage.value,
          raw: voyage.raw,
          context: voyage.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const ports = findPortsFromText(text)
      if (ports) {
        portOfLoadingCandidates.push({
          value: ports.portOfLoading,
          raw: ports.portOfLoading,
          context: ports.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
        portOfDischargeCandidates.push({
          value: ports.portOfDischarge,
          raw: ports.portOfDischarge,
          context: ports.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const totals = findTotalsFromBillOfLading(text)
      for (const entry of totals.cartons) {
        totalCartonsCandidates.push({
          value: entry.value,
          raw: entry.raw,
          context: entry.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
      for (const entry of totals.weightKg) {
        totalWeightKgCandidates.push({
          value: entry.value,
          raw: entry.raw,
          context: entry.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
      for (const entry of totals.volumeCbm) {
        totalVolumeCbmCandidates.push({
          value: entry.value,
          raw: entry.raw,
          context: entry.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
    }

    for (const doc of ciDocs) {
      const sourcePath = getDocSourcePath(doc)
      if (!sourcePath) {
        warnings.push(`commercial_invoice doc missing metadata.sourcePath: ${doc.id}`)
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`commercial_invoice sourcePath missing on disk: ${sourcePath}`)
        continue
      }

      const { text, method, errors } = extractTextForFile(sourcePath, {
        ocrMode: options.ocrMode,
        ocrPages: options.ocrPages,
      })
      for (const error of errors) warnings.push(`commercial_invoice extract: ${error} (${sourcePath})`)
      if (text.trim().length < 20) {
        warnings.push(`commercial_invoice produced too little text (${method}): ${sourcePath}`)
        continue
      }

      const invoiceNo = findInvoiceNumber(text)
      if (invoiceNo) {
        commercialInvoiceNumberCandidates.push({
          value: invoiceNo.value,
          raw: invoiceNo.raw,
          context: invoiceNo.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
    }

    for (const doc of packingDocs) {
      const sourcePath = getDocSourcePath(doc)
      if (!sourcePath) {
        warnings.push(`packing_list doc missing metadata.sourcePath: ${doc.id}`)
        const ref = extractPackingListRefFromFileName(doc.fileName)
        if (ref) {
          packingListRefCandidates.push({
            value: ref,
            raw: ref,
            context: `fileName=${doc.fileName}`,
            sourcePath: doc.fileName,
            extractionMethod: 'text',
            docId: doc.id,
            documentType: doc.documentType,
            stage: doc.stage,
          })
        }
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`packing_list sourcePath missing on disk: ${sourcePath}`)
        const ref = extractPackingListRefFromFileName(doc.fileName)
        if (ref) {
          packingListRefCandidates.push({
            value: ref,
            raw: ref,
            context: `fileName=${doc.fileName}`,
            sourcePath: doc.fileName,
            extractionMethod: 'text',
            docId: doc.id,
            documentType: doc.documentType,
            stage: doc.stage,
          })
        }
        continue
      }

      const { text, method, errors } = extractTextForFile(sourcePath, {
        ocrMode: options.ocrMode,
        ocrPages: options.ocrPages,
      })
      for (const error of errors) warnings.push(`packing_list extract: ${error} (${sourcePath})`)
      if (text.trim().length < 20) {
        warnings.push(`packing_list produced too little text (${method}): ${sourcePath}`)
        continue
      }

      const packingRef = findPackingListRef(text)
      if (packingRef) {
        packingListRefCandidates.push({
          value: packingRef.value,
          raw: packingRef.raw,
          context: packingRef.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const sailing = findSailingOnAboutDate(text)
      if (sailing) {
        estimatedDepartureCandidates.push({
          value: sailing.iso,
          raw: sailing.raw,
          context: sailing.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const vessel = findVesselName(text)
      if (vessel) {
        vesselNameCandidates.push({
          value: vessel.value,
          raw: vessel.raw,
          context: vessel.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const ports = findPortsFromText(text)
      if (ports) {
        portOfLoadingCandidates.push({
          value: ports.portOfLoading,
          raw: ports.portOfLoading,
          context: ports.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
        portOfDischargeCandidates.push({
          value: ports.portOfDischarge,
          raw: ports.portOfDischarge,
          context: ports.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
    }

    for (const doc of customsDocs) {
      const sourcePath = getDocSourcePath(doc)
      if (!sourcePath) {
        warnings.push(`custom_declaration doc missing metadata.sourcePath: ${doc.id}`)
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`custom_declaration sourcePath missing on disk: ${sourcePath}`)
        continue
      }

      const { text, method, errors } = extractTextForFile(sourcePath, {
        ocrMode: options.ocrMode,
        ocrPages: Math.max(options.ocrPages, 4),
      })
      for (const error of errors) warnings.push(`custom_declaration extract: ${error} (${sourcePath})`)
      if (text.trim().length < 20) {
        warnings.push(`custom_declaration produced too little text (${method}): ${sourcePath}`)
        continue
      }

      const mrns = findMrnCandidates(text)
      for (const mrn of mrns) {
        customsEntryNumberCandidates.push({
          value: mrn.value,
          raw: mrn.value,
          context: mrn.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const placeDates = findDateCandidatesByKeyword(text, /\bPLACE\s+AND\s+DATE\b/i)
      for (const candidate of placeDates) {
        customsClearedDateCandidates.push({
          value: candidate.iso,
          raw: candidate.raw,
          context: candidate.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }

      const statusDates = findDateCandidatesByKeyword(text, /\bSTATUS\s+DATE\b/i)
      for (const candidate of statusDates) {
        customsClearedDateCandidates.push({
          value: candidate.iso,
          raw: candidate.raw,
          context: candidate.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
    }

    for (const doc of grnDocs) {
      const sourcePath = getDocSourcePath(doc)
      if (!sourcePath) {
        warnings.push(`grn doc missing metadata.sourcePath: ${doc.id}`)
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`grn sourcePath missing on disk: ${sourcePath}`)
        continue
      }

      const { text, method, errors } = extractTextForFile(sourcePath, {
        ocrMode: options.ocrMode,
        ocrPages: options.ocrPages,
      })
      for (const error of errors) warnings.push(`grn extract: ${error} (${sourcePath})`)
      if (text.trim().length < 20) {
        warnings.push(`grn produced too little text (${method}): ${sourcePath}`)
        continue
      }

      const received = findDateCandidatesByKeyword(text, /\b(?:DELIVERY|RECEIVED)\s+DATE\b/i)
      for (const candidate of received) {
        receivedDateCandidates.push({
          value: candidate.iso,
          raw: candidate.raw,
          context: candidate.context,
          sourcePath,
          extractionMethod: method,
          docId: doc.id,
          documentType: doc.documentType,
          stage: doc.stage,
        })
      }
    }

    if (order.warehouseCode === null || order.warehouseName === null) {
      const transactions = await prisma.inventoryTransaction.findMany({
        where: { purchaseOrderId: order.id },
        select: { warehouseCode: true, warehouseName: true },
      })

      for (const tx of transactions) {
        const code = safeString(tx.warehouseCode)
        if (code) {
          warehouseCodeCandidates.push({
            value: code,
            raw: code,
            context: 'inventory_transactions.warehouse_code',
            sourcePath: 'db:inventory_transactions',
            extractionMethod: 'text',
            docId: null,
            documentType: 'inventory_transaction',
            stage: null,
          })
        }

        const name = safeString(tx.warehouseName)
        if (name) {
          warehouseNameCandidates.push({
            value: name,
            raw: name,
            context: 'inventory_transactions.warehouse_name',
            sourcePath: 'db:inventory_transactions',
            extractionMethod: 'text',
            docId: null,
            documentType: 'inventory_transaction',
            stage: null,
          })
        }
      }
    }

    const applied: MappingOrderRow['applied'] = {}

    const updates: Prisma.PurchaseOrderUpdateInput = {}

    const uniqueExpectedDate = findUniqueStrings(
      expectedDateCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueExpectedDate.length === 1 && order.expectedDate === null) {
      const iso = uniqueExpectedDate[0] as string
      if (iso) {
        applied.expectedDate = iso
        updates.expectedDate = new Date(iso)
      }
    }

    const uniqueIncoterms = findUniqueStrings(
      incotermsCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueIncoterms.length === 1 && isMissingTextValue(order.incoterms)) {
      const value = uniqueIncoterms[0] as string
      if (value) {
        applied.incoterms = value
        updates.incoterms = value
      }
    }

    const uniquePaymentTerms = findUniqueStrings(
      paymentTermsCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniquePaymentTerms.length === 1 && isMissingTextValue(order.paymentTerms)) {
      const value = uniquePaymentTerms[0] as string
      if (value) {
        applied.paymentTerms = value
        updates.paymentTerms = value
      }
    }

    const existingCounterpartyName =
      typeof order.counterpartyName === 'string' ? order.counterpartyName.trim() : ''
    if (existingCounterpartyName) {
      const canonicalExistingCounterpartyName = canonicalizeCounterpartyName(existingCounterpartyName)
      if (canonicalExistingCounterpartyName !== existingCounterpartyName) {
        applied.counterpartyName = canonicalExistingCounterpartyName
        updates.counterpartyName = canonicalExistingCounterpartyName
      }
    }

    const uniqueCounterpartyName = findUniqueStrings(
      counterpartyNameCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => canonicalizeCounterpartyName(c.value))
    )
    if (!updates.counterpartyName && uniqueCounterpartyName.length === 1 && isMissingTextValue(order.counterpartyName)) {
      const value = uniqueCounterpartyName[0] as string
      if (value) {
        applied.counterpartyName = value
        updates.counterpartyName = value
      }
    }

    const uniqueCounterpartyAddress = findUniqueStrings(
      counterpartyAddressCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueCounterpartyAddress.length === 1 && isMissingTextValue(order.counterpartyAddress)) {
      const value = uniqueCounterpartyAddress[0] as string
      if (value) {
        applied.counterpartyAddress = value
        updates.counterpartyAddress = value
      }
    }

    const uniquePiNumber = selectLikelyProformaNumbers(
      proformaInvoiceNumberCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniquePiNumber.length === 1 && isMissingTextValue(order.proformaInvoiceNumber)) {
      const value = uniquePiNumber[0] as string
      if (value) {
        applied.proformaInvoiceNumber = value
        updates.proformaInvoiceNumber = value
      }
    }

    const uniquePiDate = findUniqueStrings(
      proformaInvoiceDateCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniquePiDate.length === 1 && order.proformaInvoiceDate === null) {
      const iso = uniquePiDate[0] as string
      if (iso) {
        applied.proformaInvoiceDate = iso
        updates.proformaInvoiceDate = new Date(iso)
      }
    }

    const uniqueActualDeparture = findUniqueStrings(
      actualDepartureCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueActualDeparture.length === 1 && order.actualDeparture === null) {
      const iso = uniqueActualDeparture[0] as string
      if (iso) {
        applied.actualDeparture = iso
        updates.actualDeparture = new Date(iso)
      }
    }

    const uniqueEstimatedDeparture = findUniqueStrings(
      estimatedDepartureCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueEstimatedDeparture.length === 1 && order.estimatedDeparture === null) {
      const iso = uniqueEstimatedDeparture[0] as string
      if (iso) {
        applied.estimatedDeparture = iso
        updates.estimatedDeparture = new Date(iso)
      }
    }

    const uniqueCartons = findUniqueNumbers(
      totalCartonsCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueCartons.length === 1 && order.totalCartons === null) {
      const value = uniqueCartons[0] as number
      if (Number.isInteger(value) && value > 0) {
        applied.totalCartons = value
        updates.totalCartons = value
      }
    }

    const uniqueWeight = chooseWeightCandidates(
      totalWeightKgCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueWeight.length === 1 && order.totalWeightKg === null) {
      const value = uniqueWeight[0] as string
      if (value) {
        applied.totalWeightKg = value
        updates.totalWeightKg = new Prisma.Decimal(value)
      }
    }

    const uniqueVolume = findUniqueStrings(
      totalVolumeCbmCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueVolume.length === 1 && order.totalVolumeCbm === null) {
      const value = uniqueVolume[0] as string
      if (value) {
        applied.totalVolumeCbm = value
        updates.totalVolumeCbm = new Prisma.Decimal(value)
      }
    }

    const uniqueInvoiceNumber = findUniqueStrings(
      commercialInvoiceNumberCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueInvoiceNumber.length === 1 && isMissingTextValue(order.commercialInvoiceNumber)) {
      const value = uniqueInvoiceNumber[0] as string
      if (value) {
        applied.commercialInvoiceNumber = value
        updates.commercialInvoiceNumber = value
      }
    }

    const uniqueHouseBill = findUniqueStrings(
      houseBillOfLadingCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueHouseBill.length === 1 && isMissingTextValue(order.houseBillOfLading)) {
      const value = uniqueHouseBill[0] as string
      if (value) {
        applied.houseBillOfLading = value
        updates.houseBillOfLading = value
      }
    }

    const uniquePackingListRef = findUniqueStrings(
      packingListRefCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniquePackingListRef.length === 1 && isMissingTextValue(order.packingListRef)) {
      const value = uniquePackingListRef[0] as string
      if (value) {
        applied.packingListRef = value
        updates.packingListRef = value
      }
    }

    const uniqueVessel = findUniqueStrings(
      vesselNameCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueVessel.length === 1 && isMissingTextValue(order.vesselName)) {
      const value = uniqueVessel[0] as string
      if (value) {
        applied.vesselName = value
        updates.vesselName = value
      }
    }

    const uniqueVoyageNumber = findUniqueStrings(
      voyageNumberCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueVoyageNumber.length === 1 && isMissingTextValue(order.voyageNumber)) {
      const value = uniqueVoyageNumber[0] as string
      if (value) {
        applied.voyageNumber = value
        updates.voyageNumber = value
      }
    }

    const uniquePortLoading = findUniqueStrings(
      portOfLoadingCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (
      uniquePortLoading.length === 1 &&
      (isMissingTextValue(order.portOfLoading) || isClearlyInvalidPortValue(order.portOfLoading))
    ) {
      const value = uniquePortLoading[0] as string
      if (value) {
        applied.portOfLoading = value
        updates.portOfLoading = value
      }
    }

    const uniquePortDischarge = findUniqueStrings(
      portOfDischargeCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (
      uniquePortDischarge.length === 1 &&
      (isMissingTextValue(order.portOfDischarge) || isClearlyInvalidPortValue(order.portOfDischarge))
    ) {
      const value = uniquePortDischarge[0] as string
      if (value) {
        applied.portOfDischarge = value
        updates.portOfDischarge = value
      }
    }

    const uniqueReceiveType = findUniqueStrings(
      receiveTypeCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueReceiveType.length === 1 && order.receiveType === null) {
      const value = uniqueReceiveType[0] as string
      if (value) {
        applied.receiveType = value
        updates.receiveType = value as InboundReceiveType
      }
    }

    const uniqueWarehouseCode = findUniqueStrings(
      warehouseCodeCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueWarehouseCode.length === 1 && isMissingTextValue(order.warehouseCode)) {
      const value = uniqueWarehouseCode[0] as string
      if (value) {
        applied.warehouseCode = value
        updates.warehouseCode = value
      }
    }

    const uniqueWarehouseName = findUniqueStrings(
      warehouseNameCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueWarehouseName.length === 1 && isMissingTextValue(order.warehouseName)) {
      const value = uniqueWarehouseName[0] as string
      if (value) {
        applied.warehouseName = value
        updates.warehouseName = value
      }
    }

    const uniqueCustomsEntry = findUniqueStrings(
      customsEntryNumberCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueCustomsEntry.length === 1 && isMissingTextValue(order.customsEntryNumber)) {
      const value = uniqueCustomsEntry[0] as string
      if (value) {
        applied.customsEntryNumber = value
        updates.customsEntryNumber = value
      }
    }

    const uniqueCustomsCleared = findUniqueStrings(
      customsClearedDateCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueCustomsCleared.length === 1 && order.customsClearedDate === null) {
      const iso = uniqueCustomsCleared[0] as string
      if (iso) {
        applied.customsClearedDate = iso
        updates.customsClearedDate = new Date(iso)
      }
    }

    const uniqueReceived = findUniqueStrings(
      receivedDateCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueReceived.length === 1 && order.receivedDate === null) {
      const iso = uniqueReceived[0] as string
      if (iso) {
        applied.receivedDate = iso
        updates.receivedDate = new Date(iso)
      }
    }

    const hasUpdates = Object.keys(updates).length > 0
    if (options.apply && hasUpdates) {
      if (!options.dryRun) {
        await prisma.purchaseOrder.update({
          where: { id: order.id },
          data: updates,
          select: { id: true },
        })
      }

      updatedOrders += 1
      if (applied.expectedDate) updatedFields.expectedDate += 1
      if (applied.incoterms) updatedFields.incoterms += 1
      if (applied.paymentTerms) updatedFields.paymentTerms += 1
      if (applied.counterpartyName) updatedFields.counterpartyName += 1
      if (applied.counterpartyAddress) updatedFields.counterpartyAddress += 1
      if (applied.proformaInvoiceNumber) updatedFields.proformaInvoiceNumber += 1
      if (applied.proformaInvoiceDate) updatedFields.proformaInvoiceDate += 1
      if (applied.actualDeparture) updatedFields.actualDeparture += 1
      if (applied.estimatedDeparture) updatedFields.estimatedDeparture += 1
      if (typeof applied.totalCartons === 'number') updatedFields.totalCartons += 1
      if (applied.totalWeightKg) updatedFields.totalWeightKg += 1
      if (applied.totalVolumeCbm) updatedFields.totalVolumeCbm += 1
      if (applied.houseBillOfLading) updatedFields.houseBillOfLading += 1
      if (applied.commercialInvoiceNumber) updatedFields.commercialInvoiceNumber += 1
      if (applied.packingListRef) updatedFields.packingListRef += 1
      if (applied.vesselName) updatedFields.vesselName += 1
      if (applied.voyageNumber) updatedFields.voyageNumber += 1
      if (applied.portOfLoading) updatedFields.portOfLoading += 1
      if (applied.portOfDischarge) updatedFields.portOfDischarge += 1
      if (applied.receiveType) updatedFields.receiveType += 1
      if (applied.warehouseCode) updatedFields.warehouseCode += 1
      if (applied.warehouseName) updatedFields.warehouseName += 1
      if (applied.customsEntryNumber) updatedFields.customsEntryNumber += 1
      if (applied.customsClearedDate) updatedFields.customsClearedDate += 1
      if (applied.receivedDate) updatedFields.receivedDate += 1
    }

    const mappingLines: MappingLineRow[] = []

    const effectivePiNumber =
      typeof updates.proformaInvoiceNumber === 'string' ? updates.proformaInvoiceNumber : order.proformaInvoiceNumber

    const piCostByUnitsOrdered = new Map<number, { unitCost: string; totalCost: string }>()
    const piCostByItemNumber = new Map<string, { unitCost: string }>()
    const piAmbiguousUnits = new Set<number>()
    const piAmbiguousItems = new Set<string>()
    for (const candidate of piLineItemCandidates) {
      if (!allowCandidateForApply(candidate.extractionMethod, options.applyOcr)) continue
      const unitsOrdered = candidate.value.unitsOrdered
      if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) continue
      const key = `${candidate.value.unitCost}|${candidate.value.totalCost}`

      if (!piAmbiguousUnits.has(unitsOrdered)) {
        const existing = piCostByUnitsOrdered.get(unitsOrdered)
        if (!existing) {
          piCostByUnitsOrdered.set(unitsOrdered, { unitCost: candidate.value.unitCost, totalCost: candidate.value.totalCost })
        } else {
          const existingKey = `${existing.unitCost}|${existing.totalCost}`
          if (existingKey !== key) {
            piAmbiguousUnits.add(unitsOrdered)
            piCostByUnitsOrdered.delete(unitsOrdered)
          }
        }
      }

      const itemNumber = candidate.value.itemNumber
      if (typeof itemNumber === 'string' && itemNumber.length >= 4 && !piAmbiguousItems.has(itemNumber)) {
        const existingItem = piCostByItemNumber.get(itemNumber)
        if (!existingItem) {
          piCostByItemNumber.set(itemNumber, { unitCost: candidate.value.unitCost })
        } else if (existingItem.unitCost !== candidate.value.unitCost) {
          piAmbiguousItems.add(itemNumber)
          piCostByItemNumber.delete(itemNumber)
        }
      }
    }

    if (order.lines.length === 0 && shippingMarksBySku.size > 0) {
      for (const [skuCode, entry] of shippingMarksBySku.entries()) {
        const unitsPerCarton = findUniqueNumbers(
          entry.unitsPerCartonCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        const cartons = findUniqueNumbers(
          entry.cartonsCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )

        if (unitsPerCarton.length !== 1) continue
        if (cartons.length !== 1) continue

        const unitsPerCartonValue = unitsPerCarton[0] as number
        const cartonsValue = cartons[0] as number
        if (!Number.isInteger(unitsPerCartonValue) || unitsPerCartonValue <= 0) continue
        if (!Number.isInteger(cartonsValue) || cartonsValue <= 0) continue

        const unitsOrdered = unitsPerCartonValue * cartonsValue
        if (!Number.isInteger(unitsOrdered) || unitsOrdered <= 0) continue

        const commodity = findUniqueStrings(
          entry.commodityCodeCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        const origin = findUniqueStrings(
          entry.countryOfOriginCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        const netWeight = findUniqueStrings(
          entry.netWeightKgCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        const grossWeight = findUniqueStrings(
          entry.cartonWeightKgCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        const dims = findUniqueStrings(
          entry.cartonDimensionsCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )

        const piCost = piCostByUnitsOrdered.get(unitsOrdered)

        const createdData: Prisma.PurchaseOrderLineCreateInput = {
          purchaseOrder: { connect: { id: order.id } },
          skuCode,
          unitsOrdered,
          unitsPerCarton: unitsPerCartonValue,
          quantity: cartonsValue,
        }

        if (dims.length === 1) createdData.cartonDimensionsCm = dims[0] as string
        if (commodity.length === 1) createdData.commodityCode = commodity[0] as string
        if (origin.length === 1) createdData.countryOfOrigin = origin[0] as string
        if (netWeight.length === 1) createdData.netWeightKg = new Prisma.Decimal(netWeight[0] as string)
        if (grossWeight.length === 1) createdData.cartonWeightKg = new Prisma.Decimal(grossWeight[0] as string)
        if (effectivePiNumber) createdData.piNumber = effectivePiNumber
        if (piCost) {
          createdData.unitCost = new Prisma.Decimal(piCost.unitCost)
          createdData.totalCost = new Prisma.Decimal(piCost.totalCost)
        }

        if (dims.length === 1) {
          const parsed = parseCartonDimensionsText(dims[0] as string)
          if (parsed) {
            createdData.cartonSide1Cm = new Prisma.Decimal(parsed.side1)
            createdData.cartonSide2Cm = new Prisma.Decimal(parsed.side2)
            createdData.cartonSide3Cm = new Prisma.Decimal(parsed.side3)
          }
        }

        const appliedLine: MappingLineRow['applied'] = {
          cartonDimensionsCm: createdData.cartonDimensionsCm ?? undefined,
          commodityCode: createdData.commodityCode ?? undefined,
          countryOfOrigin: createdData.countryOfOrigin ?? undefined,
          netWeightKg: createdData.netWeightKg ? createdData.netWeightKg.toString() : undefined,
          cartonWeightKg: createdData.cartonWeightKg ? createdData.cartonWeightKg.toString() : undefined,
          piNumber: createdData.piNumber ?? undefined,
          unitCost: createdData.unitCost ? createdData.unitCost.toString() : undefined,
          totalCost: createdData.totalCost ? createdData.totalCost.toString() : undefined,
          cartonSide1Cm: createdData.cartonSide1Cm ? createdData.cartonSide1Cm.toString() : undefined,
          cartonSide2Cm: createdData.cartonSide2Cm ? createdData.cartonSide2Cm.toString() : undefined,
          cartonSide3Cm: createdData.cartonSide3Cm ? createdData.cartonSide3Cm.toString() : undefined,
        }

        if (options.apply && !options.dryRun) {
          const created = await prisma.purchaseOrderLine.create({ data: createdData, select: { id: true } })
          createdLines += 1
          mappingLines.push({
            lineId: created.id,
            skuCode,
            unitsOrdered,
            unitsPerCarton: unitsPerCartonValue,
            cartons: cartonsValue,
            current: {
              unitCost: null,
              totalCost: null,
              piNumber: null,
              commodityCode: null,
              countryOfOrigin: null,
              netWeightKg: null,
              cartonWeightKg: null,
              cartonDimensionsCm: null,
              cartonSide1Cm: null,
              cartonSide2Cm: null,
              cartonSide3Cm: null,
              packagingType: null,
              storageCartonsPerPallet: null,
              shippingCartonsPerPallet: null,
            },
            applied: appliedLine,
            created: true,
            warnings: [],
          })
        } else {
          if (options.apply) createdLines += 1
          mappingLines.push({
            lineId: `planned:${skuCode}`,
            skuCode,
            unitsOrdered,
            unitsPerCarton: unitsPerCartonValue,
            cartons: cartonsValue,
            current: {
              unitCost: null,
              totalCost: null,
              piNumber: null,
              commodityCode: null,
              countryOfOrigin: null,
              netWeightKg: null,
              cartonWeightKg: null,
              cartonDimensionsCm: null,
              cartonSide1Cm: null,
              cartonSide2Cm: null,
              cartonSide3Cm: null,
              packagingType: null,
              storageCartonsPerPallet: null,
              shippingCartonsPerPallet: null,
            },
            applied: appliedLine,
            created: true,
            warnings: [],
          })
        }
      }
    }

    for (const line of order.lines as PurchaseOrderLineRow[]) {
      const lineWarnings: string[] = []
      const lineApplied: MappingLineRow['applied'] = {}
      const lineUpdates: Prisma.PurchaseOrderLineUpdateInput = {}

      const normalizedSku = normalizeSkuCode(line.skuCode)
      const skuKey = normalizedSku ? normalizedSku : line.skuCode
      const shipping = shippingMarksBySku.get(skuKey)

      if (shipping) {
        const commodity = findUniqueStrings(
          shipping.commodityCodeCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        if (commodity.length === 1 && line.commodityCode === null) {
          const value = commodity[0] as string
          if (value) {
            lineApplied.commodityCode = value
            lineUpdates.commodityCode = value
          }
        }

        const origin = findUniqueStrings(
          shipping.countryOfOriginCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        if (origin.length === 1 && line.countryOfOrigin === null) {
          const value = origin[0] as string
          if (value) {
            lineApplied.countryOfOrigin = value
            lineUpdates.countryOfOrigin = value
          }
        }

        const netWeight = findUniqueStrings(
          shipping.netWeightKgCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        if (netWeight.length === 1 && line.netWeightKg === null) {
          const value = netWeight[0] as string
          if (value) {
            lineApplied.netWeightKg = value
            lineUpdates.netWeightKg = new Prisma.Decimal(value)
          }
        }

        const grossWeight = findUniqueStrings(
          shipping.cartonWeightKgCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        if (grossWeight.length === 1 && line.cartonWeightKg === null) {
          const value = grossWeight[0] as string
          if (value) {
            lineApplied.cartonWeightKg = value
            lineUpdates.cartonWeightKg = new Prisma.Decimal(value)
          }
        }

        const dims = findUniqueStrings(
          shipping.cartonDimensionsCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        if (dims.length === 1 && line.cartonDimensionsCm === null) {
          const value = dims[0] as string
          if (value) {
            lineApplied.cartonDimensionsCm = value
            lineUpdates.cartonDimensionsCm = value
          }
        }
      }

      if (effectivePiNumber && line.piNumber === null) {
        lineApplied.piNumber = effectivePiNumber
        lineUpdates.piNumber = effectivePiNumber
      }

      const piCost = piCostByUnitsOrdered.get(line.unitsOrdered)
      if (piCost) {
        if (line.unitCost === null) {
          lineApplied.unitCost = piCost.unitCost
          lineUpdates.unitCost = new Prisma.Decimal(piCost.unitCost)
        }
        if (line.totalCost === null) {
          lineApplied.totalCost = piCost.totalCost
          lineUpdates.totalCost = new Prisma.Decimal(piCost.totalCost)
        }
      } else if (shipping) {
        const productNumbers = findUniqueStrings(
          shipping.productNumberCandidates
            .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
            .map((c) => c.value)
        )
        if (productNumbers.length === 1) {
          const productNumber = productNumbers[0] as string
          const itemCost = piCostByItemNumber.get(productNumber)
          if (itemCost && line.unitCost === null) {
            lineApplied.unitCost = itemCost.unitCost
            lineUpdates.unitCost = new Prisma.Decimal(itemCost.unitCost)
          }
          if (itemCost && line.totalCost === null) {
            const total = new Prisma.Decimal(itemCost.unitCost).mul(line.unitsOrdered)
            const fixed = total.toFixed(2)
            lineApplied.totalCost = fixed
            lineUpdates.totalCost = new Prisma.Decimal(fixed)
          }
        }
      }

      const dimsSource = lineUpdates.cartonDimensionsCm ? String(lineUpdates.cartonDimensionsCm) : line.cartonDimensionsCm
      if (
        dimsSource &&
        (line.cartonSide1Cm === null || line.cartonSide2Cm === null || line.cartonSide3Cm === null)
      ) {
        const parsed = parseCartonDimensionsText(dimsSource)
        if (parsed) {
          if (line.cartonSide1Cm === null) {
            lineApplied.cartonSide1Cm = parsed.side1
            lineUpdates.cartonSide1Cm = new Prisma.Decimal(parsed.side1)
          }
          if (line.cartonSide2Cm === null) {
            lineApplied.cartonSide2Cm = parsed.side2
            lineUpdates.cartonSide2Cm = new Prisma.Decimal(parsed.side2)
          }
          if (line.cartonSide3Cm === null) {
            lineApplied.cartonSide3Cm = parsed.side3
            lineUpdates.cartonSide3Cm = new Prisma.Decimal(parsed.side3)
          }
        }
      }

      const hasLineUpdates = Object.keys(lineUpdates).length > 0
      if (options.apply && hasLineUpdates) {
        if (!options.dryRun) {
          await prisma.purchaseOrderLine.update({ where: { id: line.id }, data: lineUpdates, select: { id: true } })
        }

        if (lineApplied.unitCost) updatedLineFields.unitCost += 1
        if (lineApplied.totalCost) updatedLineFields.totalCost += 1
        if (lineApplied.piNumber) updatedLineFields.piNumber += 1
        if (lineApplied.commodityCode) updatedLineFields.commodityCode += 1
        if (lineApplied.countryOfOrigin) updatedLineFields.countryOfOrigin += 1
        if (lineApplied.netWeightKg) updatedLineFields.netWeightKg += 1
        if (lineApplied.cartonWeightKg) updatedLineFields.cartonWeightKg += 1
        if (lineApplied.cartonDimensionsCm) updatedLineFields.cartonDimensionsCm += 1
        if (lineApplied.cartonSide1Cm) updatedLineFields.cartonSide1Cm += 1
        if (lineApplied.cartonSide2Cm) updatedLineFields.cartonSide2Cm += 1
        if (lineApplied.cartonSide3Cm) updatedLineFields.cartonSide3Cm += 1
        if (lineApplied.packagingType) updatedLineFields.packagingType += 1
        if (typeof lineApplied.storageCartonsPerPallet === 'number')
          updatedLineFields.storageCartonsPerPallet += 1
        if (typeof lineApplied.shippingCartonsPerPallet === 'number')
          updatedLineFields.shippingCartonsPerPallet += 1
      }

      mappingLines.push({
        lineId: line.id,
        skuCode: line.skuCode,
        unitsOrdered: line.unitsOrdered,
        unitsPerCarton: line.unitsPerCarton,
        cartons: line.quantity,
        current: {
          unitCost: line.unitCost ? line.unitCost.toString() : null,
          totalCost: line.totalCost ? line.totalCost.toString() : null,
          piNumber: line.piNumber,
          commodityCode: line.commodityCode,
          countryOfOrigin: line.countryOfOrigin,
          netWeightKg: line.netWeightKg ? line.netWeightKg.toString() : null,
          cartonWeightKg: line.cartonWeightKg ? line.cartonWeightKg.toString() : null,
          cartonDimensionsCm: line.cartonDimensionsCm,
          cartonSide1Cm: line.cartonSide1Cm ? line.cartonSide1Cm.toString() : null,
          cartonSide2Cm: line.cartonSide2Cm ? line.cartonSide2Cm.toString() : null,
          cartonSide3Cm: line.cartonSide3Cm ? line.cartonSide3Cm.toString() : null,
          packagingType: line.packagingType,
          storageCartonsPerPallet: line.storageCartonsPerPallet,
          shippingCartonsPerPallet: line.shippingCartonsPerPallet,
        },
        applied: lineApplied,
        warnings: lineWarnings,
      })
    }

    mapping.push({
      purchaseOrderId: order.id,
      orderNumber: order.orderNumber,
      current: {
        expectedDate: order.expectedDate ? order.expectedDate.toISOString() : null,
        incoterms: order.incoterms,
        paymentTerms: order.paymentTerms,
        counterpartyName: order.counterpartyName,
        counterpartyAddress: order.counterpartyAddress,
        proformaInvoiceNumber: order.proformaInvoiceNumber,
        proformaInvoiceDate: order.proformaInvoiceDate ? order.proformaInvoiceDate.toISOString() : null,
        actualDeparture: order.actualDeparture ? order.actualDeparture.toISOString() : null,
        estimatedDeparture: order.estimatedDeparture ? order.estimatedDeparture.toISOString() : null,
        totalCartons: order.totalCartons,
        totalWeightKg: order.totalWeightKg ? order.totalWeightKg.toString() : null,
        totalVolumeCbm: order.totalVolumeCbm ? order.totalVolumeCbm.toString() : null,
        houseBillOfLading: order.houseBillOfLading,
        commercialInvoiceNumber: order.commercialInvoiceNumber,
        packingListRef: order.packingListRef,
        vesselName: order.vesselName,
        voyageNumber: order.voyageNumber,
        portOfLoading: order.portOfLoading,
        portOfDischarge: order.portOfDischarge,
        receiveType: order.receiveType ? String(order.receiveType) : null,
        warehouseCode: order.warehouseCode,
        warehouseName: order.warehouseName,
        customsEntryNumber: order.customsEntryNumber,
        customsClearedDate: order.customsClearedDate ? order.customsClearedDate.toISOString() : null,
        receivedDate: order.receivedDate ? order.receivedDate.toISOString() : null,
      },
      extracted: {
        expectedDateCandidates,
        incotermsCandidates,
        paymentTermsCandidates,
        counterpartyNameCandidates,
        counterpartyAddressCandidates,
        proformaInvoiceNumberCandidates,
        proformaInvoiceDateCandidates,
        actualDepartureCandidates,
        estimatedDepartureCandidates,
        totalCartonsCandidates,
        totalWeightKgCandidates,
        totalVolumeCbmCandidates,
        houseBillOfLadingCandidates,
        commercialInvoiceNumberCandidates,
        packingListRefCandidates,
        vesselNameCandidates,
        voyageNumberCandidates,
        portOfLoadingCandidates,
        portOfDischargeCandidates,
        receiveTypeCandidates,
        warehouseCodeCandidates,
        warehouseNameCandidates,
        customsEntryNumberCandidates,
        customsClearedDateCandidates,
        receivedDateCandidates,
      },
      applied,
      warnings,
      lines: mappingLines,
    })
  }

  const output = {
    generatedAt: new Date().toISOString(),
    schemaMode: options.schemaMode,
    tenant: options.tenant,
    csvPath: options.csvPath,
    outPath: options.outPath,
    apply: options.apply,
    applyOcr: options.applyOcr,
    dryRun: options.dryRun,
    ocrMode: options.ocrMode,
    ocrPages: options.ocrPages,
    orderCount: mapping.length,
    updatedOrders,
    createdLines,
    updatedFields,
    updatedLineFields,
    orders: mapping,
  }

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true })
  fs.writeFileSync(options.outPath, JSON.stringify(output, null, 2) + '\n', 'utf8')

  console.log(`Wrote mapping: ${options.outPath}`)
  console.log(`Orders processed: ${mapping.length}`)
  console.log(`Orders updated: ${updatedOrders}`)
  console.log(`Lines created: ${createdLines}`)
  console.log(`Field updates: ${JSON.stringify(updatedFields)}`)
  console.log(`Line field updates: ${JSON.stringify(updatedLineFields)}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectAllTenants()
  })
