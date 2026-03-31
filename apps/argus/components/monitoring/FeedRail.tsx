'use client'

import {
  Box,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
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

const SEVERITY_COLORS: Record<MonitoringSeverity, string> = {
  critical: '#b5362d',
  high: '#cc6b1e',
  medium: '#7f5f00',
  low: '#94a3b8',
}

const CATEGORY_LABELS: Record<MonitoringCategory, string> = {
  status: 'Status',
  content: 'Content',
  images: 'Images',
  price: 'Price',
  offers: 'Offers',
  rank: 'Rank',
  catalog: 'Catalog',
}

interface FeedRailProps {
  changes: MonitoringChangeEvent[]
  loading: boolean
  selectedEventId: string | null
  onSelectEvent: (id: string) => void
  readIds: Set<string>
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
  readIds,
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
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      {/* Filters — horizontal row */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
          bgcolor: 'rgba(248, 250, 252, 0.5)',
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ flexWrap: 'wrap', gap: 1 }}
        >
          <FormControl size="small" sx={{ minWidth: 100 }}>
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

          <FormControl size="small" sx={{ minWidth: 120 }}>
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

          <FormControl size="small" sx={{ minWidth: 140 }}>
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

          <FormControl size="small" sx={{ minWidth: 130 }}>
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
            placeholder="Search..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            sx={{ minWidth: 160, flex: '0 1 220px' }}
          />
        </Stack>
      </Box>

      {/* Loading bar */}
      {loading ? <LinearProgress /> : null}

      {/* Event list — grid */}
      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          px: 2,
          py: 1.5,
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              md: 'repeat(3, 1fr)',
              lg: 'repeat(4, 1fr)',
            },
            gap: 1,
          }}
        >
          {changes.map((item) => {
            const selected = item.id === selectedEventId
            const unread = !readIds.has(item.id)
            const label = formatMonitoringLabel(
              (item.currentSnapshot ?? item.baselineSnapshot ?? { asin: item.asin }) as MonitoringLabelSource,
            )
            return (
              <Box
                key={item.id}
                onClick={() => onSelectEvent(item.id)}
                sx={{
                  px: 1.5,
                  py: 1,
                  cursor: 'pointer',
                  borderRadius: '6px',
                  borderLeft: `3px solid ${SEVERITY_COLORS[item.severity]}`,
                  bgcolor: selected
                    ? 'rgba(24, 88, 78, 0.08)'
                    : unread
                      ? 'rgba(0, 194, 185, 0.06)'
                      : 'rgba(15, 23, 42, 0.02)',
                  border: selected
                    ? '1px solid rgba(0, 194, 185, 0.25)'
                    : unread
                      ? '1px solid rgba(0, 194, 185, 0.15)'
                      : '1px solid rgba(15, 23, 42, 0.06)',
                  borderLeftWidth: '3px',
                  borderLeftColor: SEVERITY_COLORS[item.severity],
                  '&:hover': {
                    bgcolor: selected
                      ? 'rgba(24, 88, 78, 0.08)'
                      : 'rgba(15, 23, 42, 0.05)',
                  },
                  transition: 'background-color 0.12s, border-color 0.12s',
                }}
              >
                {/* Top row: category + severity dot + time */}
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 0.4 }}>
                  <Chip
                    label={CATEGORY_LABELS[item.primaryCategory]}
                    size="small"
                    sx={{
                      height: 18,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      bgcolor: 'rgba(15, 23, 42, 0.06)',
                      color: 'text.secondary',
                    }}
                  />
                  <FiberManualRecordIcon
                    sx={{
                      fontSize: 8,
                      color: SEVERITY_COLORS[item.severity],
                    }}
                  />
                  {unread ? (
                    <Box
                      sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: '#00C2B9',
                        ml: 'auto',
                        flexShrink: 0,
                      }}
                    />
                  ) : null}
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.62rem',
                      ml: unread ? 0 : 'auto',
                      flexShrink: 0,
                    }}
                  >
                    {formatRelativeTime(item.timestamp)}
                  </Typography>
                </Stack>

                {/* Headline */}
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: unread ? 800 : 600,
                    fontSize: '0.78rem',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    color: unread ? '#0b273f' : 'text.primary',
                  }}
                >
                  {item.headline}
                </Typography>

                {/* Product label */}
                <Typography
                  variant="caption"
                  sx={{ color: 'text.secondary', fontSize: '0.66rem' }}
                >
                  {label}
                </Typography>
              </Box>
            )
          })}
        </Box>

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
