'use client'

import type { ReactNode } from 'react'
import { Box, Typography } from '@mui/material'
import { panelSx, subtleBorder, textMuted } from '@/lib/wpr/panel-tokens'

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
  children,
  footer,
}: {
  children: ReactNode
  footer: ReactNode
}) {
  return (
    <Box sx={panelSx}>
      <Box sx={{ p: 2.5 }}>{children}</Box>

      {footer}
    </Box>
  )
}
