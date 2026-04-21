'use client'

import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { WPR_CHART_HEIGHT } from '@/lib/wpr/chart-layout'
import { chartControlRailSx, subtleBorder, textMuted, textSecondary } from '@/lib/wpr/panel-tokens'

const chartViewportSx = {
  height: WPR_CHART_HEIGHT,
  minHeight: WPR_CHART_HEIGHT,
  border: subtleBorder,
  borderRadius: '12px',
  bgcolor: 'rgba(255,255,255,0.018)',
  overflow: 'hidden',
}

const controlGroupLabelSx = {
  fontSize: '0.58rem',
  fontWeight: 700,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.12em',
  color: textMuted,
}

export function WprChartControlGroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <Stack spacing={0.45}>
      <Typography sx={controlGroupLabelSx}>{label}</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>{children}</Box>
    </Stack>
  )
}

export function WprChartEmptyState({
  children,
}: {
  children: ReactNode
}) {
  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.54)',
        fontSize: '0.78rem',
        letterSpacing: '0.03em',
        px: 2,
        textAlign: 'center',
      }}
    >
      {children}
    </Box>
  )
}

export function WprChartShell({
  title,
  description,
  changeSummary,
  primaryControls,
  secondaryControls,
  children,
}: {
  title: string
  description: string
  changeSummary: string
  primaryControls?: ReactNode
  secondaryControls?: ReactNode
  children: ReactNode
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          ...chartControlRailSx,
          alignItems: 'flex-start',
        }}
      >
        <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap" alignItems="flex-start">
          <Stack spacing={0.35}>
            <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
              {title}
            </Typography>
            <Typography sx={{ fontSize: '0.68rem', color: textSecondary }}>
              {description}
            </Typography>
          </Stack>

          <Box
            data-change-visibility="wpr"
            sx={{
              px: 1.1,
              py: 0.75,
              border: subtleBorder,
              borderRadius: '10px',
              bgcolor: 'rgba(255,255,255,0.03)',
            }}
          >
            <Typography sx={controlGroupLabelSx}>Change log</Typography>
            <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.82)', mt: 0.25 }}>
              {changeSummary}
            </Typography>
          </Box>

          {primaryControls}
        </Stack>

        {secondaryControls}
      </Box>

      <Box sx={chartViewportSx}>{children}</Box>
    </Box>
  )
}
