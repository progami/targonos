import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/auth-wrapper'
import { getTenantPrisma } from '@/lib/tenant/server'
import { getInventory, getCatalogItem } from '@/lib/amazon/client'
import { calculateSizeTier } from '@/lib/amazon/fees'
import { formatDimensionTripletCm } from '@/lib/sku-dimensions'
import { SKU_FIELD_LIMITS } from '@/lib/sku-constants'
import type { Session } from 'next-auth'
export const dynamic = 'force-dynamic'

type CatalogMeasurement = { value?: number; unit?: string }
type CatalogDimensions = { length?: CatalogMeasurement; width?: CatalogMeasurement; height?: CatalogMeasurement }

function convertMeasurementToCm(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null
  if (typeof unit !== 'string') return null
  const normalized = unit.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'inches' || normalized === 'inch' || normalized === 'in') {
    return Number((value * 2.54).toFixed(2))
  }
  if (normalized === 'centimeters' || normalized === 'centimetres' || normalized === 'cm') {
    return Number(value.toFixed(2))
  }
  if (normalized === 'millimeters' || normalized === 'millimetres' || normalized === 'mm') {
    return Number((value / 10).toFixed(2))
  }
  return null
}

function parseCatalogItemPackageDimensions(attributes: {
  item_package_dimensions?: CatalogDimensions[]
}): { side1Cm: number; side2Cm: number; side3Cm: number } | null {
  const dims = attributes.item_package_dimensions?.[0]
  if (!dims) return null
  const length = dims.length?.value
  const width = dims.width?.value
  const height = dims.height?.value
  if (length === undefined || width === undefined || height === undefined) return null
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) return null

  const side1Cm = convertMeasurementToCm(length, dims.length?.unit)
  const side2Cm = convertMeasurementToCm(width, dims.width?.unit)
  const side3Cm = convertMeasurementToCm(height, dims.height?.unit)
  if (side1Cm === null || side2Cm === null || side3Cm === null) return null

  return { side1Cm, side2Cm, side3Cm }
}

function parseCatalogItemDimensions(attributes: {
  item_dimensions?: CatalogDimensions[]
}): { side1Cm: number; side2Cm: number; side3Cm: number } | null {
  const dims = attributes.item_dimensions?.[0]
  if (!dims) return null
  const length = dims.length?.value
  const width = dims.width?.value
  const height = dims.height?.value
  if (length === undefined || width === undefined || height === undefined) return null
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) return null

  const side1Cm = convertMeasurementToCm(length, dims.length?.unit)
  const side2Cm = convertMeasurementToCm(width, dims.width?.unit)
  const side3Cm = convertMeasurementToCm(height, dims.height?.unit)
  if (side1Cm === null || side2Cm === null || side3Cm === null) return null

  return { side1Cm, side2Cm, side3Cm }
}

function convertWeightToKg(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null
  if (typeof unit !== 'string') return null
  const normalized = unit.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'kilograms' || normalized === 'kilogram' || normalized === 'kg') {
    return Number(value.toFixed(3))
  }
  if (normalized === 'pounds' || normalized === 'pound' || normalized === 'lb' || normalized === 'lbs') {
    return Number((value * 0.453592).toFixed(3))
  }
  if (normalized === 'grams' || normalized === 'gram' || normalized === 'g') {
    return Number((value / 1000).toFixed(3))
  }
  if (normalized === 'ounces' || normalized === 'ounce' || normalized === 'oz') {
    return Number((value * 0.0283495).toFixed(3))
  }
  return null
}

function parseCatalogItemPackageWeightKg(attributes: {
  item_package_weight?: CatalogMeasurement[]
}): number | null {
  const measurement = attributes.item_package_weight?.[0]
  if (!measurement) return null
  const value = measurement.value
  if (value === undefined) return null
  if (!Number.isFinite(value)) return null
  return convertWeightToKg(value, measurement.unit)
}

