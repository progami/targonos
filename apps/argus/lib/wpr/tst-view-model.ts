import type {
  WeekLabel,
  WprCluster,
  WprCompetitorSummary,
  WprTstObserved,
  WprTstTermRow,
  WprTstWeeklyWindow,
  WprTstWindow,
  WprWeekBundle,
} from './types'

export type TstSelectionScope =
  | 'empty'
  | 'no-terms'
  | 'root'
  | 'term'
  | 'multi-term'
  | 'multi-root'
  | 'multi-root-term'

export interface TstAnnotatedTermRow extends WprTstTermRow {
  root?: string
  termId?: string
}

export interface TstCompareSelection extends WprTstWindow {
  term_rows: TstAnnotatedTermRow[]
}

export interface TstWeeklySelection extends WprTstWeeklyWindow {
  term_rows: TstAnnotatedTermRow[]
}

export interface TstSelectionRootRow {
  id: string
  label: string
  family: string
  selectedCount: number
  totalCount: number
  checked: boolean
  partial: boolean
  current: TstWeeklySelection
}

export interface TstSelectionTermRow {
  id: string
  rootId: string
  label: string
  checked: boolean
  current: TstAnnotatedTermRow
}

export interface TstSelectionViewModel {
  rootIds: string[]
  rootLabels: string[]
  weekly: TstWeeklySelection[]
  current: TstWeeklySelection | null
  competitor: WprCompetitorSummary | null
  scopeType: TstSelectionScope
  allTermIds: string[]
  selectedTermIds: string[]
  rootRows: TstSelectionRootRow[]
  termRowsByRoot: Record<string, TstSelectionTermRow[]>
}

type TstWindowKey = 'recent_4w' | 'baseline_13w'

function emptyTstObserved(): WprTstObserved {
  return {
    total_click_pool_share: 0,
    total_purchase_pool_share: 0,
    our_click_share_points: 0,
    our_purchase_share_points: 0,
    competitor_click_share_points: 0,
    competitor_purchase_share_points: 0,
    other_click_share_points: 0,
    other_purchase_share_points: 0,
    our_click_share: 0,
    our_purchase_share: 0,
    competitor_click_share: 0,
    competitor_purchase_share: 0,
    other_click_share: 0,
    other_purchase_share: 0,
    click_gap: 0,
    purchase_gap: 0,
  }
}

function emptyTstSelectionBase(): TstCompareSelection {
  return {
    source: 'TST',
    method: 'observed_top_clicked_asin_pool',
    coverage: {
      terms_total: 0,
      terms_covered: 0,
      weeks_present: 0,
      term_weeks_covered: 0,
      avg_click_pool_share: 0,
      avg_purchase_pool_share: 0,
    },
    observed: emptyTstObserved(),
    term_rows: [],
    top_terms: [],
  }
}

function emptyTstWeeklySelection(weekLabel: WeekLabel): TstWeeklySelection {
  return {
    ...emptyTstSelectionBase(),
    week_label: weekLabel,
    week_number: parseWeekNumber(weekLabel),
    start_date: '',
  }
}

function parseWeekNumber(weekLabel: WeekLabel): number {
  return Number.parseInt(weekLabel.replace('W', ''), 10)
}

function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }

  return numerator / denominator
}

export function competitorTermKey(rootLabel: string, term: string): string {
  return `${rootLabel}::${term}`
}

function compareByTstTermPriority(left: WprTstTermRow, right: WprTstTermRow): number {
  if (right.avg_click_pool_share !== left.avg_click_pool_share) {
    return right.avg_click_pool_share - left.avg_click_pool_share
  }

  if (right.avg_purchase_pool_share !== left.avg_purchase_pool_share) {
    return right.avg_purchase_pool_share - left.avg_purchase_pool_share
  }

  return left.search_frequency_rank - right.search_frequency_rank
}

