'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward'
import RefreshIcon from '@mui/icons-material/Refresh'
import { getPublicBasePath } from '@/lib/base-path'
import type { ListingsViewModel, ListingTableRow } from '@/lib/listings/view-model'

const basePath = getPublicBasePath()

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function HeaderCell({ label, align = 'left' }: { label: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <TableCell
      align={align}
      sx={{
        px: 1.25,
        py: 0.45,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        color: 'text.secondary',
        fontSize: '0.58rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </TableCell>
  )
}

function BodyCell({
  children,
  align = 'left',
  mono = false,
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
  mono?: boolean
}) {
  return (
    <TableCell
      align={align}
      sx={{
        px: 1,
        py: 0.5,
        borderBottom: '1px solid',
        borderColor: 'divider',
        fontFamily: mono ? 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        fontSize: '0.74rem',
        lineHeight: 1.2,
        verticalAlign: 'middle',
      }}
    >
      {children}
    </TableCell>
  )
}

function CountCell({ value }: { value: number }) {
  return (
    <Typography
      component="span"
      sx={{
        display: 'inline-flex',
        minWidth: 24,
        justifyContent: 'flex-end',
        fontFamily: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.72rem',
        fontWeight: 700,
      }}
    >
      {value}
    </Typography>
  )
}

function ProductCell({ row }: { row: ListingTableRow }) {
  return (
    <Stack spacing={0.1} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ minWidth: 0 }}>
        <Typography
          component={Link}
          href={`/listings/${row.id}`}
          sx={{
            color: 'text.primary',
            display: 'block',
            fontSize: '0.8rem',
            fontWeight: 800,
            maxWidth: 300,
            overflow: 'hidden',
            textDecoration: 'none',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {row.displayName}
        </Typography>
        {row.needsMetadataRefresh ? (
          <Chip
            label="Needs metadata"
            size="small"
            variant="outlined"
            sx={{ height: 18, borderRadius: 1, fontSize: '0.6rem', fontWeight: 700 }}
          />
        ) : null}
      </Stack>
      <Stack direction="row" spacing={0.75} alignItems="center">
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
            fontFamily: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: '0.65rem',
            fontWeight: 700,
          }}
        >
          {row.asin}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
          {row.marketplace}
        </Typography>
        {row.brandName ? (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            {row.brandName}
          </Typography>
        ) : null}
      </Stack>
    </Stack>
  )
}

export function ListingsTable({ viewModel }: { viewModel: ListingsViewModel }) {
  const router = useRouter()
  const [refreshingMetadata, setRefreshingMetadata] = useState(false)
  const [metadataMessage, setMetadataMessage] = useState<string | null>(null)
  const [metadataError, setMetadataError] = useState<string | null>(null)

  async function refreshMetadata() {
    setRefreshingMetadata(true)
    setMetadataMessage(null)
    setMetadataError(null)

    try {
      const response = await fetch(`${basePath}/api/listings/metadata`, { method: 'POST' })
      const text = await response.text()
      if (!response.ok) {
        throw new Error(text)
      }

      const payload = JSON.parse(text) as { refreshed: number; total: number }
      setMetadataMessage(`Updated ${payload.refreshed} of ${payload.total} listings.`)
      router.refresh()
    } catch (error) {
      setMetadataError(error instanceof Error ? error.message : String(error))
    } finally {
      setRefreshingMetadata(false)
    }
  }

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        spacing={1}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', md: 'center' }}
      >
        <Stack direction="row" spacing={2.5} flexWrap="wrap" useFlexGap>
          <Typography variant="caption" color="text.secondary">
            <strong>{viewModel.totalListings}</strong> listings
          </Typography>
          <Typography variant="caption" color="text.secondary">
            <strong>{viewModel.totalSnapshots}</strong> snapshots
          </Typography>
          <Typography variant="caption" color="text.secondary">
            <strong>{viewModel.totalRevisions}</strong> revisions
          </Typography>
          <Typography variant="caption" color="text.secondary">
            <strong>{viewModel.metadataRefreshCount}</strong> need metadata
          </Typography>
        </Stack>

        <Button
          type="button"
          size="small"
          variant="outlined"
          startIcon={<RefreshIcon sx={{ fontSize: 16 }} />}
          onClick={refreshMetadata}
          disabled={refreshingMetadata ? true : viewModel.totalListings === 0}
          sx={{ alignSelf: { xs: 'flex-start', md: 'center' }, minHeight: 28, py: 0.25 }}
        >
          {refreshingMetadata ? 'Fetching...' : 'Fetch metadata'}
        </Button>
      </Stack>

      {metadataMessage ? <Alert severity="success">{metadataMessage}</Alert> : null}
      {metadataError ? <Alert severity="error">{metadataError}</Alert> : null}
      {refreshingMetadata ? <LinearProgress /> : null}

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
          display: 'inline-block',
          overflowX: 'hidden',
          alignSelf: 'start',
          justifySelf: 'start',
          maxWidth: '100%',
          width: 858,
        }}
      >
        <Table stickyHeader size="small" sx={{ width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 300 }} />
            <col style={{ width: 78 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 66 }} />
            <col style={{ width: 66 }} />
            <col style={{ width: 60 }} />
            <col style={{ width: 52 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 48 }} />
          </colgroup>
          <TableHead>
            <TableRow>
              <HeaderCell label="Product" />
              <HeaderCell label="Snapshots" align="right" />
              <HeaderCell label="Title" align="right" />
              <HeaderCell label="Bullets" align="right" />
              <HeaderCell label="Images" align="right" />
              <HeaderCell label="Video" align="right" />
              <HeaderCell label="A+" align="right" />
              <HeaderCell label="Updated" />
              <HeaderCell label="Open" align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {viewModel.rows.length === 0 ? (
              <TableRow>
                <BodyCell>
                  <Typography variant="body2" color="text.secondary">
                    No listings yet
                  </Typography>
                </BodyCell>
                <BodyCell align="right">—</BodyCell>
                <BodyCell align="right">—</BodyCell>
                <BodyCell align="right">—</BodyCell>
                <BodyCell align="right">—</BodyCell>
                <BodyCell align="right">—</BodyCell>
                <BodyCell align="right">—</BodyCell>
                <BodyCell>—</BodyCell>
                <BodyCell align="right">—</BodyCell>
              </TableRow>
            ) : (
              viewModel.rows.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  sx={{
                    '&:last-child td': { borderBottom: 0 },
                  }}
                >
                  <BodyCell>
                    <ProductCell row={row} />
                  </BodyCell>
                  <BodyCell align="right"><CountCell value={row.counts.snapshots} /></BodyCell>
                  <BodyCell align="right"><CountCell value={row.counts.titleRevisions} /></BodyCell>
                  <BodyCell align="right"><CountCell value={row.counts.bulletsRevisions} /></BodyCell>
                  <BodyCell align="right"><CountCell value={row.counts.galleryRevisions} /></BodyCell>
                  <BodyCell align="right"><CountCell value={row.counts.videoRevisions} /></BodyCell>
                  <BodyCell align="right"><CountCell value={row.counts.ebcRevisions} /></BodyCell>
                  <BodyCell>{formatDate(row.updatedAt)}</BodyCell>
                  <BodyCell align="right">
                    <Tooltip title="Open listing">
                      <IconButton component={Link} href={`/listings/${row.id}`} size="small" aria-label="Open listing">
                        <ArrowOutwardIcon sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </BodyCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
