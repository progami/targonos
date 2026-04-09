import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getCaseAccentTextColor,
  getCaseActiveDateBackgroundColor,
  getCaseActiveDateBorderColor,
  getCaseDividerColor,
  getCaseDividerStrongColor,
  getCaseTone,
} from './theme'

test('getCaseTone returns brighter dark-mode accents', () => {
  assert.deepEqual(getCaseTone('Action due', 'dark'), {
    color: '#ff8f80',
    tint: 'rgba(255, 143, 128, 0.14)',
    line: 'rgba(255, 143, 128, 0.34)',
  })
  assert.deepEqual(getCaseTone('Watching', 'dark'), {
    color: '#63ddd7',
    tint: 'rgba(99, 221, 215, 0.14)',
    line: 'rgba(99, 221, 215, 0.28)',
  })
})

test('case brief chrome colors stay theme-aware', () => {
  assert.equal(getCaseAccentTextColor('light'), '#0b5c58')
  assert.equal(getCaseAccentTextColor('dark'), '#7ce7e0')
  assert.equal(getCaseDividerColor('light'), 'rgba(0, 44, 81, 0.08)')
  assert.equal(getCaseDividerColor('dark'), 'rgba(255, 255, 255, 0.08)')
  assert.equal(getCaseDividerStrongColor('light'), 'rgba(0, 44, 81, 0.12)')
  assert.equal(getCaseDividerStrongColor('dark'), 'rgba(255, 255, 255, 0.12)')
  assert.equal(getCaseActiveDateBorderColor('light'), 'rgba(0, 44, 81, 0.26)')
  assert.equal(getCaseActiveDateBorderColor('dark'), 'rgba(127, 232, 225, 0.28)')
  assert.equal(getCaseActiveDateBackgroundColor('light'), 'rgba(0, 44, 81, 0.06)')
  assert.equal(getCaseActiveDateBackgroundColor('dark'), 'rgba(255, 255, 255, 0.05)')
})
