'use client'

import {
  Box,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type {
  MonitoringCategory,
  MonitoringChangeEvent,
  MonitoringSeverity,
} from '@/lib/monitoring/types'
import { formatMonitoringLabel, type MonitoringLabelSource } from '@/lib/monitoring/labels'

type OwnerFilter = 'ALL' | 'OURS' | 'COMPETITOR'

const WINDOWS = [
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: 'all' },
] as const

const CATEGORY_OPTIONS: Array<{ value: MonitoringCategory | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All categories' },
  { value: 'status', label: 'Status' },
  { value: 'content', label: 'Content' },
  { value: 'images', label: 'Images' },
  { value: 'price', label: 'Price' },
  { value: 'offers', label: 'Offers' },
  { value: 'rank', label: 'Rank' },
  { value: 'catalog', label: 'Catalog' },
]

const SEVERITY_OPTIONS: Array<{ value: MonitoringSeverity | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const SEVERITY_BORDER_COLORS: Record<MonitoringSeverity, string> = {
  critical: '#b5362d',
  high: '#cc6b1e',
  medium: '#7f5f00',
  low: '#94a3b8',
}

interface FeedRailProps {
  changes: MonitoringChangeEvent[]
  loading: boolean
  selectedEventId: string | null
  onSelectEvent: (id: string) => void
  windowValue: '24h' | '7d' | '30d' | 'all'
  onWindowChange: (value: '24h' | '7d' | '30d' | 'all') => void
  owner: OwnerFilter
  onOwnerChange: (value: OwnerFilter) => void
  category: MonitoringCategory | 'ALL'
  onCategoryChange: (value: MonitoringCategory | 'ALL') => void
  severity: MonitoringSeverity | 'ALL'
  onSeverityChange: (value: MonitoringSeverity | 'ALL') => void
  query: string
  onQueryChange: (value: string) => void
}

export default function FeedRail({
  changes,
  loading,
  selectedEventId,
  onSelectEvent,
  windowValue,
  onWindowChange,
  owner,
  onOwnerChange,
  category,
  onCategoryChange,
  severity,
  onSeverityChange,
  query,
  onQueryChange,
}: FeedRailProps) {
  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid rgba(15, 23, 42, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Filters */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
        <Stack spacing={1}>
          <FormControl size="small" fullWidth>
            <InputLabel>Window</InputLabel>
            <Select
              value={windowValue}
              label="Window"
              onChange={(e) => onWindowChange(e.target.value as typeof windowValue)}
            >
              {WINDOWS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Owner</InputLabel>
            <Select
              value={owner}
              label="Owner"
              onChange={(e) => onOwnerChange(e.target.value as OwnerFilter)}
            >
              <MenuItem value="ALL">All owners</MenuItem>
              <MenuItem value="OURS">Ours</MenuItem>
              <MenuItem value="COMPETITOR">Competitors</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => onCategoryChange(e.target.value as MonitoringCategory | 'ALL')}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Severity</InputLabel>
            <Select
              value={severity}
              label="Severity"
              onChange={(e) => onSeverityChange(e.target.value as MonitoringSeverity | 'ALL')}
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            fullWidth
            placeholder="Search..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </Stack>
      </Box>

      {/* Event list */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? <LinearProgress /> : null}
        {changes.map((item) => {
          const selected = item.id === selectedEventId
          const label = formatMonitoringLabel(
            (item.currentSnapshot ?? item.baselineSnapshot ?? { asin: item.asin }) as MonitoringLabelSource,
          )
          return (
            <Box
              key={item.id}
              onClick={() => onSelectEvent(item.id)}
              sx={{
                px: 1.5,
                py: 1.2,
                cursor: 'pointer',
                borderLeft: `3px solid ${SEVERITY_BORDER_COLORS[item.severity]}`,
                bgcolor: selected ? 'rgba(24, 88, 78, 0.08)' : 'transparent',
                '&:hover': { bgcolor: selected ? 'rgba(24, 88, 78, 0.08)' : 'rgba(15, 23, 42, 0.03)' },
                borderBottom: '1px solid rgba(15, 23, 42, 0.05)',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.headline}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
              >
                {label} · {formatRelativeTime(item.timestamp)}
              </Typography>
            </Box>
          )
        })}
        {!loading && changes.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No matching events
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
