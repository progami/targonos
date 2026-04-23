'use client'

import { MenuItem, Select, Stack, Typography } from '@mui/material'
import { textMuted, textPrimary } from '@/lib/wpr/panel-tokens'
import type { WeekLabel } from '@/lib/wpr/types'
import { formatWeekLabelFromLookup } from '@/lib/wpr/week-display'

export default function WprWeekSelect({
  label,
  selectedWeek,
  weeks,
  weekStartDates,
  onSelectWeek,
  minWidth = 228,
}: {
  label: string
  selectedWeek: WeekLabel
  weeks: WeekLabel[]
  weekStartDates: Record<WeekLabel, string>
  onSelectWeek: (week: WeekLabel) => void
  minWidth?: number
}) {
  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography
        sx={{
          fontSize: '0.65rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: textMuted,
          fontWeight: 600,
        }}
      >
        {label}
      </Typography>
      <Select
        size="small"
        value={selectedWeek}
        onChange={(event) => onSelectWeek(event.target.value as WeekLabel)}
        sx={{
          minWidth,
          fontSize: '0.75rem',
          color: textPrimary,
          bgcolor: 'rgba(255,255,255,0.03)',
          '& .MuiSelect-icon': {
            color: textMuted,
          },
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.08)',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: 'rgba(255,255,255,0.16)',
          },
          '& .MuiSelect-select': {
            py: 0.75,
          },
        }}
      >
        {weeks.map((week) => (
          <MenuItem key={week} value={week} sx={{ fontSize: '0.75rem' }}>
            {formatWeekLabelFromLookup(week, weekStartDates)}
          </MenuItem>
        ))}
      </Select>
    </Stack>
  )
}
