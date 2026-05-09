import test from 'node:test'
import assert from 'node:assert/strict'
import { buildTrackingAsinSeedsFromEnv, normalizeTrackingAsinSeeds } from './seeds'

test('buildTrackingAsinSeedsFromEnv reads the market-specific Argus ASIN lists', () => {
  const seeds = buildTrackingAsinSeedsFromEnv(
    {
      ARGUS_OUR_ASINS_UK: 'B09HXC3NL8, B0C7ZQ3VZL',
      ARGUS_COMPETITOR_MAIN_ASINS_UK: 'B08QZHS7V6|B09SZJ2MC8',
      ARGUS_OUR_ASINS_US: 'B0FLKJ7WWM',
      ARGUS_COMPETITOR_MAIN_ASINS_US: 'B0DQDWV1SV',
    },
    'uk',
  )

  assert.deepEqual(
    seeds.map((seed) => [seed.asin, seed.ownership]),
    [
      ['B09HXC3NL8', 'OURS'],
      ['B0C7ZQ3VZL', 'OURS'],
      ['B08QZHS7V6', 'COMPETITOR'],
      ['B09SZJ2MC8', 'COMPETITOR'],
    ],
  )
  assert.equal(seeds[0].label, 'Caelum Star 6 Pack 12x9 ft Extra Large')
})

test('buildTrackingAsinSeedsFromEnv fails when the market list is missing', () => {
  assert.throws(
    () => buildTrackingAsinSeedsFromEnv({ ARGUS_OUR_ASINS_UK: 'B09HXC3NL8' }, 'uk'),
    /ARGUS_COMPETITOR_MAIN_ASINS_UK/,
  )
})

test('normalizeTrackingAsinSeeds rejects duplicate ASINs across owners', () => {
  assert.throws(
    () =>
      normalizeTrackingAsinSeeds([
        { asin: 'B09HXC3NL8', ownership: 'OURS', label: 'Dust Sheet' },
        { asin: 'b09hxc3nl8', ownership: 'COMPETITOR', label: 'Duplicate' },
      ]),
    /Duplicate tracked ASIN seed: B09HXC3NL8/,
  )
})
