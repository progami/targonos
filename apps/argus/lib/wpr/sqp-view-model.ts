import type { WprSortDirection } from './dashboard-state'
import type { WeekLabel, WprObservedWindow, WprSqpTerm, WprWeekBundle } from './types'

export type SqpSelectionScope =
  | 'empty'
  | 'no-terms'
  | 'root'
  | 'term'
  | 'multi'
  | 'multi-root'

export type SqpSortKey =
  | 'term'
  | 'query_volume'
  | 'impression_share'
  | 'ctr_ratio'
  | 'atc_ratio'
  | 'purchase_rate_ratio'
  | 'cvr_ratio'

export interface SqpAggregatedMetrics {
  query_volume: number
  market_impressions: number
  asin_impressions: number
  market_clicks: number
  asin_clicks: number
  market_cart_adds: number
  asin_cart_adds: number
  market_purchases: number
  asin_purchases: number
  rank_weight: number
  rank_sum: number
  rank_span_sum: number
  rank_term_count: number
  rank_weeks: number
  weeks_sqp: number
  market_ctr: number
  market_cvr: number
  asin_ctr: number
  asin_cvr: number
  impression_share: number
  click_share: number
  cart_add_share: number
  purchase_share: number
  cart_add_rate: number
  asin_cart_add_rate: number
  avg_rank: number | null
  rank_volatility: number | null
}

export interface SqpSelectionRootRow {
  id: string
  label: string
  family: string
  selectedCount: number
  totalCount: number
  checked: boolean
  partial: boolean
  topTerms: string[]
  coverageLabel: string
  current: SqpAggregatedMetrics
}

export interface SqpSelectionTermRow {
  id: string
  rootId: string
  label: string
  checked: boolean
  selectionVolumeSelectedWeek: number
  current: SqpAggregatedMetrics
}

export interface SqpWeeklyPoint {
  week_label: WeekLabel
  week_number: number
  start_date: string
  metrics: SqpAggregatedMetrics
}

export interface SqpSelectionViewModel {
  scopeType: SqpSelectionScope
  metrics: SqpAggregatedMetrics | null
  weekly: SqpWeeklyPoint[]
  rootRows: SqpSelectionRootRow[]
  termRowsByRoot: Record<string, SqpSelectionTermRow[]>
  selectedRootIds: string[]
  selectedRootLabels: string[]
  allTermIds: string[]
  selectedTermIds: string[]
  isAllSelected: boolean
}

export function safeDiv(numerator: number, denominator: number): number {
  if (denominator === 0) {
    return 0
  }

  return numerator / denominator
}

export function rateRatio(numerator: number, denominator: number): number {
  if (numerator <= 0) {
    return 0
  }

  if (denominator <= 0) {
    return numerator
  }

  return numerator / denominator
}

export function emptySqpMetrics(): SqpAggregatedMetrics {
  return {
    query_volume: 0,
    market_impressions: 0,
    asin_impressions: 0,
    market_clicks: 0,
    asin_clicks: 0,
    market_cart_adds: 0,
    asin_cart_adds: 0,
    market_purchases: 0,
    asin_purchases: 0,
    rank_weight: 0,
    rank_sum: 0,
    rank_span_sum: 0,
    rank_term_count: 0,
    rank_weeks: 0,
    weeks_sqp: 0,
    market_ctr: 0,
    market_cvr: 0,
    asin_ctr: 0,
    asin_cvr: 0,
    impression_share: 0,
    click_share: 0,
    cart_add_share: 0,
    purchase_share: 0,
    cart_add_rate: 0,
    asin_cart_add_rate: 0,
    avg_rank: null,
    rank_volatility: null,
  }
}

