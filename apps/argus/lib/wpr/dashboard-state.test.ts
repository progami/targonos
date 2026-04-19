import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createInitialDashboardState,
  toggleSetMember,
  type WprTab,
} from './dashboard-state'

test('createInitialDashboardState matches the HTML defaults', () => {
  const state = createInitialDashboardState('W16')

  assert.equal(state.activeTab, 'sqp' satisfies WprTab)
  assert.equal(state.selectedWeek, 'W16')
  assert.equal(state.selectedClusterId, null)
  assert.deepEqual([...state.selectedSqpRootIds], [])
  assert.equal(state.compareOrganicMode, 'map')
  assert.deepEqual(state.scpWowVisible, {
    ctr: true,
    atc: true,
    purch: true,
    cvr: true,
  })
})

test('toggleSetMember adds then removes a selected id', () => {
  const first = toggleSetMember(new Set<string>(), 'cluster-a')
  const second = toggleSetMember(first, 'cluster-a')

  assert.deepEqual([...first], ['cluster-a'])
  assert.deepEqual([...second], [])
})