function finalizeTstSelection(selection: TstCompareSelection): TstCompareSelection {
  selection.coverage.avg_click_pool_share = safeDiv(
    selection.observed.total_click_pool_share,
    selection.coverage.term_weeks_covered,
  )
  selection.coverage.avg_purchase_pool_share = safeDiv(
    selection.observed.total_purchase_pool_share,
    selection.coverage.term_weeks_covered,
  )
  selection.observed.our_click_share = safeDiv(
    selection.observed.our_click_share_points,
    selection.observed.total_click_pool_share,
  )
  selection.observed.our_purchase_share = safeDiv(
    selection.observed.our_purchase_share_points,
    selection.observed.total_purchase_pool_share,
  )
  selection.observed.competitor_click_share = safeDiv(
    selection.observed.competitor_click_share_points,
    selection.observed.total_click_pool_share,
  )
  selection.observed.competitor_purchase_share = safeDiv(
    selection.observed.competitor_purchase_share_points,
    selection.observed.total_purchase_pool_share,
  )
  selection.observed.other_click_share = safeDiv(
    selection.observed.other_click_share_points,
    selection.observed.total_click_pool_share,
  )
  selection.observed.other_purchase_share = safeDiv(
    selection.observed.other_purchase_share_points,
    selection.observed.total_purchase_pool_share,
  )
  selection.observed.click_gap =
    selection.observed.our_click_share - selection.observed.competitor_click_share
  selection.observed.purchase_gap =
    selection.observed.our_purchase_share - selection.observed.competitor_purchase_share
  selection.term_rows.sort(compareByTstTermPriority)

  return selection
}

function toWeeklySelection(window: WprTstWeeklyWindow): TstWeeklySelection {
  return {
    ...window,
    term_rows: window.term_rows.map((row) => ({ ...row })),
  }
}

function competitorAllWeeklyTermRows(cluster: WprCluster): WprTstTermRow[] {
  const rowsByTerm = new Map<string, WprTstTermRow>()
  for (const weekCompare of cluster.tstCompare.weekly) {
    for (const row of weekCompare.term_rows) {
      if (!rowsByTerm.has(row.term)) {
        rowsByTerm.set(row.term, row)
      }
    }
  }

  return Array.from(rowsByTerm.values())
}

export function competitorRootTermIds(bundle: WprWeekBundle, clusterId: string): string[] {
  const cluster = bundle.clusters.find((item) => item.id === clusterId)
  if (cluster === undefined) {
    return []
  }

  return competitorAllWeeklyTermRows(cluster).map((row) => competitorTermKey(cluster.cluster, row.term))
}

function competitorSelectedTermsForRoot(
  bundle: WprWeekBundle,
  clusterId: string,
  selectedTermIds: Set<string>,
): string[] {
  return competitorRootTermIds(bundle, clusterId).filter((termId) => selectedTermIds.has(termId))
}

function selectedCompetitorRootIdsList(bundle: WprWeekBundle, selectedRootIds: Set<string>): string[] {
  return bundle.clusters
    .map((cluster) => cluster.id)
    .filter((clusterId) => selectedRootIds.has(clusterId))
}

function buildRootRows(
  bundle: WprWeekBundle,
  selectedTermIds: Set<string>,
): TstSelectionRootRow[] {
  return bundle.clusters.map((cluster) => {
    const allIds = competitorRootTermIds(bundle, cluster.id)
    const selectedIds = competitorSelectedTermsForRoot(bundle, cluster.id, selectedTermIds)

    return {
      id: cluster.id,
      label: cluster.cluster,
      family: cluster.family,
      selectedCount: selectedIds.length,
      totalCount: allIds.length,
      checked: allIds.length > 0 && selectedIds.length === allIds.length,
      partial: selectedIds.length > 0 && selectedIds.length < allIds.length,
      current: selectedWeekTstCompare(cluster.tstCompare.weekly, bundle.meta.anchorWeek),
    }
  })
}

function buildTermRowsByRoot(
  bundle: WprWeekBundle,
  selectedTermIds: Set<string>,
): Record<string, TstSelectionTermRow[]> {
  const rowsByRoot: Record<string, TstSelectionTermRow[]> = {}
  for (const cluster of bundle.clusters) {
    const rows = competitorAllWeeklyTermRows(cluster)
      .map((row) => {
        const id = competitorTermKey(cluster.cluster, row.term)
        return {
          id,
          rootId: cluster.id,
          label: row.term,
          checked: selectedTermIds.has(id),
          current: {
            ...row,
            root: cluster.cluster,
            termId: id,
          },
        }
      })
      .sort((left, right) => compareByTstTermPriority(left.current, right.current))
    rowsByRoot[cluster.id] = rows
  }

  return rowsByRoot
}

