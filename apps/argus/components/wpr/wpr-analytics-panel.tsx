'use client'

import type { ReactNode } from 'react'
import { Box, Stack, Typography } from '@mui/material'
import { panelSx, subtleBorder, textMuted, textSecondary } from '@/lib/wpr/panel-tokens'

export function WprAnalyticsMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <Box
      sx={{
        minHeight: 48,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
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

export function WprAnalyticsFooter({
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

export function WprAnalyticsPanel({
  title,
  meta,
  children,
  footer,
}: {
  title: string
  meta: string[]
  children: ReactNode
  footer: ReactNode
}) {
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
            {title}
          </Typography>
          <Typography sx={{ fontSize: '0.72rem', color: textSecondary }}>
            {meta.join(' · ')}
          </Typography>
        </Stack>
      </Box>

      <Box sx={{ p: 2.5 }}>{children}</Box>

      {footer}
    </Box>
  )
}