export function finalizeSqpMetrics(metrics: SqpAggregatedMetrics): SqpAggregatedMetrics {
  return {
    ...metrics,
    market_ctr: safeDiv(metrics.market_clicks, metrics.market_impressions),
    market_cvr: safeDiv(metrics.market_purchases, metrics.market_clicks),
    asin_ctr: safeDiv(metrics.asin_clicks, metrics.asin_impressions),
    asin_cvr: safeDiv(metrics.asin_purchases, metrics.asin_clicks),
    impression_share: safeDiv(metrics.asin_impressions, metrics.market_impressions),
    click_share: safeDiv(metrics.asin_clicks, metrics.market_clicks),
    cart_add_share: safeDiv(metrics.asin_cart_adds, metrics.market_cart_adds),
    purchase_share: safeDiv(metrics.asin_purchases, metrics.market_purchases),
    cart_add_rate: safeDiv(metrics.market_cart_adds, metrics.market_clicks),
    asin_cart_add_rate: safeDiv(metrics.asin_cart_adds, metrics.asin_clicks),
    avg_rank: metrics.rank_weight > 0 ? metrics.rank_sum / metrics.rank_weight : null,
    rank_volatility: metrics.rank_term_count > 0 ? metrics.rank_span_sum / metrics.rank_term_count : null,
  }
}

function addObservedMetrics(target: SqpAggregatedMetrics, source: WprObservedWindow) {
  target.query_volume += source.query_volume
  target.market_impressions += source.market_impressions
  target.asin_impressions += source.asin_impressions
  target.market_clicks += source.market_clicks
  target.asin_clicks += source.asin_clicks
  target.market_cart_adds += source.market_cart_adds
  target.asin_cart_adds += source.asin_cart_adds
  target.market_purchases += source.market_purchases
  target.asin_purchases += source.asin_purchases
  target.rank_weight += source.rank_weight
  target.rank_sum += source.rank_sum
  target.rank_span_sum += source.rank_span_sum
  target.rank_term_count += source.rank_term_count

  if (source.rank_weeks > target.rank_weeks) {
    target.rank_weeks = source.rank_weeks
  }

  if (source.query_volume > 0 && target.weeks_sqp < 1) {
    target.weeks_sqp = 1
  }
}

function aggregateObservedSources(sources: WprObservedWindow[]): SqpAggregatedMetrics {
  const metrics = emptySqpMetrics()
  for (const source of sources) {
    addObservedMetrics(metrics, source)
  }
  return finalizeSqpMetrics(metrics)
}

function allRootIds(bundle: WprWeekBundle): string[] {
  return bundle.clusters.map((cluster) => cluster.id)
}

export function defaultSqpRootIds(bundle: WprWeekBundle): string[] {
  const rootIds = allRootIds(bundle)
  const rootIdSet = new Set(rootIds)
  const defaultRootIds: string[] = []

  for (const rootId of bundle.defaultClusterIds) {
    if (!rootIdSet.has(rootId)) {
      throw new Error(`Default SQP root id is not present in the bundle: ${rootId}`)
    }

    defaultRootIds.push(rootId)
  }

  if (defaultRootIds.length > 0) {
    return defaultRootIds
  }

  return rootIds
}

export function rootTermIds(bundle: WprWeekBundle, rootId: string): string[] {
  const ids = bundle.sqpClusterTerms[rootId]
  if (ids === undefined) {
    return []
  }

  return ids
}

export function selectableSqpTermIdsForRoots(bundle: WprWeekBundle, rootIds: string[]): string[] {
  const allIds: string[] = []
  const seenIds = new Set<string>()

  for (const rootId of rootIds) {
    for (const termId of rootTermIds(bundle, rootId)) {
      if (seenIds.has(termId)) {
        continue
      }

      seenIds.add(termId)
      allIds.push(termId)
    }
  }

  return allIds
}

export function allSelectableSqpTermIds(bundle: WprWeekBundle): string[] {
  return selectableSqpTermIdsForRoots(bundle, allRootIds(bundle))
}

function selectedRootIdsList(bundle: WprWeekBundle, selectedRootIds: Set<string>): string[] {
  return allRootIds(bundle).filter((rootId) => selectedRootIds.has(rootId))
}

function selectedTermsForRoot(bundle: WprWeekBundle, rootId: string, selectedTermIds: Set<string>): string[] {
  return rootTermIds(bundle, rootId).filter((termId) => selectedTermIds.has(termId))
}

function termMap(bundle: WprWeekBundle): Map<string, WprSqpTerm> {
  return new Map(bundle.sqpTerms.map((term) => [term.id, term]))
}

function observedWindowForWeek(
  series: readonly WprObservedWindow[],
  selectedWeek: WeekLabel,
): WprObservedWindow | null {
  const record = series.find((item) => item.week_label === selectedWeek)
  if (record === undefined) {
    return null
  }

  return record
}

