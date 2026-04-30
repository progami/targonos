'use client'

import type { ReactNode } from 'react'
import { Box, TableContainer, Typography } from '@mui/material'
import { panelSx, subtleBorder, textMuted } from '@/lib/wpr/panel-tokens'

export const wprSelectionHeaderCellSx = {
  bgcolor: 'rgba(0, 20, 35, 0.96)',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}

export const wprSelectionMetricCellSx = {
  fontSize: '0.72rem',
  color: 'rgba(255,255,255,0.76)',
  borderBottom: '1px solid rgba(255,255,255,0.04)',
}

export function WprSelectionPanel({
  title,
  summary,
  toolbar,
  children,
  tableMaxHeight = 640,
}: {
  title: string
  summary: string
  toolbar?: ReactNode
  children: ReactNode
  tableMaxHeight?: number
}) {
  return (
    <Box sx={panelSx}>
      <Box
        sx={{
          px: 2,
          py: 1.3,
          borderBottom: subtleBorder,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: '0.64rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: textMuted,
            }}
          >
            {title}
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>
            {summary}
          </Typography>
        </Box>

        {toolbar}
      </Box>

      <TableContainer sx={{ maxHeight: tableMaxHeight, overflowX: 'auto' }}>{children}</TableContainer>
    </Box>
  )
}
