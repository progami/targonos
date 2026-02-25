'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

type TrackedAsinDetail = {
  id: string
  asin: string
  marketplace: string
  ownership: string
  label: string
  brand: string | null
  imageUrl: string | null
  enabled: boolean
  latestSnapshot: SnapshotRow | null
}

type SnapshotRow = {
  id: string
  capturedAt: string
  landedPriceCents: number | null
  listingPriceCents: number | null
  shippingPriceCents: number | null
  currencyCode: string | null
  offerCount: number | null
  bsrRoot: number | null
  bsrRootCategory: string | null
  bsrSub: number | null
  bsrSubCategory: string | null
  title: string | null
  brand: string | null
}

function formatCents(cents: number | null): string {
  if (cents === null) return '—'
  return `$${(cents / 100).toFixed(2)}`
}

function formatDelta(current: number | null, snapshots: SnapshotRow[], field: keyof SnapshotRow): React.ReactNode {
  if (current === null || snapshots.length < 2) return null
  // Find the oldest snapshot for comparison
  const oldest = snapshots[0]
  const oldValue = oldest[field] as number | null
  if (oldValue === null) return null
  const delta = current - oldValue
  if (delta === 0) return null
  const isBsr = field === 'bsrRoot' || field === 'bsrSub'
  // For BSR, lower is better
  const color = isBsr
    ? delta < 0 ? 'success.main' : 'error.main'
    : delta > 0 ? 'error.main' : 'success.main'
  const prefix = delta > 0 ? '+' : ''
  const display = isBsr ? delta.toLocaleString() : formatCents(delta)
  return (
    <Typography variant="caption" sx={{ color }}>
      {prefix}{display}
    </Typography>
  )
}

export default function TrackingDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [asin, setAsin] = useState<TrackedAsinDetail | null>(null)
  const [history, setHistory] = useState<SnapshotRow[]>([])
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    const [asinRes, historyRes] = await Promise.all([
      fetch(`${basePath}/api/tracking/asins/${id}`),
      fetch(`${basePath}/api/tracking/asins/${id}/history?range=${range}`),
    ])
    const asinData = await asinRes.json()
    const historyData = await historyRes.json()
    setAsin(asinData)
    setHistory(historyData)
    setLoading(false)
  }, [id, range])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>Loading...</Typography>
      </Box>
    )
  }

  if (!asin) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography>ASIN not found</Typography>
      </Box>
    )
  }

  const latest = asin.latestSnapshot

  // Prepare chart data
  const priceChartData = history
    .filter((s) => s.landedPriceCents != null)
    .map((s) => ({
      time: new Date(s.capturedAt).toLocaleString(),
      price: s.landedPriceCents! / 100,
    }))

  const bsrChartData = history
    .filter((s) => s.bsrRoot != null)
    .map((s) => ({
      time: new Date(s.capturedAt).toLocaleString(),
      bsr: s.bsrRoot,
    }))

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={2} mb={3}>
        <IconButton onClick={() => router.push('/tracking')}>
          <ArrowBackIcon />
        </IconButton>
        {asin.imageUrl && (
          <Box
            component="img"
            src={asin.imageUrl}
            alt=""
            sx={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 1 }}
          />
        )}
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="h5" fontWeight={700}>
              {asin.label}
            </Typography>
            <Chip
              label={asin.ownership}
              size="small"
              color={asin.ownership === 'OURS' ? 'primary' : 'warning'}
              variant="outlined"
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            {asin.asin} {asin.brand && `· ${asin.brand}`}
          </Typography>
        </Box>
      </Stack>

      {/* Metric Cards */}
      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Price
            </Typography>
            <Typography variant="h4">
              {formatCents(latest?.landedPriceCents ?? null)}
            </Typography>
            {formatDelta(latest?.landedPriceCents ?? null, history, 'landedPriceCents')}
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              BSR (Root)
            </Typography>
            <Typography variant="h4">
              {latest?.bsrRoot?.toLocaleString() ?? '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {latest?.bsrRootCategory ?? ''}
            </Typography>
            <Box>{formatDelta(latest?.bsrRoot ?? null, history, 'bsrRoot')}</Box>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              BSR (Sub)
            </Typography>
            <Typography variant="h4">
              {latest?.bsrSub?.toLocaleString() ?? '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {latest?.bsrSubCategory ?? ''}
            </Typography>
            <Box>{formatDelta(latest?.bsrSub ?? null, history, 'bsrSub')}</Box>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Offers
            </Typography>
            <Typography variant="h4">
              {latest?.offerCount ?? '—'}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* Time Range Toggle */}
      <Stack direction="row" justifyContent="flex-end" mb={2}>
        <ToggleButtonGroup
          value={range}
          exclusive
          onChange={(_, v) => v && setRange(v)}
          size="small"
        >
          <ToggleButton value="24h">24h</ToggleButton>
          <ToggleButton value="7d">7d</ToggleButton>
          <ToggleButton value="30d">30d</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {/* Price Chart */}
      {priceChartData.length > 1 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" mb={2}>
              Price History
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#1976d2"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* BSR Chart */}
      {bsrChartData.length > 1 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" mb={2}>
              BSR History
            </Typography>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={bsrChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis reversed domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="bsr"
                  stroke="#ed6c02"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Snapshots Table */}
      <Card>
        <CardContent>
          <Typography variant="h6" mb={2}>
            Snapshots
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell align="right">Landed Price</TableCell>
                  <TableCell align="right">List Price</TableCell>
                  <TableCell align="right">BSR Root</TableCell>
                  <TableCell align="right">BSR Sub</TableCell>
                  <TableCell align="right">Offers</TableCell>
                  <TableCell>Title</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...history].reverse().map((snap) => (
                  <TableRow key={snap.id}>
                    <TableCell>{new Date(snap.capturedAt).toLocaleString()}</TableCell>
                    <TableCell align="right">{formatCents(snap.landedPriceCents)}</TableCell>
                    <TableCell align="right">{formatCents(snap.listingPriceCents)}</TableCell>
                    <TableCell align="right">{snap.bsrRoot?.toLocaleString() ?? '—'}</TableCell>
                    <TableCell align="right">{snap.bsrSub?.toLocaleString() ?? '—'}</TableCell>
                    <TableCell align="right">{snap.offerCount ?? '—'}</TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 300 }}>
                        {snap.title ?? '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">No snapshots yet</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Delete Button */}
      <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          color="error"
          variant="outlined"
          onClick={async () => {
            await fetch(`${basePath}/api/tracking/asins/${id}`, { method: 'DELETE' })
            router.push('/tracking')
          }}
        >
          Delete ASIN
        </Button>
      </Box>
    </Box>
  )
}
