import type { WeekLabel } from './types'

export type WprTab = 'sqp' | 'scp' | 'br' | 'tst' | 'changelog' | 'compare' | 'sources'
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

export const WPR_TABS = [
  { id: 'sqp', label: 'SQP' },
  { id: 'scp', label: 'SCP' },
  { id: 'br', label: 'BR' },
  { id: 'tst', label: 'TST' },
  { id: 'changelog', label: 'Change Log' },
  { id: 'compare', label: 'Compare' },
  { id: 'sources', label: 'Sources' },
] as const satisfies ReadonlyArray<{ id: WprTab; label: string }>

export interface WprDashboardState {
  activeTab: WprTab
  selectedWeek: WeekLabel | null
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

export function createInitialDashboardState(defaultWeek: WeekLabel | null): WprDashboardState {
  return {
    activeTab: 'sqp',
    selectedWeek: defaultWeek,
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
