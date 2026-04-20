import type { WprBrandMetricsPoint, WprCluster, WprWeekBundle } from './types'

export interface CompareRankRow {
  weekLabel: string
  [clusterLabel: string]: string | number | null
}

export interface CompareBrandRow extends WprBrandMetricsPoint {
  weekLabel: string
}

export interface CompareViewModel {
  scatterRows: WprCluster[]
  lineClusters: WprCluster[]
  rankRows: CompareRankRow[]
  ppcRows: WprCluster[]
  brandRows: CompareBrandRow[]
}

function clusterMap(bundle: WprWeekBundle): Map<string, WprCluster> {
  return new Map(bundle.clusters.map((cluster) => [cluster.id, cluster]))
}

function clustersFromIds(map: Map<string, WprCluster>, ids: readonly string[]): WprCluster[] {
  return ids
    .map((clusterId) => map.get(clusterId))
    .filter((cluster): cluster is WprCluster => cluster !== undefined)
}

export function createCompareViewModel(bundle: WprWeekBundle): CompareViewModel {
  const map = clusterMap(bundle)
  const scatterRows = clustersFromIds(map, bundle.scatterClusterIds)
  const lineClusters = clustersFromIds(map, bundle.lineClusterIds)
  const ppcRows = clustersFromIds(map, bundle.ppcClusterIds)

  const rankRows = bundle.weeks.map((week) => {
    const row: CompareRankRow = { weekLabel: week }
    for (const cluster of lineClusters) {
      const point = cluster.weekly.find((entry) => entry.week_label === week)
      row[cluster.cluster] = point?.avg_rank ?? null
    }
    return row
  })

  const brandRows = bundle.weeks.map((week) => {
    const point = bundle.brandMetricsWindow[week]
    if (point === undefined) {
      return {
        weekLabel: week,
        awareness: 0,
        consideration: 0,
        purchase: 0,
      }
    }

    return {
      weekLabel: week,
      awareness: point.awareness,
      consideration: point.consideration,
      purchase: point.purchase,
    }
  })

  return {
    scatterRows,
    lineClusters,
    rankRows,
    ppcRows,
    brandRows,
  }
}
