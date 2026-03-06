'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  Skeleton,
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
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
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

function formatDelta(
  current: number | null,
  snapshots: SnapshotRow[],
  field: keyof SnapshotRow
): React.ReactNode {
  if (current === null || snapshots.length < 2) return null
  const oldest = snapshots[0]
  const oldValue = oldest[field] as number | null
  if (oldValue === null) return null
  const delta = current - oldValue
  if (delta === 0) return null
  const isBsr = field === 'bsrRoot' || field === 'bsrSub'
  // For BSR lower is better; for price, context-dependent but showing direction
  const isGood = isBsr ? delta < 0 : delta < 0
  const prefix = delta > 0 ? '+' : ''
  const display = isBsr ? delta.toLocaleString() : formatCents(delta)
  return (
    <Typography
      variant="caption"
      sx={{ color: isGood ? 'success.main' : 'error.main', fontWeight: 600 }}
    >
      {prefix}
      {display}
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
  const [deleteOpen, setDeleteOpen] = useState(false)

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

  const handleDelete = async () => {
    await fetch(`${basePath}/api/tracking/asins/${id}`, { method: 'DELETE' })
    router.push(`${basePath}/tracking`)
  }

  if (loading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Stack direction="row" alignItems="center" spacing={2} mb={3}>
          <Skeleton variant="circular" width={40} height={40} />
          <Skeleton variant="rounded" width={64} height={64} />
          <Box>
            <Skeleton width={200} height={32} />
            <Skeleton width={120} height={20} />
          </Box>
        </Stack>
        <Stack direction="row" spacing={2} mb={3}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={88} sx={{ flex: 1 }} />
          ))}
        </Stack>
        <Skeleton variant="rounded" height={300} />
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

  const priceChartData = history
    .filter((s) => s.landedPriceCents != null)
    .map((s) => ({
      time: new Date(s.capturedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      price: s.landedPriceCents! / 100,
    }))

  const bsrChartData = history
    .filter((s) => s.bsrRoot != null)
    .map((s) => ({
      time: new Date(s.capturedAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      bsr: s.bsrRoot,
    }))

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        mb={3}
      >
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton
            onClick={() => router.push(`${basePath}/tracking`)}
            size="small"
          >
            <ArrowBackIcon />
          </IconButton>
          {asin.imageUrl && (
            <Box
              component="img"
              src={asin.imageUrl}
              alt=""
              sx={{
                width: 48,
                height: 48,
                objectFit: 'contain',
                borderRadius: 1,
              }}
            />
          )}
          <Box>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h5">{asin.label}</Typography>
              <Chip
                label={asin.ownership}
                size="small"
                color={asin.ownership === 'OURS' ? 'primary' : 'secondary'}
                variant="outlined"
                sx={{ height: 22, fontSize: '0.7rem' }}
              />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {asin.asin}
              {asin.brand && ` · ${asin.brand}`}
            </Typography>
          </Box>
        </Stack>
        <Button
          color="error"
          size="small"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => setDeleteOpen(true)}
        >
          Delete
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              Price
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {formatCents(latest?.landedPriceCents ?? null)}
            </Typography>
            {formatDelta(
              latest?.landedPriceCents ?? null,
              history,
              'landedPriceCents'
            )}
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              BSR (Root)
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {latest?.bsrRoot?.toLocaleString() ?? '—'}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              {formatDelta(latest?.bsrRoot ?? null, history, 'bsrRoot')}
              {latest?.bsrRootCategory && (
                <Typography variant="caption" color="text.secondary">
                  {latest.bsrRootCategory}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              BSR (Sub)
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {latest?.bsrSub?.toLocaleString() ?? '—'}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              {formatDelta(latest?.bsrSub ?? null, history, 'bsrSub')}
              {latest?.bsrSubCategory && (
                <Typography variant="caption" color="text.secondary">
                  {latest.bsrSubCategory}
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              Offers
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {latest?.offerCount ?? '—'}
            </Typography>
          </CardContent>
        </Card>
      </Stack>

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

      {priceChartData.length > 1 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>
              Price History
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={priceChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dde1e5" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#6F7B8B' }}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#6F7B8B' }}
                  tickFormatter={(v: number) => `$${v}`}
                />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Price']}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #dde1e5',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#002C51"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {bsrChartData.length > 1 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" color="text.secondary" mb={2}>
              BSR History
            </Typography>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={bsrChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#dde1e5" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 11, fill: '#6F7B8B' }}
                />
                <YAxis
                  reversed
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11, fill: '#6F7B8B' }}
                  tickFormatter={(v: number) => v.toLocaleString()}
                />
                <Tooltip
                  formatter={(value: number) => [
                    value.toLocaleString(),
                    'BSR',
                  ]}
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #dde1e5',
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="bsr"
                  stroke="#00C2B9"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <Typography variant="subtitle2" color="text.secondary" mb={2}>
            Snapshots
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell align="right">Landed</TableCell>
                  <TableCell align="right">List</TableCell>
                  <TableCell align="right">BSR Root</TableCell>
                  <TableCell align="right">BSR Sub</TableCell>
                  <TableCell align="right">Offers</TableCell>
                  <TableCell>Title</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...history].reverse().map((snap) => (
                  <TableRow key={snap.id}>
                    <TableCell>
                      <Typography variant="body2">
                        {new Date(snap.capturedAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      {formatCents(snap.landedPriceCents)}
                    </TableCell>
                    <TableCell align="right">
                      {formatCents(snap.listingPriceCents)}
                    </TableCell>
                    <TableCell align="right">
                      {snap.bsrRoot?.toLocaleString() ?? '—'}
                    </TableCell>
                    <TableCell align="right">
                      {snap.bsrSub?.toLocaleString() ?? '—'}
                    </TableCell>
                    <TableCell align="right">
                      {snap.offerCount ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        noWrap
                        sx={{ maxWidth: 280 }}
                      >
                        {snap.title ?? '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
                {history.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <Typography color="text.secondary" variant="body2">
                        No snapshots yet
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>Delete ASIN</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This will permanently remove <strong>{asin.label}</strong> (
            {asin.asin}) and all its snapshot history.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteOpen(false)} size="small">
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            size="small"
            onClick={handleDelete}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
