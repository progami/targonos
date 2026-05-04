import type { WeekLabel } from './types'

export type WprTab = 'sqp' | 'scp' | 'br' | 'tst' | 'brand' | 'changelog' | 'compare' | 'sources'
export type WprCompareOrganicMode = 'map' | 'trend'
export type WprSortDirection = 'asc' | 'desc'

type SearchParamLike = {
  get: (key: string) => string | null
}

export interface WprSortState {
  key: string
  dir: WprSortDirection
}

export interface WprSqpWowVisible {
  impr: boolean
  ctr: boolean
  atc: boolean
  cvr: boolean
}

export interface WprScpWowVisible {
  ctr: boolean
  atc: boolean
  purch: boolean
  cvr: boolean
}

export interface WprBrWowVisible {
  sessions: boolean
  order_items: boolean
  unit_session: boolean
}

export interface WprCompWowVisible {
  click: boolean
  purch: boolean
}

export interface WprWeekScopedState {
  selectedClusterId: string | null
  selectedSqpRootIds: Set<string>
  selectedSqpTermIds: Set<string>
  expandedSqpRootIds: Set<string>
  hasInitializedSqpSelection: boolean
  selectedScpAsinIds: Set<string>
  hasInitializedScpSelection: boolean
  selectedBusinessReportAsinIds: Set<string>
  hasInitializedBusinessReportSelection: boolean
  selectedCompetitorRootIds: Set<string>
  selectedCompetitorTermIds: Set<string>
  expandedCompetitorRootIds: Set<string>
  hasInitializedCompetitorSelection: boolean
}

export const WPR_TABS = [
  { id: 'sqp', label: 'SQP' },
  { id: 'scp', label: 'SCP' },
  { id: 'br', label: 'BR' },
  { id: 'tst', label: 'TST' },
  { id: 'brand', label: 'BM' },
  { id: 'changelog', label: 'Change Log' },
  { id: 'compare', label: 'Compare' },
  { id: 'sources', label: 'Sources' },
] as const satisfies ReadonlyArray<{ id: WprTab; label: string }>

export interface WprDashboardState extends WprWeekScopedState {
  activeTab: WprTab
  selectedWeek: WeekLabel | null
  weekStateByWeek: Partial<Record<WeekLabel, WprWeekScopedState>>
  compareOrganicMode: WprCompareOrganicMode
  sqpTableSort: WprSortState
  scpTableSort: WprSortState
  brTableSort: WprSortState
  competitorTableSort: WprSortState
  sqpWowVisible: WprSqpWowVisible
  scpWowVisible: WprScpWowVisible
  brWowVisible: WprBrWowVisible
  compWowVisible: WprCompWowVisible
}

const WPR_SET_TAG = '__wprSetValues'

type SerializedWprSet = {
  [WPR_SET_TAG]: string[]
}

function cloneSet(ids: Set<string>): Set<string> {
  return new Set(ids)
}

function isSerializedWprSet(value: unknown): value is SerializedWprSet {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  return WPR_SET_TAG in value && Array.isArray((value as SerializedWprSet)[WPR_SET_TAG])
}

export function createEmptyWeekScopedState(): WprWeekScopedState {
  return {
    selectedClusterId: null,
    selectedSqpRootIds: new Set<string>(),
    selectedSqpTermIds: new Set<string>(),
    expandedSqpRootIds: new Set<string>(),
    hasInitializedSqpSelection: false,
    selectedScpAsinIds: new Set<string>(),
    hasInitializedScpSelection: false,
    selectedBusinessReportAsinIds: new Set<string>(),
    hasInitializedBusinessReportSelection: false,
    selectedCompetitorRootIds: new Set<string>(),
    selectedCompetitorTermIds: new Set<string>(),
    expandedCompetitorRootIds: new Set<string>(),
    hasInitializedCompetitorSelection: false,
  }
}

export function captureWeekScopedState(state: WprWeekScopedState): WprWeekScopedState {
  return {
    selectedClusterId: state.selectedClusterId,
    selectedSqpRootIds: cloneSet(state.selectedSqpRootIds),
    selectedSqpTermIds: cloneSet(state.selectedSqpTermIds),
    expandedSqpRootIds: cloneSet(state.expandedSqpRootIds),
    hasInitializedSqpSelection: state.hasInitializedSqpSelection,
    selectedScpAsinIds: cloneSet(state.selectedScpAsinIds),
    hasInitializedScpSelection: state.hasInitializedScpSelection,
    selectedBusinessReportAsinIds: cloneSet(state.selectedBusinessReportAsinIds),
    hasInitializedBusinessReportSelection: state.hasInitializedBusinessReportSelection,
    selectedCompetitorRootIds: cloneSet(state.selectedCompetitorRootIds),
    selectedCompetitorTermIds: cloneSet(state.selectedCompetitorTermIds),
    expandedCompetitorRootIds: cloneSet(state.expandedCompetitorRootIds),
    hasInitializedCompetitorSelection: state.hasInitializedCompetitorSelection,
  }
}