function aggregateSelectedTermMetrics(
  bundle: WprWeekBundle,
  selectedIds: string[],
  selectedWeek: WeekLabel,
): SqpAggregatedMetrics {
  const terms = termMap(bundle)
  return aggregateObservedSources(
    selectedIds
      .map((termId) => {
        const term = terms.get(termId)
        if (term === undefined) {
          return undefined
        }

        return observedWindowForWeek(term.weekly, selectedWeek) ?? undefined
      })
      .filter((metric): metric is WprObservedWindow => metric !== undefined),
  )
}

function aggregateSelectedRootMetrics(
  bundle: WprWeekBundle,
  rootIds: string[],
  selectedWeek: WeekLabel,
): SqpAggregatedMetrics {
  return aggregateObservedSources(
    bundle.clusters
      .filter((cluster) => rootIds.includes(cluster.id))
      .map((cluster) => observedWindowForWeek(cluster.weekly, selectedWeek))
      .filter((metric): metric is WprObservedWindow => metric !== null),
  )
}

function aggregateSelectedTermWeeklyMetrics(bundle: WprWeekBundle, selectedIds: string[]): SqpWeeklyPoint[] {
  if (selectedIds.length === 0) {
    return []
  }

  const terms = termMap(bundle)
  const weekMap = new Map<WeekLabel, SqpWeeklyPoint>()
  for (const weekLabel of bundle.meta.baselineWindow) {
    weekMap.set(weekLabel, {
      week_label: weekLabel,
      week_number: Number.parseInt(weekLabel.replace('W', ''), 10),
      start_date: '',
      metrics: emptySqpMetrics(),
    })
  }

  for (const termId of selectedIds) {
    const term = terms.get(termId)
    if (term === undefined) {
      continue
    }

    for (const week of term.weekly) {
      const point = weekMap.get(week.week_label)
      if (point === undefined) {
        continue
      }

      if (point.start_date === '') {
        point.start_date = week.start_date
      }

      addObservedMetrics(point.metrics, week)
    }
  }

  return bundle.meta.baselineWindow.map((weekLabel) => {
    const point = weekMap.get(weekLabel)
    if (point === undefined) {
      throw new Error(`Missing SQP weekly point for ${weekLabel}`)
    }

    return {
      ...point,
      metrics: finalizeSqpMetrics(point.metrics),
    }
  })
}

function aggregateSelectedRootWeeklyMetrics(bundle: WprWeekBundle, rootIds: string[]): SqpWeeklyPoint[] {
  const selectedIds: string[] = []
  for (const rootId of rootIds) {
    selectedIds.push(...rootTermIds(bundle, rootId))
  }

  return aggregateSelectedTermWeeklyMetrics(bundle, selectedIds)
}

function toCurrentMetrics(source: WprObservedWindow): SqpAggregatedMetrics {
  return finalizeSqpMetrics({
    ...emptySqpMetrics(),
    query_volume: source.query_volume,
    market_impressions: source.market_impressions,
    asin_impressions: source.asin_impressions,
    market_clicks: source.market_clicks,
    asin_clicks: source.asin_clicks,
    market_cart_adds: source.market_cart_adds,
    asin_cart_adds: source.asin_cart_adds,
    market_purchases: source.market_purchases,
    asin_purchases: source.asin_purchases,
    rank_weight: source.rank_weight,
    rank_sum: source.rank_sum,
    rank_span_sum: source.rank_span_sum,
    rank_term_count: source.rank_term_count,
    rank_weeks: source.rank_weeks,
    weeks_sqp: source.query_volume > 0 ? 1 : 0,
    market_ctr: source.market_ctr,
    market_cvr: source.market_cvr,
    asin_ctr: source.asin_ctr,
    asin_cvr: source.asin_cvr,
    impression_share: source.impression_share,
    click_share: source.click_share,
    cart_add_share: source.cart_add_share,
    purchase_share: source.purchase_share,
    cart_add_rate: source.cart_add_rate,
    asin_cart_add_rate: source.asin_cart_add_rate,
    avg_rank: source.avg_rank,
    rank_volatility: source.rank_volatility,
  })
}

