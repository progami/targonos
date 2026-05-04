import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  CARTON_DIMENSION_UNIT_SYSTEM,
  convertLengthToCm,
  formatLengthFromCm,
  getDefaultUnitSystem,
  getLengthUnitLabel,
} from '../../src/lib/measurements'

test('US carton dimensions stay metric for inbound entry', () => {
  assert.equal(getDefaultUnitSystem('US'), 'imperial')
  assert.equal(CARTON_DIMENSION_UNIT_SYSTEM, 'metric')
  assert.equal(getLengthUnitLabel(CARTON_DIMENSION_UNIT_SYSTEM), 'cm')
  assert.equal(convertLengthToCm(27.99, CARTON_DIMENSION_UNIT_SYSTEM), 27.99)
  assert.equal(formatLengthFromCm(27.99, CARTON_DIMENSION_UNIT_SYSTEM), '27.99')
})

test('inbound carton size controls use metric carton units instead of tenant package units', () => {
  const talosRoot = path.resolve(__dirname, '..', '..')
  const source = readFileSync(
    path.join(talosRoot, 'src/components/inbound/inbound-flow.tsx'),
    'utf8'
  )

  assert.equal(source.includes('const cartonUnitSystem = CARTON_DIMENSION_UNIT_SYSTEM'), true)
  assert.equal(source.includes('const cartonLengthUnit = getLengthUnitLabel(cartonUnitSystem)'), true)
  assert.equal(source.includes('Carton Size ({cartonLengthUnit})'), true)
  assert.equal(source.includes('Carton Size ({lengthUnit})'), false)
  assert.equal(source.includes('cartonSide1Cm: convertLengthToCm(side1, unitSystem)'), false)
  assert.equal(source.includes('formatLengthFromCm(line.cartonSide1Cm, unitSystem)'), false)
  assert.equal(source.includes('cartonSide1Cm: convertLengthToCm(side1, cartonUnitSystem)'), true)
  assert.equal(source.includes('formatLengthFromCm(line.cartonSide1Cm, cartonUnitSystem)'), true)
})
