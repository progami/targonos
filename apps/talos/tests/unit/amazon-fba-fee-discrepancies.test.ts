import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import * as discrepancies from '../../src/lib/amazon/fba-fee-discrepancies'
import { parseCatalogItemPackageDimensions } from '../../src/lib/amazon/catalog-normalization'
import type { ApiSkuRow, ComparisonSkuSourceRow } from '../../src/lib/amazon/fba-fee-discrepancies'
import {
  isReferenceInputUnitSystemAllowedForTenant,
  normalizeReferenceInputForStorage,
} from '../../src/lib/amazon/reference-input'
import {
  parseFbaFeePreviewReport,
  resolveFbaFeePreviewRow,
} from '../../src/lib/amazon/fba-fee-preview-report'
import { getSizeTierOptionsForTenant, isAllowedSizeTierForTenant } from '../../src/lib/amazon/fees'
import {
  formatDimensionTripletDisplayFromCm,
  formatWeightDisplayFromKg,
} from '../../src/lib/measurements'

function createSkuRow(overrides: Partial<ApiSkuRow> = {}): ApiSkuRow {
  const referenceTriplet = {
    side1Cm: 10,
    side2Cm: 10,
    side3Cm: 10,
  }
  const referenceWeightKg = 0.2
  const assignedSizeTier = 'Small Standard-Size'

  return {
    id: 'sku_1',
    skuCode: 'CS-010',
    description: 'Test SKU',
    asin: 'B000TEST01',
    sizeTier: assignedSizeTier,
    amazonSizeTier: assignedSizeTier,
    referenceItemPackageDimensionsCm: null,
    referenceItemPackageSide1Cm: referenceTriplet.side1Cm,
    referenceItemPackageSide2Cm: referenceTriplet.side2Cm,
    referenceItemPackageSide3Cm: referenceTriplet.side3Cm,
    referenceItemPackageWeightKg: referenceWeightKg,
    amazonItemPackageDimensionsCm: null,
    amazonItemPackageSide1Cm: referenceTriplet.side1Cm,
    amazonItemPackageSide2Cm: referenceTriplet.side2Cm,
    amazonItemPackageSide3Cm: referenceTriplet.side3Cm,
    amazonItemPackageWeightKg: referenceWeightKg,
    itemDimensionsCm: null,
    itemSide1Cm: null,
    itemSide2Cm: null,
    itemSide3Cm: null,
    itemWeightKg: null,
    ...overrides,
  }
}

function createComparisonSkuSourceRow(
  overrides: Partial<ComparisonSkuSourceRow> = {}
): ComparisonSkuSourceRow {
  const referenceTriplet = {
    side1Cm: 10,
    side2Cm: 10,
    side3Cm: 10,
  }
  const referenceWeightKg = 0.2
  const assignedSizeTier = 'Small Standard-Size'

  return {
    id: 'sku_1',
    skuCode: 'CS-010',
    description: 'Test SKU',
    asin: 'B000TEST01',
    category: 'Toys',
    sizeTier: assignedSizeTier,
    amazonSizeTier: assignedSizeTier,
    unitDimensionsCm: null,
    unitSide1Cm: referenceTriplet.side1Cm,
    unitSide2Cm: referenceTriplet.side2Cm,
    unitSide3Cm: referenceTriplet.side3Cm,
    unitWeightKg: referenceWeightKg,
    itemDimensionsCm: null,
    itemSide1Cm: null,
    itemSide2Cm: null,
    itemSide3Cm: null,
    itemWeightKg: null,
    amazonItemPackageDimensionsCm: null,
    amazonItemPackageSide1Cm: referenceTriplet.side1Cm,
    amazonItemPackageSide2Cm: referenceTriplet.side2Cm,
    amazonItemPackageSide3Cm: referenceTriplet.side3Cm,
    amazonReferenceWeightKg: referenceWeightKg,
    ...overrides,
  }
}

test('computeComparison marks matching assigned tiers as match even when dimensions differ', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      amazonItemPackageSide1Cm: 12,
      amazonItemPackageSide2Cm: 10,
      amazonItemPackageSide3Cm: 10,
    }),
    'US'
  )

  assert.equal(comparison.status, 'MATCH')
  assert.equal(comparison.hasSizeTierMismatch, false)
})

