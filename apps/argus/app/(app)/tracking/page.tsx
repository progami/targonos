'use client'

import Link from 'next/link'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  Alert,
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
  MonitoringHealthReport,
  MonitoringOverview,
  MonitoringSeverity,
} from '@/lib/monitoring/types'
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
              'linear-gradient(135deg, #13232f 0%, #243649 60%, #7a4520 100%)',
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
                    bgcolor: '#f8fafc',
                    color: '#102032',
                    '&:hover': { bgcolor: '#e2e8f0' },
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
                  >
                    {selectedEvent.label ?? selectedEvent.asin}
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
            backgroundColor: 'rgba(255, 252, 245, 0.92)',
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
                                      label={item.label && item.label !== item.asin ? `${item.label} (${item.asin})` : item.asin}
                                      size="small"
                                      sx={{
                                        borderRadius: 999,
                                        bgcolor: 'rgba(15, 23, 42, 0.06)',
                                      }}
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
                                {selectedEvent.label && selectedEvent.label !== selectedEvent.asin ? selectedEvent.label : selectedEvent.asin}
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
                              color: '#64748b',
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

                <Box
                  sx={{
                    display: 'grid',
                    gap: 2,
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: 'repeat(2, minmax(0, 1fr))',
                    },
                  }}
                >
                  {health?.datasets.map((dataset) => (
                    <Card
                      key={dataset.id}
                      sx={{
                        borderRadius: 4,
                        border: '1px solid rgba(15, 23, 42, 0.08)',
                        boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                        background:
                          dataset.status === 'healthy'
                            ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(239,249,244,0.88) 100%)'
                            : dataset.status === 'stale'
                              ? 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,245,229,0.88) 100%)'
                              : 'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(252,241,241,0.92) 100%)',
                      }}
                    >
                      <CardContent sx={{ p: 2.5 }}>
                        <Stack spacing={1.2}>
                          <Stack direction="row" justifyContent="space-between" spacing={1}>
                            <Box>
                              <Typography variant="overline" color="text.secondary">
                                {dataset.cadence}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 800 }}>
                                {dataset.label}
                              </Typography>
                            </Box>
                            <Chip
                              label={dataset.status.toUpperCase()}
                              size="small"
                              sx={{
                                fontWeight: 800,
                                borderRadius: 999,
                                bgcolor:
                                  dataset.status === 'healthy'
                                    ? 'rgba(35, 116, 70, 0.14)'
                                    : dataset.status === 'stale'
                                      ? 'rgba(180, 104, 50, 0.16)'
                                      : 'rgba(181, 54, 45, 0.16)',
                                color:
                                  dataset.status === 'healthy'
                                    ? '#1f6a5a'
                                    : dataset.status === 'stale'
                                      ? '#8c4b1f'
                                      : '#b5362d',
                              }}
                            />
                          </Stack>

                          <DataField label="Last updated" value={formatDateTime(dataset.updatedAt)} mono />
                          <DataField
                            label="Age"
                            value={
                              dataset.ageMinutes === null
                                ? 'Missing'
                                : `${dataset.ageMinutes.toLocaleString()} minutes`
                            }
                          />
                          <DataField label="Path" value={dataset.path} />
                        </Stack>
                      </CardContent>
                    </Card>
                  ))}
                </Box>

                {!health && !healthError ? <LinearProgress /> : null}
              </Stack>
            </CardContent>
          )}
        </Card>
      </Stack>
    </Box>
  )
}

