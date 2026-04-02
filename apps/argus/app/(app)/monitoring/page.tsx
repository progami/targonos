'use client'

import Link from 'next/link'
import dynamic from 'next/dynamic'
import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Stack,
  Tab,
  Tabs,
  Typography,
} from '@mui/material'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward'
import RefreshIcon from '@mui/icons-material/Refresh'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import type {
  MonitoringCategory,
  MonitoringChangeEvent,
  MonitoringHealthReport,
  MonitoringOverview,
  MonitoringSeverity,
} from '@/lib/monitoring/types'
import { formatMonitoringLabel } from '@/lib/monitoring/labels'
import { formatDateTime } from '@/components/monitoring/ui'
import FeedRail from '@/components/monitoring/FeedRail'
import ChangeDetail from '@/components/monitoring/ChangeDetail'
import SourceHealthGrid from '@/components/monitoring/SourceHealthGrid'

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

type OwnerFilter = 'ALL' | 'OURS' | 'COMPETITOR'

const TrackingDashboardLazy = dynamic(
  () => Promise.resolve(TrackingDashboardContent),
  { ssr: false, loading: TrackingDashboardFallback },
)

export default function TrackingDashboard() {
  return <TrackingDashboardLazy />
}

function TrackingDashboardContent() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'changes' | 'sources'>('changes')
  const [overview, setOverview] = useState<MonitoringOverview | null>(null)
  const [changes, setChanges] = useState<MonitoringChangeEvent[]>([])
  const [health, setHealth] = useState<MonitoringHealthReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [windowValue, setWindowValue] = useState<'24h' | '7d' | '30d' | 'all'>(() =>
    readWindowParam(searchParams.get('window')),
  )
  const [owner, setOwner] = useState<OwnerFilter>(() => readOwnerParam(searchParams.get('owner')))
  const [category, setCategory] = useState<MonitoringCategory | 'ALL'>(() =>
    readCategoryParam(searchParams.get('category')),
  )
  const [severity, setSeverity] = useState<MonitoringSeverity | 'ALL'>(() =>
    readSeverityParam(searchParams.get('severity')),
  )
  const [query, setQuery] = useState(() => readQueryParam(searchParams.get('query')))
  const [snapshotTimestamp, setSnapshotTimestamp] = useState<string | null>(() =>
    readSnapshotParam(searchParams.get('snapshot')),
  )
  const deferredQuery = useDeferredValue(query)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [readIds, setReadIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem('argus:read-events')
      return stored ? new Set(JSON.parse(stored) as string[]) : new Set()
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    const nextWindow = readWindowParam(searchParams.get('window'))
    const nextOwner = readOwnerParam(searchParams.get('owner'))
    const nextCategory = readCategoryParam(searchParams.get('category'))
    const nextSeverity = readSeverityParam(searchParams.get('severity'))
    const nextQuery = readQueryParam(searchParams.get('query'))
    const nextSnapshot = readSnapshotParam(searchParams.get('snapshot'))

    setWindowValue((current) => (current === nextWindow ? current : nextWindow))
    setOwner((current) => (current === nextOwner ? current : nextOwner))
    setCategory((current) => (current === nextCategory ? current : nextCategory))
    setSeverity((current) => (current === nextSeverity ? current : nextSeverity))
    setQuery((current) => (current === nextQuery ? current : nextQuery))
    setSnapshotTimestamp((current) => (current === nextSnapshot ? current : nextSnapshot))
  }, [searchParams])

  useEffect(() => {
    const nextSearchParams = buildUrlSearchParams({
      windowValue,
      owner,
      category,
      severity,
      query,
      snapshotTimestamp,
    })
    const nextQueryString = nextSearchParams.toString()
    const currentQueryString = searchParams.toString()
    if (nextQueryString === currentQueryString) return

    const nextUrl = nextQueryString === '' ? pathname : `${pathname}?${nextQueryString}`
    startTransition(() => {
      router.replace(nextUrl, { scroll: false })
    })
  }, [
    category,
    owner,
    pathname,
    query,
    router,
    searchParams,
    severity,
    snapshotTimestamp,
    windowValue,
  ])

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
        if (snapshotTimestamp) searchParams.set('snapshot', snapshotTimestamp)

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
  }, [windowValue, owner, category, severity, deferredQuery, snapshotTimestamp])

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

  function handleSelectEvent(id: string) {
    setSelectedEventId(id)
    setReadIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      try { localStorage.setItem('argus:read-events', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  const unreadCount = useMemo(
    () => changes.filter((c) => !readIds.has(c.id)).length,
    [changes, readIds],
  )

  async function handleRefresh() {
    setRefreshing(true)
    setError(null)
    setHealthError(null)
    try {
      const [overviewResponse, changesResponse] = await Promise.all([
        fetch(`${basePath}/api/monitoring/overview`),
        fetch(
          `${basePath}/api/monitoring/changes?${buildUrlSearchParams({
            windowValue,
            owner,
            category,
            severity,
            query: deferredQuery,
            snapshotTimestamp,
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
        {/* Hero header */}
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

              <Stack direction="row" spacing={1} alignItems="center">
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
                    href={`/monitoring/${selectedEvent.asin}`}
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

        {snapshotTimestamp ? (
          <Alert
            severity="info"
            sx={{ borderRadius: 3 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => setSnapshotTimestamp(null)}
              >
                Show all
              </Button>
            }
          >
            Showing events from the {formatDateTime(snapshotTimestamp)} monitoring run.
          </Alert>
        ) : null}

        {error ? (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            {error}
          </Alert>
        ) : null}

        {/* Main content card */}
        <Card
          sx={{
            borderRadius: 4,
            border: '1px solid rgba(15, 23, 42, 0.08)',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ px: 2, pt: 1.5 }}>
            <Tabs
              value={activeTab}
              onChange={(_event, nextValue: 'changes' | 'sources') => setActiveTab(nextValue)}
            >
              <Tab
                label={
                  <Badge
                    badgeContent={unreadCount}
                    color="error"
                    max={99}
                    sx={{ '& .MuiBadge-badge': { fontSize: '0.65rem', height: 18, minWidth: 18 } }}
                  >
                    <Box component="span" sx={{ pr: unreadCount > 0 ? 1.5 : 0 }}>Changes</Box>
                  </Badge>
                }
                value="changes"
              />
              <Tab label="Sources" value="sources" />
            </Tabs>
          </Box>

          {activeTab === 'changes' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
              {/* Detail panel — top, fixed height */}
              <Box
                sx={{
                  height: 280,
                  minHeight: 280,
                  overflow: 'auto',
                  borderBottom: '1px solid rgba(15, 23, 42, 0.08)',
                }}
              >
                <ChangeDetail event={selectedEvent} />
              </Box>

              {/* Feed strip — below, full width */}
              <FeedRail
                changes={changes}
                loading={loading}
                selectedEventId={selectedEventId}
                onSelectEvent={handleSelectEvent}
                readIds={readIds}
                windowValue={windowValue}
                onWindowChange={setWindowValue}
                owner={owner}
                onOwnerChange={setOwner}
                category={category}
                onCategoryChange={setCategory}
                severity={severity}
                onSeverityChange={setSeverity}
                query={query}
                onQueryChange={setQuery}
              />
            </Box>
          ) : (
            <SourceHealthGrid health={health} healthError={healthError} />
          )}
        </Card>
      </Stack>
    </Box>
  )
}

function TrackingDashboardFallback() {
  return (
    <Box sx={{ maxWidth: 1520, mx: 'auto', pb: 4 }}>
      <Card
        sx={{
          borderRadius: 4,
          border: '1px solid rgba(15, 23, 42, 0.08)',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
        }}
      >
        <CardContent sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary">
            Loading monitoring feed...
          </Typography>
        </CardContent>
      </Card>
    </Box>
  )
}

function readWindowParam(value: string | null): '24h' | '7d' | '30d' | 'all' {
  if (value === '24h' || value === '7d' || value === '30d' || value === 'all') return value
  return '7d'
}

function readOwnerParam(value: string | null): OwnerFilter {
  if (value === 'OURS' || value === 'COMPETITOR' || value === 'ALL') return value
  return 'ALL'
}

function readCategoryParam(value: string | null): MonitoringCategory | 'ALL' {
  if (
    value === 'status' ||
    value === 'content' ||
    value === 'images' ||
    value === 'price' ||
    value === 'offers' ||
    value === 'rank' ||
    value === 'catalog' ||
    value === 'ALL'
  ) {
    return value
  }

  return 'ALL'
}

function readSeverityParam(value: string | null): MonitoringSeverity | 'ALL' {
  if (
    value === 'critical' ||
    value === 'high' ||
    value === 'medium' ||
    value === 'low' ||
    value === 'ALL'
  ) {
    return value
  }

  return 'ALL'
}

function readQueryParam(value: string | null): string {
  return value?.trim() ?? ''
}

function readSnapshotParam(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function buildUrlSearchParams(input: {
  windowValue: '24h' | '7d' | '30d' | 'all'
  owner: OwnerFilter
  category: MonitoringCategory | 'ALL'
  severity: MonitoringSeverity | 'ALL'
  query: string
  snapshotTimestamp: string | null
}): URLSearchParams {
  const searchParams = new URLSearchParams()
  if (input.windowValue !== '7d') searchParams.set('window', input.windowValue)
  if (input.owner !== 'ALL') searchParams.set('owner', input.owner)
  if (input.category !== 'ALL') searchParams.set('category', input.category)
  if (input.severity !== 'ALL') searchParams.set('severity', input.severity)
  if (input.query.trim() !== '') searchParams.set('query', input.query.trim())
  if (input.snapshotTimestamp) searchParams.set('snapshot', input.snapshotTimestamp)
  return searchParams
}