function firstCompetitor(bundle: WprWeekBundle): WprCompetitorSummary {
  const competitor = bundle.meta.competitor
  if (competitor === undefined) {
    throw new Error('Missing WPR competitor context')
  }

  return competitor
}

function combineTstWindowCompare(
  bundle: WprWeekBundle,
  rootIds: string[],
  windowKey: TstWindowKey,
): TstCompareSelection {
  const combined = emptyTstSelectionBase()
  let maxWeeksPresent = 0

  for (const clusterId of rootIds) {
    const cluster = bundle.clusters.find((item) => item.id === clusterId)
    if (cluster === undefined) {
      throw new Error(`Missing TST cluster ${clusterId}`)
    }

    const compare = cluster.tstCompare[windowKey]
    combined.coverage.terms_total += compare.coverage.terms_total
    combined.coverage.terms_covered += compare.coverage.terms_covered
    combined.coverage.term_weeks_covered += compare.coverage.term_weeks_covered
    if (compare.coverage.weeks_present > maxWeeksPresent) {
      maxWeeksPresent = compare.coverage.weeks_present
    }

    combined.observed.total_click_pool_share += compare.observed.total_click_pool_share
    combined.observed.total_purchase_pool_share += compare.observed.total_purchase_pool_share
    combined.observed.our_click_share_points += compare.observed.our_click_share_points
    combined.observed.our_purchase_share_points += compare.observed.our_purchase_share_points
    combined.observed.competitor_click_share_points += compare.observed.competitor_click_share_points
    combined.observed.competitor_purchase_share_points += compare.observed.competitor_purchase_share_points
    combined.observed.other_click_share_points += compare.observed.other_click_share_points
    combined.observed.other_purchase_share_points += compare.observed.other_purchase_share_points

    for (const row of compare.term_rows) {
      combined.term_rows.push({
        ...row,
        root: cluster.cluster,
      })
    }
  }

  combined.coverage.weeks_present = maxWeeksPresent
  return finalizeTstSelection(combined)
}

function filterTstCompareByTermIds(
  compare: TstCompareSelection | TstWeeklySelection,
  rootLabels: string[],
  selectedIds: Set<string>,
): TstCompareSelection {
  const filtered = emptyTstSelectionBase()
  filtered.source = compare.source
  filtered.method = compare.method
  filtered.coverage.terms_total = compare.coverage.terms_total
  filtered.coverage.weeks_present = compare.coverage.weeks_present

  for (const row of compare.term_rows) {
    const rowRoot = row.root ?? rootLabels[0]
    const termId = competitorTermKey(rowRoot, row.term)
    if (!selectedIds.has(termId)) {
      continue
    }

    let shareWeight = row.weeks_present
    if ('week_label' in compare) {
      shareWeight = 1
    }
    filtered.coverage.terms_covered += 1
    filtered.coverage.term_weeks_covered += shareWeight
    filtered.observed.total_click_pool_share += row.click_pool_share
    filtered.observed.total_purchase_pool_share += row.purchase_pool_share
    filtered.observed.our_click_share_points += row.our_click_share * row.click_pool_share
    filtered.observed.our_purchase_share_points += row.our_purchase_share * row.purchase_pool_share
    filtered.observed.competitor_click_share_points += row.competitor_click_share * row.click_pool_share
    filtered.observed.competitor_purchase_share_points += row.competitor_purchase_share * row.purchase_pool_share
    filtered.term_rows.push({
      ...row,
      root: rowRoot,
      termId,
    })
  }

  filtered.observed.other_click_share_points = Math.max(
    filtered.observed.total_click_pool_share
      - filtered.observed.our_click_share_points
      - filtered.observed.competitor_click_share_points,
    0,
  )
  filtered.observed.other_purchase_share_points = Math.max(
    filtered.observed.total_purchase_pool_share
      - filtered.observed.our_purchase_share_points
      - filtered.observed.competitor_purchase_share_points,
    0,
  )

  return finalizeTstSelection(filtered)
}