function currentMetricsForWeek(
  series: readonly WprObservedWindow[],
  selectedWeek: WeekLabel,
): SqpAggregatedMetrics {
  const record = observedWindowForWeek(series, selectedWeek)
  if (record === null) {
    return finalizeSqpMetrics(emptySqpMetrics())
  }

  return toCurrentMetrics(record)
}

function compareSortValues(
  left: number | string,
  right: number | string,
  direction: WprSortDirection,
  kind: 'number' | 'text',
): number {
  if (kind === 'text') {
    const result = String(left).localeCompare(String(right), undefined, { sensitivity: 'base' })
    return direction === 'asc' ? result : -result
  }

  const numericLeft = Number(left)
  const numericRight = Number(right)
  if (direction === 'asc') {
    return numericLeft - numericRight
  }

  return numericRight - numericLeft
}

function purchaseRate(metrics: SqpAggregatedMetrics): number {
  return safeDiv(metrics.asin_purchases, metrics.asin_cart_adds)
}

function marketPurchaseRate(metrics: SqpAggregatedMetrics): number {
  return safeDiv(metrics.market_purchases, metrics.market_cart_adds)
}

export function sqpSortValueForMetrics(metrics: SqpAggregatedMetrics, key: SqpSortKey): number {
  if (key === 'query_volume') {
    return metrics.query_volume
  }

  if (key === 'impression_share') {
    return metrics.impression_share
  }

  if (key === 'ctr_ratio') {
    return rateRatio(metrics.asin_ctr, metrics.market_ctr)
  }

  if (key === 'atc_ratio') {
    return rateRatio(metrics.asin_cart_add_rate, metrics.cart_add_rate)
  }

  if (key === 'purchase_rate_ratio') {
    return rateRatio(purchaseRate(metrics), marketPurchaseRate(metrics))
  }

  if (key === 'cvr_ratio') {
    return rateRatio(metrics.asin_cvr, metrics.market_cvr)
  }

  throw new Error(`Unsupported SQP metrics sort key: ${key}`)
}

export function sortSqpRootRows(
  rows: SqpSelectionRootRow[],
  sortKey: SqpSortKey,
  direction: WprSortDirection,
): SqpSelectionRootRow[] {
  return rows.slice().sort((left, right) => {
    if (sortKey === 'term') {
      return compareSortValues(left.label, right.label, direction, 'text')
    }

    return compareSortValues(
      sqpSortValueForMetrics(left.current, sortKey),
      sqpSortValueForMetrics(right.current, sortKey),
      direction,
      'number',
    )
  })
}

export function sortSqpTermRows(
  rows: SqpSelectionTermRow[],
  sortKey: SqpSortKey,
  direction: WprSortDirection,
): SqpSelectionTermRow[] {
  return rows.slice().sort((left, right) => {
    if (sortKey === 'term') {
      return compareSortValues(left.label, right.label, direction, 'text')
    }

    return compareSortValues(
      sqpSortValueForMetrics(left.current, sortKey),
      sqpSortValueForMetrics(right.current, sortKey),
      direction,
      'number',
    )
  })
}

