import assert from 'node:assert/strict'
import test from 'node:test'

import * as discrepancies from '../../src/lib/amazon/fba-fee-discrepancies'
import type { ApiSkuRow } from '../../src/lib/amazon/fba-fee-discrepancies'
import { calculateFbaFeeForTenant, calculateSizeTierForTenant } from '../../src/lib/amazon/fees'

function createSkuRow(overrides: Partial<ApiSkuRow> = {}): ApiSkuRow {
  const referenceTriplet = {
    side1Cm: 10,
    side2Cm: 10,
    side3Cm: 10,
  }
  const referenceWeightKg = 0.2

  return {
    id: 'sku_1',
    skuCode: 'CS-010',
    description: 'Test SKU',
    asin: 'B000TEST01',
    fbaFulfillmentFee: 3.21,
    amazonFbaFulfillmentFee: 3.21,
    amazonListingPrice: 19.99,
    amazonSizeTier: calculateSizeTierForTenant(
      'US',
      referenceTriplet.side1Cm,
      referenceTriplet.side2Cm,
      referenceTriplet.side3Cm,
      referenceWeightKg
    ),
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

test('computeComparison marks identical fees with different Amazon package measurements as mismatch', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      amazonItemPackageSide1Cm: 12,
      amazonItemPackageSide2Cm: 10,
      amazonItemPackageSide3Cm: 10,
    }),
    'US'
  )

  assert.equal(comparison.status, 'MISMATCH')
  assert.equal(comparison.hasPhysicalMismatch, true)
  assert.equal(comparison.feeDifference, 0)
})

test('computeComparison marks incomplete Amazon comparison data as error', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      amazonSizeTier: null,
    }),
    'US'
  )

  assert.equal(comparison.status, 'ERROR')
  assert.deepEqual(comparison.amazon.missingFields, ['Amazon size tier'])
})

test('status label shows physical mismatch when fees still align', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      amazonItemPackageSide1Cm: 12,
      amazonItemPackageSide2Cm: 10,
      amazonItemPackageSide3Cm: 10,
    }),
    'US'
  )

  assert.equal(typeof discrepancies.getComparisonStatusLabel, 'function')
  if (typeof discrepancies.getComparisonStatusLabel !== 'function') return

  assert.equal(discrepancies.getComparisonStatusLabel(comparison), 'Physical mismatch')
})

test('status label shows overcharge when only the fee differs', () => {
  const comparison = discrepancies.computeComparison(
    createSkuRow({
      amazonFbaFulfillmentFee: 3.71,
    }),
    'US'
  )

  assert.equal(typeof discrepancies.getComparisonStatusLabel, 'function')
  if (typeof discrepancies.getComparisonStatusLabel !== 'function') return

  assert.equal(discrepancies.getComparisonStatusLabel(comparison), 'Overcharge')
})

test('hydrateComparisonSkuRow derives the reference fee instead of trusting the stored value', async () => {
  assert.equal(typeof discrepancies.hydrateComparisonSkuRow, 'function')
  if (typeof discrepancies.hydrateComparisonSkuRow !== 'function') return

  const listingPrice = 19.99
  const sizeTier = calculateSizeTierForTenant('US', 10, 10, 10, 0.2)
  assert.notEqual(sizeTier, null)
  if (sizeTier === null) return

  const expectedReferenceFee = calculateFbaFeeForTenant('US', {
    side1Cm: 10,
    side2Cm: 10,
    side3Cm: 10,
    unitWeightKg: 0.2,
    listingPrice,
    sizeTier,
  })

  const hydrated = await discrepancies.hydrateComparisonSkuRow(
    createSkuRow({
      fbaFulfillmentFee: 99.99,
      amazonFbaFulfillmentFee: 88.88,
    }),
    'US',
    {
      loadListingPrice: async () => listingPrice,
      loadAmazonFees: async () => ({ fbaFees: 7.77, sizeTier: null }),
    }
  )

  assert.equal(hydrated.fbaFulfillmentFee, expectedReferenceFee)
  assert.equal(hydrated.amazonFbaFulfillmentFee, 7.77)
})

test('hydrateComparisonSkuRow uses the live Amazon fee even when the stored fee disagrees', async () => {
  assert.equal(typeof discrepancies.hydrateComparisonSkuRow, 'function')
  if (typeof discrepancies.hydrateComparisonSkuRow !== 'function') return

  const hydrated = await discrepancies.hydrateComparisonSkuRow(
    createSkuRow({
      fbaFulfillmentFee: 2.22,
      amazonFbaFulfillmentFee: 55.55,
      amazonSizeTier: 'Large Standard-Size',
    }),
    'US',
    {
      loadListingPrice: async () => 24.5,
      loadAmazonFees: async () => ({ fbaFees: 6.66, sizeTier: 'Small Bulky' }),
    }
  )

  assert.equal(hydrated.amazonFbaFulfillmentFee, 6.66)
  assert.equal(hydrated.amazonSizeTier, 'Small Bulky')
})
