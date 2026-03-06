'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Button,
  Card,
  CardContent,
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
        <Stack direction="row" justifyContent="space-between" mb={3}>
          <Skeleton width={200} height={40} />
          <Stack direction="row" spacing={1}>
            <Skeleton width={120} height={36} variant="rounded" />
            <Skeleton width={100} height={36} variant="rounded" />
          </Stack>
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

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Competitive Tracking</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            size="small"
            startIcon={
              refreshing ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <RefreshIcon />
              )
            }
            onClick={handleRefresh}
            disabled={refreshing}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            Add ASIN
          </Button>
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              Total
            </Typography>
            <Typography variant="h4" fontWeight={700}>
              {data?.totalAsins ?? 0}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              Ours
            </Typography>
            <Typography variant="h4" fontWeight={700} color="primary.main">
              {data?.oursCount ?? 0}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              Competitors
            </Typography>
            <Typography variant="h4" fontWeight={700} color="secondary.main">
              {data?.competitorCount ?? 0}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Typography variant="overline" color="text.secondary">
              Last Fetch
            </Typography>
            <Typography variant="body2" fontWeight={500}>
              {data?.lastFetchAt
                ? new Date(data.lastFetchAt).toLocaleString()
                : 'Never'}
            </Typography>
            {data?.lastFetchStatus && (
              <Chip
                label={data.lastFetchStatus}
                size="small"
                color={data.lastFetchStatus === 'SUCCEEDED' ? 'success' : 'error'}
                sx={{ mt: 0.5, height: 20, fontSize: '0.675rem' }}
              />
            )}
          </CardContent>
        </Card>
      </Stack>

      <TableContainer component={Card}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>ASIN</TableCell>
              <TableCell>Label</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">BSR</TableCell>
              <TableCell align="right">Sub BSR</TableCell>
              <TableCell align="right">Offers</TableCell>
              <TableCell>Updated</TableCell>
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
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {row.imageUrl && (
                      <Box
                        component="img"
                        src={row.imageUrl}
                        alt=""
                        sx={{
                          width: 28,
                          height: 28,
                          objectFit: 'contain',
                          borderRadius: 0.5,
                        }}
                      />
                    )}
                    <Typography
                      variant="body2"
                      sx={{ fontFamily: 'monospace', fontWeight: 500 }}
                    >
                      {row.asin}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{row.label}</Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={row.ownership}
                    size="small"
                    color={row.ownership === 'OURS' ? 'primary' : 'secondary'}
                    variant="outlined"
                    sx={{ height: 22, fontSize: '0.7rem' }}
                  />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" component="span">
                    {formatCents(row.price, row.currencyCode)}
                  </Typography>
                  <Delta value={row.priceDelta} isCents />
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" component="span">
                    {row.bsrRoot?.toLocaleString() ?? '—'}
                  </Typography>
                  <Delta value={row.bsrDelta} invert />
                </TableCell>
                <TableCell align="right">
                  {row.bsrSub?.toLocaleString() ?? '—'}
                </TableCell>
                <TableCell align="right">{row.offerCount ?? '—'}</TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {row.lastUpdated
                      ? new Date(row.lastUpdated).toLocaleDateString()
                      : '—'}
                  </Typography>
                </TableCell>
              </TableRow>
            ))}
            {(!data?.rows || data.rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 8 }}>
                  <TrendingUpIcon
                    sx={{ fontSize: 48, color: 'divider', mb: 1 }}
                  />
                  <Typography color="text.secondary" variant="body2">
                    No ASINs tracked yet
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setDialogOpen(true)}
                    sx={{ mt: 1 }}
                  >
                    Add ASIN
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
        <DialogTitle>Add ASIN</DialogTitle>
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
              label="Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Drop Cloth 6-Pack"
              size="small"
              fullWidth
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
            Add
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