function combineTstWeeklySeries(bundle: WprWeekBundle, rootIds: string[]): TstWeeklySelection[] {
  const weekMap = new Map<WeekLabel, TstWeeklySelection>()
  for (const weekLabel of bundle.meta.baselineWindow) {
    weekMap.set(weekLabel, emptyTstWeeklySelection(weekLabel))
  }

  for (const clusterId of rootIds) {
    const cluster = bundle.clusters.find((item) => item.id === clusterId)
    if (cluster === undefined) {
      throw new Error(`Missing TST cluster ${clusterId}`)
    }

    for (const weekCompare of cluster.tstCompare.weekly) {
      const combined = weekMap.get(weekCompare.week_label)
      if (combined === undefined) {
        throw new Error(`Missing TST week ${weekCompare.week_label}`)
      }

      combined.source = weekCompare.source
      combined.method = weekCompare.method
      combined.week_number = weekCompare.week_number
      if (combined.start_date === '') {
        combined.start_date = weekCompare.start_date
      }

      combined.coverage.terms_total += weekCompare.coverage.terms_total
      combined.coverage.terms_covered += weekCompare.coverage.terms_covered
      combined.coverage.term_weeks_covered += weekCompare.coverage.term_weeks_covered
      if (weekCompare.coverage.weeks_present > combined.coverage.weeks_present) {
        combined.coverage.weeks_present = weekCompare.coverage.weeks_present
      }

      combined.observed.total_click_pool_share += weekCompare.observed.total_click_pool_share
      combined.observed.total_purchase_pool_share += weekCompare.observed.total_purchase_pool_share
      combined.observed.our_click_share_points += weekCompare.observed.our_click_share_points
      combined.observed.our_purchase_share_points += weekCompare.observed.our_purchase_share_points
      combined.observed.competitor_click_share_points += weekCompare.observed.competitor_click_share_points
      combined.observed.competitor_purchase_share_points += weekCompare.observed.competitor_purchase_share_points
      combined.observed.other_click_share_points += weekCompare.observed.other_click_share_points
      combined.observed.other_purchase_share_points += weekCompare.observed.other_purchase_share_points

      for (const row of weekCompare.term_rows) {
        combined.term_rows.push({
          ...row,
          root: cluster.cluster,
        })
      }
    }
  }

  return bundle.meta.baselineWindow.map((weekLabel) => {
    const combined = weekMap.get(weekLabel)
    if (combined === undefined) {
      throw new Error(`Missing TST weekly selection for ${weekLabel}`)
    }

    return finalizeTstSelection(combined) as TstWeeklySelection
  })
}

function filterTstWeeklySeriesByTermIds(
  weeklySeries: TstWeeklySelection[],
  rootLabels: string[],
  selectedIds: Set<string>,
): TstWeeklySelection[] {
  return weeklySeries.map((weekCompare) => {
    const filtered = filterTstCompareByTermIds(weekCompare, rootLabels, selectedIds)
    return {
      ...filtered,
      week_label: weekCompare.week_label,
      week_number: weekCompare.week_number,
      start_date: weekCompare.start_date,
    }
  })
}

export function selectedWeekTstCompare(
  series: readonly WprTstWeeklyWindow[] | readonly TstWeeklySelection[],
  selectedWeek: WeekLabel,
): TstWeeklySelection {
  const record = series.find((item) => item.week_label === selectedWeek)
  if (record !== undefined) {
    return toWeeklySelection(record)
  }

  return {
    ...emptyTstWeeklySelection(selectedWeek),
    top_terms: [],
  }
}

