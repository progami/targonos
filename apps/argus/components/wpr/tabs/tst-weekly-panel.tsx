'use client'

import { Box, Button, Stack, Typography } from '@mui/material'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { WprCompWowVisible } from '@/lib/wpr/dashboard-state'
import type { TstSelectionViewModel } from '@/lib/wpr/tst-view-model'
import type { WprCompetitorSummary } from '@/lib/wpr/types'
import { panelSx, subtleBorder, textMuted, textSecondary } from '@/lib/wpr/panel-tokens'
import { formatPercent } from '@/lib/wpr/format'

type TstHeroContent = {
  name: string
  meta: string[]
}

function blankMetricValue(): string {
  return '---'
}

function MetricChip({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <Box>
      <Typography
        sx={{
          fontSize: '0.58rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: textMuted,
          mb: 0.35,
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '1.18rem',
          fontWeight: 700,
          letterSpacing: '-0.04em',
          color: 'rgba(255,255,255,0.92)',
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

function Footer({
  items,
}: {
  items: string[]
}) {
  return (
    <Box
      sx={{
        px: 2.5,
        py: 1.2,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 2,
        borderTop: subtleBorder,
        color: textMuted,
      }}
    >
      {items.map((item) => (
        <Typography
          key={item}
          sx={{
            fontSize: '0.64rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          {item}
        </Typography>
      ))}
    </Box>
  )
}

function WeeklyGapChart({
  competitor,
  weekly,
  wowVisible,
  setWowVisible,
}: {
  competitor: WprCompetitorSummary
  weekly: TstSelectionViewModel['weekly']
  wowVisible: WprCompWowVisible
  setWowVisible: (nextState: WprCompWowVisible) => void
}) {
  const visibleSeries = [
    wowVisible.click ? { key: 'clickGap', label: 'Click Gap', color: '#77dfd0' } : null,
    wowVisible.purch ? { key: 'purchaseGap', label: 'Purch Gap', color: '#d5ff62' } : null,
  ].filter((value): value is { key: 'clickGap' | 'purchaseGap'; label: string; color: string } => value !== null)

  if (weekly.length === 0) {
    return (
      <Box
        sx={{
          minHeight: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.54)',
          fontSize: '0.78rem',
          letterSpacing: '0.03em',
        }}
      >
        No weekly TST history for this selection.
      </Box>
    )
  }

  if (visibleSeries.length === 0) {
    return (
      <Box
        sx={{
          minHeight: 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(255,255,255,0.54)',
          fontSize: '0.78rem',
          letterSpacing: '0.03em',
        }}
      >
        Turn on at least one series to view the TST history chart.
      </Box>
    )
  }

  const chartRows = weekly.map((week) => ({
    weekLabel: week.week_label,
    clickGap: week.observed.click_gap * 100,
    purchaseGap: week.observed.purchase_gap * 100,
  }))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Stack spacing={0.35}>
          <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
            Week over week
          </Typography>
          <Typography sx={{ fontSize: '0.68rem', color: textMuted }}>
            {`${competitor.brand} share gap shown in pts`}
          </Typography>
        </Stack>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            size="small"
            variant={wowVisible.click ? 'contained' : 'outlined'}
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                click: !wowVisible.click,
              })
            }}
          >
            Click Gap
          </Button>
          <Button
            size="small"
            variant={wowVisible.purch ? 'contained' : 'outlined'}
            onClick={() => {
              setWowVisible({
                ...wowVisible,
                purch: !wowVisible.purch,
              })
            }}
          >
            Purch Gap
          </Button>
        </Box>
      </Box>

      <Box sx={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ top: 12, right: 16, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="weekLabel" tick={{ fontSize: 10 }} />
            <YAxis
              tick={{ fontSize: 10 }}
              tickFormatter={(value: number) => `${value.toFixed(0)} pts`}
            />
            <ReferenceLine y={0} stroke="rgba(255,255,255,0.18)" strokeDasharray="4 4" />
            <Tooltip
              formatter={(value: number, key: string) => {
                const label = key === 'clickGap' ? 'Click Gap' : 'Purch Gap'
                return [`${value.toFixed(1)} pts`, label]
              }}
              contentStyle={{
                background: 'rgba(0,20,35,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
              }}
            />
            {visibleSeries.map((series) => (
              <Line
                key={series.key}
                type="monotone"
                dataKey={series.key}
                stroke={series.color}
                strokeWidth={2.2}
                dot={{ r: 2.5, strokeWidth: 0, fill: series.color }}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  )
}

export default function TstWeeklyPanel({
  competitor,
  heroContent,
  viewModel,
  selectedWeekLabel,
  historyLabel,
  wowVisible,
  setWowVisible,
}: {
  competitor: WprCompetitorSummary
  heroContent: TstHeroContent
  viewModel: TstSelectionViewModel
  selectedWeekLabel: string
  historyLabel: string
  wowVisible: WprCompWowVisible
  setWowVisible: (nextState: WprCompWowVisible) => void
}) {
  const blankTopValues = viewModel.scopeType === 'no-terms'
  const current = viewModel.current

  let footerItems = [
    `Source: TST`,
    `Scope: ${viewModel.scopeType}`,
    `Roots: ${viewModel.rootIds.length}`,
    `TST terms: ${viewModel.selectedTermIds.length} / ${viewModel.allTermIds.length}`,
    `Table week: ${selectedWeekLabel}`,
    `Chart history: ${historyLabel}`,
  ]

  if (current !== null && viewModel.scopeType !== 'empty' && viewModel.scopeType !== 'no-terms') {
    footerItems = [
      `Covered terms: ${current.coverage.terms_covered} / ${viewModel.allTermIds.length}`,
      `Term-weeks: ${current.coverage.term_weeks_covered}`,
      `TST rows capture: ${formatPercent(current.coverage.avg_click_pool_share, 1)} clicks`,
      `TST rows capture: ${formatPercent(current.coverage.avg_purchase_pool_share, 1)} purchases`,
      `Table week: ${selectedWeekLabel}`,
      `Chart history: ${historyLabel}`,
    ]
  }

  return (
    <Box sx={panelSx}>
      <Box
        sx={{
          px: 2.5,
          pt: 2,
          pb: 1.25,
          borderBottom: subtleBorder,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Stack spacing={0.45}>
          <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
            {heroContent.name}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: textSecondary }}>
            {heroContent.meta.join(' · ')}
          </Typography>
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
          gap: 1.5,
          px: 2.5,
          py: 1.75,
          borderBottom: subtleBorder,
        }}
      >
        <MetricChip
          label="Terms Covered"
          value={blankTopValues || current === null ? blankMetricValue() : String(current.coverage.terms_covered)}
        />
        <MetricChip
          label="Term-Weeks"
          value={blankTopValues || current === null ? blankMetricValue() : String(current.coverage.term_weeks_covered)}
        />
        <MetricChip
          label="Our Click Share"
          value={blankTopValues || current === null ? blankMetricValue() : formatPercent(current.observed.our_click_share, 1)}
        />
        <MetricChip
          label={`${competitor.brand} Click Share`}
          value={blankTopValues || current === null ? blankMetricValue() : formatPercent(current.observed.competitor_click_share, 1)}
        />
      </Box>

      <Box sx={{ p: 2.5 }}>
        {viewModel.scopeType === 'empty' ? (
          <Box
            sx={{
              minHeight: 260,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.54)',
              fontSize: '0.78rem',
              letterSpacing: '0.03em',
            }}
          >
            Use the table below to select roots and TST terms for the TST view.
          </Box>
        ) : viewModel.scopeType === 'no-terms' ? (
          <Box
            sx={{
              minHeight: 260,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.54)',
              fontSize: '0.78rem',
              letterSpacing: '0.03em',
            }}
          >
            No terms selected. Use the table below to reselect TST terms.
          </Box>
        ) : (
          <WeeklyGapChart
            competitor={competitor}
            weekly={viewModel.weekly}
            wowVisible={wowVisible}
            setWowVisible={setWowVisible}
          />
        )}
      </Box>

      <Footer items={footerItems} />
    </Box>
  )
}