test('computeComparison marks incomplete Amazon tier data as missing Amazon tier', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      amazonSizeTier: null,
    }),
    'US'
  )

  assert.equal(comparison.status, 'MISSING_AMAZON')
  assert.deepEqual(comparison.amazon.missingFields, ['Amazon size tier'])
})

test('computeComparison marks assigned size tier mismatch without reference fee data', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      sizeTier: 'Small Standard-Size',
      amazonSizeTier: 'Large Standard-Size',
    }),
    'US'
  )

  assert.equal(comparison.status, 'MISMATCH')
  assert.equal(comparison.hasSizeTierMismatch, true)
  assert.equal(typeof discrepancies.getComparisonStatusLabel, 'function')
  if (typeof discrepancies.getComparisonStatusLabel !== 'function') return

  assert.equal(discrepancies.getComparisonStatusLabel(comparison), 'Size tier mismatch')
})

test('computeComparison marks missing assigned reference size tier as missing reference', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      sizeTier: null,
    }),
    'US'
  )

  assert.equal(comparison.status, 'MISSING_REFERENCE')
  assert.deepEqual(comparison.reference.missingFields, ['Reference size tier'])
})

test('computeComparison does not need fee fields when assigned size tiers match', () => {
  const comparison = discrepancies.computeComparison(createSkuRow(), 'US')

  assert.equal(typeof discrepancies.getComparisonStatusLabel, 'function')
  if (typeof discrepancies.getComparisonStatusLabel !== 'function') return

  assert.equal(comparison.status, 'MATCH')
  assert.equal(discrepancies.getComparisonStatusLabel(comparison), 'Size tier match')
})

test('computeComparison treats missing Amazon fee as match when assigned size tiers match', () => {
  const comparison = discrepancies.computeComparison(createSkuRow(), 'US')

  assert.equal(comparison.status, 'MATCH')
  assert.equal(comparison.hasSizeTierMismatch, false)
})

test('UK shipping weight uses package weight when it exceeds dimensional weight', () => {
  const shipping = discrepancies.computeShippingWeights(
    { side1Cm: 5, side2Cm: 10, side3Cm: 10 },
    0.5,
    null,
    'UK'
  )

  assert.equal(shipping.dimensionalWeightKg, 0.1)
  assert.equal(shipping.shippingWeightKg, 0.5)
})

test('UK shipping weight uses dimensional weight when it exceeds package weight', () => {
  const shipping = discrepancies.computeShippingWeights(
    { side1Cm: 10, side2Cm: 20, side3Cm: 30 },
    0.5,
    null,
    'UK'
  )

  assert.equal(shipping.dimensionalWeightKg, 1.2)
  assert.equal(shipping.shippingWeightKg, 1.2)
})

