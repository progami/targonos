'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemButton,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward'
import RefreshIcon from '@mui/icons-material/Refresh'
import StorageIcon from '@mui/icons-material/Storage'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import type {
  MonitoringCategory,
  MonitoringChangeEvent,
  MonitoringHealthDataset,
  MonitoringHealthReport,
  MonitoringOverview,
  MonitoringSchedulerJob,
  MonitoringSeverity,
  MonitoringSourceType,
} from '@/lib/monitoring/types'
import { formatMonitoringLabel } from '@/lib/monitoring/labels'
import {
  CategoryChip,
  CategorySection,
  ComparisonRow,
  DataField,
  OwnerChip,
  SeverityChip,
  formatCount,
  formatDateTime,
  formatMoney,
  humanizeFieldName,
} from '@/components/monitoring/ui'

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

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

function getDatasetPalette(status: 'healthy' | 'stale' | 'missing') {
  if (status === 'healthy') {
    return {
      background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(239,249,244,0.88) 100%)',
      chipBackground: 'rgba(35, 116, 70, 0.14)',
      chipColor: '#1f6a5a',
    }
  }

  if (status === 'stale') {
    return {
      background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,245,229,0.88) 100%)',
      chipBackground: 'rgba(180, 104, 50, 0.16)',
      chipColor: '#8c4b1f',
    }
  }

  return {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(252,241,241,0.92) 100%)',
    chipBackground: 'rgba(181, 54, 45, 0.16)',
    chipColor: '#b5362d',
  }
}

function getSchedulerPalette(status: MonitoringSchedulerJob['status']) {
  if (status === 'running') {
    return {
      background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(232,244,252,0.92) 100%)',
      chipBackground: 'rgba(34, 94, 168, 0.14)',
      chipColor: '#1d4f91',
    }
  }

  if (status === 'healthy') {
    return {
      background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(239,249,244,0.88) 100%)',
      chipBackground: 'rgba(35, 116, 70, 0.14)',
      chipColor: '#1f6a5a',
    }
  }

  if (status === 'failed') {
    return {
      background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(252,241,241,0.92) 100%)',
      chipBackground: 'rgba(181, 54, 45, 0.16)',
      chipColor: '#b5362d',
    }
  }

  return {
    background: 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(245,247,250,0.9) 100%)',
    chipBackground: 'rgba(106, 147, 179, 0.18)',
    chipColor: '#496981',
  }
}

function formatSchedulerStatus(job: MonitoringSchedulerJob): string {
  if (job.status === 'running') return `RUNNING${job.pid === null ? '' : ` · PID ${job.pid}`}`
  if (job.status === 'healthy') return 'HEALTHY'
  if (job.status === 'failed') {
    return `FAILED${job.lastExitStatus === null ? '' : ` · EXIT ${job.lastExitStatus}`}`
  }
  return 'MISSING'
}

function getSourceTypePalette(sourceType: MonitoringSourceType) {
  if (sourceType === 'API') {
    return {
      background: 'rgba(0, 44, 81, 0.08)',
      color: '#0b273f',
      border: 'rgba(0, 44, 81, 0.12)',
      label: 'API',
      helper: 'Automated data pull',
    }
  }

  if (sourceType === 'BROWSER') {
    return {
      background: 'rgba(0, 194, 185, 0.12)',
      color: '#007a6d',
      border: 'rgba(0, 194, 185, 0.2)',
      label: 'Browser',
      helper: 'Automated browser capture',
    }
  }

  return {
    background: 'rgba(180, 104, 50, 0.12)',
    color: '#7b4215',
    border: 'rgba(180, 104, 50, 0.22)',
    label: 'Manual',
    helper: 'Operator-maintained',
  }
}

function formatAgeLabel(ageMinutes: number | null): string {
  if (ageMinutes === null) return 'Missing'
  if (ageMinutes < 60) return `${ageMinutes.toLocaleString()} minutes`

  const hours = ageMinutes / 60
  if (hours < 48) return `${hours.toFixed(hours >= 10 ? 0 : 1)} hours`

  return `${(hours / 24).toFixed(1)} days`
}

