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
  MonitoringBootstrap,
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
  const changeRequestQuery = useMemo(
    () =>
      buildUrlSearchParams({
        windowValue,
        owner,
        category,
        severity,
        query: deferredQuery,
        snapshotTimestamp,
      }).toString(),
    [category, deferredQuery, owner, severity, snapshotTimestamp, windowValue],
  )
  const [initialChangeRequestQuery] = useState(changeRequestQuery)
  const [loadedChangeRequestQuery, setLoadedChangeRequestQuery] = useState<string | null>(null)
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

    async function loadBootstrap() {
      try {
        setLoading(true)
        setError(null)
        const requestPath =
          initialChangeRequestQuery === ''
            ? `${basePath}/api/monitoring/bootstrap`
            : `${basePath}/api/monitoring/bootstrap?${initialChangeRequestQuery}`
        const response = await fetch(requestPath)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load monitoring bootstrap.')
        }
        if (!cancelled) {
          const bootstrap = payload as MonitoringBootstrap
          setOverview(bootstrap.overview)
          setChanges(bootstrap.changes)
          setLoadedChangeRequestQuery(initialChangeRequestQuery)
          setLoading(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load monitoring bootstrap.')
          setLoading(false)
        }
      }
    }

    void loadBootstrap()
    return () => {
      cancelled = true
    }
  }, [initialChangeRequestQuery])

  useEffect(() => {
    if (loadedChangeRequestQuery === null) return
    if (loadedChangeRequestQuery === changeRequestQuery) return

    let cancelled = false

    async function loadChanges() {
      try {
        setLoading(true)
        setError(null)
        const requestPath =
          changeRequestQuery === ''
            ? `${basePath}/api/monitoring/changes`
            : `${basePath}/api/monitoring/changes?${changeRequestQuery}`
        const response = await fetch(requestPath)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load monitoring changes.')
        }

        if (!cancelled) {
          setChanges(payload)
          setLoadedChangeRequestQuery(changeRequestQuery)
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
  }, [changeRequestQuery, loadedChangeRequestQuery])

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
      const bootstrapPath =
        changeRequestQuery === ''
          ? `${basePath}/api/monitoring/bootstrap`
          : `${basePath}/api/monitoring/bootstrap?${changeRequestQuery}`
      const bootstrapResponse = await fetch(bootstrapPath)
      const bootstrapPayload = await bootstrapResponse.json()

      if (!bootstrapResponse.ok) {
        throw new Error(bootstrapPayload.error ?? 'Failed to refresh monitoring feed.')
      }

      const bootstrap = bootstrapPayload as MonitoringBootstrap
      setOverview(bootstrap.overview)
      setChanges(bootstrap.changes)
      setLoadedChangeRequestQuery(changeRequestQuery)

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
            overflow: 'hidden',
            bgcolor: 'background.paper',
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, pt: 1.5 }}>
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

            <Stack direction="row" spacing={1} alignItems="center">
              <Button
                variant="outlined"
                size="small"
                startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
                onClick={handleRefresh}
                disabled={refreshing}
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
                  title={selectedEvent.asin}
                >
                  {formatMonitoringLabel(
                    selectedEvent.currentSnapshot ?? selectedEvent.baselineSnapshot ?? { asin: selectedEvent.asin },
                  )}
                </Button>
              ) : null}
            </Stack>
          </Stack>

          {activeTab === 'changes' ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}>
              {/* Feed strip — filters and event cards */}
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

              {/* Detail panel — below the feed */}
              <Box
                sx={{
                  flex: 1,
                  minHeight: 200,
                  overflow: 'auto',
                  borderTop: '1px solid',
                  borderColor: 'divider',
                }}
              >
                <ChangeDetail event={selectedEvent} />
              </Box>
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