test('buildComparisonSkuRow does not expose stored reference FBA fulfillment fee', () => {
  assert.equal(typeof discrepancies.buildComparisonSkuRow, 'function')
  if (typeof discrepancies.buildComparisonSkuRow !== 'function') return

  const resolved = discrepancies.buildComparisonSkuRow(
    createComparisonSkuSourceRow({
      sizeTier: 'Large Standard-Size',
    })
  )

  assert.equal(Object.prototype.hasOwnProperty.call(resolved, 'fbaFulfillmentFee'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(resolved, 'amazonFbaFulfillmentFee'), false)
  assert.equal(resolved.sizeTier, 'Large Standard-Size')
  assert.equal(resolved.referenceItemPackageWeightKg, 0.2)
})

test('live catalog merge preserves stored Amazon package data when package attributes are absent', () => {
  const merge = (discrepancies as unknown as Record<string, unknown>).mergeAmazonCatalogPackageData
  assert.equal(typeof merge, 'function')
  if (typeof merge !== 'function') return

  const storedAmazonRow = createSkuRow({
    amazonSizeTier: 'Large Envelope',
    amazonItemPackageDimensionsCm: '2.39x21.11x27',
    amazonItemPackageSide1Cm: 2.39,
    amazonItemPackageSide2Cm: 21.11,
    amazonItemPackageSide3Cm: 27,
    amazonItemPackageWeightKg: 0.331,
  })

  const resolved = merge(storedAmazonRow, {
    packageTriplet: null,
    packageWeightKg: null,
    sizeTier: null,
  }) as ApiSkuRow

  assert.equal(resolved.amazonSizeTier, 'Large Envelope')
  assert.equal(resolved.amazonItemPackageDimensionsCm, '2.39x21.11x27')
  assert.equal(resolved.amazonItemPackageSide1Cm, 2.39)
  assert.equal(resolved.amazonItemPackageSide2Cm, 21.11)
  assert.equal(resolved.amazonItemPackageSide3Cm, 27)
  assert.equal(resolved.amazonItemPackageWeightKg, 0.331)
})

test('SKU Info dimensions are side 1, side 2, side 3 ordered shortest to longest', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      referenceItemPackageSide1Cm: 27,
      referenceItemPackageSide2Cm: 21,
      referenceItemPackageSide3Cm: 1.7,
      amazonItemPackageSide1Cm: 27,
      amazonItemPackageSide2Cm: 2.39,
      amazonItemPackageSide3Cm: 21.11,
    }),
    'UK'
  )

  assert.deepEqual(comparison.reference.triplet, {
    side1Cm: 1.7,
    side2Cm: 21,
    side3Cm: 27,
  })
  assert.deepEqual(comparison.amazon.triplet, {
    side1Cm: 2.39,
    side2Cm: 21.11,
    side3Cm: 27,
  })
  assert.equal(
    formatDimensionTripletDisplayFromCm(comparison.reference.triplet, 'metric'),
    '1.7×21×27 cm'
  )
})

test('Amazon catalog package dimensions normalize to shortest middle longest sides', () => {
  const parsed = parseCatalogItemPackageDimensions({
    item_package_dimensions: [
      {
        length: { value: 27, unit: 'centimeters' },
        width: { value: 2.39, unit: 'centimeters' },
        height: { value: 21.11, unit: 'centimeters' },
      },
    ],
  })

  assert.deepEqual(parsed, {
    side1Cm: 2.39,
    side2Cm: 21.11,
    side3Cm: 27,
  })
})

test('FBA fee preview report normalizes Seller Central size tier bands and package measurements', () => {
  const report = [
    'sku\tasin\tlongest-side\tmedian-side\tshortest-side\tunit-of-dimension\titem-package-weight\tunit-of-weight\tproduct-size-weight-band',
    'CS 007\tB09HXC3NL8\t26.8\t21.0\t2.5\tcentimeters\t309.99\tgrams\tStandardEnvelope',
  ].join('\n')
  const rows = parseFbaFeePreviewReport(report, 'UK')
  const row = resolveFbaFeePreviewRow(rows, 'CS 007', 'B09HXC3NL8')

  assert.deepEqual(row, {
    sku: 'CS 007',
    asin: 'B09HXC3NL8',
    packageTriplet: {
      side1Cm: 2.5,
      side2Cm: 21,
      side3Cm: 26.8,
    },
    packageWeightKg: 0.3,
    sizeTier: 'Standard Envelope',
  })
})

test('Amazon report package measurements truncate down instead of rounding up', () => {
  const report = [
    'sku\tasin\tlongest-side\tmedian-side\tshortest-side\tunit-of-dimension\titem-package-weight\tunit-of-weight\tproduct-size-weight-band',
    'ROUNDING\tB0ROUNDING\t26.899\t21.009\t2.599\tcentimeters\t309.99\tgrams\tStandardEnvelope',
  ].join('\n')
  const rows = parseFbaFeePreviewReport(report, 'UK')
  const row = resolveFbaFeePreviewRow(rows, 'ROUNDING', 'B0ROUNDING')

  assert.equal(row?.packageTriplet?.side1Cm, 2.59)
  assert.equal(row?.packageTriplet?.side2Cm, 21)
  assert.equal(row?.packageTriplet?.side3Cm, 26.89)
  assert.equal(row?.packageWeightKg, 0.3)
})

test('SKU Info measurement display truncates down to two decimals instead of rounding', () => {
  assert.equal(
    formatDimensionTripletDisplayFromCm(
      { side1Cm: 2.599, side2Cm: 21.009, side3Cm: 26.899 },
      'metric'
    ),
    '2.59×21×26.89 cm'
  )
  assert.equal(formatWeightDisplayFromKg(0.30999, 'metric', 2), '0.3 kg')
})