export function createTstViewModel(input: {
  bundle: WprWeekBundle
  selectedRootIds: Set<string>
  selectedTermIds: Set<string>
  selectedWeek: WeekLabel
}): TstSelectionViewModel {
  const { bundle, selectedRootIds, selectedTermIds, selectedWeek } = input
  const rootIds = selectedCompetitorRootIdsList(bundle, selectedRootIds)
  const rootRows = buildRootRows(bundle, selectedTermIds)
  const termRowsByRoot = buildTermRowsByRoot(bundle, selectedTermIds)

  if (rootIds.length === 0) {
    return {
      rootIds: [],
      rootLabels: [],
      weekly: [],
      current: null,
      competitor: null,
      scopeType: 'empty',
      allTermIds: [],
      selectedTermIds: [],
      rootRows,
      termRowsByRoot,
    }
  }

  if (rootIds.length === 1) {
    const rootId = rootIds[0]
    const cluster = bundle.clusters.find((item) => item.id === rootId)
    if (cluster === undefined) {
      throw new Error(`Missing TST root ${rootId}`)
    }

    const allTermIds = competitorRootTermIds(bundle, rootId)
    const selectedIds = competitorSelectedTermsForRoot(bundle, rootId, selectedTermIds)
    if (selectedIds.length === 0) {
      return {
        rootIds,
        rootLabels: [cluster.cluster],
        weekly: cluster.tstCompare.weekly.map(toWeeklySelection),
        current: selectedWeekTstCompare(cluster.tstCompare.weekly, selectedWeek),
        competitor: firstCompetitor(bundle),
        scopeType: 'no-terms',
        allTermIds,
        selectedTermIds: [],
        rootRows,
        termRowsByRoot,
      }
    }

    const fullSelection = selectedIds.length === allTermIds.length
    let weekly = cluster.tstCompare.weekly.map(toWeeklySelection)
    if (!fullSelection) {
      weekly = filterTstWeeklySeriesByTermIds(weekly, [cluster.cluster], new Set(selectedIds))
    }

    return {
      rootIds,
      rootLabels: [cluster.cluster],
      weekly,
      current: selectedWeekTstCompare(weekly, selectedWeek),
      competitor: firstCompetitor(bundle),
      scopeType: fullSelection ? 'root' : selectedIds.length === 1 ? 'term' : 'multi-term',
      allTermIds,
      selectedTermIds: selectedIds,
      rootRows,
      termRowsByRoot,
    }
  }

  const allTermIds: string[] = []
  for (const rootId of rootIds) {
    allTermIds.push(...competitorRootTermIds(bundle, rootId))
  }

  const selectedIds = allTermIds.filter((termId) => selectedTermIds.has(termId))
  const rootLabels = rootIds.map((clusterId) => {
    const cluster = bundle.clusters.find((item) => item.id === clusterId)
    if (cluster === undefined) {
      throw new Error(`Missing TST root ${clusterId}`)
    }

    return cluster.cluster
  })

  if (selectedIds.length === 0) {
    const weekly = combineTstWeeklySeries(bundle, rootIds)
    return {
      rootIds,
      rootLabels,
      weekly,
      current: selectedWeekTstCompare(weekly, selectedWeek),
      competitor: firstCompetitor(bundle),
      scopeType: 'no-terms',
      allTermIds,
      selectedTermIds: [],
      rootRows,
      termRowsByRoot,
    }
  }

  const fullSelection = selectedIds.length === allTermIds.length
  let weekly = combineTstWeeklySeries(bundle, rootIds)
  if (!fullSelection) {
    weekly = filterTstWeeklySeriesByTermIds(weekly, rootLabels, new Set(selectedIds))
  }

  return {
    rootIds,
    rootLabels,
    weekly,
    current: selectedWeekTstCompare(weekly, selectedWeek),
    competitor: firstCompetitor(bundle),
    scopeType: fullSelection ? 'multi-root' : 'multi-root-term',
    allTermIds,
    selectedTermIds: selectedIds,
    rootRows,
    termRowsByRoot,
  }
}

export function createTstWindowCompareSelection(input: {
  bundle: WprWeekBundle
  rootIds: string[]
  windowKey: TstWindowKey
  selectedTermIds?: Set<string>
  rootLabels?: string[]
}): TstCompareSelection {
  const selection = combineTstWindowCompare(input.bundle, input.rootIds, input.windowKey)
  if (input.selectedTermIds === undefined) {
    return selection
  }

  if (input.rootLabels === undefined) {
    throw new Error('rootLabels are required when filtering TST terms')
  }

  return filterTstCompareByTermIds(selection, input.rootLabels, input.selectedTermIds)
}