export function applyWeekScopedPatch(
  state: WprDashboardState,
  patch: Partial<WprDashboardState>,
): Partial<WprDashboardState> {
  const mergedState = {
    ...state,
    ...patch,
  } satisfies WprDashboardState

  if (mergedState.selectedWeek === null) {
    return patch
  }

  return {
    ...patch,
    weekStateByWeek: {
      ...mergedState.weekStateByWeek,
      [mergedState.selectedWeek]: captureWeekScopedState(mergedState),
    },
  }
}

export function switchDashboardWeek(
  state: WprDashboardState,
  nextWeek: WeekLabel,
): Pick<WprDashboardState, 'selectedWeek' | 'weekStateByWeek'> & WprWeekScopedState {
  if (state.selectedWeek === nextWeek) {
    return {
      selectedWeek: nextWeek,
      weekStateByWeek: state.weekStateByWeek,
      ...captureWeekScopedState(state),
    }
  }

  const weekStateByWeek: Partial<Record<WeekLabel, WprWeekScopedState>> = {
    ...state.weekStateByWeek,
  }
  if (state.selectedWeek !== null) {
    weekStateByWeek[state.selectedWeek] = captureWeekScopedState(state)
  }

  const nextWeekState = weekStateByWeek[nextWeek]

  return {
    selectedWeek: nextWeek,
    weekStateByWeek,
    ...(nextWeekState === undefined ? createEmptyWeekScopedState() : captureWeekScopedState(nextWeekState)),
  }
}

export function wprStateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Set) {
    return {
      [WPR_SET_TAG]: Array.from(value),
    }
  }

  return value
}

export function wprStateReviver(_key: string, value: unknown): unknown {
  if (isSerializedWprSet(value)) {
    return new Set(value[WPR_SET_TAG])
  }

  return value
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function shouldResetInitializedEmptySqpSelection(state: Record<string, unknown>): boolean {
  return state.hasInitializedSqpSelection === true
    && state.selectedSqpRootIds instanceof Set
    && state.selectedSqpRootIds.size === 0
    && state.selectedSqpTermIds instanceof Set
    && state.selectedSqpTermIds.size === 0
}

function resetInitializedEmptySqpSelection<T extends Record<string, unknown>>(state: T): T {
  if (!shouldResetInitializedEmptySqpSelection(state)) {
    return state
  }

  return {
    ...state,
    hasInitializedSqpSelection: false,
  }
}

export function migrateWprDashboardState(persistedState: unknown, persistedVersion: number): unknown {
  if (persistedVersion >= 2) {
    return persistedState
  }

  if (!isObjectRecord(persistedState)) {
    return persistedState
  }

  const nextState = resetInitializedEmptySqpSelection(persistedState)
  if (!isObjectRecord(nextState.weekStateByWeek)) {
    return nextState
  }

  const nextWeekStateByWeek: Record<string, unknown> = {}
  for (const [weekLabel, weekState] of Object.entries(nextState.weekStateByWeek)) {
    if (isObjectRecord(weekState)) {
      nextWeekStateByWeek[weekLabel] = resetInitializedEmptySqpSelection(weekState)
    } else {
      nextWeekStateByWeek[weekLabel] = weekState
    }
  }

  return {
    ...nextState,
    weekStateByWeek: nextWeekStateByWeek,
  }
}

export function createInitialDashboardState(defaultWeek: WeekLabel | null): WprDashboardState {
  return {
    activeTab: 'sqp',
    selectedWeek: defaultWeek,
    weekStateByWeek: {},
    ...createEmptyWeekScopedState(),
    compareOrganicMode: 'map',
    sqpTableSort: { key: 'query_volume', dir: 'desc' },
    scpTableSort: { key: 'purchases', dir: 'desc' },
    brTableSort: { key: 'sessions', dir: 'desc' },
    competitorTableSort: { key: 'competitor_purchase_share', dir: 'desc' },
    sqpWowVisible: { impr: true, ctr: true, atc: true, cvr: true },
    scpWowVisible: { ctr: true, atc: true, purch: true, cvr: true },
    brWowVisible: { sessions: true, order_items: true, unit_session: true },
    compWowVisible: { click: true, purch: true },
  }
}

export function isWprTab(value: string | null): value is WprTab {
  return WPR_TABS.some((tab) => tab.id === value)
}

export function getInitialWprTab(searchParams: SearchParamLike): WprTab {
  const tab = searchParams.get('tab')
  if (isWprTab(tab)) {
    return tab
  }

  return 'sqp'
}

export function getLegacyWprRedirect(pathname: string): string {
  if (pathname === '/wpr/compare') {
    return '/wpr?tab=compare'
  }

  if (pathname === '/wpr/competitor') {
    return '/wpr?tab=tst'
  }

  if (pathname === '/wpr/changelog') {
    return '/wpr?tab=changelog'
  }

  if (pathname === '/wpr/sources') {
    return '/wpr?tab=sources'
  }

  return '/wpr'
}

export function toggleSetMember(current: Set<string>, member: string): Set<string> {
  const next = new Set(current)
  if (next.has(member)) {
    next.delete(member)
    return next
  }

  next.add(member)
  return next
}
