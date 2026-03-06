'use client'

import {
  alpha,
  Box,
  Chip,
  Stack,
  Typography,
} from '@mui/material'
import type {
  MonitoringCategory,
  MonitoringOwner,
  MonitoringSeverity,
} from '@/lib/monitoring/types'

export function OwnerChip({ owner }: { owner: MonitoringOwner }) {
  const label =
    owner === 'OURS' ? 'Ours' : owner === 'COMPETITOR' ? 'Competitor' : 'Unknown'

  return (
    <Chip
      label={label}
      size="small"
      sx={{
        fontWeight: 700,
        borderRadius: 999,
        bgcolor:
          owner === 'OURS'
            ? alpha('#1f6a5a', 0.14)
            : owner === 'COMPETITOR'
              ? alpha('#b46832', 0.16)
              : alpha('#59697a', 0.18),
        color:
          owner === 'OURS' ? '#17483e' : owner === 'COMPETITOR' ? '#7b4215' : '#334155',
      }}
    />
  )
}

export function SeverityChip({ severity }: { severity: MonitoringSeverity }) {
  const palette = getSeverityPalette(severity)
  return (
    <Chip
      label={severity.toUpperCase()}
      size="small"
      sx={{
        fontWeight: 800,
        letterSpacing: '0.06em',
        borderRadius: 999,
        bgcolor: alpha(palette.main, 0.12),
        color: palette.main,
      }}
    />
  )
}

export function CategoryChip({ category }: { category: MonitoringCategory }) {
  const label = category.charAt(0).toUpperCase() + category.slice(1)
  return (
    <Chip
      label={label}
      size="small"
      variant="outlined"
      sx={{
        borderRadius: 999,
        borderColor: alpha('#0f172a', 0.12),
        color: '#334155',
        bgcolor: alpha('#ffffff', 0.72),
      }}
    />
  )
}

export function MetricCard(props: {
  label: string
  value: string | number
  helper?: string
  accent?: string
}) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1.5,
        borderRadius: 2.5,
        border: '1px solid rgba(15, 23, 42, 0.07)',
        bgcolor: 'rgba(255, 255, 255, 0.72)',
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', letterSpacing: '0.04em', fontSize: '0.68rem' }}
      >
        {props.label}
      </Typography>
      <Typography
        variant="h6"
        sx={{
          fontWeight: 800,
          lineHeight: 1.15,
          color: props.accent ?? '#0f172a',
          mt: 0.2,
        }}
      >
        {props.value}
      </Typography>
      {props.helper ? (
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
          {props.helper}
        </Typography>
      ) : null}
    </Box>
  )
}

export function DataField(props: {
  label: string
  value: string
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 140px) minmax(0, 1fr)',
        gap: 1.5,
        alignItems: 'start',
      }}
    >
      <Typography variant="caption" sx={{ color: 'text.secondary', letterSpacing: '0.04em' }}>
        {props.label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
        {props.value}
      </Typography>
    </Box>
  )
}

export function formatMoney(value: number | null, currency: string | null): string {
  if (value === null) return '—'
  if (!currency) return value.toFixed(2)

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return value.toFixed(2)
  }
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

export function formatCount(value: number | null): string {
  if (value === null) return '—'
  return value.toLocaleString()
}

export function humanizeFieldName(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getSeverityPalette(severity: MonitoringSeverity) {
  switch (severity) {
    case 'critical':
      return { main: '#b5362d' }
    case 'high':
      return { main: '#cc6b1e' }
    case 'medium':
      return { main: '#7f5f00' }
    case 'low':
      return { main: '#41576d' }
  }
}
