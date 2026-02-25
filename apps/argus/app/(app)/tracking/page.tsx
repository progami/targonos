'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
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
  const dollars = cents / 100
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency ?? 'USD',
  }).format(dollars)
}

function formatDelta(delta: number | null, isCents?: boolean): React.ReactNode {
  if (delta === null) return null
  const display = isCents ? formatCents(Math.abs(delta)) : Math.abs(delta).toLocaleString()
  const color = delta < 0 ? 'success.main' : delta > 0 ? 'error.main' : 'text.secondary'
  const prefix = delta < 0 ? '-' : delta > 0 ? '+' : ''
  // For BSR, lower is better so green = negative
  return (
    <Typography variant="caption" sx={{ color, ml: 0.5 }}>
      {prefix}
      {display}
    </Typography>
  )
}

function formatBsrDelta(delta: number | null): React.ReactNode {
  if (delta === null) return null
  const display = Math.abs(delta).toLocaleString()
  // For BSR, lower = better, so negative delta = green (improvement)
  const color = delta < 0 ? 'success.main' : delta > 0 ? 'error.main' : 'text.secondary'
  const prefix = delta < 0 ? '-' : delta > 0 ? '+' : ''
  return (
    <Typography variant="caption" sx={{ color, ml: 0.5 }}>
      {prefix}
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
      <Box sx={{ p: 4 }}>
        <Typography>Loading...</Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5" fontWeight={700}>
          Competitive Tracking
        </Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? 'Fetching...' : 'Refresh Now'}
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDialogOpen(true)}
          >
            Add ASIN
          </Button>
        </Stack>
      </Stack>

      {/* Summary Cards */}
      <Stack direction="row" spacing={2} mb={3}>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Total ASINs
            </Typography>
            <Typography variant="h4">{data?.totalAsins ?? 0}</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Ours
            </Typography>
            <Typography variant="h4" color="primary">
              {data?.oursCount ?? 0}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Competitors
            </Typography>
            <Typography variant="h4" color="warning.main">
              {data?.competitorCount ?? 0}
            </Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1 }}>
          <CardContent>
            <Typography variant="overline" color="text.secondary">
              Last Fetch
            </Typography>
            <Typography variant="body1">
              {data?.lastFetchAt
                ? new Date(data.lastFetchAt).toLocaleString()
                : 'Never'}
            </Typography>
            {data?.lastFetchStatus && (
              <Chip
                label={data.lastFetchStatus}
                size="small"
                color={data.lastFetchStatus === 'SUCCEEDED' ? 'success' : 'error'}
                sx={{ mt: 0.5 }}
              />
            )}
          </CardContent>
        </Card>
      </Stack>

      {/* Data Table */}
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
              <TableCell>Last Updated</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data?.rows.map((row) => (
              <TableRow
                key={row.id}
                hover
                sx={{ cursor: 'pointer' }}
                onClick={() => router.push(`/tracking/${row.id}`)}
              >
                <TableCell>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    {row.imageUrl && (
                      <Box
                        component="img"
                        src={row.imageUrl}
                        alt=""
                        sx={{ width: 32, height: 32, objectFit: 'contain', borderRadius: 0.5 }}
                      />
                    )}
                    <Typography variant="body2" fontFamily="monospace">
                      {row.asin}
                    </Typography>
                  </Stack>
                </TableCell>
                <TableCell>{row.label}</TableCell>
                <TableCell>
                  <Chip
                    label={row.ownership}
                    size="small"
                    color={row.ownership === 'OURS' ? 'primary' : 'warning'}
                    variant="outlined"
                  />
                </TableCell>
                <TableCell align="right">
                  {formatCents(row.price, row.currencyCode)}
                  {formatDelta(row.priceDelta, true)}
                </TableCell>
                <TableCell align="right">
                  {row.bsrRoot?.toLocaleString() ?? '—'}
                  {formatBsrDelta(row.bsrDelta)}
                </TableCell>
                <TableCell align="right">
                  {row.bsrSub?.toLocaleString() ?? '—'}
                </TableCell>
                <TableCell align="right">{row.offerCount ?? '—'}</TableCell>
                <TableCell>
                  {row.lastUpdated
                    ? new Date(row.lastUpdated).toLocaleString()
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
            {(!data?.rows || data.rows.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    No ASINs being tracked. Click &quot;Add ASIN&quot; to get started.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Add ASIN Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add ASIN to Track</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="ASIN"
              value={newAsin}
              onChange={(e) => setNewAsin(e.target.value)}
              placeholder="B09HXC3NL8"
              fullWidth
            />
            <TextField
              label="Label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Drop Cloth 6-Pack"
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Ownership</InputLabel>
              <Select
                value={newOwnership}
                label="Ownership"
                onChange={(e) => setNewOwnership(e.target.value as 'OURS' | 'COMPETITOR')}
              >
                <MenuItem value="OURS">Ours</MenuItem>
                <MenuItem value="COMPETITOR">Competitor</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
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
