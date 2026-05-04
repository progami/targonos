import { ApiResponses, withRole, z } from '@/lib/api'
import { getCatalogItem } from '@/lib/amazon/client'
import {
  parseCatalogItemPackageDimensions,
  parseCatalogItemPackageWeightKg,
} from '@/lib/amazon/catalog-normalization'
import {
  buildComparisonSkuRow,
  mergeAmazonCatalogPackageData,
  resolveMasterCartonTripletCm,
  type AmazonCatalogPackageData,
  type ApiSkuRow,
} from '@/lib/amazon/fba-fee-discrepancies'
import {
  loadLatestFbaFeePreviewReportRows,
  resolveFbaFeePreviewRow,
  type FbaFeePreviewReportRow,
} from '@/lib/amazon/fba-fee-preview-report'
import { isAllowedSizeTierForTenant } from '@/lib/amazon/fees'
import {
  escapeRegex,
  sanitizeForDisplay,
  sanitizeSearchQuery,
} from '@/lib/security/input-sanitization'
import {
  isReferenceInputUnitSystemAllowedForTenant,
  normalizeReferenceInputForStorage,
} from '@/lib/amazon/reference-input'
import type { TenantCode } from '@/lib/tenant/constants'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { InboundOrderLineStatus, InboundOrderStatus, Prisma } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(10),
})

const optionalDimensionValueSchema = z.number().positive().nullable()

const referenceUpdateSchema = z.object({
  skuId: z.string().uuid(),
  inputUnitSystem: z.enum(['metric', 'imperial']),
  unitSide1: optionalDimensionValueSchema,
  unitSide2: optionalDimensionValueSchema,
  unitSide3: optionalDimensionValueSchema,
  unitWeight: z.number().positive().nullable(),
  sizeTier: z
    .string()
    .trim()
    .max(100)
    .nullable()
    .transform(value => {
      if (value === null) return null
      const sanitized = sanitizeForDisplay(value)
      return sanitized ? sanitized : null
    }),
})

const comparisonSkuSelect = {
  id: true,
  skuCode: true,
  description: true,
  asin: true,
  category: true,
  sizeTier: true,
  amazonSizeTier: true,
  unitDimensionsCm: true,
  unitSide1Cm: true,
  unitSide2Cm: true,
  unitSide3Cm: true,
  unitWeightKg: true,
  itemDimensionsCm: true,
  itemSide1Cm: true,
  itemSide2Cm: true,
  itemSide3Cm: true,
  itemWeightKg: true,
  amazonItemPackageDimensionsCm: true,
  amazonItemPackageSide1Cm: true,
  amazonItemPackageSide2Cm: true,
  amazonItemPackageSide3Cm: true,
  amazonReferenceWeightKg: true,
} satisfies Prisma.SkuSelect

type ComparisonSkuDatabaseRow = Prisma.SkuGetPayload<{
  select: typeof comparisonSkuSelect
}>

type MasterCartonFields = Pick<
  ApiSkuRow,
  | 'masterCartonDimensionsCm'
  | 'masterCartonSide1Cm'
  | 'masterCartonSide2Cm'
  | 'masterCartonSide3Cm'
  | 'masterCartonSourceOrderNumber'
>

const emptyMasterCartonFields: MasterCartonFields = {
  masterCartonDimensionsCm: null,
  masterCartonSide1Cm: null,
  masterCartonSide2Cm: null,
  masterCartonSide3Cm: null,
  masterCartonSourceOrderNumber: null,
}

const latestMasterCartonLineSelect = {
  skuCode: true,
  cartonDimensionsCm: true,
  cartonSide1Cm: true,
  cartonSide2Cm: true,
  cartonSide3Cm: true,
  inboundOrder: {
    select: {
      orderNumber: true,
      createdAt: true,
    },
  },
} satisfies Prisma.InboundOrderLineSelect

type LatestMasterCartonLine = Prisma.InboundOrderLineGetPayload<{
  select: typeof latestMasterCartonLineSelect
}>

function buildMasterCartonFields(line: LatestMasterCartonLine): MasterCartonFields {
  return {
    masterCartonDimensionsCm: line.cartonDimensionsCm,
    masterCartonSide1Cm: line.cartonSide1Cm,
    masterCartonSide2Cm: line.cartonSide2Cm,
    masterCartonSide3Cm: line.cartonSide3Cm,
    masterCartonSourceOrderNumber: line.inboundOrder.orderNumber,
  }
}

function attachMasterCartonFields<T extends ComparisonSkuDatabaseRow>(
  sku: T,
  masterCartonBySkuCode: Map<string, MasterCartonFields>
): T & MasterCartonFields {
  const masterCartonFields = masterCartonBySkuCode.get(sku.skuCode)
  return {
    ...sku,
    ...(masterCartonFields === undefined ? emptyMasterCartonFields : masterCartonFields),
  }
}

