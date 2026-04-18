import { ApiResponses, withRole, z } from '@/lib/api'
import { parseAmazonProductFees } from '@/lib/amazon/fees'
import { hydrateComparisonSkuRow } from '@/lib/amazon/fba-fee-discrepancies'
import { getListingPrice, getProductFeesForSku } from '@/lib/amazon/client'
import { getMarketplaceCurrencyCode } from '@/lib/amazon/fees'
import { escapeRegex, sanitizeSearchQuery } from '@/lib/security/input-sanitization'
import { getCurrentTenantCode, getTenantPrisma } from '@/lib/tenant/server'
import { Prisma } from '@targon/prisma-talos'

export const dynamic = 'force-dynamic'

const listQuerySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(10),
})

export const GET = withRole(['admin', 'staff'], async (request, _session) => {
  const prisma = await getTenantPrisma()
  const tenantCode = await getCurrentTenantCode()
  const currencyCode = getMarketplaceCurrencyCode(tenantCode)

  const query = listQuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams))
  const search = query.search ? sanitizeSearchQuery(query.search) : null
  const { page, pageSize } = query

  const whereClauses: Prisma.SkuWhereInput[] = [
    { asin: { not: null } },
    { asin: { not: '' } },
  ]
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
    select: {
      id: true,
      skuCode: true,
      description: true,
      asin: true,
      category: true,
      amazonSizeTier: true,
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
    },
  })

  const feeHydratedSkus = await Promise.all(
    skus.map(async sku => {
      const resolvedSku = {
        ...sku,
        fbaFulfillmentFee: null,
        amazonListingPrice: null,
        amazonFbaFulfillmentFee: null,
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
      }
      return hydrateComparisonSkuRow(resolvedSku, tenantCode, {
        loadListingPrice: getListingPrice,
        loadAmazonFees: async (sellerSku, listingPriceToEstimate, currentTenantCode) => {
          const rawFees = await getProductFeesForSku(sellerSku, listingPriceToEstimate, currentTenantCode)
          const parsedFees = parseAmazonProductFees(rawFees)
          return {
            fbaFees: parsedFees.fbaFees,
            sizeTier: parsedFees.sizeTier,
          }
        },
      })
    })
  )

  return ApiResponses.success({ currencyCode, skus: feeHydratedSkus, total, page, pageSize })
})
