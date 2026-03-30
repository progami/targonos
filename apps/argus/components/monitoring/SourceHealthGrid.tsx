'use client'

import { useMemo, useState } from 'react'
import {
  Alert,
  alpha,
  Box,
  Chip,
  Collapse,
  IconButton,
  LinearProgress,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type {
  MonitoringHealthDataset,
  MonitoringHealthReport,
  MonitoringSchedulerJob,
  MonitoringSourceType,
} from '@/lib/monitoring/types'
import { formatDateTime } from '@/components/monitoring/ui'

/* ── Status helpers ─────────────────────────────────────── */

type UnifiedStatus = 'healthy' | 'stale' | 'failed'

const STATUS_DOT: Record<UnifiedStatus, string> = {
  healthy: '#22c55e',
  stale: '#f59e0b',
  failed: '#ef4444',
}

const SOURCE_TYPE_STYLES: Record<MonitoringSourceType, { bg: string; color: string }> = {
  API: { bg: 'rgba(0, 44, 81, 0.08)', color: '#0b273f' },
  BROWSER: { bg: 'rgba(0, 194, 185, 0.12)', color: '#007a6d' },
  MANUAL: { bg: 'rgba(180, 104, 50, 0.12)', color: '#7b4215' },
}

function deriveJobStatus(job: MonitoringSchedulerJob, datasets: MonitoringHealthDataset[]): UnifiedStatus {
  if (job.status === 'failed' || job.status === 'missing') return 'failed'
  const jobDatasets = datasets.filter((ds) => ds.producedBy === job.label)
  if (jobDatasets.some((ds) => ds.status === 'stale' || ds.status === 'missing')) return 'stale'
  return 'healthy'
}

function formatAge(minutes: number | null): string {
  if (minutes === null) return '—'
  if (minutes < 60) return `${minutes}m ago`
  const hours = minutes / 60
  if (hours < 48) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h ago`
  return `${(hours / 24).toFixed(1)}d ago`
}

/* ── Component ──────────────────────────────────────────── */

interface SourceHealthGridProps {
  health: MonitoringHealthReport | null
  healthError: string | null
}

export default function SourceHealthGrid({ health, healthError }: SourceHealthGridProps) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  const jobsWithStatus = useMemo(() => {
    if (!health) return []
    return health.jobs.map((job) => ({
      job,
      status: deriveJobStatus(job, health.datasets),
      datasets: health.datasets.filter((ds) => ds.producedBy === job.label),
    }))
  }, [health])

  const manualDatasets = useMemo(() => {
    if (!health) return []
    return health.datasets.filter((ds) => ds.sourceType === 'MANUAL')
  }, [health])

  const sortedJobs = useMemo(() => {
    const order: Record<UnifiedStatus, number> = { failed: 0, stale: 1, healthy: 2 }
    return [...jobsWithStatus].sort((a, b) => order[a.status] - order[b.status])
  }, [jobsWithStatus])

  const counts = useMemo(() => {
    const allStatuses = [
      ...jobsWithStatus.map((j) => j.status),
      ...manualDatasets.map((ds) => ds.status === 'healthy' ? 'healthy' as const : 'stale' as const),
    ]
    return {
      total: allStatuses.length,
      healthy: allStatuses.filter((s) => s === 'healthy').length,
      stale: allStatuses.filter((s) => s === 'stale').length,
      failed: allStatuses.filter((s) => s === 'failed').length,
    }
  }, [jobsWithStatus, manualDatasets])

  if (healthError) {
    return <Alert severity="error" sx={{ borderRadius: 3, m: 2.5 }}>{healthError}</Alert>
  }

  if (!health) {
    return <LinearProgress />
  }

  return (
    <Box sx={{ p: 2.5 }}>
      <Stack spacing={3}>
        {/* Summary counters */}
        <Stack direction="row" spacing={3}>
          <Counter label="Sources" value={counts.total} color="#0b273f" />
          <Counter label="Healthy" value={counts.healthy} color="#22c55e" />
          <Counter label="Stale" value={counts.stale} color="#f59e0b" />
          <Counter label="Failed" value={counts.failed} color="#ef4444" />
        </Stack>

        {/* Job rows */}
        <Stack spacing={1}>
          {sortedJobs.map(({ job, status, datasets }) => {
            const expanded = expandedJobId === job.id
            const typeStyle = SOURCE_TYPE_STYLES[job.sourceType]
            return (
              <Box
                key={job.id}
                sx={{
                  borderRadius: 2.5,
                  border: '1px solid rgba(15, 23, 42, 0.08)',
                  bgcolor: 'rgba(255,255,255,0.78)',
                  overflow: 'hidden',
                }}
              >
                {/* Row header */}
                <Box
                  onClick={() => setExpandedJobId(expanded ? null : job.id)}
                  sx={{
                    px: 2,
                    py: 1.5,
                    cursor: 'pointer',
                    display: 'grid',
                    gridTemplateColumns: '8px 1fr auto',
                    gap: 1.5,
                    alignItems: 'center',
                    '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.02)' },
                  }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS_DOT[status] }} />
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        {job.label}
                      </Typography>
                      <Chip
                        label={job.sourceType}
                        size="small"
                        sx={{ height: 18, fontSize: '0.6rem', fontWeight: 700, bgcolor: typeStyle.bg, color: typeStyle.color }}
                      />
                      <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                        {job.schedule}
                      </Typography>
                    </Stack>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                      {datasets.length > 0
                        ? datasets.map((ds) => ds.label).join(' · ')
                        : job.outputs.join(' · ')}
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={1.5} alignItems="center">
                    {datasets[0]?.updatedAt ? (
                      <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'text.secondary' }}>
                        {formatAge(datasets[0].ageMinutes)}
                      </Typography>
                    ) : null}
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

                {/* Expanded: dataset details */}
                <Collapse in={expanded}>
                  <Box sx={{ borderTop: '1px solid rgba(15, 23, 42, 0.06)', px: 2, py: 1.5 }}>
                    {datasets.length > 0 ? (
                      <Box
                        component="table"
                        sx={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          '& td, & th': { py: 0.6, px: 1, fontSize: '0.75rem', textAlign: 'left' },
                          '& th': { color: 'text.secondary', fontWeight: 600, fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.04em' },
                          '& td': { color: 'text.primary' },
                          '& tr:not(:last-child) td': { borderBottom: '1px solid rgba(15, 23, 42, 0.04)' },
                        }}
                      >
                        <thead>
                          <tr>
                            <th>Output</th>
                            <th>Status</th>
                            <th>Last updated</th>
                            <th>Age</th>
                            <th>Purpose</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {datasets.map((ds) => (
                            <tr key={ds.id}>
                              <td style={{ fontWeight: 600 }}>{ds.label}</td>
                              <td>
                                <Chip
                                  label={ds.status.toUpperCase()}
                                  size="small"
                                  sx={{
                                    height: 18,
                                    fontSize: '0.6rem',
                                    fontWeight: 700,
                                    bgcolor: alpha(STATUS_DOT[ds.status === 'healthy' ? 'healthy' : ds.status === 'stale' ? 'stale' : 'failed'], 0.12),
                                    color: STATUS_DOT[ds.status === 'healthy' ? 'healthy' : ds.status === 'stale' ? 'stale' : 'failed'],
                                  }}
                                />
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                                {formatDateTime(ds.updatedAt)}
                              </td>
                              <td style={{ fontFamily: 'var(--font-mono)' }}>{formatAge(ds.ageMinutes)}</td>
                              <td style={{ color: '#6a93b3' }}>{ds.purpose}</td>
                              <td>
                                {ds.driveUrl ? (
                                  <Tooltip title="Open in Google Drive">
                                    <IconButton
                                      size="small"
                                      component="a"
                                      href={ds.driveUrl}
                                      target="_blank"
                                      rel="noopener"
                                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                      sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}
                                    >
                                      <OpenInNewIcon sx={{ fontSize: 16 }} />
                                    </IconButton>
                                  </Tooltip>
                                ) : null}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Outputs: {job.outputs.join(', ')}
                      </Typography>
                    )}

                    {/* Job meta */}
                    <Stack
                      direction="row"
                      spacing={3}
                      sx={{ mt: 1.5, pt: 1, borderTop: '1px solid rgba(15, 23, 42, 0.04)' }}
                    >
                      <MetaItem label="LaunchAgent" value={job.launchdLabel} mono />
                      <MetaItem label="Status" value={job.status === 'running' ? `Running (PID ${job.pid})` : job.status} />
                      {job.latestRunStatus && job.latestRunAt ? (
                        <MetaItem
                          label="Latest run"
                          value={`${job.latestRunStatus} · ${formatDateTime(job.latestRunAt)}`}
                        />
                      ) : null}
                      {job.lastExitStatus !== null ? (
                        <MetaItem label="Launchd exit" value={String(job.lastExitStatus)} mono />
                      ) : null}
                    </Stack>
                  </Box>
                </Collapse>
              </Box>
            )
          })}

          {/* Manual datasets */}
          {manualDatasets.length > 0 ? (
            <Box
              sx={{
                borderRadius: 2.5,
                border: '1px solid rgba(15, 23, 42, 0.08)',
                bgcolor: 'rgba(255,255,255,0.78)',
                px: 2,
                py: 1.5,
              }}
            >
              <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem', display: 'block', mb: 1 }}>
                Manual sources
              </Typography>
              {manualDatasets.map((ds) => (
                <Box
                  key={ds.id}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '8px 1fr auto',
                    gap: 1.5,
                    alignItems: 'center',
                    py: 0.6,
                    '&:not(:last-child)': { borderBottom: '1px solid rgba(15, 23, 42, 0.04)' },
                  }}
                >
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: STATUS_DOT[ds.status === 'healthy' ? 'healthy' : 'stale'] }} />
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem' }}>
                      {ds.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.72rem' }}>
                      {ds.purpose}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'text.secondary' }}>
                    {formatAge(ds.ageMinutes)}
                  </Typography>
                </Box>
              ))}
            </Box>
          ) : null}
        </Stack>
      </Stack>
    </Box>
  )
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline">
      <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-mono)', color }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}>
        {label}
      </Typography>
    </Stack>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: '0.75rem', fontWeight: 600, ...(mono && { fontFamily: 'var(--font-mono)' }) }}>
        {value}
      </Typography>
    </Box>
  )
}
