import test from 'node:test'
import assert from 'node:assert/strict'
import {
  applyWeekScopedPatch,
  captureWeekScopedState,
  createInitialDashboardState,
  getInitialWprTab,
  getLegacyWprRedirect,
  migrateWprDashboardState,
  switchDashboardWeek,
  toggleSetMember,
  WPR_TABS,
  wprStateReviver,
  wprStateReplacer,
  type WprTab,
} from './dashboard-state'

test('createInitialDashboardState matches the HTML defaults', () => {
  const state = createInitialDashboardState('W16')

  assert.equal(state.activeTab, 'sqp' satisfies WprTab)
  assert.equal(state.selectedWeek, 'W16')
  assert.equal(state.selectedClusterId, null)
  assert.deepEqual([...state.selectedSqpRootIds], [])
  assert.equal(state.compareOrganicMode, 'map')
  assert.deepEqual(state.weekStateByWeek, {})
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

test('legacy competitor route maps to the TST tab', () => {
  assert.equal(getLegacyWprRedirect('/wpr/competitor'), '/wpr?tab=tst')
})

test('missing query params default the shell to SQP', () => {
  assert.equal(getInitialWprTab(new URLSearchParams()), 'sqp')
})

test('brand query param opens the Brand WPR tab', () => {
  assert.equal(getInitialWprTab(new URLSearchParams('tab=brand')), 'brand')
})

test('brand metrics tab is labeled BM in the WPR navigation', () => {
  assert.deepEqual(WPR_TABS.find((tab) => tab.id === 'brand'), { id: 'brand', label: 'BM' })
})

test('switchDashboardWeek snapshots the current week and clears state for an uncached week', () => {
  const state = createInitialDashboardState('W16')
  state.selectedClusterId = 'cluster-a'
  state.selectedSqpRootIds = new Set(['cluster-a'])
  state.selectedSqpTermIds = new Set(['term-a'])
  state.expandedSqpRootIds = new Set(['cluster-a'])
  state.hasInitializedSqpSelection = true
  state.selectedScpAsinIds = new Set(['asin-a'])
  state.hasInitializedScpSelection = true

  const next = switchDashboardWeek(state, 'W15')

  assert.equal(next.selectedWeek, 'W15')
  assert.deepEqual([...next.selectedSqpRootIds], [])
  assert.deepEqual([...next.selectedSqpTermIds], [])
  assert.equal(next.hasInitializedSqpSelection, false)
  assert.deepEqual([...next.selectedScpAsinIds], [])
  assert.equal(next.hasInitializedScpSelection, false)

  const previousWeekState = next.weekStateByWeek.W16
  if (previousWeekState === undefined) {
    throw new Error('Missing previous week snapshot')
  }

  assert.equal(previousWeekState.selectedClusterId, 'cluster-a')
  assert.deepEqual([...previousWeekState.selectedSqpRootIds], ['cluster-a'])
  assert.deepEqual([...previousWeekState.selectedScpAsinIds], ['asin-a'])
})

test('switchDashboardWeek restores a cached week snapshot', () => {
  const state = createInitialDashboardState('W16')
  state.weekStateByWeek.W14 = {
    ...captureWeekScopedState(state),
    selectedClusterId: 'cluster-b',
    selectedSqpRootIds: new Set(['cluster-b']),
    selectedSqpTermIds: new Set(['term-b']),
    hasInitializedSqpSelection: true,
    selectedCompetitorRootIds: new Set(['root-b']),
    hasInitializedCompetitorSelection: true,
  }

  const next = switchDashboardWeek(state, 'W14')

  assert.equal(next.selectedWeek, 'W14')
  assert.equal(next.selectedClusterId, 'cluster-b')
  assert.deepEqual([...next.selectedSqpRootIds], ['cluster-b'])
  assert.deepEqual([...next.selectedSqpTermIds], ['term-b'])
  assert.equal(next.hasInitializedSqpSelection, true)
  assert.deepEqual([...next.selectedCompetitorRootIds], ['root-b'])
  assert.equal(next.hasInitializedCompetitorSelection, true)
})

test('applyWeekScopedPatch keeps the current week snapshot in sync', () => {
  const state = createInitialDashboardState('W16')

  const patch = applyWeekScopedPatch(state, {
    selectedClusterId: 'cluster-c',
    selectedSqpRootIds: new Set(['cluster-c']),
    selectedSqpTermIds: new Set(['term-c']),
    hasInitializedSqpSelection: true,
  })

  const cachedWeekState = patch.weekStateByWeek?.W16
  if (cachedWeekState === undefined) {
    throw new Error('Missing synced week snapshot')
  }

  assert.equal(cachedWeekState.selectedClusterId, 'cluster-c')
  assert.deepEqual([...cachedWeekState.selectedSqpRootIds], ['cluster-c'])
  assert.deepEqual([...cachedWeekState.selectedSqpTermIds], ['term-c'])
  assert.equal(cachedWeekState.hasInitializedSqpSelection, true)
})

test('WPR state JSON replacer and reviver preserve Set-backed fields', () => {
  const state = createInitialDashboardState('W16')
  state.selectedSqpRootIds = new Set(['cluster-a'])
  state.weekStateByWeek.W16 = captureWeekScopedState(state)

  const roundTrip = JSON.parse(
    JSON.stringify(state, wprStateReplacer),
    wprStateReviver,
  ) as typeof state

  assert.ok(roundTrip.selectedSqpRootIds instanceof Set)
  assert.deepEqual([...roundTrip.selectedSqpRootIds], ['cluster-a'])
  assert.ok(roundTrip.weekStateByWeek.W16?.selectedSqpRootIds instanceof Set)
  assert.deepEqual([...roundTrip.weekStateByWeek.W16!.selectedSqpRootIds], ['cluster-a'])
})

test('WPR persisted state migration reopens initialized empty SQP selections', () => {
  const state = createInitialDashboardState('W16')
  state.hasInitializedSqpSelection = true
  state.weekStateByWeek.W16 = {
    ...captureWeekScopedState(state),
    hasInitializedSqpSelection: true,
  }

  const migrated = migrateWprDashboardState(state, 1) as typeof state

  assert.equal(migrated.hasInitializedSqpSelection, false)
  assert.equal(migrated.weekStateByWeek.W16?.hasInitializedSqpSelection, false)
})

test('WPR persisted state migration preserves non-empty SQP selections', () => {
  const state = createInitialDashboardState('W16')
  state.selectedSqpRootIds = new Set(['cluster-a'])
  state.selectedSqpTermIds = new Set(['term-a'])
  state.hasInitializedSqpSelection = true

  const migrated = migrateWprDashboardState(state, 1) as typeof state

  assert.equal(migrated.hasInitializedSqpSelection, true)
  assert.deepEqual([...migrated.selectedSqpRootIds], ['cluster-a'])
  assert.deepEqual([...migrated.selectedSqpTermIds], ['term-a'])
})
