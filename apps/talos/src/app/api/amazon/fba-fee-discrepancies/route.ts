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
      itemDimensionsCm: true,
      itemSide1Cm: true,
      itemSide2Cm: true,
      itemSide3Cm: true,
      itemWeightKg: true,
      batches: {
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          batchCode: true,
          unitDimensionsCm: true,
          unitSide1Cm: true,
          unitSide2Cm: true,
          unitSide3Cm: true,
          unitWeightKg: true,
          amazonItemPackageDimensionsCm: true,
          amazonItemPackageSide1Cm: true,
          amazonItemPackageSide2Cm: true,
          amazonItemPackageSide3Cm: true,
          amazonReferenceWeightKg: true,
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
      referenceItemPackageDimensionsCm: latestBatch?.unitDimensionsCm ?? null,
      referenceItemPackageSide1Cm: latestBatch?.unitSide1Cm ?? null,
      referenceItemPackageSide2Cm: latestBatch?.unitSide2Cm ?? null,
      referenceItemPackageSide3Cm: latestBatch?.unitSide3Cm ?? null,
      referenceItemPackageWeightKg: latestBatch?.unitWeightKg ?? null,
      amazonItemPackageDimensionsCm: latestBatch?.amazonItemPackageDimensionsCm ?? null,
      amazonItemPackageSide1Cm: latestBatch?.amazonItemPackageSide1Cm ?? null,
      amazonItemPackageSide2Cm: latestBatch?.amazonItemPackageSide2Cm ?? null,
      amazonItemPackageSide3Cm: latestBatch?.amazonItemPackageSide3Cm ?? null,
      amazonItemPackageWeightKg: latestBatch?.amazonReferenceWeightKg ?? null,
      amazonSizeTier: latestBatch?.amazonSizeTier ?? null,
      amazonFbaFulfillmentFee: latestBatch?.amazonFbaFulfillmentFee ?? null,
    }
  })

  return ApiResponses.success({ currencyCode, skus: resolvedSkus })
})