function parseCatalogItemWeightKg(attributes: { item_weight?: CatalogMeasurement[] }): number | null {
  const measurement = attributes.item_weight?.[0]
  if (!measurement) return null
  const value = measurement.value
  if (value === undefined) return null
  if (!Number.isFinite(value)) return null
  return convertWeightToKg(value, measurement.unit)
}

function parseCatalogCategories(catalog: { summaries?: unknown }): { category: string | null; subcategory: string | null } {
  const summaries = catalog.summaries
  if (!Array.isArray(summaries) || summaries.length === 0) {
    return { category: null, subcategory: null }
  }

  const summary = summaries[0]
  if (!summary || typeof summary !== 'object') {
    return { category: null, subcategory: null }
  }

  const summaryRecord = summary as Record<string, unknown>
  const categoryRaw = summaryRecord.websiteDisplayGroupName
  const category = typeof categoryRaw === 'string' && categoryRaw.trim() ? categoryRaw.trim() : null

  const browse = summaryRecord.browseClassification
  const subcategoryRaw =
    browse && typeof browse === 'object' ? (browse as Record<string, unknown>).displayName : null
  const subcategory =
    typeof subcategoryRaw === 'string' && subcategoryRaw.trim() ? subcategoryRaw.trim() : null

  return { category, subcategory }
}

