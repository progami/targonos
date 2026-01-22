import { ApiResponses, withRole, z } from '@/lib/api'
import { getMarketplaceCurrencyCode } from '@/lib/amazon/fees'
import { escapeRegex, sanitizeSearchQuery } from '@/lib/security/input-sanitization'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  search: z.string().optional(),
})

export const GET = withRole(['admin', 'staff'], async (request, _session) => {
  const prisma = await getTenantPrisma()
  const tenantCode = await getCurrentTenantCode()
  const currencyCode = getMarketplaceCurrencyCode(tenantCode)

  const query = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const search = query.search ? sanitizeSearchQuery(query.search) : null

  const where: Prisma.SkuWhereInput = { isActive: true }
  if (search) {
    const escapedSearch = escapeRegex(search)
    where.OR = [
      { skuCode: { contains: escapedSearch, mode: 'insensitive' } },
      { description: { contains: escapedSearch, mode: 'insensitive' } },
      { asin: { contains: escapedSearch, mode: 'insensitive' } },
    ]
  }

  const skus = await prisma.sku.findMany({
    where,
    orderBy: { skuCode: 'asc' },
    select: {
      id: true,
      skuCode: true,
      description: true,
      asin: true,
      fbaFulfillmentFee: true,
      amazonListingPrice: true,
      // Reference dimensions (user-entered)
      unitDimensionsCm: true,
      unitSide1Cm: true,
      unitSide2Cm: true,
      unitSide3Cm: true,
      unitWeightKg: true,
      // Item dimensions
      itemDimensionsCm: true,
      itemSide1Cm: true,
      itemSide2Cm: true,
      itemSide3Cm: true,
      itemWeightKg: true,
      // Amazon item package dimensions (from Amazon catalog)
      amazonItemPackageDimensionsCm: true,
      amazonItemPackageSide1Cm: true,
      amazonItemPackageSide2Cm: true,
      amazonItemPackageSide3Cm: true,
      amazonReferenceWeightKg: true,
      batches: {
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          batchCode: true,
          amazonSizeTier: true,
          amazonFbaFulfillmentFee: true,
        },
      },
    },
  })

  const resolvedSkus = skus.map(({ batches, ...sku }) => {
    const latestBatch = batches[0] ?? null
    return {
      ...sku,
      latestBatchCode: latestBatch?.batchCode ?? null,
      // Reference dimensions are now on SKU
      referenceItemPackageDimensionsCm: sku.unitDimensionsCm,
      referenceItemPackageSide1Cm: sku.unitSide1Cm,
      referenceItemPackageSide2Cm: sku.unitSide2Cm,
      referenceItemPackageSide3Cm: sku.unitSide3Cm,
      referenceItemPackageWeightKg: sku.unitWeightKg,
      // Amazon item package dimensions are now on SKU
      amazonItemPackageDimensionsCm: sku.amazonItemPackageDimensionsCm,
      amazonItemPackageSide1Cm: sku.amazonItemPackageSide1Cm,
      amazonItemPackageSide2Cm: sku.amazonItemPackageSide2Cm,
      amazonItemPackageSide3Cm: sku.amazonItemPackageSide3Cm,
      amazonItemPackageWeightKg: sku.amazonReferenceWeightKg,
      // Fee data still from batch
      amazonSizeTier: latestBatch?.amazonSizeTier ?? null,
      amazonFbaFulfillmentFee: latestBatch?.amazonFbaFulfillmentFee ?? null,
    }
  })

  return ApiResponses.success({ currencyCode, skus: resolvedSkus })
})