export default function TrackingDashboard() {
  const [activeTab, setActiveTab] = useState<'changes' | 'sources'>('changes')
  const [overview, setOverview] = useState<MonitoringOverview | null>(null)
  const [changes, setChanges] = useState<MonitoringChangeEvent[]>([])
  const [health, setHealth] = useState<MonitoringHealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [windowValue, setWindowValue] = useState<'24h' | '7d' | '30d' | 'all'>('7d')
  const [owner, setOwner] = useState<OwnerFilter>('ALL')
  const [category, setCategory] = useState<MonitoringCategory | 'ALL'>('ALL')
  const [severity, setSeverity] = useState<MonitoringSeverity | 'ALL'>('ALL')
  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadOverview() {
      try {
        setError(null)
        const response = await fetch(`${basePath}/api/monitoring/overview`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load monitoring overview.')
        }
        if (!cancelled) {
          setOverview(payload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load monitoring overview.')
        }
      }
    }

    void loadOverview()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadChanges() {
      try {
        setLoading(true)
        setError(null)
        const searchParams = new URLSearchParams()
        searchParams.set('window', windowValue)
        searchParams.set('owner', owner)
        searchParams.set('category', category)
        searchParams.set('severity', severity)
        if (deferredQuery.trim() !== '') searchParams.set('query', deferredQuery.trim())

        const response = await fetch(`${basePath}/api/monitoring/changes?${searchParams.toString()}`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load monitoring changes.')
        }

        if (!cancelled) {
          setChanges(payload)
          setLoading(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load monitoring changes.')
          setLoading(false)
        }
      }
    }

    void loadChanges()
    return () => {
      cancelled = true
    }
  }, [windowValue, owner, category, severity, deferredQuery])

  useEffect(() => {
    if (activeTab !== 'sources') return
    let cancelled = false

    async function loadHealth() {
      try {
        setHealthError(null)
        const response = await fetch(`${basePath}/api/monitoring/health`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load monitoring health.')
        }
        if (!cancelled) {
          setHealth(payload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setHealthError(loadError instanceof Error ? loadError.message : 'Failed to load monitoring health.')
        }
      }
    }

    void loadHealth()
    return () => {
      cancelled = true
    }
  }, [activeTab])

  useEffect(() => {
    if (changes.length === 0) {
      setSelectedEventId(null)
      return
    }

    const stillExists = changes.some((item) => item.id === selectedEventId)
    if (!stillExists) {
      setSelectedEventId(changes[0].id)
    }
  }, [changes, selectedEventId])

  const selectedEvent = useMemo(
    () => changes.find((item) => item.id === selectedEventId) ?? null,
    [changes, selectedEventId],
  )

  const snapshotAgeMinutes = useMemo(() => {
    if (!overview) return null
    return Math.max(
      0,
      Math.round((Date.now() - new Date(overview.snapshotTimestamp).getTime()) / 60000),
    )
  }, [overview])

  const schedulerSummary = useMemo(() => {
    const jobs = health?.jobs ?? []
    return {
      total: jobs.length,
      healthy: jobs.filter((job) => job.status === 'healthy' || job.status === 'running').length,
      failed: jobs.filter((job) => job.status === 'failed').length,
      missing: jobs.filter((job) => job.status === 'missing').length,
    }
  }, [health])

  const datasetSummary = useMemo(() => {
    const datasets = health?.datasets ?? []
    return {
      total: datasets.length,
      healthy: datasets.filter((dataset) => dataset.status === 'healthy').length,
      attention: datasets.filter((dataset) => dataset.status === 'stale' || dataset.status === 'missing').length,
      manual: datasets.filter((dataset) => dataset.sourceType === 'MANUAL').length,
    }
  }, [health])

  const datasetsBySourceType = useMemo(() => {
    const groups: Record<MonitoringSourceType, MonitoringHealthDataset[]> = {
      API: [],
      BROWSER: [],
      MANUAL: [],
    }

    for (const dataset of health?.datasets ?? []) {
      groups[dataset.sourceType].push(dataset)
    }

    return groups
  }, [health])

  const jobsBySourceType = useMemo(() => {
    const groups: Record<'API' | 'BROWSER', MonitoringSchedulerJob[]> = {
      API: [],
      BROWSER: [],
    }

    for (const job of health?.jobs ?? []) {
      groups[job.sourceType].push(job)
    }

    return groups
  }, [health])

  const changePipeline = useMemo(() => {
    if (!health) return null

    return {
      dataset: health.datasets.find((dataset) => dataset.id === 'hourly-changes') ?? null,
      job: health.jobs.find((job) => job.id === 'hourly-listing-attributes-api') ?? null,
    }
  }, [health])

  const pipelineJob = changePipeline?.job ?? null
  const pipelineDataset = changePipeline?.dataset ?? null

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    setHealthError(null)
    try {
      const [overviewResponse, changesResponse] = await Promise.all([
        fetch(`${basePath}/api/monitoring/overview`),
        fetch(
          `${basePath}/api/monitoring/changes?${new URLSearchParams({
            window: windowValue,
            owner,
            category,
            severity,
            query: deferredQuery.trim(),
          }).toString()}`,
        ),
      ])

      const overviewPayload = await overviewResponse.json()
      const changesPayload = await changesResponse.json()

      if (!overviewResponse.ok) {
        throw new Error(overviewPayload.error ?? 'Failed to refresh overview.')
      }
      if (!changesResponse.ok) {
        throw new Error(changesPayload.error ?? 'Failed to refresh change feed.')
      }

      setOverview(overviewPayload)
      setChanges(changesPayload)

      if (activeTab === 'sources') {
        const healthResponse = await fetch(`${basePath}/api/monitoring/health`)
        const healthPayload = await healthResponse.json()
        if (!healthResponse.ok) {
          throw new Error(healthPayload.error ?? 'Failed to refresh source health.')
        }
        setHealth(healthPayload)
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Refresh failed.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <Box sx={{ maxWidth: 1520, mx: 'auto', pb: 4 }}>
      <Stack spacing={3}>
        <Card
          sx={{
            overflow: 'hidden',
            borderRadius: 4,
            border: '1px solid rgba(15, 23, 42, 0.08)',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.08)',
            background:
              'linear-gradient(135deg, #0b273f 0%, #1a3d56 60%, #00C2B9 100%)',
            color: '#f8fafc',
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              justifyContent="space-between"
              alignItems={{ md: 'center' }}
              spacing={2}
            >
              <Stack spacing={0.3}>
                <Typography
                  variant="overline"
                  sx={{ color: 'rgba(248, 250, 252, 0.6)', letterSpacing: '0.1em', fontSize: '0.65rem' }}
                >
                  Argus · US Marketplace
                </Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.03em' }}>
                  Monitoring
                </Typography>
                {overview ? (
                  <Typography variant="body2" sx={{ color: 'rgba(248, 250, 252, 0.7)', fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                    {formatDateTime(overview.snapshotTimestamp)}
                  </Typography>
                ) : null}
              </Stack>

              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
              >
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                  onClick={handleRefresh}
                  disabled={refreshing}
                  sx={{
                    bgcolor: '#F5F5F5',
                    color: '#0b273f',
                    '&:hover': { bgcolor: '#dae4ec' },
                  }}
                >
                  {refreshing ? 'Refreshing...' : 'Refresh'}
                </Button>
                {selectedEvent ? (
                  <Button
                    component={Link}
                    href={`/tracking/${selectedEvent.asin}`}
                    variant="outlined"
                    size="small"
                    startIcon={<ArrowOutwardIcon sx={{ fontSize: 14 }} />}
                    sx={{
                      borderColor: 'rgba(248, 250, 252, 0.28)',
                      color: '#f8fafc',
                    }}
                    title={selectedEvent.asin}
                  >
                    {formatMonitoringLabel(
                      selectedEvent.currentSnapshot ?? selectedEvent.baselineSnapshot ?? { asin: selectedEvent.asin },
                    )}
                  </Button>
                ) : null}
              </Stack>
            </Stack>
          </CardContent>
        </Card>

        {snapshotAgeMinutes !== null && snapshotAgeMinutes > 180 ? (
          <Alert
            severity="warning"
            icon={<WarningAmberIcon fontSize="inherit" />}
            sx={{ borderRadius: 3 }}
          >
            Snapshot is {snapshotAgeMinutes}m old
          </Alert>
        ) : null}

        {error ? (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            {error}
          </Alert>
        ) : null}

        <Card
          sx={{
            borderRadius: 4,
            border: '1px solid rgba(15, 23, 42, 0.08)',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
          }}
        >
          <Box sx={{ px: 2, pt: 1.5 }}>
            <Tabs
              value={activeTab}
              onChange={(_event, nextValue: 'changes' | 'sources') => setActiveTab(nextValue)}
            >
              <Tab label="Change Feed" value="changes" />
              <Tab label="Source Health" value="sources" />
            </Tabs>
          </Box>

          {activeTab === 'changes' ? (
            <CardContent sx={{ p: 2.5 }}>
              <Stack spacing={2.5}>
                <Box
                  sx={{
                    display: 'grid',
                    gap: 1.5,
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: 'repeat(5, minmax(0, 1fr))',
                    },
                  }}
                >
                  <FormControl size="small">
                    <InputLabel>Window</InputLabel>
                    <Select
                      value={windowValue}
                      label="Window"
                      onChange={(event) => setWindowValue(event.target.value as typeof windowValue)}
                    >
                      {WINDOWS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small">
                    <InputLabel>Owner</InputLabel>
                    <Select
                      value={owner}
                      label="Owner"
                      onChange={(event) => setOwner(event.target.value as OwnerFilter)}
                    >
                      <MenuItem value="ALL">All owners</MenuItem>
                      <MenuItem value="OURS">Ours</MenuItem>
                      <MenuItem value="COMPETITOR">Competitors</MenuItem>
                    </Select>
                  </FormControl>

                  <FormControl size="small">
                    <InputLabel>Category</InputLabel>
                    <Select
                      value={category}
                      label="Category"
                      onChange={(event) =>
                        setCategory(event.target.value as MonitoringCategory | 'ALL')
                      }
                    >
                      {CATEGORY_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <FormControl size="small">
                    <InputLabel>Severity</InputLabel>
                    <Select
                      value={severity}
                      label="Severity"
                      onChange={(event) =>
                        setSeverity(event.target.value as MonitoringSeverity | 'ALL')
                      }
                    >
                      {SEVERITY_OPTIONS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>
                          {option.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  <TextField
                    label="Search"
                    size="small"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="ASIN, headline, field"
                  />
                </Box>

                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      xl: 'minmax(0, 1.45fr) minmax(360px, 0.95fr)',
                    },
                    alignItems: 'start',
                  }}
                >
                  <Paper
                    variant="outlined"
                    sx={{
                      borderRadius: 4,
                      overflow: 'hidden',
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      backgroundColor: 'rgba(255,255,255,0.78)',
                    }}
                  >
                    {loading ? <LinearProgress /> : null}
                    <List sx={{ p: 0 }}>
                      {changes.map((item, index) => {
                        const selected = item.id === selectedEventId
                        const listingLabel = formatMonitoringLabel(
                          item.currentSnapshot ?? item.baselineSnapshot ?? { asin: item.asin },
                        )
                        return (
                          <Box key={item.id}>
                            <ListItemButton
                              selected={selected}
                              onClick={() => setSelectedEventId(item.id)}
                              sx={{
                                alignItems: 'stretch',
                                px: 2,
                                py: 2,
                                bgcolor: selected ? 'rgba(24, 88, 78, 0.08)' : 'transparent',
                                '&.Mui-selected': {
                                  bgcolor: 'rgba(24, 88, 78, 0.08)',
                                },
                              }}
                            >
                              <Stack spacing={1.4} sx={{ width: '100%' }}>
                                <Stack
                                  direction={{ xs: 'column', sm: 'row' }}
                                  justifyContent="space-between"
                                  spacing={1}
                                >
                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <SeverityChip severity={item.severity} />
                                    <OwnerChip owner={item.owner} />
                                    <CategoryChip category={item.primaryCategory} />
                                  </Stack>
                                  <Typography
                                    variant="body2"
                                    sx={{ color: 'text.primary', fontWeight: 600, fontFamily: 'var(--font-mono)', alignSelf: 'center' }}
                                  >
                                    {formatDateTime(item.timestamp)}
                                  </Typography>
                                </Stack>

                                <Box>
                                  <Typography
                                    variant="subtitle1"
                                    sx={{ fontWeight: 800, letterSpacing: '-0.01em' }}
                                  >
                                    {item.headline}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {item.summary}
                                  </Typography>
                                </Box>

                                <Stack
                                  direction={{ xs: 'column', md: 'row' }}
                                  justifyContent="space-between"
                                  spacing={1.5}
                                >
                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    <Chip
                                      label={listingLabel}
                                      size="small"
                                      sx={{
                                        fontWeight: 700,
                                        borderRadius: 999,
                                        bgcolor: 'rgba(15, 23, 42, 0.06)',
                                      }}
                                      title={item.asin}
                                    />
                                    {item.changedFields.slice(0, 4).map((field) => (
                                      <Chip
                                        key={`${item.id}-${field}`}
                                        label={humanizeFieldName(field)}
                                        size="small"
                                        variant="outlined"
                                        sx={{ borderRadius: 999 }}
                                      />
                                    ))}
                                  </Stack>
                                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                    {item.changedFieldCount}
                                    {' '}
                                    field
                                    {item.changedFieldCount === 1 ? '' : 's'}
                                  </Typography>
                                </Stack>
                              </Stack>
                            </ListItemButton>
                            {index < changes.length - 1 ? <Divider /> : null}
                          </Box>
                        )
                      })}

                      {!loading && changes.length === 0 ? (
                        <Box sx={{ px: 3, py: 5, textAlign: 'center' }}>
                          <StorageIcon sx={{ fontSize: 36, color: 'text.secondary', mb: 1 }} />
                          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                            No matching events
                          </Typography>
                        </Box>
                      ) : null}
                    </List>
                  </Paper>

                  <Paper
                    variant="outlined"
                    sx={{
                      position: { xl: 'sticky' },
                      top: { xl: 24 },
                      borderRadius: 4,
                      borderColor: 'rgba(15, 23, 42, 0.08)',
                      backgroundColor: 'rgba(255,255,255,0.84)',
                    }}
                  >
                    <CardContent sx={{ p: 2.5 }}>
                      {selectedEvent ? (
                        <Stack spacing={2.2}>
                          <Stack direction="row" justifyContent="space-between" spacing={1.5}>
                            <Box>
                              <Typography
                                variant="overline"
                                sx={{ color: 'text.secondary', letterSpacing: '0.08em' }}
                              >
                                {selectedEvent.label && selectedEvent.label !== selectedEvent.asin ? `(${selectedEvent.asin})` : selectedEvent.asin}
                              </Typography>
                              <Typography variant="h5" sx={{ fontWeight: 800, mt: 0.4 }}>
                                {formatMonitoringLabel(
                                  selectedEvent.currentSnapshot ?? selectedEvent.baselineSnapshot ?? { asin: selectedEvent.asin },
                                )}
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              <SeverityChip severity={selectedEvent.severity} />
                              <OwnerChip owner={selectedEvent.owner} />
                            </Stack>
                          </Stack>

                          <Typography variant="body1" sx={{ fontWeight: 700 }}>
                            {selectedEvent.headline}
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            {selectedEvent.summary}
                          </Typography>

                          <Box
                            sx={{
                              display: 'flex',
                              gap: 2,
                              color: '#6a93b3',
                              fontSize: '0.72rem',
                              fontFamily: 'var(--font-mono)',
                              fontWeight: 600,
                            }}
                          >
                            <span>{formatDateTime(selectedEvent.timestamp)}</span>
                            <span style={{ opacity: 0.4 }}>vs</span>
                            <span>{formatDateTime(selectedEvent.baselineTimestamp)}</span>
                          </Box>

                          <Divider />

                          <Stack spacing={0}>
                            {selectedEvent.categories.includes('status') && (
                              <CategorySection label={selectedEvent.categories.length > 1 ? 'Status' : ''}>
                                <ComparisonRow
                                  label="Status"
                                  baseline={selectedEvent.baselineSnapshot?.status ?? null}
                                  current={selectedEvent.currentSnapshot?.status ?? null}
                                />
                              </CategorySection>
                            )}

                            {selectedEvent.categories.includes('price') && (
                              <CategorySection label={selectedEvent.categories.length > 1 ? 'Price' : ''}>
                                <ComparisonRow
                                  label="Landed"
                                  baseline={formatMoney(selectedEvent.baselineSnapshot?.landedPrice ?? null, selectedEvent.baselineSnapshot?.priceCurrency ?? null)}
                                  current={formatMoney(selectedEvent.currentSnapshot?.landedPrice ?? null, selectedEvent.currentSnapshot?.priceCurrency ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.landedPrice}
                                  numericCurrent={selectedEvent.currentSnapshot?.landedPrice}
                                />
                                <ComparisonRow
                                  label="Listing"
                                  baseline={formatMoney(selectedEvent.baselineSnapshot?.listingPrice ?? null, selectedEvent.baselineSnapshot?.priceCurrency ?? null)}
                                  current={formatMoney(selectedEvent.currentSnapshot?.listingPrice ?? null, selectedEvent.currentSnapshot?.priceCurrency ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.listingPrice}
                                  numericCurrent={selectedEvent.currentSnapshot?.listingPrice}
                                />
                                <ComparisonRow
                                  label="Shipping"
                                  baseline={formatMoney(selectedEvent.baselineSnapshot?.shippingPrice ?? null, selectedEvent.baselineSnapshot?.priceCurrency ?? null)}
                                  current={formatMoney(selectedEvent.currentSnapshot?.shippingPrice ?? null, selectedEvent.currentSnapshot?.priceCurrency ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.shippingPrice}
                                  numericCurrent={selectedEvent.currentSnapshot?.shippingPrice}
                                />
                              </CategorySection>
                            )}

                            {selectedEvent.categories.includes('rank') && (
                              <CategorySection label={selectedEvent.categories.length > 1 ? 'Rank' : ''}>
                                <ComparisonRow
                                  label="Root BSR"
                                  baseline={formatCount(selectedEvent.baselineSnapshot?.rootBsrRank ?? null)}
                                  current={formatCount(selectedEvent.currentSnapshot?.rootBsrRank ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.rootBsrRank}
                                  numericCurrent={selectedEvent.currentSnapshot?.rootBsrRank}
                                  lowerIsBetter
                                />
                                <ComparisonRow
                                  label="Sub BSR"
                                  baseline={formatCount(selectedEvent.baselineSnapshot?.subBsrRank ?? null)}
                                  current={formatCount(selectedEvent.currentSnapshot?.subBsrRank ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.subBsrRank}
                                  numericCurrent={selectedEvent.currentSnapshot?.subBsrRank}
                                  lowerIsBetter
                                />
                              </CategorySection>
                            )}

                            {selectedEvent.categories.includes('offers') && (
                              <CategorySection label={selectedEvent.categories.length > 1 ? 'Offers' : ''}>
                                <ComparisonRow
                                  label="Total offers"
                                  baseline={formatCount(selectedEvent.baselineSnapshot?.totalOfferCount ?? null)}
                                  current={formatCount(selectedEvent.currentSnapshot?.totalOfferCount ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.totalOfferCount}
                                  numericCurrent={selectedEvent.currentSnapshot?.totalOfferCount}
                                />
                              </CategorySection>
                            )}

                            {selectedEvent.categories.includes('content') && (
                              <CategorySection label={selectedEvent.categories.length > 1 ? 'Content' : ''}>
                                <ComparisonRow
                                  label="Title"
                                  baseline={selectedEvent.baselineSnapshot?.title ?? null}
                                  current={selectedEvent.currentSnapshot?.title ?? null}
                                />
                                <ComparisonRow
                                  label="Bullets"
                                  baseline={formatCount(selectedEvent.baselineSnapshot?.bulletCount ?? null)}
                                  current={formatCount(selectedEvent.currentSnapshot?.bulletCount ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.bulletCount}
                                  numericCurrent={selectedEvent.currentSnapshot?.bulletCount}
                                />
                                <ComparisonRow
                                  label="Description"
                                  baseline={formatCount(selectedEvent.baselineSnapshot?.descriptionLength ?? null)}
                                  current={formatCount(selectedEvent.currentSnapshot?.descriptionLength ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.descriptionLength}
                                  numericCurrent={selectedEvent.currentSnapshot?.descriptionLength}
                                />
                              </CategorySection>
                            )}

                            {selectedEvent.categories.includes('images') && (
                              <CategorySection label={selectedEvent.categories.length > 1 ? 'Images' : ''}>
                                <ComparisonRow
                                  label="Count"
                                  baseline={formatCount(selectedEvent.baselineSnapshot?.imageCount ?? null)}
                                  current={formatCount(selectedEvent.currentSnapshot?.imageCount ?? null)}
                                  numericBaseline={selectedEvent.baselineSnapshot?.imageCount}
                                  numericCurrent={selectedEvent.currentSnapshot?.imageCount}
                                />
                                {selectedEvent.currentSnapshot?.imageUrls.length ? (
                                  <Box
                                    sx={{
                                      display: 'grid',
                                      gap: 0.8,
                                      gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                      mt: 1,
                                    }}
                                  >
                                    {selectedEvent.currentSnapshot.imageUrls.slice(0, 6).map((url) => (
                                      <Box
                                        key={url}
                                        component="img"
                                        src={url}
                                        alt=""
                                        sx={{
                                          width: '100%',
                                          aspectRatio: '1 / 1',
                                          objectFit: 'contain',
                                          borderRadius: 1.5,
                                          bgcolor: '#f8fafc',
                                          border: '1px solid rgba(15, 23, 42, 0.06)',
                                          p: 0.6,
                                        }}
                                      />
                                    ))}
                                  </Box>
                                ) : null}
                              </CategorySection>
                            )}

                            {selectedEvent.categories.includes('catalog') && (
                              <CategorySection label={selectedEvent.categories.length > 1 ? 'Catalog' : ''}>
                                <ComparisonRow
                                  label="Brand"
                                  baseline={selectedEvent.baselineSnapshot?.brand ?? null}
                                  current={selectedEvent.currentSnapshot?.brand ?? null}
                                />
                              </CategorySection>
                            )}
                          </Stack>

                          <Button
                            component={Link}
                            href={`/tracking/${selectedEvent.asin}`}
                            variant="contained"
                            startIcon={<ArrowOutwardIcon />}
                            sx={{ alignSelf: 'flex-start' }}
                          >
                            View {selectedEvent.label && selectedEvent.label !== selectedEvent.asin ? selectedEvent.label : selectedEvent.asin}
                          </Button>
                        </Stack>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Select an event to inspect
                        </Typography>
                      )}
                    </CardContent>
                  </Paper>
                </Box>
              </Stack>
            </CardContent>
          ) : (
            <CardContent sx={{ p: 2.5 }}>
              <Stack spacing={2.5}>
                {healthError ? (
                  <Alert severity="error" sx={{ borderRadius: 3 }}>
                    {healthError}
                  </Alert>
                ) : null}

                <Alert severity="info" sx={{ borderRadius: 3 }}>
                  Source Health is grouped by the real monitoring outputs under Google Drive. The
                  {' '}
                  <code>launchd</code>
                  {' '}
                  jobs produce those outputs. For hourly listing attributes, the change history file is
                  the canonical stream, and email alerts are downstream of that same change feed.
                </Alert>

                {health ? (
                  <>
                    <Paper
                      variant="outlined"
                      sx={{
                        borderRadius: 4,
                        overflow: 'hidden',
                        borderColor: 'rgba(15, 23, 42, 0.08)',
                        background:
                          'linear-gradient(135deg, rgba(11,39,63,0.04) 0%, rgba(0,194,185,0.08) 100%)',
                      }}
                    >
                      <CardContent sx={{ p: 2.5 }}>
                        <Stack spacing={2}>
                          <Stack
                            direction={{ xs: 'column', md: 'row' }}
                            justifyContent="space-between"
                            spacing={1.5}
                          >
                            <Box>
                              <Typography variant="overline" color="text.secondary">
                                Change Pipeline
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                Change Feed → Email
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                One hourly API run writes the change history, the feed renders that stream,
                                and email alerts are sent from the same canonical event set.
                              </Typography>
                            </Box>
                            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                              {pipelineJob ? (
                                <Chip
                                  label={`Collector ${formatSchedulerStatus(pipelineJob)}`}
                                  size="small"
                                  sx={{
                                    fontWeight: 800,
                                    borderRadius: 999,
                                    bgcolor: getSchedulerPalette(pipelineJob.status).chipBackground,
                                    color: getSchedulerPalette(pipelineJob.status).chipColor,
                                  }}
                                />
                              ) : null}
                              {pipelineDataset ? (
                                <Chip
                                  label={`Stream ${pipelineDataset.status.toUpperCase()}`}
                                  size="small"
                                  sx={{
                                    fontWeight: 800,
                                    borderRadius: 999,
                                    bgcolor: getDatasetPalette(pipelineDataset.status).chipBackground,
                                    color: getDatasetPalette(pipelineDataset.status).chipColor,
                                  }}
                                />
                              ) : null}
                            </Stack>
                          </Stack>

                          <Box
                            sx={{
                              display: 'grid',
                              gap: 1.25,
                              gridTemplateColumns: {
                                xs: '1fr',
                                md: 'repeat(4, minmax(0, 1fr))',
                              },
                            }}
                          >
                            {[
                              {
                                label: 'Collector',
                                value: 'Hourly listing attributes (API)',
                                helper: pipelineJob?.schedule ?? 'Every hour',
                              },
                              {
                                label: 'Canonical stream',
                                value: 'Listings-Changes-History.csv',
                                helper: formatDateTime(pipelineDataset?.updatedAt ?? null),
                              },
                              {
                                label: 'Product surface',
                                value: 'Change Feed',
                                helper: 'Tracking → Changes tab',
                              },
                              {
                                label: 'Delivery',
                                value: 'Alert email',
                                helper: 'Sent from the same event stream',
                              },
                            ].map((step) => (
                              <Box
                                key={step.label}
                                sx={{
                                  p: 1.6,
                                  borderRadius: 3,
                                  border: '1px solid rgba(15, 23, 42, 0.08)',
                                  bgcolor: 'rgba(255,255,255,0.82)',
                                }}
                              >
                                <Typography variant="caption" color="text.secondary">
                                  {step.label}
                                </Typography>
                                <Typography variant="body2" sx={{ fontWeight: 800, mt: 0.4 }}>
                                  {step.value}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  {step.helper}
                                </Typography>
                              </Box>
                            ))}
                          </Box>
                        </Stack>
                      </CardContent>
                    </Paper>

                    <Box
                      sx={{
                        display: 'grid',
                        gap: 1.5,
                        gridTemplateColumns: {
                          xs: '1fr',
                          md: 'repeat(4, minmax(0, 1fr))',
                        },
                      }}
                    >
                      {[
                        {
                          label: 'Source outputs',
                          value: datasetSummary.total,
                          accent: '#0b273f',
                          helper: `${datasetSummary.manual} manual source${datasetSummary.manual === 1 ? '' : 's'}`,
                        },
                        {
                          label: 'Healthy outputs',
                          value: datasetSummary.healthy,
                          accent: '#1f6a5a',
                          helper: `${datasetSummary.attention} need attention`,
                        },
                        {
                          label: 'Automated jobs',
                          value: schedulerSummary.total,
                          accent: '#0b273f',
                          helper: `${schedulerSummary.failed + schedulerSummary.missing} with issues`,
                        },
                        {
                          label: 'Healthy or running',
                          value: schedulerSummary.healthy,
                          accent: '#1f6a5a',
                          helper: `${schedulerSummary.failed} failed · ${schedulerSummary.missing} missing`,
                        },
                      ].map((item) => (
                        <Paper
                          key={item.label}
                          variant="outlined"
                          sx={{
                            px: 2,
                            py: 1.75,
                            borderRadius: 3,
                            borderColor: 'rgba(15, 23, 42, 0.08)',
                          }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            {item.label}
                          </Typography>
                          <Typography variant="h5" sx={{ fontWeight: 800, color: item.accent }}>
                            {item.value}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {item.helper}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>

                    <Box>
                      <Typography
                        variant="overline"
                        sx={{ color: 'text.secondary', letterSpacing: '0.08em', display: 'block', mb: 1 }}
                      >
                        Source Outputs
                      </Typography>
                      <Stack spacing={2}>
                        {(['API', 'BROWSER', 'MANUAL'] as const).map((sourceType) => {
                          const datasets = datasetsBySourceType[sourceType]
                          if (datasets.length === 0) return null

                          const sourcePalette = getSourceTypePalette(sourceType)
                          return (
                            <Paper
                              key={sourceType}
                              variant="outlined"
                              sx={{
                                borderRadius: 4,
                                borderColor: 'rgba(15, 23, 42, 0.08)',
                                overflow: 'hidden',
                              }}
                            >
                              <Box
                                sx={{
                                  px: 2.2,
                                  py: 1.6,
                                  borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
                                  bgcolor: alpha(sourcePalette.color, 0.04),
                                }}
                              >
                                <Stack
                                  direction={{ xs: 'column', md: 'row' }}
                                  justifyContent="space-between"
                                  spacing={1}
                                >
                                  <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                      {sourcePalette.label}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                      {sourcePalette.helper}
                                    </Typography>
                                  </Box>
                                  <Chip
                                    label={`${datasets.length} source${datasets.length === 1 ? '' : 's'}`}
                                    size="small"
                                    sx={{
                                      fontWeight: 700,
                                      borderRadius: 999,
                                      alignSelf: 'flex-start',
                                      bgcolor: sourcePalette.background,
                                      color: sourcePalette.color,
                                      border: `1px solid ${sourcePalette.border}`,
                                    }}
                                  />
                                </Stack>
                              </Box>
                              <CardContent sx={{ p: 2.2 }}>
                                <Box
                                  sx={{
                                    display: 'grid',
                                    gap: 1.5,
                                    gridTemplateColumns: {
                                      xs: '1fr',
                                      xl: 'repeat(2, minmax(0, 1fr))',
                                    },
                                  }}
                                >
                                  {datasets.map((dataset) => {
                                    const palette = getDatasetPalette(dataset.status)
                                    return (
                                      <Box
                                        key={dataset.id}
                                        sx={{
                                          p: 1.75,
                                          borderRadius: 3,
                                          border: '1px solid rgba(15, 23, 42, 0.08)',
                                          background: palette.background,
                                        }}
                                      >
                                        <Stack spacing={1.2}>
                                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                                            <Box>
                                              <Typography variant="body1" sx={{ fontWeight: 800 }}>
                                                {dataset.label}
                                              </Typography>
                                              <Typography variant="caption" color="text.secondary">
                                                {dataset.purpose}
                                              </Typography>
                                            </Box>
                                            <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap justifyContent="flex-end">
                                              <Chip
                                                label={dataset.cadence.toUpperCase()}
                                                size="small"
                                                sx={{
                                                  fontWeight: 700,
                                                  borderRadius: 999,
                                                  bgcolor: sourcePalette.background,
                                                  color: sourcePalette.color,
                                                  border: `1px solid ${sourcePalette.border}`,
                                                }}
                                              />
                                              <Chip
                                                label={dataset.status.toUpperCase()}
                                                size="small"
                                                sx={{
                                                  fontWeight: 800,
                                                  borderRadius: 999,
                                                  bgcolor: palette.chipBackground,
                                                  color: palette.chipColor,
                                                }}
                                              />
                                            </Stack>
                                          </Stack>

                                          <DataField label="Last updated" value={formatDateTime(dataset.updatedAt)} mono />
                                          <DataField label="Age" value={formatAgeLabel(dataset.ageMinutes)} />
                                          <DataField
                                            label="Producer"
                                            value={dataset.producedBy ?? 'Manual update'}
                                          />
                                          <DataField
                                            label="Used by"
                                            value={dataset.consumers.join(' · ')}
                                          />

                                          <Box
                                            sx={{
                                              p: 1.2,
                                              borderRadius: 2.5,
                                              bgcolor: 'rgba(255,255,255,0.72)',
                                              border: '1px solid rgba(15, 23, 42, 0.06)',
                                            }}
                                          >
                                            <Typography variant="caption" color="text.secondary">
                                              Path
                                            </Typography>
                                            <Typography
                                              variant="body2"
                                              sx={{
                                                mt: 0.4,
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: '0.76rem',
                                                wordBreak: 'break-word',
                                              }}
                                            >
                                              {dataset.path}
                                            </Typography>
                                          </Box>
                                        </Stack>
                                      </Box>
                                    )
                                  })}
                                </Box>
                              </CardContent>
                            </Paper>
                          )
                        })}
                      </Stack>
                    </Box>

                    <Box>
                      <Typography
                        variant="overline"
                        sx={{ color: 'text.secondary', letterSpacing: '0.08em', display: 'block', mb: 1 }}
                      >
                        Automation Health
                      </Typography>
                      <Stack spacing={2}>
                        {(['API', 'BROWSER'] as const).map((sourceType) => {
                          const jobs = jobsBySourceType[sourceType]
                          if (jobs.length === 0) return null

                          const sourcePalette = getSourceTypePalette(sourceType)
                          return (
                            <Paper
                              key={sourceType}
                              variant="outlined"
                              sx={{ borderRadius: 4, borderColor: 'rgba(15, 23, 42, 0.08)' }}
                            >
                              <Box
                                sx={{
                                  px: 2.2,
                                  py: 1.6,
                                  borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
                                  bgcolor: alpha(sourcePalette.color, 0.04),
                                }}
                              >
                                <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                  {sourcePalette.label} collectors
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  {sourceType === 'API'
                                    ? 'LaunchAgents that write API-backed outputs and tracking snapshots.'
                                    : 'LaunchAgents that drive browser-based monitoring captures.'}
                                </Typography>
                              </Box>
                              <CardContent sx={{ p: 2.2 }}>
                                <Stack spacing={1.5}>
                                  {jobs.map((job) => {
                                    const palette = getSchedulerPalette(job.status)
                                    return (
                                      <Box
                                        key={job.id}
                                        sx={{
                                          p: 1.75,
                                          borderRadius: 3,
                                          border: '1px solid rgba(15, 23, 42, 0.08)',
                                          background: palette.background,
                                        }}
                                      >
                                        <Stack spacing={1.2}>
                                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                                            <Box>
                                              <Typography variant="body1" sx={{ fontWeight: 800 }}>
                                                {job.label}
                                              </Typography>
                                              <Typography variant="caption" color="text.secondary">
                                                {job.schedule}
                                              </Typography>
                                            </Box>
                                            <Chip
                                              label={formatSchedulerStatus(job)}
                                              size="small"
                                              sx={{
                                                fontWeight: 800,
                                                borderRadius: 999,
                                                bgcolor: palette.chipBackground,
                                                color: palette.chipColor,
                                              }}
                                            />
                                          </Stack>

                                          <DataField label="Outputs" value={job.outputs.join(' · ')} />
                                          <DataField label="LaunchAgent" value={job.launchdLabel} mono />
                                          <DataField
                                            label="Target"
                                            value={job.target ?? 'Missing'}
                                            mono={job.target !== null}
                                          />
                                          <DataField
                                            label="Logs"
                                            value={`${job.stdoutPath ?? 'Missing stdout'} · ${job.stderrPath ?? 'Missing stderr'}`}
                                            mono
                                          />
                                        </Stack>
                                      </Box>
                                    )
                                  })}
                                </Stack>
                              </CardContent>
                            </Paper>
                          )
                        })}
                      </Stack>
                    </Box>
                  </>
                ) : null}

                {!health && !healthError ? <LinearProgress /> : null}
              </Stack>
            </CardContent>
          )}
        </Card>
      </Stack>
    </Box>
  )
}
