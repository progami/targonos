#!/usr/bin/env tsx

/**
 * Backfill safe INV-* purchase order fields from existing documents (UK)
 * -------------------------------------------------------------------
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
import { InboundReceiveType, Prisma, PurchaseOrderDocumentStage } from '@targon/prisma-talos'
import { getTenantPrismaClient, disconnectAllTenants } from '../../src/lib/tenant/prisma-factory'
import type { TenantCode } from '../../src/lib/tenant/constants'

type OcrMode = 'off' | 'auto' | 'always'

type ScriptOptions = {
  csvPath: string
  outPath: string
  schemaMode: 'main' | 'dev'
  dryRun: boolean
  apply: boolean
  applyOcr: boolean
  limit: number | null
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

type MappingOrderRow = {
  purchaseOrderId: string
  orderNumber: string
  current: {
    actualDeparture: string | null
    estimatedDeparture: string | null
    totalCartons: number | null
    totalWeightKg: string | null
    totalVolumeCbm: string | null
    houseBillOfLading: string | null
    commercialInvoiceNumber: string | null
    packingListRef: string | null
    vesselName: string | null
    portOfLoading: string | null
    portOfDischarge: string | null
    receiveType: string | null
    customsEntryNumber: string | null
    customsClearedDate: string | null
    receivedDate: string | null
  }
  extracted: {
    actualDepartureCandidates: ExtractedValue<string>[]
    estimatedDepartureCandidates: ExtractedValue<string>[]
    totalCartonsCandidates: ExtractedValue<number>[]
    totalWeightKgCandidates: ExtractedValue<string>[]
    totalVolumeCbmCandidates: ExtractedValue<string>[]
    houseBillOfLadingCandidates: ExtractedValue<string>[]
    commercialInvoiceNumberCandidates: ExtractedValue<string>[]
    packingListRefCandidates: ExtractedValue<string>[]
    vesselNameCandidates: ExtractedValue<string>[]
    portOfLoadingCandidates: ExtractedValue<string>[]
    portOfDischargeCandidates: ExtractedValue<string>[]
    receiveTypeCandidates: ExtractedValue<string>[]
    customsEntryNumberCandidates: ExtractedValue<string>[]
    customsClearedDateCandidates: ExtractedValue<string>[]
    receivedDateCandidates: ExtractedValue<string>[]
  }
  applied: {
    actualDeparture?: string
    estimatedDeparture?: string
    totalCartons?: number
    totalWeightKg?: string
    totalVolumeCbm?: string
    houseBillOfLading?: string
    commercialInvoiceNumber?: string
    packingListRef?: string
    vesselName?: string
    portOfLoading?: string
    portOfDischarge?: string
    receiveType?: string
    customsEntryNumber?: string
    customsClearedDate?: string
    receivedDate?: string
  }
  warnings: string[]
}

const SHARED_DRIVES_ROOT =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives'

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

function parseArgs(): ScriptOptions {
  const options: ScriptOptions = {
    csvPath: '',
    outPath: '',
    schemaMode: 'main',
    dryRun: false,
    apply: false,
    applyOcr: false,
    limit: null,
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
    if (!options.csvPath) throw new Error('Missing required --csv argument')

    if (!options.outPath) {
      const baseDir = path.dirname(options.csvPath)
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      options.outPath = path.join(baseDir, `talos_uk_inv_backfill_map_${stamp}.json`)
    }
  }

  return options
}

function showHelp() {
  console.log(`
Backfill safe INV-* PO fields from documents (UK)

Usage:
  pnpm --filter @targon/talos exec tsx scripts/migrations/backfill-uk-inv-fields-from-documents.ts --csv=/abs/path/to/talos_batch_migration_state.csv --out=/abs/path/to/output.json [options]

Options:
  --schema=main|dev         Target schema mode (default: main)
  --limit=N                 Only process first N UK rows
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

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'talos-pdf-ocr-'))
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

function extractTextForFile(
  filePath: string,
  options: { ocrMode: OcrMode; ocrPages: number }
): { text: string; method: 'pdftotext' | 'ocr' | 'text'; errors: string[] } {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.pdf') return extractTextFromPdf(filePath, options)
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

  const monthMatch = trimmed.match(/\b([A-Za-z]{3,9})[.\s-]*(\d{1,2})[,\s-]*(20\d{2})\b/)
  if (monthMatch) {
    const month = monthTokenToNumber(monthMatch[1] ?? '')
    const day = Number(monthMatch[2])
    const year = Number(monthMatch[3])
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

  return null
}

function findPortsFromText(
  text: string
): { portOfLoading: string; portOfDischarge: string; context: string } | null {
  const lines = text
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  for (const line of lines) {
    const match = line.match(/^FROM\s+(.+?)\s+TO\s*[:：]?\s*(.+)$/i)
    if (!match) continue
    const loading = (match[1] ?? '').trim()
    const discharge = (match[2] ?? '').trim()
    if (!loading || !discharge) continue
    return { portOfLoading: loading, portOfDischarge: discharge, context: line }
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
    const cartonMatch = line.match(/\b(\d{1,6})\s*CARTONS\b/i)
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

  const csvOrderNumbers: string[] = []
  for (const row of ukRows) {
    const batchIdRaw = normalizeCsvValue(row.batch_id_raw)
    const variant = normalizeCsvValue(row.variant)
    if (!batchIdRaw || !variant) continue
    const orderNumber = buildOrderNumber(batchIdRaw, variant)
    csvOrderNumbers.push(orderNumber)
  }

  const orders = await prisma.purchaseOrder.findMany({
    where: { orderNumber: { in: csvOrderNumbers } },
    select: {
      id: true,
      orderNumber: true,
      actualDeparture: true,
      estimatedDeparture: true,
      totalCartons: true,
      totalWeightKg: true,
      totalVolumeCbm: true,
      houseBillOfLading: true,
      commercialInvoiceNumber: true,
      packingListRef: true,
      vesselName: true,
      portOfLoading: true,
      portOfDischarge: true,
      receiveType: true,
      customsEntryNumber: true,
      customsClearedDate: true,
      receivedDate: true,
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

  const mapping: MappingOrderRow[] = []

  let updatedOrders = 0
  const updatedFields = {
    actualDeparture: 0,
    estimatedDeparture: 0,
    totalCartons: 0,
    totalWeightKg: 0,
    totalVolumeCbm: 0,
    houseBillOfLading: 0,
    commercialInvoiceNumber: 0,
    packingListRef: 0,
    vesselName: 0,
    portOfLoading: 0,
    portOfDischarge: 0,
    receiveType: 0,
    customsEntryNumber: 0,
    customsClearedDate: 0,
    receivedDate: 0,
  }

  for (const order of orders) {
    const warnings: string[] = []

    const billDocs = order.documents.filter((doc) => doc.documentType === 'bill_of_lading')
    const ciDocs = order.documents.filter((doc) => doc.documentType === 'commercial_invoice')
    const packingDocs = order.documents.filter((doc) => doc.documentType === 'packing_list')
    const customsDocs = order.documents.filter((doc) => doc.documentType === 'custom_declaration')
    const grnDocs = order.documents.filter((doc) => doc.documentType === 'grn')

    const actualDepartureCandidates: ExtractedValue<string>[] = []
    const estimatedDepartureCandidates: ExtractedValue<string>[] = []
    const totalCartonsCandidates: ExtractedValue<number>[] = []
    const totalWeightKgCandidates: ExtractedValue<string>[] = []
    const totalVolumeCbmCandidates: ExtractedValue<string>[] = []
    const houseBillOfLadingCandidates: ExtractedValue<string>[] = []
    const commercialInvoiceNumberCandidates: ExtractedValue<string>[] = []
    const packingListRefCandidates: ExtractedValue<string>[] = []
    const vesselNameCandidates: ExtractedValue<string>[] = []
    const portOfLoadingCandidates: ExtractedValue<string>[] = []
    const portOfDischargeCandidates: ExtractedValue<string>[] = []
    const receiveTypeCandidates: ExtractedValue<string>[] = []
    const customsEntryNumberCandidates: ExtractedValue<string>[] = []
    const customsClearedDateCandidates: ExtractedValue<string>[] = []
    const receivedDateCandidates: ExtractedValue<string>[] = []

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
        continue
      }
      if (!fs.existsSync(sourcePath)) {
        warnings.push(`packing_list sourcePath missing on disk: ${sourcePath}`)
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

    const applied: MappingOrderRow['applied'] = {}

    const updates: Prisma.PurchaseOrderUpdateInput = {}

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

    const uniqueWeight = findUniqueStrings(
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
    if (uniqueInvoiceNumber.length === 1 && order.commercialInvoiceNumber === null) {
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
    if (uniqueHouseBill.length === 1 && order.houseBillOfLading === null) {
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
    if (uniquePackingListRef.length === 1 && order.packingListRef === null) {
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
    if (uniqueVessel.length === 1 && order.vesselName === null) {
      const value = uniqueVessel[0] as string
      if (value) {
        applied.vesselName = value
        updates.vesselName = value
      }
    }

    const uniquePortLoading = findUniqueStrings(
      portOfLoadingCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniquePortLoading.length === 1 && order.portOfLoading === null) {
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
    if (uniquePortDischarge.length === 1 && order.portOfDischarge === null) {
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

    const uniqueCustomsEntry = findUniqueStrings(
      customsEntryNumberCandidates
        .filter((c) => allowCandidateForApply(c.extractionMethod, options.applyOcr))
        .map((c) => c.value)
    )
    if (uniqueCustomsEntry.length === 1 && order.customsEntryNumber === null) {
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
      if (applied.actualDeparture) updatedFields.actualDeparture += 1
      if (applied.estimatedDeparture) updatedFields.estimatedDeparture += 1
      if (typeof applied.totalCartons === 'number') updatedFields.totalCartons += 1
      if (applied.totalWeightKg) updatedFields.totalWeightKg += 1
      if (applied.totalVolumeCbm) updatedFields.totalVolumeCbm += 1
      if (applied.houseBillOfLading) updatedFields.houseBillOfLading += 1
      if (applied.commercialInvoiceNumber) updatedFields.commercialInvoiceNumber += 1
      if (applied.packingListRef) updatedFields.packingListRef += 1
      if (applied.vesselName) updatedFields.vesselName += 1
      if (applied.portOfLoading) updatedFields.portOfLoading += 1
      if (applied.portOfDischarge) updatedFields.portOfDischarge += 1
      if (applied.receiveType) updatedFields.receiveType += 1
      if (applied.customsEntryNumber) updatedFields.customsEntryNumber += 1
      if (applied.customsClearedDate) updatedFields.customsClearedDate += 1
      if (applied.receivedDate) updatedFields.receivedDate += 1
    }

    mapping.push({
      purchaseOrderId: order.id,
      orderNumber: order.orderNumber,
      current: {
        actualDeparture: order.actualDeparture ? order.actualDeparture.toISOString() : null,
        estimatedDeparture: order.estimatedDeparture ? order.estimatedDeparture.toISOString() : null,
        totalCartons: order.totalCartons,
        totalWeightKg: order.totalWeightKg ? order.totalWeightKg.toString() : null,
        totalVolumeCbm: order.totalVolumeCbm ? order.totalVolumeCbm.toString() : null,
        houseBillOfLading: order.houseBillOfLading,
        commercialInvoiceNumber: order.commercialInvoiceNumber,
        packingListRef: order.packingListRef,
        vesselName: order.vesselName,
        portOfLoading: order.portOfLoading,
        portOfDischarge: order.portOfDischarge,
        receiveType: order.receiveType ? String(order.receiveType) : null,
        customsEntryNumber: order.customsEntryNumber,
        customsClearedDate: order.customsClearedDate ? order.customsClearedDate.toISOString() : null,
        receivedDate: order.receivedDate ? order.receivedDate.toISOString() : null,
      },
      extracted: {
        actualDepartureCandidates,
        estimatedDepartureCandidates,
        totalCartonsCandidates,
        totalWeightKgCandidates,
        totalVolumeCbmCandidates,
        houseBillOfLadingCandidates,
        commercialInvoiceNumberCandidates,
        packingListRefCandidates,
        vesselNameCandidates,
        portOfLoadingCandidates,
        portOfDischargeCandidates,
        receiveTypeCandidates,
        customsEntryNumberCandidates,
        customsClearedDateCandidates,
        receivedDateCandidates,
      },
      applied,
      warnings,
    })
  }

  const output = {
    generatedAt: new Date().toISOString(),
    schemaMode: options.schemaMode,
    tenant: 'UK',
    csvPath: options.csvPath,
    outPath: options.outPath,
    apply: options.apply,
    applyOcr: options.applyOcr,
    dryRun: options.dryRun,
    ocrMode: options.ocrMode,
    ocrPages: options.ocrPages,
    orderCount: mapping.length,
    updatedOrders,
    updatedFields,
    orders: mapping,
  }

  fs.mkdirSync(path.dirname(options.outPath), { recursive: true })
  fs.writeFileSync(options.outPath, JSON.stringify(output, null, 2) + '\n', 'utf8')

  console.log(`Wrote mapping: ${options.outPath}`)
  console.log(`Orders processed: ${mapping.length}`)
  console.log(`Orders updated: ${updatedOrders}`)
  console.log(`Field updates: ${JSON.stringify(updatedFields)}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnectAllTenants()
  })
