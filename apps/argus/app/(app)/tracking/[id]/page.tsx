'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type {
  MonitoringAsinDetail,
  MonitoringChangeEvent,
  MonitoringSnapshotRecord,
} from '@/lib/monitoring/types'
import {
  CategoryChip,
  DataField,
  MetricCard,
  OwnerChip,
  SeverityChip,
  formatCount,
  formatDateTime,
  formatMoney,
  humanizeFieldName,
} from '@/components/monitoring/ui'

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

type RangeValue = '24h' | '7d' | '30d' | 'all'

export default function TrackingDetailPage() {
  const params = useParams()
  const asin = String(params.id ?? '').trim().toUpperCase()
  const [detail, setDetail] = useState<MonitoringAsinDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [range, setRange] = useState<RangeValue>('7d')

  useEffect(() => {
    let cancelled = false

    async function loadDetail() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`${basePath}/api/monitoring/asins/${asin}`)
        const payload = await response.json()
        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load ASIN monitoring detail.')
        }
        if (!cancelled) {
          setDetail(payload)
          setLoading(false)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load ASIN detail.')
          setLoading(false)
        }
      }
    }

    if (asin !== '') {
      void loadDetail()
    }

    return () => {
      cancelled = true
    }
  }, [asin])

  const filteredSnapshots = useMemo(
    () => filterSnapshots(detail?.snapshots ?? [], range),
    [detail?.snapshots, range],
  )

  const filteredChanges = useMemo(
    () => filterChanges(detail?.changes ?? [], range),
    [detail?.changes, range],
  )

  const current = detail?.current ?? null
  const owner = current?.owner ?? 'UNKNOWN'

  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading ASIN detail...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1480, mx: 'auto', pb: 4 }}>
      <Stack spacing={3}>
        <Button
          component={Link}
          href="/tracking"
          startIcon={<ArrowBackIcon />}
          sx={{ alignSelf: 'flex-start' }}
        >
          Back to Monitoring
        </Button>

        {error ? (
          <Alert severity="error" sx={{ borderRadius: 3 }}>
            {error}
          </Alert>
        ) : null}

        {detail && current ? (
          <>
            <Card
              sx={{
                borderRadius: 5,
                border: '1px solid rgba(15, 23, 42, 0.08)',
                boxShadow: '0 24px 54px rgba(15, 23, 42, 0.1)',
                background:
                  'radial-gradient(circle at top right, rgba(196, 119, 49, 0.12), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(246,242,234,0.96) 100%)',
              }}
            >
              <CardContent sx={{ p: { xs: 3, md: 4 } }}>
                <Stack spacing={2.5}>
                  <Stack
                    direction={{ xs: 'column', lg: 'row' }}
                    justifyContent="space-between"
                    spacing={2}
                  >
                    <Stack spacing={1.2}>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <OwnerChip owner={owner} />
                        {current.status ? <CategoryChip category="status" /> : null}
                      </Stack>
                      <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.04em' }}>
                        {detail.asin}
                      </Typography>
                      <Typography variant="h6" sx={{ fontWeight: 700 }}>
                        {current.title ?? 'Untitled monitoring record'}
                      </Typography>
                      <Typography color="text.secondary">
                        {current.brand ? `${current.brand} · ` : ''}
                        Latest snapshot
                        {' '}
                        {formatDateTime(detail.latestSnapshotAt)}
                      </Typography>
                    </Stack>

                    <ToggleButtonGroup
                      value={range}
                      exclusive
                      onChange={(_event, nextValue: RangeValue | null) => {
                        if (nextValue) setRange(nextValue)
                      }}
                      size="small"
                      sx={{ alignSelf: 'flex-start' }}
                    >
                      <ToggleButton value="24h">24h</ToggleButton>
                      <ToggleButton value="7d">7d</ToggleButton>
                      <ToggleButton value="30d">30d</ToggleButton>
                      <ToggleButton value="all">All</ToggleButton>
                    </ToggleButtonGroup>
                  </Stack>

                  <Box
                    sx={{
                      display: 'grid',
                      gap: 2,
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2, minmax(0, 1fr))',
                        xl: 'repeat(5, minmax(0, 1fr))',
                      },
                    }}
                  >
                    <MetricCard
                      label="Status"
                      value={current.status ?? 'Unknown'}
                      helper={current.sellerSku ? `SKU ${current.sellerSku}` : 'No seller SKU in feed'}
                      accent="#17324d"
                    />
                    <MetricCard
                      label="Landed Price"
                      value={formatMoney(current.landedPrice, current.priceCurrency)}
                      helper={`Listing ${formatMoney(current.listingPrice, current.priceCurrency)}`}
                      accent="#8c4b1f"
                    />
                    <MetricCard
                      label="Root BSR"
                      value={formatCount(current.rootBsrRank)}
                      helper={`Sub rank ${formatCount(current.subBsrRank)}`}
                      accent="#0f5c5c"
                    />
                    <MetricCard
                      label="Offer Count"
                      value={formatCount(current.totalOfferCount)}
                      helper={`Images ${formatCount(current.imageCount)}`}
                      accent="#32556d"
                    />
                    <MetricCard
                      label="Changes In View"
                      value={filteredChanges.length}
                      helper={`${filteredSnapshots.length} snapshots in ${range}`}
                      accent="#b5362d"
                    />
                  </Box>
                </Stack>
              </CardContent>
            </Card>

            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: '1fr',
                  xl: 'minmax(0, 1.35fr) minmax(340px, 0.9fr)',
                },
              }}
            >
              <Stack spacing={2}>
                <Card
                  sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Price trajectory
                      </Typography>
                      {filteredSnapshots.filter((item) => item.landedPrice !== null).length > 1 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart
                            data={filteredSnapshots
                              .filter((item) => item.landedPrice !== null)
                              .map((item) => ({
                                label: new Date(item.capturedAt).toLocaleDateString(),
                                value: item.landedPrice,
                              }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.1)" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="#b46832"
                              strokeWidth={2.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <Typography color="text.secondary">
                          Not enough priced snapshots in the selected window.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Rank trajectory
                      </Typography>
                      {filteredSnapshots.filter((item) => item.rootBsrRank !== null).length > 1 ? (
                        <ResponsiveContainer width="100%" height={280}>
                          <LineChart
                            data={filteredSnapshots
                              .filter((item) => item.rootBsrRank !== null)
                              .map((item) => ({
                                label: new Date(item.capturedAt).toLocaleDateString(),
                                value: item.rootBsrRank,
                              }))}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(15, 23, 42, 0.1)" />
                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                            <YAxis reversed tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Line
                              type="monotone"
                              dataKey="value"
                              stroke="#1f6a5a"
                              strokeWidth={2.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      ) : (
                        <Typography color="text.secondary">
                          Not enough rank snapshots in the selected window.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={2}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Recent change events
                      </Typography>

                      {filteredChanges.length > 0 ? (
                        <Stack spacing={1.5}>
                          {filteredChanges.map((event) => (
                            <Card
                              key={event.id}
                              variant="outlined"
                              sx={{
                                borderRadius: 3.5,
                                borderColor: 'rgba(15, 23, 42, 0.08)',
                                backgroundColor: 'rgba(248, 250, 252, 0.78)',
                              }}
                            >
                              <CardContent sx={{ p: 2 }}>
                                <Stack spacing={1.2}>
                                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                      <SeverityChip severity={event.severity} />
                                      {event.categories.map((category) => (
                                        <CategoryChip key={`${event.id}-${category}`} category={category} />
                                      ))}
                                    </Stack>
                                    <Typography variant="caption" color="text.secondary">
                                      {formatDateTime(event.timestamp)}
                                    </Typography>
                                  </Stack>
                                  <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                                    {event.headline}
                                  </Typography>
                                  <Typography variant="body2" color="text.secondary">
                                    {event.summary}
                                  </Typography>
                                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                                    {event.changedFields.slice(0, 6).map((field) => (
                                      <Chip
                                        key={`${event.id}-${field}`}
                                        label={humanizeFieldName(field)}
                                        size="small"
                                        variant="outlined"
                                        sx={{ borderRadius: 999 }}
                                      />
                                    ))}
                                  </Stack>
                                  <Typography variant="caption" color="text.secondary">
                                    Fields:
                                    {' '}
                                    {event.changedFields.map((field) => humanizeFieldName(field)).join(', ')}
                                  </Typography>
                                </Stack>
                              </CardContent>
                            </Card>
                          ))}
                        </Stack>
                      ) : (
                        <Typography color="text.secondary">
                          No change events in the selected window.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>

              <Stack spacing={2}>
                <Card
                  sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={1.2}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Current record
                      </Typography>
                      <Divider />
                      <DataField label="Title" value={current.title ?? '—'} />
                      <DataField label="Brand" value={current.brand ?? '—'} />
                      <DataField label="Status" value={current.status ?? '—'} />
                      <DataField label="Seller SKU" value={current.sellerSku ?? '—'} />
                      <DataField
                        label="Landed price"
                        value={formatMoney(current.landedPrice, current.priceCurrency)}
                      />
                      <DataField
                        label="Offer count"
                        value={formatCount(current.totalOfferCount)}
                      />
                      <DataField label="Root BSR" value={formatCount(current.rootBsrRank)} />
                      <DataField label="Sub BSR" value={formatCount(current.subBsrRank)} />
                      <DataField label="Bullet count" value={formatCount(current.bulletCount)} />
                      <DataField
                        label="Description length"
                        value={formatCount(current.descriptionLength)}
                      />
                      <DataField
                        label="Last updated on Amazon"
                        value={formatDateTime(current.lastUpdatedDate)}
                      />
                    </Stack>
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 4,
                    border: '1px solid rgba(15, 23, 42, 0.08)',
                    boxShadow: '0 18px 40px rgba(15, 23, 42, 0.08)',
                  }}
                >
                  <CardContent sx={{ p: 2.5 }}>
                    <Stack spacing={1.5}>
                      <Typography variant="h6" sx={{ fontWeight: 800 }}>
                        Current gallery
                      </Typography>
                      {current.imageUrls.length > 0 ? (
                        <Box
                          sx={{
                            display: 'grid',
                            gap: 1,
                            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                          }}
                        >
                          {current.imageUrls.slice(0, 8).map((url) => (
                            <Box
                              key={url}
                              component="img"
                              src={url}
                              alt=""
                              sx={{
                                width: '100%',
                                aspectRatio: '1 / 1',
                                objectFit: 'contain',
                                borderRadius: 2.5,
                                p: 1,
                                bgcolor: 'rgba(248, 250, 252, 0.9)',
                                border: '1px solid rgba(15, 23, 42, 0.08)',
                              }}
                            />
                          ))}
                        </Box>
                      ) : (
                        <Typography color="text.secondary">
                          No image URLs are present in the latest monitoring state.
                        </Typography>
                      )}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Box>
          </>
        ) : (
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            This ASIN was not found in the current monitoring state.
          </Alert>
        )}
      </Stack>
    </Box>
  )
}

function filterChanges(items: MonitoringChangeEvent[], range: RangeValue): MonitoringChangeEvent[] {
  const since = getSince(range)
  if (!since) return items

  return items.filter((item) => new Date(item.timestamp).getTime() >= since.getTime())
}

function filterSnapshots(
  items: MonitoringSnapshotRecord[],
  range: RangeValue,
): MonitoringSnapshotRecord[] {
  const since = getSince(range)
  if (!since) return items

  return items.filter((item) => new Date(item.capturedAt).getTime() >= since.getTime())
}

function getSince(range: RangeValue): Date | null {
  const now = Date.now()

  switch (range) {
    case '24h':
      return new Date(now - 24 * 60 * 60 * 1000)
    case '7d':
      return new Date(now - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now - 30 * 24 * 60 * 60 * 1000)
    case 'all':
      return null
  }
}
