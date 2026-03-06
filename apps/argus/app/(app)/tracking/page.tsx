'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

type DashboardRow = {
  id: string
  asin: string
  marketplace: string
  ownership: string
  label: string
  brand: string | null
  imageUrl: string | null
  enabled: boolean
  price: number | null
  listingPrice: number | null
  currencyCode: string | null
  bsrRoot: number | null
  bsrRootCategory: string | null
  bsrSub: number | null
  offerCount: number | null
  lastUpdated: string | null
  priceDelta: number | null
  bsrDelta: number | null
}

type DashboardData = {
  totalAsins: number
  oursCount: number
  competitorCount: number
  lastFetchAt: string | null
  lastFetchStatus: string | null
  rows: DashboardRow[]
}

function formatCents(cents: number | null, currency?: string | null): string {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
  }).format(cents / 100)
}

function Delta({
  value,
  invert,
  isCents,
}: {
  value: number | null
  invert?: boolean
  isCents?: boolean
}) {
  if (value === null || value === 0) return null
  const positive = value > 0
  const isGood = invert ? !positive : positive
  const display = isCents
    ? formatCents(Math.abs(value))
    : Math.abs(value).toLocaleString()
  return (
    <Typography
      variant="caption"
      sx={{
        color: isGood ? 'success.main' : 'error.main',
        fontWeight: 600,
        ml: 0.5,
      }}
    >
      {positive ? '+' : '−'}
      {display}
    </Typography>
  )
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function TrackingDashboard() {
  const router = useRouter()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newAsin, setNewAsin] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newOwnership, setNewOwnership] = useState<'OURS' | 'COMPETITOR'>('OURS')

  const fetchDashboard = useCallback(async () => {
    const res = await fetch(`${basePath}/api/tracking/dashboard`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetch(`${basePath}/api/tracking/fetch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggeredBy: 'manual' }),
    })
    await fetchDashboard()
    setRefreshing(false)
  }

  const handleAddAsin = async () => {
    await fetch(`${basePath}/api/tracking/asins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        asin: newAsin.trim(),
        label: newLabel.trim(),
        ownership: newOwnership,
      }),
    })
    setDialogOpen(false)
    setNewAsin('')
    setNewLabel('')
    setNewOwnership('OURS')
    await fetchDashboard()
  }

  if (loading) {
    return (
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Skeleton width={200} height={40} sx={{ mb: 3 }} />
        <Skeleton variant="rounded" height={400} />
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        mb={2}
      >
        <Stack direction="row" alignItems="baseline" spacing={1}>
          <Typography variant="h5">Tracking</Typography>
          {data?.lastFetchAt && (
            <Typography variant="caption" color="text.secondary">
              Synced {timeAgo(data.lastFetchAt)}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={
              refreshing ? (
                <CircularProgress size={14} color="inherit" />
              ) : (
                <RefreshIcon sx={{ fontSize: 18 }} />
              )
            }
            onClick={handleRefresh}
            disabled={refreshing}
          >
            Sync
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            Track
          </Button>
        </Stack>
      </Stack>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Product</TableCell>
              <TableCell />
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">BSR</TableCell>
              <TableCell align="right">Sub BSR</TableCell>
              <TableCell align="right">Offers</TableCell>
              <TableCell align="right">Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.rows.map((row) => (
              <TableRow
                key={row.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => router.push(`${basePath}/tracking/${row.id}`)}
              >
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={1.5}>
                    {row.imageUrl && (
                      <Box
                        component="img"
                        src={row.imageUrl}
                        alt=""
                        sx={{
                          width: 32,
                          height: 32,
                          objectFit: 'contain',
                          borderRadius: 0.5,
                        }}
                      />
                    )}
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        {row.brand ? `${row.brand} — ` : ''}
                        {row.label}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ fontFamily: 'monospace' }}
                      >
                        {row.asin}
                      </Typography>
                    </Box>
                  </Stack>
                </TableCell>
                <TableCell sx={{ width: 80 }}>
                  <Chip
                    label={row.ownership === 'OURS' ? 'Ours' : 'Comp'}
                    size="small"
                    color={row.ownership === 'OURS' ? 'primary' : 'secondary'}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.675rem' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" component="span" fontWeight={500}>
                    {formatCents(row.price, row.currencyCode)}
                  </Typography>
                  <Delta value={row.priceDelta} isCents />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" component="span" fontWeight={500}>
                    {row.bsrRoot?.toLocaleString() ?? '—'}
                  </Typography>
                  <Delta value={row.bsrDelta} invert />
                </TableCell>
                <TableCell align="right">
                  {row.bsrSub?.toLocaleString() ?? '—'}
                </TableCell>
                <TableCell align="right">{row.offerCount ?? '—'}</TableCell>
                <TableCell align="right">
                  <Typography
                    variant="body2"
                    fontWeight={500}
                    sx={{
                      color: row.lastUpdated
                        ? Date.now() - new Date(row.lastUpdated).getTime() >
                          86400000
                          ? 'warning.main'
                          : 'text.primary'
                        : 'text.secondary',
                    }}
                  >
                    {row.lastUpdated ? timeAgo(row.lastUpdated) : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            {(!data?.rows || data.rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 8, border: 0 }}>
                  <TrendingUpIcon
                    sx={{ fontSize: 40, color: 'divider', mb: 1 }}
                  />
                  <Typography color="text.secondary" variant="body2">
                    No products tracked yet
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setDialogOpen(true)}
                    sx={{ mt: 1 }}
                  >
                    Track a product
                  </Button>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>Track a product</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ASIN"
              value={newAsin}
              onChange={(e) => setNewAsin(e.target.value)}
              placeholder="B09HXC3NL8"
              size="small"
              fullWidth
            />
            <TextField
              label="Product name"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. ToughGuard — Drop Cloth 6-Pack"
              size="small"
              fullWidth
              helperText="Brand — product descriptor"
            />
            <FormControl fullWidth size="small">
              <InputLabel>Ownership</InputLabel>
              <Select
                value={newOwnership}
                label="Ownership"
                onChange={(e) =>
                  setNewOwnership(e.target.value as 'OURS' | 'COMPETITOR')
                }
              >
                <MenuItem value="OURS">Ours</MenuItem>
                <MenuItem value="COMPETITOR">Competitor</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} size="small">
            Cancel
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={handleAddAsin}
            disabled={!newAsin.trim() || !newLabel.trim()}
          >
            Track
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
