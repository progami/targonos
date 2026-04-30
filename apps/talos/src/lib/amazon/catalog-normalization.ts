import { sanitizeForDisplay } from '@/lib/security/input-sanitization'
import { truncateToDecimalPlaces } from '@/lib/number-precision'
import { resolveDimensionTripletCm, sortDimensionTripletCm } from '@/lib/sku-dimensions'

type CatalogMeasurement = {
  value?: number
  unit?: string
}

type CatalogDimensions = {
  length?: CatalogMeasurement
  width?: CatalogMeasurement
  height?: CatalogMeasurement
}

type CatalogAttributes = {
  item_package_dimensions?: CatalogDimensions[]
  item_dimensions?: CatalogDimensions[]
  item_package_weight?: CatalogMeasurement[]
  item_weight?: CatalogMeasurement[]
}

type CatalogTriplet = { side1Cm: number; side2Cm: number; side3Cm: number }

function convertMeasurementToCm(value: number, unit: string | undefined): number | null {
  if (!Number.isFinite(value)) return null
  if (typeof unit !== 'string') return null
  const normalized = unit.trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'inches' || normalized === 'inch' || normalized === 'in') {
    return truncateToDecimalPlaces(value * 2.54, 2)
  }
  if (normalized === 'centimeters' || normalized === 'centimetres' || normalized === 'cm') {
    return truncateToDecimalPlaces(value, 2)
  }
  if (normalized === 'millimeters' || normalized === 'millimetres' || normalized === 'mm') {
    return truncateToDecimalPlaces(value / 10, 2)
  }
  return null
}

function parseCatalogDimensions(
  dimensions: CatalogDimensions | null | undefined
): CatalogTriplet | null {
  if (!dimensions) return null
  const length = dimensions.length?.value
  const width = dimensions.width?.value
  const height = dimensions.height?.value
  if (length === undefined || width === undefined || height === undefined) return null
  if (!Number.isFinite(length) || !Number.isFinite(width) || !Number.isFinite(height)) return null

  const side1Cm = convertMeasurementToCm(length, dimensions.length?.unit)
  const side2Cm = convertMeasurementToCm(width, dimensions.width?.unit)
  const side3Cm = convertMeasurementToCm(height, dimensions.height?.unit)
  if (side1Cm === null || side2Cm === null || side3Cm === null) return null

  const triplet = resolveDimensionTripletCm({ side1Cm, side2Cm, side3Cm })
  return triplet ? sortDimensionTripletCm(triplet) : null
}

function parseCatalogWeightKg(measurement: CatalogMeasurement | null | undefined): number | null {
  if (!measurement) return null
  const raw = measurement.value
  if (raw === undefined || raw === null) return null
  if (!Number.isFinite(raw)) return null

  const unit = measurement.unit
  if (typeof unit !== 'string') return null
  const normalized = unit.trim().toLowerCase()
  if (!normalized) return null

  if (normalized === 'kilograms' || normalized === 'kilogram' || normalized === 'kg') {
    return truncateToDecimalPlaces(raw, 2)
  }

  if (
    normalized === 'pounds' ||
    normalized === 'pound' ||
    normalized === 'lb' ||
    normalized === 'lbs'
  ) {
    return truncateToDecimalPlaces(raw * 0.453592, 2)
  }

  if (normalized === 'grams' || normalized === 'gram' || normalized === 'g') {
    return truncateToDecimalPlaces(raw / 1000, 2)
  }

  if (normalized === 'ounces' || normalized === 'ounce' || normalized === 'oz') {
    return truncateToDecimalPlaces(raw * 0.0283495, 2)
  }

  return null
}

export function parseCatalogItemPackageDimensions(
  attributes: CatalogAttributes
): CatalogTriplet | null {
  return parseCatalogDimensions(attributes.item_package_dimensions?.[0])
}

export function parseCatalogItemDimensions(attributes: CatalogAttributes): CatalogTriplet | null {
  return parseCatalogDimensions(attributes.item_dimensions?.[0])
}

export function parseCatalogItemPackageWeightKg(attributes: CatalogAttributes): number | null {
  return parseCatalogWeightKg(attributes.item_package_weight?.[0])
}

export function parseCatalogItemWeightKg(attributes: CatalogAttributes): number | null {
  return parseCatalogWeightKg(attributes.item_weight?.[0])
}

export function parseCatalogCategories(catalog: { summaries?: unknown }): {
  category: string | null
  subcategory: string | null
} {
  const summaries = catalog.summaries
  if (Array.isArray(summaries) && summaries.length > 0) {
    const summary = summaries[0]
    if (summary && typeof summary === 'object') {
      const summaryRecord = summary as Record<string, unknown>
      const displayGroupRaw = summaryRecord.websiteDisplayGroupName
      const displayGroup =
        typeof displayGroupRaw === 'string' && displayGroupRaw.trim()
          ? sanitizeForDisplay(displayGroupRaw.trim())
          : null

      const browse = summaryRecord.browseClassification
      const browseDisplayRaw =
        browse && typeof browse === 'object'
          ? (browse as Record<string, unknown>).displayName
          : null
      const browseDisplay =
        typeof browseDisplayRaw === 'string' && browseDisplayRaw.trim()
          ? sanitizeForDisplay(browseDisplayRaw.trim())
          : null

      return { category: displayGroup, subcategory: browseDisplay }
    }
  }
  return { category: null, subcategory: null }
}