test('SKU Info reference table uses inline edit controls for editable reference values only', () => {
  const talosRoot = path.resolve(__dirname, '..', '..')
  const pageSource = readFileSync(
    path.join(talosRoot, 'src/app/amazon/fba-fee-discrepancies/page.tsx'),
    'utf8'
  )

  assert.equal(pageSource.includes('Reference Input'), false)
  assert.equal(pageSource.includes('Edit reference data for'), false)
  assert.equal(pageSource.includes('Edit package sides for'), true)
  assert.equal(pageSource.includes('Edit package weight for'), true)
  assert.equal(pageSource.includes('Edit size tier for'), true)
  assert.equal(pageSource.includes('Edit dimensional weight for'), false)
  assert.equal(pageSource.includes('Edit shipping weight for'), false)
})

test('SKU Info API does not calculate Amazon size tier from catalog dimensions', () => {
  const talosRoot = path.resolve(__dirname, '..', '..')
  const routeSource = readFileSync(
    path.join(talosRoot, 'src/app/api/amazon/fba-fee-discrepancies/route.ts'),
    'utf8'
  )

  assert.equal(routeSource.includes('calculateSizeTierForTenant'), false)
  assert.equal(routeSource.includes('loadLatestFbaFeePreviewReportRows'), true)
})

test('assigned size tier option validation allows tenant options and rejects invalid names', () => {
  const ukSizeTiers = getSizeTierOptionsForTenant('UK')
  const firstUkTier = ukSizeTiers[0]
  assert.equal(isAllowedSizeTierForTenant('US', 'Small Bulky'), true)
  assert.equal(typeof firstUkTier, 'string')
  if (typeof firstUkTier !== 'string') return

  assert.equal(isAllowedSizeTierForTenant('UK', firstUkTier), true)
  assert.equal(isAllowedSizeTierForTenant('US', 'Invalid invented tier'), false)
})

test('computeComparison uses user-entered reference tier without recalculating from package sides', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      referenceItemPackageSide1Cm: 1,
      referenceItemPackageSide2Cm: 1,
      referenceItemPackageSide3Cm: 1,
      referenceItemPackageWeightKg: 0.01,
      sizeTier: 'Large Bulky',
      amazonSizeTier: 'Large Bulky',
    }),
    'US'
  )

  assert.equal(comparison.reference.sizeTier, 'Large Bulky')
  assert.equal(comparison.amazon.sizeTier, 'Large Bulky')
  assert.equal(comparison.status, 'MATCH')
  assert.equal(comparison.hasSizeTierMismatch, false)
})

test('buildComparisonSkuRow keeps user reference input separate from Amazon data', () => {
  const comparisonRow = discrepancies.buildComparisonSkuRow(
    createComparisonSkuSourceRow({
      sizeTier: 'Large Standard-Size',
      amazonSizeTier: 'Small Standard-Size',
      unitSide1Cm: 3,
      unitSide2Cm: 12,
      unitSide3Cm: 20,
      unitWeightKg: 0.44,
      amazonItemPackageSide1Cm: 2,
      amazonItemPackageSide2Cm: 10,
      amazonItemPackageSide3Cm: 18,
      amazonReferenceWeightKg: 0.31,
    })
  )
  const comparison = discrepancies.computeComparison(comparisonRow, 'US')

  assert.equal(comparison.reference.sizeTier, 'Large Standard-Size')
  assert.deepEqual(comparison.reference.triplet, {
    side1Cm: 3,
    side2Cm: 12,
    side3Cm: 20,
  })
  assert.equal(comparison.reference.shipping.unitWeightKg, 0.44)
  assert.equal(comparison.amazon.sizeTier, 'Small Standard-Size')
  assert.deepEqual(comparison.amazon.triplet, {
    side1Cm: 2,
    side2Cm: 10,
    side3Cm: 18,
  })
  assert.equal(comparison.amazon.shipping.unitWeightKg, 0.31)
  assert.equal(comparison.status, 'MISMATCH')
})

