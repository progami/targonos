'use client'

import { Box, Button, Stack, Typography } from '@mui/material'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import ResponsiveChartFrame from '@/components/charts/responsive-chart-frame'
import { createCompareViewModel } from '@/lib/wpr/compare-view-model'
import type { WprWeekBundle } from '@/lib/wpr/types'
import { useWprStore } from '@/stores/wpr-store'
import {
  panelBadgeSx,
  panelHeadSx,
  panelSx,
  panelTitleSx,
  textMuted,
  textSecondary,
} from '@/lib/wpr/panel-tokens'
import {
  formatCompactNumber,
  formatCount,
  formatDecimal,
  formatMoney,
  formatPercent,
} from '@/lib/wpr/format'

const LINE_COLORS = ['#00C2B9', '#f5a623', '#8fc7ff', '#a78bfa', '#d5ff62', '#ff8a80']

function colorForRank(rank: number | null): string {
  if (rank === null) {
    return 'rgba(255,255,255,0.08)'
  }

  let clamped = rank
  if (clamped < 10) {
    clamped = 10
  }
  if (clamped > 40) {
    clamped = 40
  }

  const t = (clamped - 10) / 30
  const hue = 120 - 120 * t
  return `hsl(${hue.toFixed(1)} 68% 56%)`
}

function PanelTitle({
  title,
  badge,
}: {
  title: string
  badge: string
}) {
  return (
    <Box sx={panelHeadSx}>
      <Typography sx={panelTitleSx}>{title}</Typography>
      <Typography sx={panelBadgeSx}>{badge}</Typography>
    </Box>
  )
}

