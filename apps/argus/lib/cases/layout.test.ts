import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CASES_DRILLDOWN_DESKTOP_GRID_COLUMNS,
  CASES_DRILLDOWN_RIGHT_RAIL_DESKTOP_ROWS,
  CASE_ACTIVITY_TABLE_DESKTOP_HEIGHT,
  CASE_DETAIL_BODY_FONT_SIZE,
  CASE_DETAIL_BODY_LINE_HEIGHT,
  CASE_DETAIL_PANEL_DESKTOP_MIN_HEIGHT,
  CASE_SELECTOR_DESKTOP_COLUMN_WIDTHS,
  CASE_SELECTOR_TABLE_DESKTOP_HEIGHT,
  CASE_SELECTOR_TABLE_MIN_HEIGHT,
  CASE_SELECTOR_TABLE_OVERFLOW,
} from './layout'

test('case selector desktop widths prioritize subject visibility', () => {
  assert.deepEqual(CASE_SELECTOR_DESKTOP_COLUMN_WIDTHS, [
    '46%',
    '14%',
    '18%',
    '14%',
    '8%',
  ])
  assert.equal(CASE_SELECTOR_TABLE_MIN_HEIGHT, 320)
  assert.equal(CASE_SELECTOR_TABLE_DESKTOP_HEIGHT, 'auto')
  assert.equal(CASE_SELECTOR_TABLE_OVERFLOW, 'hidden')
})

test('cases desktop layout keeps the right rail height stable', () => {
  assert.equal(CASES_DRILLDOWN_DESKTOP_GRID_COLUMNS, 'minmax(420px, 1.04fr) minmax(0, 1.72fr)')
  assert.equal(CASE_ACTIVITY_TABLE_DESKTOP_HEIGHT, 440)
  assert.equal(CASE_DETAIL_PANEL_DESKTOP_MIN_HEIGHT, 368)
  assert.equal(CASES_DRILLDOWN_RIGHT_RAIL_DESKTOP_ROWS, '440px minmax(368px, auto)')
  assert.equal(CASE_DETAIL_BODY_FONT_SIZE, '0.98rem')
  assert.equal(CASE_DETAIL_BODY_LINE_HEIGHT, 1.72)
})