export function createSqpSelectionViewModel(input: {
  bundle: WprWeekBundle
  selectedRootIds: Set<string>
  selectedTermIds: Set<string>
  selectedWeek: WeekLabel
}): SqpSelectionViewModel {
  const { bundle, selectedRootIds, selectedTermIds, selectedWeek } = input
  const terms = termMap(bundle)
  const selectedRoots = selectedRootIdsList(bundle, selectedRootIds)
  const rootRows: SqpSelectionRootRow[] = bundle.clusters.map((cluster) => {
    const allIds = rootTermIds(bundle, cluster.id)
    const selectedIds = selectedTermsForRoot(bundle, cluster.id, selectedTermIds)
    const coverageTermsSqp = cluster.coverage.terms_sqp
    const coverageTermsTotal = cluster.coverage.terms_total
    let coverageLabel = '0 / 0'
    if (coverageTermsSqp !== undefined && coverageTermsTotal !== undefined) {
      coverageLabel = `${coverageTermsSqp} / ${coverageTermsTotal}`
    }

    return {
      id: cluster.id,
      label: cluster.cluster,
      family: cluster.family,
      selectedCount: selectedIds.length,
      totalCount: allIds.length,
      checked: allIds.length > 0 && selectedIds.length === allIds.length,
      partial: selectedIds.length > 0 && selectedIds.length < allIds.length,
      topTerms: cluster.top_terms,
      coverageLabel,
      current: currentMetricsForWeek(cluster.weekly, selectedWeek),
    }
  })

  const termRowsByRoot: Record<string, SqpSelectionTermRow[]> = {}
  for (const cluster of bundle.clusters) {
    termRowsByRoot[cluster.id] = rootTermIds(bundle, cluster.id)
      .map((termId) => terms.get(termId))
      .filter((term): term is WprSqpTerm => term !== undefined)
      .map((term) => ({
        id: term.id,
        rootId: cluster.id,
        label: term.term,
        checked: selectedTermIds.has(term.id),
        selectionVolumeSelectedWeek: currentMetricsForWeek(term.weekly, selectedWeek).query_volume,
        current: currentMetricsForWeek(term.weekly, selectedWeek),
      }))
  }

  if (selectedRoots.length === 0) {
    return {
      scopeType: 'empty',
      metrics: null,
      weekly: [],
      rootRows,
      termRowsByRoot,
      selectedRootIds: [],
      selectedRootLabels: [],
      allTermIds: [],
      selectedTermIds: [],
      isAllSelected: false,
    }
  }

  if (selectedRoots.length === 1) {
    const rootId = selectedRoots[0]
    const cluster = bundle.clusters.find((item) => item.id === rootId)
    if (cluster === undefined) {
      throw new Error(`Missing SQP root ${rootId}`)
    }

    const allIds = rootTermIds(bundle, rootId)
    const selectedIds = selectedTermsForRoot(bundle, rootId, selectedTermIds)
    const isAllSelected = allIds.length > 0 && selectedIds.length === allIds.length

    if (selectedIds.length === 0) {
      return {
        scopeType: 'no-terms',
        metrics: currentMetricsForWeek(cluster.weekly, selectedWeek),
        weekly: aggregateSelectedRootWeeklyMetrics(bundle, [rootId]),
        rootRows,
        termRowsByRoot,
        selectedRootIds: [rootId],
        selectedRootLabels: [cluster.cluster],
        allTermIds: allIds,
        selectedTermIds: [],
        isAllSelected: false,
      }
    }

    return {
      scopeType: isAllSelected ? 'root' : selectedIds.length === 1 ? 'term' : 'multi',
      metrics: isAllSelected
        ? currentMetricsForWeek(cluster.weekly, selectedWeek)
        : aggregateSelectedTermMetrics(bundle, selectedIds, selectedWeek),
      weekly: isAllSelected
        ? aggregateSelectedRootWeeklyMetrics(bundle, [rootId])
        : aggregateSelectedTermWeeklyMetrics(bundle, selectedIds),
      rootRows,
      termRowsByRoot,
      selectedRootIds: [rootId],
      selectedRootLabels: [cluster.cluster],
      allTermIds: allIds,
      selectedTermIds: selectedIds,
      isAllSelected,
    }
  }

  const allTermIds: string[] = []
  for (const rootId of selectedRoots) {
    allTermIds.push(...rootTermIds(bundle, rootId))
  }

  const selectedIds = allTermIds.filter((termId) => selectedTermIds.has(termId))
  return {
    scopeType: selectedIds.length > 0 ? 'multi-root' : 'no-terms',
    metrics: selectedIds.length > 0
      ? aggregateSelectedTermMetrics(bundle, selectedIds, selectedWeek)
      : aggregateSelectedRootMetrics(bundle, selectedRoots, selectedWeek),
    weekly: selectedIds.length > 0
      ? aggregateSelectedTermWeeklyMetrics(bundle, selectedIds)
      : aggregateSelectedRootWeeklyMetrics(bundle, selectedRoots),
    rootRows,
    termRowsByRoot,
    selectedRootIds: selectedRoots,
    selectedRootLabels: bundle.clusters
      .filter((cluster) => selectedRoots.includes(cluster.id))
      .map((cluster) => cluster.cluster),
    allTermIds,
    selectedTermIds: selectedIds,
    isAllSelected: allTermIds.length > 0 && selectedIds.length === allTermIds.length,
  }
}