async function loadLatestMasterCartonBySkuCode(
  prisma: Prisma.TransactionClient,
  skuCodes: string[]
): Promise<Map<string, MasterCartonFields>> {
  if (skuCodes.length === 0) return new Map()

  const lines = await prisma.inboundOrderLine.findMany({
    where: {
      skuCode: { in: skuCodes },
      status: { not: InboundOrderLineStatus.CANCELLED },
      inboundOrder: {
        status: { not: InboundOrderStatus.CANCELLED },
      },
    },
    orderBy: [
      { inboundOrder: { createdAt: 'desc' } },
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
    select: latestMasterCartonLineSelect,
  })

  const bySkuCode = new Map<string, MasterCartonFields>()
  for (const line of lines) {
    if (bySkuCode.has(line.skuCode)) continue
    const masterCartonFields = buildMasterCartonFields(line)
    if (resolveMasterCartonTripletCm(masterCartonFields) === null) continue
    bySkuCode.set(line.skuCode, masterCartonFields)
  }

  return bySkuCode
}

async function buildLiveAmazonComparisonRow(
  row: ComparisonSkuDatabaseRow & MasterCartonFields,
  tenantCode: TenantCode,
  feePreviewRows: FbaFeePreviewReportRow[]
) {
  const comparisonRow = buildComparisonSkuRow(row)
  const asin = typeof row.asin === 'string' ? row.asin.trim() : ''

  const feePreviewRow = resolveFbaFeePreviewRow(feePreviewRows, row.skuCode, asin ? asin : null)
  if (feePreviewRow) {
    const feePreviewData: AmazonCatalogPackageData = {
      packageTriplet: feePreviewRow.packageTriplet,
      packageWeightKg: feePreviewRow.packageWeightKg,
      sizeTier: feePreviewRow.sizeTier,
    }
    return mergeAmazonCatalogPackageData(comparisonRow, feePreviewData)
  }

  if (!asin) return comparisonRow

  const catalog = await getCatalogItem(asin, tenantCode)
  const attributes = catalog.attributes
  const amazonPackageTriplet = attributes ? parseCatalogItemPackageDimensions(attributes) : null
  const amazonPackageWeightKg = attributes ? parseCatalogItemPackageWeightKg(attributes) : null

  return mergeAmazonCatalogPackageData(comparisonRow, {
    packageTriplet: amazonPackageTriplet,
    packageWeightKg: amazonPackageWeightKg,
    sizeTier: null,
  })
}

export const GET = withRole(['admin', 'staff'], async (request, _session) => {
  const prisma = await getTenantPrisma()
  const tenantCode = await getCurrentTenantCode()

  const query = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const search = query.search ? sanitizeSearchQuery(query.search) : null
  const { page, pageSize } = query

  const whereClauses: Prisma.SkuWhereInput[] = [{ asin: { not: null } }, { asin: { not: '' } }]
  if (search) {
    const escapedSearch = escapeRegex(search)
    whereClauses.push({
      OR: [
        { skuCode: { contains: escapedSearch, mode: 'insensitive' } },
        { description: { contains: escapedSearch, mode: 'insensitive' } },
        { asin: { contains: escapedSearch, mode: 'insensitive' } },
      ],
    })
  }

  const where: Prisma.SkuWhereInput = {
    isActive: true,
    AND: whereClauses,
  }

  const total = await prisma.sku.count({ where })
  const skip = (page - 1) * pageSize
  const skus = await prisma.sku.findMany({
    where,
    orderBy: { skuCode: 'asc' },
    skip,
    take: pageSize,
    select: comparisonSkuSelect,
  })

  const feePreviewRows = await loadLatestFbaFeePreviewReportRows(tenantCode)
  const masterCartonBySkuCode = await loadLatestMasterCartonBySkuCode(
    prisma,
    skus.map(sku => sku.skuCode)
  )
  const comparisonSkus = await Promise.all(
    skus.map(sku =>
      buildLiveAmazonComparisonRow(
        attachMasterCartonFields(sku, masterCartonBySkuCode),
        tenantCode,
        feePreviewRows
      )
    )
  )

  return ApiResponses.success({ skus: comparisonSkus, total, page, pageSize })
})

export const PATCH = withRole(['admin', 'staff'], async (request, _session) => {
  const prisma = await getTenantPrisma()
  const tenantCode = await getCurrentTenantCode()
  const body = await request.json()
  const validatedData = referenceUpdateSchema.parse(body)

  if (
    validatedData.sizeTier !== null &&
    !isAllowedSizeTierForTenant(tenantCode, validatedData.sizeTier)
  ) {
    return ApiResponses.badRequest('Invalid size tier')
  }

  if (!isReferenceInputUnitSystemAllowedForTenant(tenantCode, validatedData.inputUnitSystem)) {
    return ApiResponses.badRequest('Invalid reference input units for tenant')
  }

  const dimensionValues = [
    validatedData.unitSide1,
    validatedData.unitSide2,
    validatedData.unitSide3,
  ]
  const unitAny = dimensionValues.some(value => value !== null)
  const unitAll = dimensionValues.every(value => value !== null)
  if (unitAny && !unitAll) {
    return ApiResponses.badRequest('Item package dimensions require all three sides')
  }

  const normalizedReferenceInput = normalizeReferenceInputForStorage({
    inputUnitSystem: validatedData.inputUnitSystem,
    unitSide1: validatedData.unitSide1,
    unitSide2: validatedData.unitSide2,
    unitSide3: validatedData.unitSide3,
    unitWeight: validatedData.unitWeight,
  })

  const updatedSku = await prisma.sku.update({
    where: { id: validatedData.skuId },
    data: {
      sizeTier: validatedData.sizeTier,
      ...normalizedReferenceInput.storage,
    },
    select: comparisonSkuSelect,
  })

  const feePreviewRows = await loadLatestFbaFeePreviewReportRows(tenantCode)
  const masterCartonBySkuCode = await loadLatestMasterCartonBySkuCode(prisma, [updatedSku.skuCode])
  const comparisonSku = await buildLiveAmazonComparisonRow(
    attachMasterCartonFields(updatedSku, masterCartonBySkuCode),
    tenantCode,
    feePreviewRows
  )
  return ApiResponses.success(comparisonSku)
})
