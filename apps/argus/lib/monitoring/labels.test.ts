import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMonitoringLabel } from './labels'

test('formatMonitoringLabel includes variant size with brand', () => {
  assert.equal(
    formatMonitoringLabel({
      asin: 'B09HXC3NL8',
      brand: 'Caelum star',
      size: '6 PK - Light',
      title: 'Caelum Star 6 Pack 12x9 ft Extra Large Plastic Drop Cloth',
    }),
    'Caelum star - 6 PK - Light',
  )
})

test('formatMonitoringLabel uses title identity before brand when size is missing', () => {
  assert.equal(
    formatMonitoringLabel({
      asin: 'B09HXC3NL8',
      brand: 'Caelum star',
      title: 'Caelum Star 6 Pack 12x9 ft Extra Large Plastic Drop Cloth',
    }),
    '6 Pack 12x9 ft Extra Large',
  )
})

test('formatMonitoringLabel uses known ASIN names when label lookup only has the ASIN', () => {
  assert.equal(
    formatMonitoringLabel({
      asin: 'B0CWS3848Y',
    }),
    'Ecotez 6 Pack 12 x 9 ft Plastic Drop Cloth',
  )
})
