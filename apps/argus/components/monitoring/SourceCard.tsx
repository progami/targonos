'use client'

import { useEffect, useState } from 'react'
import {
  Box,
  Chip,
  Collapse,
  Stack,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { MonitoringHealthDataset, MonitoringSchedulerJob } from '@/lib/monitoring/types'
import { appendMarketParam, type ArgusMarket } from '@/lib/argus-market'

export type UnifiedSourceStatus = 'healthy' | 'stale' | 'failed'

export interface UnifiedSource {
  job: MonitoringSchedulerJob
  primaryDataset: MonitoringHealthDataset | null
  status: UnifiedSourceStatus
}

interface RunLogEntry {
  timestamp: string
  status: 'ok' | 'failed'
  summary: string
  durationMs: number
  errorMessage?: string
}

const STATUS_COLORS: Record<UnifiedSourceStatus, string> = {
  healthy: '#22c55e',
  stale: '#f59e0b',
  failed: '#ef4444',
}

const SOURCE_TYPE_STYLES: Record<MonitoringSchedulerJob['sourceType'], { bg: string; color: string }> = {
  API: { bg: 'rgba(100, 160, 220, 0.15)', color: '#8FC7FF' },
  BROWSER: { bg: 'rgba(0, 194, 185, 0.15)', color: '#00C2B9' },
}

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

interface SourceCardProps {
  source: UnifiedSource
  market: ArgusMarket
  expanded: boolean
  onToggle: () => void
}

export default function SourceCard({ source, market, expanded, onToggle }: SourceCardProps) {
  const { job, primaryDataset, status } = source
  const [runs, setRuns] = useState<RunLogEntry[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    setLoadingRuns(true)

    fetch(`${basePath}${appendMarketParam(`/api/monitoring/health/${job.id}/runs`, market)}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RunLogEntry[]) => {
        if (!cancelled) setRuns(data)
      })
      .finally(() => {
        if (!cancelled) setLoadingRuns(false)
      })

    return () => { cancelled = true }
  }, [expanded, job.id, market])

  const age = primaryDataset?.ageMinutes != null ? formatAge(primaryDataset.ageMinutes) : '—'
  const typeStyle = SOURCE_TYPE_STYLES[job.sourceType]

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid rgba(255, 255, 255, 0.08)',
        bgcolor: 'rgba(255, 255, 255, 0.03)',
        overflow: 'hidden',
        gridColumn: expanded ? '1 / -1' : undefined,
        transition: 'grid-column 0.15s',
      }}
    >
      {/* Card header — always visible */}
      <Box
        onClick={onToggle}
        sx={{
          px: 1.5,
          py: 1.2,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: STATUS_COLORS[status],
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {job.label}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip
                label={job.sourceType}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  bgcolor: typeStyle.bg,
                  color: typeStyle.color,
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
                {job.cadence}
              </Typography>
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, ml: 1 }}>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'text.secondary' }}
          >
            {age}
          </Typography>
          <ExpandMoreIcon
            sx={{
              fontSize: 18,
              color: 'text.secondary',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        </Stack>
      </Box>

      {/* Expanded run history */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1.5, borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1, mb: 0.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}
          >
            Recent runs
          </Typography>
          {loadingRuns ? (
            <Typography variant="caption" color="text.secondary">Loading...</Typography>
          ) : runs.length === 0 ? (
            <Typography variant="caption" color="text.secondary">No run history available</Typography>
          ) : (
            <Stack spacing={0}>
              {runs.map((run, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '8px 1fr auto',
                    gap: 1,
                    alignItems: 'center',
                    py: 0.5,
                    borderBottom: i < runs.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: run.status === 'ok' ? '#22c55e' : '#ef4444',
                    }}
                  />
                  <Box>
                    <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'text.secondary' }}>
                      {new Date(run.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', fontSize: '0.68rem' }}>
                      {run.summary}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'text.secondary' }}>
                    {formatDuration(run.durationMs)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 48) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}