export const POST = withAuth(async (request, session) => {
  try {
    if (session.user.role !== 'admin') {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const { syncType } = await request.json()

    switch (syncType) {
      case 'inventory':
        return await syncInventory(session)
      case 'products':
        return await syncProducts(session)
      default:
        return NextResponse.json({ message: 'Invalid sync type' }, { status: 400 })
    }
  } catch (_error) {
    // console.error('Amazon sync error:', _error)
    return NextResponse.json(
      {
        message: 'Failed to sync Amazon data',
        error: _error instanceof Error ? _error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
})

async function syncInventory(session: Session) {
  try {
    if (!session?.user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const prisma = await getTenantPrisma()
    // Get FBA inventory from Amazon
    const inventoryData = await getInventory(session.user.region)

    if (!inventoryData || !inventoryData.inventorySummaries) {
      return NextResponse.json({
        message: 'No inventory data found',
        synced: 0,
      })
    }

    let syncedCount = 0
    let skippedCount = 0
    const errors = []

    // Process each inventory item
    for (const item of inventoryData.inventorySummaries) {
      try {
        // Only sync SKUs that already exist in our system
        const sku = await prisma.sku.findFirst({
          where: {
            OR: [{ asin: item.asin }, { skuCode: item.sellerSku }],
          },
        })

        if (!sku) {
          // Skip items that don't exist in our product catalog
          // console.log(`Skipping Amazon item ${item.sellerSku} (ASIN: ${item.asin}) - not in product catalog`)
          skippedCount++
          continue
        }

        // Get the total quantity from Amazon
        const totalQuantity = item.totalQuantity || 0

        // Update the SKU with FBA stock
        await prisma.sku.update({
          where: { id: sku.id },
          data: {
            fbaStock: totalQuantity,
            fbaStockLastUpdated: new Date(),
          },
        })

        syncedCount++
      } catch (_itemError) {
        // console.error(`Error syncing item ${item.asin}:`, _itemError)
        errors.push({
          asin: item.asin,
          error: _itemError instanceof Error ? _itemError.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      message: `Successfully synced ${syncedCount} items${skippedCount > 0 ? `, skipped ${skippedCount} items not in catalog` : ''}`,
      synced: syncedCount,
      skipped: skippedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (_error) {
    throw _error
  }
}

async function syncProducts(session: Session) {
  try {
    const prisma = await getTenantPrisma()
    // Get all SKUs with ASINs
    const skus = await prisma.sku.findMany({
      where: {
        asin: { not: null },
      },
    })

    let updatedCount = 0
    const errors = []

    for (const sku of skus) {
      if (!sku.asin) continue

      try {
        const catalogItem = await getCatalogItem(sku.asin, session.user.region)

        if (catalogItem.attributes) {
          const attributes = catalogItem.attributes
          const updates: Record<string, unknown> = {}

          // Update description if available
          const itemName = attributes.item_name?.[0]?.value
          if (typeof itemName === 'string' && itemName.trim()) {
            updates.description = itemName.trim().substring(0, SKU_FIELD_LIMITS.DESCRIPTION_MAX)
          } else {
            const summaryName = catalogItem.summaries?.[0]?.itemName
            if (typeof summaryName === 'string' && summaryName.trim()) {
              updates.description = summaryName.trim().substring(0, SKU_FIELD_LIMITS.DESCRIPTION_MAX)
            }
          }

          const categories = parseCatalogCategories(catalogItem)
          if (categories.category) {
            updates.amazonCategory = categories.category
          }
          if (categories.subcategory) {
            updates.amazonSubcategory = categories.subcategory
          }

          const unitTriplet = parseCatalogItemPackageDimensions(attributes)
          const unitWeightKg = parseCatalogItemPackageWeightKg(attributes)
          const computedTier =
            unitTriplet && unitWeightKg !== null
              ? calculateSizeTier(unitTriplet.side1Cm, unitTriplet.side2Cm, unitTriplet.side3Cm, unitWeightKg)
              : null

          const batchUpdates: Record<string, unknown> = {}
          if (unitTriplet) {
            batchUpdates.amazonItemPackageDimensionsCm = formatDimensionTripletCm(unitTriplet)
            batchUpdates.amazonItemPackageSide1Cm = unitTriplet.side1Cm
            batchUpdates.amazonItemPackageSide2Cm = unitTriplet.side2Cm
            batchUpdates.amazonItemPackageSide3Cm = unitTriplet.side3Cm
          }
          if (unitWeightKg !== null) {
            batchUpdates.amazonReferenceWeightKg = unitWeightKg
          }
          if (computedTier) {
            batchUpdates.amazonSizeTier = computedTier
          }

          if (Object.keys(batchUpdates).length > 0) {
            const latestBatch = await prisma.skuBatch.findFirst({
              where: { skuId: sku.id, isActive: true },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            })
            if (!latestBatch) {
              throw new Error(`No active batch found for SKU: ${sku.skuCode}`)
            }

            await prisma.skuBatch.update({
              where: { id: latestBatch.id },
              data: batchUpdates,
            })
          }

          const itemTriplet = parseCatalogItemDimensions(attributes)
          if (
            itemTriplet &&
            sku.itemDimensionsCm === null &&
            sku.itemSide1Cm === null &&
            sku.itemSide2Cm === null &&
            sku.itemSide3Cm === null
          ) {
            updates.itemDimensionsCm = formatDimensionTripletCm(itemTriplet)
            updates.itemSide1Cm = itemTriplet.side1Cm
            updates.itemSide2Cm = itemTriplet.side2Cm
            updates.itemSide3Cm = itemTriplet.side3Cm
          }

          const itemWeightKg = parseCatalogItemWeightKg(attributes)
          if (itemWeightKg !== null && sku.itemWeightKg === null) {
            updates.itemWeightKg = itemWeightKg
          }

          if (Object.keys(updates).length > 0) {
            await prisma.sku.update({
              where: { id: sku.id },
              data: updates,
            })
            updatedCount++
          }
        }
      } catch (_itemError) {
        // console.error(`Error updating product ${sku.asin}:`, _itemError)
        errors.push({
          asin: sku.asin,
          error: _itemError instanceof Error ? _itemError.message : 'Unknown error',
        })
      }

      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    return NextResponse.json({
      message: `Successfully updated ${updatedCount} products`,
      updated: updatedCount,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (_error) {
    throw _error
  }
}
