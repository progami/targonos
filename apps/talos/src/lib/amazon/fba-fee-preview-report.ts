import type { DimensionTriplet } from '@/lib/amazon/fba-fee-discrepancies'
import { getSizeTierOptionsForTenant } from '@/lib/amazon/fees'
import { truncateToDecimalPlaces } from '@/lib/number-precision'
import type { TenantCode } from '@/lib/tenant/constants'
import { resolveDimensionTripletCm, sortDimensionTripletCm } from '@/lib/sku-dimensions'

const FBA_FEE_PREVIEW_REPORT_TYPE = 'GET_FBA_ESTIMATED_FBA_FEES_TXT_DATA'

export type FbaFeePreviewReportRow = {
  sku: string
  asin: string | null
  packageTriplet: DimensionTriplet | null
  packageWeightKg: number | null
  sizeTier: string | null
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase()
}

function normalizeTierKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseFiniteNumber(value: string | null): number | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function lengthToCm(value: number | null, unit: string | null): number | null {
  if (value === null) return null
  if (unit === null) return null
  const normalized = unit.trim().toLowerCase()
  if (['centimeters', 'centimetres', 'cm'].includes(normalized)) {
    return truncateToDecimalPlaces(value, 2)
  }
  if (['inches', 'inch', 'in'].includes(normalized)) {
    return truncateToDecimalPlaces(value * 2.54, 2)
  }
  if (['millimeters', 'millimetres', 'mm'].includes(normalized)) {
    return truncateToDecimalPlaces(value / 10, 2)
  }
  return null
}

function weightToKg(value: number | null, unit: string | null): number | null {
  if (value === null) return null
  if (unit === null) return null
  const normalized = unit.trim().toLowerCase()
  if (['kilograms', 'kilogram', 'kg'].includes(normalized)) {
    return truncateToDecimalPlaces(value, 2)
  }
  if (['grams', 'gram', 'g'].includes(normalized)) {
    return truncateToDecimalPlaces(value / 1000, 2)
  }
  if (['pounds', 'pound', 'lb', 'lbs'].includes(normalized)) {
    return truncateToDecimalPlaces(value * 0.453592, 2)
  }
  if (['ounces', 'ounce', 'oz'].includes(normalized)) {
    return truncateToDecimalPlaces(value * 0.0283495, 2)
  }
  return null
}

function resolveColumn(headers: string[], name: string): number {
  return headers.findIndex(header => header === name)
}

function getColumnValue(columns: string[], index: number): string | null {
  if (index < 0) return null
  const value = columns[index]
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function normalizeFbaFeePreviewSizeTier(
  tenantCode: TenantCode,
  rawSizeBand: string | null
): string | null {
  if (rawSizeBand === null) return null
  const normalizedRaw = normalizeTierKey(rawSizeBand)
  if (!normalizedRaw) return null

  for (const option of getSizeTierOptionsForTenant(tenantCode)) {
    if (normalizeTierKey(option) === normalizedRaw) {
      return option
    }
  }

  return null
}

export function parseFbaFeePreviewReport(
  reportText: string,
  tenantCode: TenantCode
): FbaFeePreviewReportRow[] {
  const lines = reportText.split(/\r?\n/).filter(line => line.trim())
  const headerLine = lines[0]
  if (!headerLine) return []

  const headers = headerLine.split('\t').map(normalizeHeader)
  const skuIndex = resolveColumn(headers, 'sku')
  const asinIndex = resolveColumn(headers, 'asin')
  const longestIndex = resolveColumn(headers, 'longest-side')
  const medianIndex = resolveColumn(headers, 'median-side')
  const shortestIndex = resolveColumn(headers, 'shortest-side')
  const dimensionUnitIndex = resolveColumn(headers, 'unit-of-dimension')
  const weightIndex = resolveColumn(headers, 'item-package-weight')
  const weightUnitIndex = resolveColumn(headers, 'unit-of-weight')
  const sizeBandIndex = resolveColumn(headers, 'product-size-weight-band')

  const rows: FbaFeePreviewReportRow[] = []

  for (const line of lines.slice(1)) {
    const columns = line.split('\t')
    const sku = getColumnValue(columns, skuIndex)
    const asin = getColumnValue(columns, asinIndex)
    if (sku === null && asin === null) continue

    const dimensionUnit = getColumnValue(columns, dimensionUnitIndex)
    const side1Cm = lengthToCm(parseFiniteNumber(getColumnValue(columns, shortestIndex)), dimensionUnit)
    const side2Cm = lengthToCm(parseFiniteNumber(getColumnValue(columns, medianIndex)), dimensionUnit)
    const side3Cm = lengthToCm(parseFiniteNumber(getColumnValue(columns, longestIndex)), dimensionUnit)
    const packageTriplet = resolveDimensionTripletCm({ side1Cm, side2Cm, side3Cm })
    const weightUnit = getColumnValue(columns, weightUnitIndex)

    rows.push({
      sku: sku ?? '',
      asin,
      packageTriplet: packageTriplet ? sortDimensionTripletCm(packageTriplet) : null,
      packageWeightKg: weightToKg(parseFiniteNumber(getColumnValue(columns, weightIndex)), weightUnit),
      sizeTier: normalizeFbaFeePreviewSizeTier(tenantCode, getColumnValue(columns, sizeBandIndex)),
    })
  }

  return rows
}

export function resolveFbaFeePreviewRow(
  rows: FbaFeePreviewReportRow[],
  skuCode: string,
  asin: string | null
): FbaFeePreviewReportRow | null {
  const normalizedSku = skuCode.trim().toUpperCase()
  for (const row of rows) {
    if (row.sku.trim().toUpperCase() === normalizedSku) return row
  }

  if (asin === null) return null
  const normalizedAsin = asin.trim().toUpperCase()
  if (!normalizedAsin) return null
  for (const row of rows) {
    if (row.asin && row.asin.trim().toUpperCase() === normalizedAsin) return row
  }

  return null
}

export async function loadLatestFbaFeePreviewReportRows(
  tenantCode: TenantCode
): Promise<FbaFeePreviewReportRow[]> {
  const { getLatestAmazonReportDocumentText } = await import('@/lib/amazon/client')
  const reportText = await getLatestAmazonReportDocumentText(
    tenantCode,
    FBA_FEE_PREVIEW_REPORT_TYPE
  )
  if (reportText === null) return []
  return parseFbaFeePreviewReport(reportText, tenantCode)
}
