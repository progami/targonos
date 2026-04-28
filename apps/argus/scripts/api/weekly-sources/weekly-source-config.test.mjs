import assert from 'node:assert/strict'
import test from 'node:test'

import { wprSourceConfigForMarket } from './lib/common.mjs'

function withEnv(values, callback) {
  const previous = new Map()
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return callback()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test('wprSourceConfigForMarket resolves explicit UK report identity', () => {
  const config = withEnv({
    WPR_HERO_ASIN_UK: 'B09HXC3NL8',
    WPR_COMPETITOR_ASIN_UK: 'B08QZHS7V6',
    WPR_COMPETITOR_BRAND_UK: 'ARVO',
    DATADIVE_NICHE_ID_UK: 'NqAfkOXzuP',
    ARGUS_OUR_ASINS_UK: 'B09HXC3NL8,B0C7ZQ3VZL',
    ARGUS_COMPETITOR_MAIN_ASINS_UK: 'B08QZHS7V6,B09SZJ2MC8',
    ARGUS_HERO_BSR_ASINS_UK: 'B09HXC3NL8,B08QZHS7V6',
  }, () => wprSourceConfigForMarket('uk'))

  assert.deepEqual(config, {
    market: 'uk',
    heroAsin: 'B09HXC3NL8',
    competitorAsin: 'B08QZHS7V6',
    competitorBrand: 'ARVO',
    datadiveNicheId: 'NqAfkOXzuP',
    listingOurAsins: ['B09HXC3NL8', 'B0C7ZQ3VZL'],
    listingCompetitorSeedAsins: ['B08QZHS7V6', 'B09SZJ2MC8'],
    listingHeroBsrAsins: ['B09HXC3NL8', 'B08QZHS7V6'],
  })
})

test('wprSourceConfigForMarket hard-fails missing market-specific identity', () => {
  withEnv({
    WPR_HERO_ASIN_UK: '',
    WPR_COMPETITOR_ASIN_UK: 'B08QZHS7V6',
    WPR_COMPETITOR_BRAND_UK: 'ARVO',
    DATADIVE_NICHE_ID_UK: 'NqAfkOXzuP',
    ARGUS_OUR_ASINS_UK: 'B09HXC3NL8',
    ARGUS_COMPETITOR_MAIN_ASINS_UK: 'B08QZHS7V6',
    ARGUS_HERO_BSR_ASINS_UK: 'B09HXC3NL8',
  }, () => {
    assert.throws(
      () => wprSourceConfigForMarket('uk'),
      /WPR_HERO_ASIN_UK/,
    )
  })
})