test('comparison labels come from size tier status only', () => {
  const mismatch = discrepancies.computeComparison(
    createSkuRow({
      sizeTier: 'Small Standard-Size',
      amazonSizeTier: 'Large Standard-Size',
    }),
    'US'
  )
  const missingAmazon = discrepancies.computeComparison(
    createSkuRow({
      amazonSizeTier: null,
    }),
    'US'
  )

  assert.equal(discrepancies.getComparisonStatusLabel(mismatch), 'Size tier mismatch')
  assert.equal(discrepancies.getComparisonStatusLabel(missingAmazon), 'No Amazon tier')
})

test('SKU Info summary data only returns nonzero compact status counts', () => {
  const helpers = discrepancies as unknown as Record<string, unknown>
  const summarizeComparisonStatuses = helpers.summarizeComparisonStatuses
  const buildComparisonSummaryItems = helpers.buildComparisonSummaryItems
  assert.equal(typeof summarizeComparisonStatuses, 'function')
  assert.equal(typeof buildComparisonSummaryItems, 'function')
  if (typeof summarizeComparisonStatuses !== 'function') return
  if (typeof buildComparisonSummaryItems !== 'function') return

  const rows = [
    {
      comparison: discrepancies.computeComparison(
        createSkuRow({
          id: 'sku_match',
          sizeTier: 'Small Standard-Size',
          amazonSizeTier: 'Small Standard-Size',
        }),
        'US'
      ),
    },
    {
      comparison: discrepancies.computeComparison(
        createSkuRow({
          id: 'sku_mismatch',
          sizeTier: 'Small Standard-Size',
          amazonSizeTier: 'Large Standard-Size',
        }),
        'US'
      ),
    },
    {
      comparison: discrepancies.computeComparison(
        createSkuRow({
          id: 'sku_missing_amazon',
          amazonSizeTier: null,
        }),
        'US'
      ),
    },
  ]

  const summary = summarizeComparisonStatuses(rows)
  const summaryItems = buildComparisonSummaryItems(summary)

  assert.deepEqual(summary, {
    mismatch: 1,
    match: 1,
    warning: 1,
    pending: 0,
  })
  assert.deepEqual(summaryItems, [
    { key: 'mismatch', count: 1, label: 'mismatch' },
    { key: 'match', count: 1, label: 'match' },
    { key: 'warning', count: 1, label: 'warning' },
  ])
  assert.deepEqual(
    buildComparisonSummaryItems({
      mismatch: 0,
      match: 0,
      warning: 0,
      pending: 0,
    }),
    []
  )
})

test('reference input normalizes US inches and pounds before database storage', () => {
  const normalized = normalizeReferenceInputForStorage({
    inputUnitSystem: 'imperial',
    unitSide1: 1,
    unitSide2: 8,
    unitSide3: 10,
    unitWeight: 1,
  })

  assert.deepEqual(normalized.storage.unitDimensionsCm, '2.54x20.32x25.4')
  assert.equal(normalized.storage.unitSide1Cm, 2.54)
  assert.equal(normalized.storage.unitSide2Cm, 20.32)
  assert.equal(normalized.storage.unitSide3Cm, 25.4)
  assert.equal(normalized.storage.unitWeightKg, 0.45)
})

test('reference input keeps UK centimeters and kilograms before database storage', () => {
  const normalized = normalizeReferenceInputForStorage({
    inputUnitSystem: 'metric',
    unitSide1: 2.5,
    unitSide2: 20,
    unitSide3: 30,
    unitWeight: 0.75,
  })

  assert.deepEqual(normalized.storage, {
    unitDimensionsCm: '2.5x20x30',
    unitSide1Cm: 2.5,
    unitSide2Cm: 20,
    unitSide3Cm: 30,
    unitWeightKg: 0.75,
  })
})

test('reference input unit system is scoped to the active tenant', () => {
  assert.equal(isReferenceInputUnitSystemAllowedForTenant('US', 'imperial'), true)
  assert.equal(isReferenceInputUnitSystemAllowedForTenant('US', 'metric'), false)
  assert.equal(isReferenceInputUnitSystemAllowedForTenant('UK', 'metric'), true)
  assert.equal(isReferenceInputUnitSystemAllowedForTenant('UK', 'imperial'), false)
})