function RankHeatmap({
  bundle,
  clusterIds,
}: {
  bundle: WprWeekBundle
  clusterIds: string[]
}) {
  const clusters = clusterIds
    .map((clusterId) => bundle.clusters.find((cluster) => cluster.id === clusterId))
    .filter((cluster): cluster is WprWeekBundle['clusters'][number] => cluster !== undefined)

  if (clusters.length === 0) {
    return (
      <Box
        sx={{
          minHeight: 180,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.54)',
          fontSize: '0.76rem',
        }}
      >
        No rank heatmap data.
      </Box>
    )
  }

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: `140px repeat(${bundle.weeks.length}, minmax(36px, 1fr))`,
          gap: 0.5,
          minWidth: Math.max(bundle.weeks.length * 42 + 160, 540),
        }}
      >
        <Box />
        {bundle.weeks.map((week) => (
          <Box
            key={week}
            sx={{
              textAlign: 'center',
              fontSize: '0.58rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              color: textMuted,
            }}
          >
            {week}
          </Box>
        ))}

        {clusters.map((cluster) => (
          <Box key={cluster.id} sx={{ display: 'contents' }}>
            <Box
              sx={{
                pr: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontSize: '0.68rem',
                color: 'rgba(255,255,255,0.86)',
                whiteSpace: 'nowrap',
              }}
            >
              {cluster.cluster}
            </Box>
            {bundle.weeks.map((week) => {
              const point = cluster.weekly.find((entry) => entry.week_label === week)
              return (
                <Box
                  key={`${cluster.id}-${week}`}
                  title={`${cluster.cluster} · ${week} · Avg rank ${point?.avg_rank ?? '—'} · Purchase share ${formatPercent(point?.purchase_share ?? null, 1)}`}
                  sx={{
                    height: 26,
                    borderRadius: '6px',
                    bgcolor: colorForRank(point?.avg_rank ?? null),
                    border: '1px solid rgba(255,255,255,0.08)',
                    opacity: point?.avg_rank === null ? 0.25 : 0.92,
                  }}
                />
              )
            })}
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default function CompareTab({ bundle }: { bundle: WprWeekBundle }) {
  const compareOrganicMode = useWprStore((state) => state.compareOrganicMode)
  const setCompareOrganicMode = useWprStore((state) => state.setCompareOrganicMode)
  const viewModel = createCompareViewModel(bundle)

  const scatterRows = viewModel.scatterRows.filter((cluster) => {
    return cluster.avg_rank !== null && cluster.eligibility.rank_eligible === true
  })

  const scatterTooltipFormatter = (value: number, key: string) => {
    if (key === 'purchase_share') {
      return formatPercent(value, 1)
    }

    if (key === 'avg_rank') {
      return formatDecimal(value, 1)
    }

    return formatCount(value)
  }

  const rankTooltipFormatter = (value: number | string) => {
    if (typeof value !== 'number') {
      return String(value)
    }

    return formatDecimal(value, 1)
  }

  const ppcTooltipFormatter = (value: number | string, key: string) => {
    if (typeof value !== 'number') {
      return String(value)
    }

    if (key === 'ppc_spend' || key === 'ppc_sales') {
      return formatMoney(value)
    }

    return formatCount(value)
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: 2,
      }}
    >
      <Box sx={{ ...panelSx, gridColumn: '1 / -1' }}>
        <PanelTitle title="Brand Metrics" badge="Awareness / Consideration / Purchase" />
        <Box sx={{ p: 1.5 }}>
          {viewModel.brandRows.length === 0 ? (
            <Box
              sx={{
                minHeight: 220,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.54)',
                fontSize: '0.76rem',
              }}
            >
              No brand metrics data.
            </Box>
          ) : (
            <Box role="img" aria-label="Brand metrics trend over weeks showing awareness, consideration, and purchase">
              <ResponsiveChartFrame height={280}>
                <LineChart data={viewModel.brandRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(value) => formatCompactNumber(value)} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ paddingTop: 6, fontSize: 10 }} />
                  <Line type="monotone" dataKey="awareness" stroke="#8fc7ff" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#8fc7ff' }} activeDot={{ r: 3.5 }} />
                  <Line type="monotone" dataKey="consideration" stroke="#77dfd0" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#77dfd0' }} activeDot={{ r: 3.5 }} />
                  <Line type="monotone" dataKey="purchase" stroke="#d5ff62" strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: '#d5ff62' }} activeDot={{ r: 3.5 }} />
                </LineChart>
              </ResponsiveChartFrame>
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ ...panelSx, gridColumn: '1 / -1' }}>
        <Box
          sx={{
            ...panelHeadSx,
            alignItems: 'flex-start',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Stack spacing={0.35}>
            <Typography sx={panelTitleSx}>Organic View</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: textSecondary }}>
              {compareOrganicMode === 'map' ? 'Demand vs Rank' : 'Trend + heatmap'}
            </Typography>
          </Stack>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant={compareOrganicMode === 'map' ? 'contained' : 'outlined'}
              onClick={() => {
                setCompareOrganicMode('map')
              }}
            >
              Map
            </Button>
            <Button
              size="small"
              variant={compareOrganicMode === 'trend' ? 'contained' : 'outlined'}
              onClick={() => {
                setCompareOrganicMode('trend')
              }}
            >
              Trend
            </Button>
          </Box>
        </Box>

        {compareOrganicMode === 'map' ? (
          <Box sx={{ p: 1.5 }}>
            {scatterRows.length === 0 ? (
              <Box
                sx={{
                  minHeight: 320,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(255,255,255,0.54)',
                  fontSize: '0.76rem',
                }}
              >
                No rank data available for scatter plot.
              </Box>
            ) : (
              <Box role="img" aria-label="Demand versus rank scatter plot comparing purchase share to organic rank across clusters">
                <ResponsiveChartFrame height={340}>
                  <ScatterChart margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      type="number"
                      dataKey="purchase_share"
                      name="Purchase share"
                      tickFormatter={(value) => formatPercent(value, 0)}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      type="number"
                      dataKey="avg_rank"
                      name="Organic rank"
                      reversed
                      tickFormatter={(value) => formatDecimal(value, 0)}
                      tick={{ fontSize: 10 }}
                    />
                    <ZAxis dataKey="market_purchases" range={[90, 360]} name="Root demand" />
                    <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={scatterTooltipFormatter} />
                    <Scatter data={scatterRows} fill="#00C2B9" stroke="#0E3A60" strokeOpacity={0.18} />
                  </ScatterChart>
                </ResponsiveChartFrame>
              </Box>
            )}
          </Box>
        ) : (
          <Box
            sx={{
              p: 1.5,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.1fr 0.9fr' },
              gap: 2,
            }}
          >
            <Box>
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', mb: 1 }}>
                Organic Rank Trend
              </Typography>
              {viewModel.lineClusters.length === 0 ? (
                <Box
                  sx={{
                    minHeight: 240,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'rgba(255,255,255,0.54)',
                    fontSize: '0.76rem',
                  }}
                >
                  No rank trend data.
                </Box>
              ) : (
                <Box role="img" aria-label="Organic rank trend over weeks for tracked clusters">
                  <ResponsiveChartFrame height={320}>
                    <LineChart data={viewModel.rankRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
                      <YAxis reversed tickFormatter={(value) => formatDecimal(value, 1)} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={rankTooltipFormatter} />
                      <ReferenceLine y={10} stroke="rgba(255,255,255,0.08)" />
                      <Legend wrapperStyle={{ paddingTop: 6, fontSize: 10 }} />
                      {viewModel.lineClusters.map((cluster, index) => (
                        <Line
                          key={cluster.id}
                          type="monotone"
                          dataKey={cluster.cluster}
                          stroke={LINE_COLORS[index % LINE_COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 1.75, strokeWidth: 0, fill: LINE_COLORS[index % LINE_COLORS.length] }}
                          activeDot={{ r: 3.5 }}
                          connectNulls={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveChartFrame>
                </Box>
              )}
            </Box>

            <Box>
              <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)', mb: 1 }}>
                Rank Heatmap
              </Typography>
              <RankHeatmap bundle={bundle} clusterIds={bundle.lineClusterIds} />
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ ...panelSx, gridColumn: '1 / -1' }}>
        <PanelTitle title="Paid Support" badge="Sponsored Products" />
        <Box sx={{ p: 1.5 }}>
          {viewModel.ppcRows.length === 0 ? (
            <Box
              sx={{
                minHeight: 240,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'rgba(255,255,255,0.54)',
                fontSize: '0.76rem',
              }}
            >
              No PPC data available.
            </Box>
          ) : (
            <Box role="img" aria-label="Paid support horizontal bar chart comparing PPC spend and PPC sales by cluster">
              <ResponsiveChartFrame height={320}>
                <BarChart data={viewModel.ppcRows} layout="vertical" margin={{ top: 8, right: 16, left: 24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => formatCompactNumber(value)} tick={{ fontSize: 10 }} />
                  <YAxis
                    type="category"
                    dataKey="cluster"
                    width={132}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value: string) => (value.length > 18 ? `${value.slice(0, 18)}...` : value)}
                  />
                  <Tooltip formatter={ppcTooltipFormatter} />
                  <Legend wrapperStyle={{ paddingTop: 6, fontSize: 10 }} />
                  <Bar dataKey="ppc_spend" fill="#0E3A60" radius={[0, 6, 6, 0]} name="PPC spend" />
                  <Bar dataKey="ppc_sales" fill="#00C2B9" radius={[0, 6, 6, 0]} name="PPC sales" />
                </BarChart>
              </ResponsiveChartFrame>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
