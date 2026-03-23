'use client'

import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import type { MonitoringHealthReport } from '@/lib/monitoring/types'
import SourceCard, { type UnifiedSource, type UnifiedSourceStatus } from './SourceCard'

interface SourceHealthGridProps {
  health: MonitoringHealthReport | null
  healthError: string | null
}

export default function SourceHealthGrid({ health, healthError }: SourceHealthGridProps) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  const sources = useMemo((): UnifiedSource[] => {
    if (!health) return []

    return health.jobs.map((job) => {
      const primaryDatasetName = job.outputs[0] ?? null
      const primaryDataset = primaryDatasetName
        ? health.datasets.find((ds) => ds.label === primaryDatasetName) ?? null
        : null

      let status: UnifiedSourceStatus
      if (job.status === 'failed' || job.status === 'missing') {
        status = 'failed'
      } else if (primaryDataset && (primaryDataset.status === 'stale' || primaryDataset.status === 'missing')) {
        status = 'stale'
      } else {
        status = 'healthy'
      }

      return { job, primaryDataset, status }
    })
  }, [health])

  const sortedSources = useMemo(() => {
    const order: Record<UnifiedSourceStatus, number> = { failed: 0, stale: 1, healthy: 2 }
    return [...sources].sort((a, b) => order[a.status] - order[b.status])
  }, [sources])

  const counts = useMemo(() => {
    const total = sources.length
    const healthy = sources.filter((s) => s.status === 'healthy').length
    const stale = sources.filter((s) => s.status === 'stale').length
    const failed = sources.filter((s) => s.status === 'failed').length
    return { total, healthy, stale, failed }
  }, [sources])

  if (healthError) {
    return <Alert severity="error" sx={{ borderRadius: 3, m: 2.5 }}>{healthError}</Alert>
  }

  if (!health) {
    return <LinearProgress />
  }

  return (
    <Box sx={{ p: 2.5 }}>
      <Stack spacing={2.5}>
        {/* Summary counters */}
        <Stack direction="row" spacing={3}>
          <CounterChip label="Total" value={counts.total} color="#0b273f" />
          <CounterChip label="Healthy" value={counts.healthy} color="#22c55e" />
          <CounterChip label="Stale" value={counts.stale} color="#f59e0b" />
          <CounterChip label="Failed" value={counts.failed} color="#ef4444" />
        </Stack>

        {/* Source grid */}
        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, 1fr)',
              lg: 'repeat(3, 1fr)',
            },
          }}
        >
          {sortedSources.map((source) => (
            <SourceCard
              key={source.job.id}
              source={source}
              expanded={expandedJobId === source.job.id}
              onToggle={() =>
                setExpandedJobId((prev) => (prev === source.job.id ? null : source.job.id))
              }
            />
          ))}
        </Box>
      </Stack>
    </Box>
  )
}

function CounterChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline">
      <Typography
        sx={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-mono)', color }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}
      >
        {label}
      </Typography>
    </Stack>
  )
}
