'use client'

import { Fragment, type ReactNode } from 'react'
import {
  Box,
  Checkbox,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  WprSelectionPanel,
  wprSelectionHeaderCellSx,
  wprSelectionMetricCellSx,
} from '@/components/wpr/wpr-selection-panel'
import type { WprSortState } from '@/lib/wpr/dashboard-state'
import { getBulkSelectionAction } from '@/lib/wpr/bulk-selection'
import {
  rateRatio,
  safeDiv,
  sortSqpRootRows,
  sortSqpTermRows,
  type SqpSelectionViewModel,
  type SqpSortKey,
} from '@/lib/wpr/sqp-view-model'
import type { WprSortDirection } from '@/lib/wpr/dashboard-state'
import type { WeekLabel } from '@/lib/wpr/types'
import { formatWeekLabelFromLookup } from '@/lib/wpr/week-display'

const SQP_COLUMNS: Array<{ key: SqpSortKey; label: string }> = [
  { key: 'term', label: 'Term' },
  { key: 'query_volume', label: 'Q Vol' },
  { key: 'impression_share', label: 'Impr %' },
  { key: 'ctr_ratio', label: 'CTR x' },
  { key: 'atc_ratio', label: 'ATC x' },
  { key: 'purchase_rate_ratio', label: 'PurchRt x' },
  { key: 'cvr_ratio', label: 'CVR x' },
]

function toSqpSortKey(value: string): SqpSortKey {
  if (value === 'term') {
    return value
  }

  if (value === 'query_volume') {
    return value
  }

  if (value === 'impression_share') {
    return value
  }

  if (value === 'ctr_ratio') {
    return value
  }

  if (value === 'atc_ratio') {
    return value
  }

  if (value === 'purchase_rate_ratio') {
    return value
  }

  if (value === 'cvr_ratio') {
    return value
  }

  throw new Error(`Unsupported SQP sort key: ${value}`)
}

function formatCount(value: number): string {
  if (!Number.isFinite(value)) {
    return '–'
  }

  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) {
    return '–'
  }

  return `${(value * 100).toFixed(1)}%`
}

function formatRatio(value: number): string {
  if (!Number.isFinite(value)) {
    return '–'
  }

  return `${value.toFixed(2)}x`
}

function formatSqpSelectionSummary(viewModel: SqpSelectionViewModel): string {
  const baseSummary = `${viewModel.selectedRootIds.length} roots · ${viewModel.selectedTermIds.length} selected`
  const selectedQueryVolume = selectedSqpQueryVolume(viewModel)
  const activeTermCount = activeSqpTermCount(viewModel)
  if (selectedQueryVolume === null) {
    return baseSummary
  }

  return `${baseSummary} · ${activeTermCount} active · Total SV ${formatCount(selectedQueryVolume)}`
}

function selectedSqpQueryVolume(viewModel: SqpSelectionViewModel): number | null {
  if (viewModel.selectedTermIds.length === 0) {
    if (viewModel.metrics === null) {
      return null
    }

    return viewModel.metrics.query_volume
  }

  const countedTermIds = new Set<string>()
  let queryVolume = 0
  for (const rows of Object.values(viewModel.termRowsByRoot)) {
    for (const row of rows) {
      if (!row.checked) {
        continue
      }

      if (countedTermIds.has(row.id)) {
        continue
      }

      countedTermIds.add(row.id)
      queryVolume += row.current.query_volume
    }
  }

  return queryVolume
}

function activeSqpTermCount(viewModel: SqpSelectionViewModel): number {
  const countedTermIds = new Set<string>()
  for (const rows of Object.values(viewModel.termRowsByRoot)) {
    for (const row of rows) {
      if (!row.checked) {
        continue
      }

      if (row.current.query_volume <= 0) {
        continue
      }

      countedTermIds.add(row.id)
    }
  }

  return countedTermIds.size
}

function MetricCell({
  children,
  align,
}: {
  children: ReactNode
  align: 'left' | 'right' | 'center'
}) {
  return (
    <TableCell
      align={align}
      sx={{
        ...wprSelectionMetricCellSx,
      }}
    >
      {children}
    </TableCell>
  )
}

function nextSortDirection(current: WprSortState, key: SqpSortKey): WprSortDirection {
  if (current.key === key) {
    return current.dir === 'desc' ? 'asc' : 'desc'
  }

  if (key === 'term') {
    return 'asc'
  }

  return 'desc'
}

function SqpWeekStepper({
  selectedWeek,
  weeks,
  weekStartDates,
  onSelectWeek,
}: {
  selectedWeek: WeekLabel
  weeks: WeekLabel[]
  weekStartDates: Record<WeekLabel, string>
  onSelectWeek: (week: WeekLabel) => void
}) {
  const selectedIndex = weeks.indexOf(selectedWeek)
  if (selectedIndex < 0) {
    throw new Error(`Selected SQP table week is not available: ${selectedWeek}`)
  }

  const previousWeek = selectedIndex > 0 ? weeks[selectedIndex - 1] : undefined
  const nextWeek = selectedIndex < weeks.length - 1 ? weeks[selectedIndex + 1] : undefined
  const selectedWeekLabel = formatWeekLabelFromLookup(selectedWeek, weekStartDates)

  const handlePreviousWeek = () => {
    if (previousWeek === undefined) {
      throw new Error(`Missing previous SQP table week before ${selectedWeek}`)
    }

    onSelectWeek(previousWeek)
  }

  const handleNextWeek = () => {
    if (nextWeek === undefined) {
      throw new Error(`Missing next SQP table week after ${selectedWeek}`)
    }

    onSelectWeek(nextWeek)
  }

  const arrowButtonSx = {
    width: 30,
    height: 30,
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.78)',
    bgcolor: 'rgba(255,255,255,0.035)',
    '&:hover': {
      bgcolor: 'rgba(0,194,185,0.12)',
      borderColor: 'rgba(0,194,185,0.32)',
      color: 'rgba(255,255,255,0.94)',
    },
    '&.Mui-disabled': {
      color: 'rgba(255,255,255,0.22)',
      borderColor: 'rgba(255,255,255,0.04)',
      bgcolor: 'rgba(255,255,255,0.02)',
    },
  }

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={0.75}
      aria-label="SQP table week controls"
      sx={{
        px: 0.75,
        py: 0.45,
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        bgcolor: 'rgba(255,255,255,0.03)',
      }}
    >
      <IconButton
        size="small"
        aria-label="Previous table week"
        disabled={previousWeek === undefined}
        onClick={handlePreviousWeek}
        sx={arrowButtonSx}
      >
        <ChevronLeft size={15} strokeWidth={2.4} />
      </IconButton>
      <Box
        sx={{
          minWidth: 166,
          textAlign: 'center',
          fontSize: '0.77rem',
          lineHeight: 1.2,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.9)',
          whiteSpace: 'nowrap',
        }}
      >
        {selectedWeekLabel}
      </Box>
      <IconButton
        size="small"
        aria-label="Next table week"
        disabled={nextWeek === undefined}
        onClick={handleNextWeek}
        sx={arrowButtonSx}
      >
        <ChevronRight size={15} strokeWidth={2.4} />
      </IconButton>
    </Stack>
  )
}

export default function SqpSelectionTable({
  selectedWeek,
  weeks,
  weekStartDates,
  familyOrder,
  viewModel,
  expandedRootIds,
  sortState,
  setSortState,
  onSelectWeek,
  onSelectAll,
  onClearAll,
  onSetRootSelection,
  onToggleTerm,
  onToggleExpanded,
}: {
  selectedWeek: WeekLabel
  weeks: WeekLabel[]
  weekStartDates: Record<WeekLabel, string>
  familyOrder: string[]
  viewModel: SqpSelectionViewModel
  expandedRootIds: Set<string>
  sortState: WprSortState
  setSortState: (nextState: WprSortState) => void
  onSelectWeek: (week: WeekLabel) => void
  onSelectAll: () => void
  onClearAll: () => void
  onSetRootSelection: (rootId: string, shouldSelect: boolean) => void
  onToggleTerm: (rootId: string, termId: string) => void
  onToggleExpanded: (rootId: string) => void
}) {
  const allTermsChecked = viewModel.isAllSelected && viewModel.allTermIds.length > 0
  const allTermsIndeterminate = viewModel.selectedTermIds.length > 0 && !viewModel.isAllSelected
  const sortKey = toSqpSortKey(sortState.key)
  const groupRowsByFamily = sortKey === 'term'
  const rootRowSections = groupRowsByFamily
    ? familyOrder.map((family) => ({
      family,
      rows: sortSqpRootRows(
        viewModel.rootRows.filter((row) => row.family === family),
        sortKey,
        sortState.dir,
      ),
    }))
    : [{
      family: null,
      rows: sortSqpRootRows(viewModel.rootRows, sortKey, sortState.dir),
    }]

  return (
    <WprSelectionPanel
      title="SQP Selection"
      summary={formatSqpSelectionSummary(viewModel)}
      toolbar={(
        <SqpWeekStepper
          selectedWeek={selectedWeek}
          weeks={weeks}
          weekStartDates={weekStartDates}
          onSelectWeek={onSelectWeek}
        />
      )}
    >
        <Table stickyHeader size="small" sx={{ minWidth: 960 }}>
          <TableHead>
            <TableRow>
              <TableCell
                padding="checkbox"
                sx={wprSelectionHeaderCellSx}
              >
                <Checkbox
                  size="small"
                  checked={allTermsChecked}
                  indeterminate={allTermsIndeterminate}
                  onChange={() => {
                    if (getBulkSelectionAction(viewModel.allTermIds.length, viewModel.selectedTermIds.length) === 'clear-all') {
                      onClearAll()
                      return
                    }

                    onSelectAll()
                  }}
                />
              </TableCell>
              {SQP_COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  sx={wprSelectionHeaderCellSx}
                  align={column.key === 'term' ? 'left' : 'right'}
                >
                  <TableSortLabel
                    active={sortState.key === column.key}
                    direction={sortState.key === column.key ? sortState.dir : 'desc'}
                    onClick={() => {
                      setSortState({
                        key: column.key,
                        dir: nextSortDirection(sortState, column.key),
                      })
                    }}
                    sx={{
                      color: 'rgba(255,255,255,0.7)',
                      '& .MuiTableSortLabel-icon': {
                        color: 'rgba(255,255,255,0.4) !important',
                      },
                    }}
                  >
                    {column.label}
                  </TableSortLabel>
                </TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {rootRowSections.map((section) => {
              if (section.rows.length === 0) {
                return null
              }

              return (
                <Fragment key={section.family ?? 'all-roots'}>
                  {section.family !== null ? (
                    <TableRow>
                      <TableCell
                        colSpan={SQP_COLUMNS.length + 1}
                        sx={{
                          bgcolor: 'rgba(0,194,185,0.05)',
                          color: '#00C2B9',
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          letterSpacing: '0.14em',
                          borderBottom: '1px solid rgba(0,194,185,0.12)',
                        }}
                      >
                        {section.family}
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {section.rows.map((row) => {
                    const rowIsExpanded = expandedRootIds.has(row.id)
                    const termRows = viewModel.termRowsByRoot[row.id]
                    if (termRows === undefined) {
                      throw new Error(`Missing SQP term rows for root ${row.id}`)
                    }

                    const sortedTermRows = sortSqpTermRows(termRows, sortKey, sortState.dir)
                    const rowBackground = row.checked
                      ? 'rgba(0,194,185,0.08)'
                      : row.partial
                        ? 'rgba(0,194,185,0.05)'
                        : 'transparent'

                    return (
                      <Fragment key={row.id}>
                        <TableRow
                          hover
                          onClick={() => {
                            onSetRootSelection(row.id, !row.checked)
                          }}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: rowBackground,
                          }}
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={row.checked}
                              indeterminate={row.partial}
                              onClick={(event) => {
                                event.stopPropagation()
                              }}
                              onChange={(event) => {
                                onSetRootSelection(row.id, event.target.checked)
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                              <Box
                                component="button"
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  onToggleExpanded(row.id)
                                }}
                                sx={{
                                  mt: 0.35,
                                  width: 22,
                                  height: 22,
                                  borderRadius: '50%',
                                  border: '1px solid rgba(255,255,255,0.12)',
                                  bgcolor: 'rgba(255,255,255,0.03)',
                                  color: rowIsExpanded ? '#00C2B9' : 'rgba(255,255,255,0.54)',
                                  fontSize: '0.65rem',
                                  lineHeight: 1,
                                  cursor: 'pointer',
                                }}
                              >
                                {rowIsExpanded ? '▾' : '▸'}
                              </Box>
                              <Stack spacing={0.25}>
                                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                                  {row.label}
                                </Typography>
                                <Typography sx={{ fontSize: '0.66rem', color: 'rgba(255,255,255,0.58)' }}>
                                  {groupRowsByFamily
                                    ? `${row.selectedCount} / ${row.totalCount} terms selected`
                                    : `${row.family} · ${row.selectedCount} / ${row.totalCount} terms selected`}
                                </Typography>
                              </Stack>
                            </Box>
                          </TableCell>
                          <MetricCell align="right">{formatCount(row.current.query_volume)}</MetricCell>
                          <MetricCell align="right">{formatPercent(row.current.impression_share)}</MetricCell>
                          <MetricCell align="right">{formatRatio(rateRatio(row.current.asin_ctr, row.current.market_ctr))}</MetricCell>
                          <MetricCell align="right">{formatRatio(rateRatio(row.current.asin_cart_add_rate, row.current.cart_add_rate))}</MetricCell>
                          <MetricCell align="right">
                            {formatRatio(rateRatio(
                              safeDiv(row.current.asin_purchases, row.current.asin_cart_adds),
                              safeDiv(row.current.market_purchases, row.current.market_cart_adds),
                            ))}
                          </MetricCell>
                          <MetricCell align="right">{formatRatio(rateRatio(row.current.asin_cvr, row.current.market_cvr))}</MetricCell>
                        </TableRow>

                        {rowIsExpanded
                          ? sortedTermRows.map((termRow) => (
                              <TableRow
                                key={termRow.id}
                                hover
                                onClick={() => {
                                  onToggleTerm(row.id, termRow.id)
                                }}
                                sx={{
                                  cursor: 'pointer',
                                  bgcolor: termRow.checked ? 'rgba(255,255,255,0.04)' : 'transparent',
                                }}
                              >
                                <TableCell padding="checkbox">
                                  <Checkbox
                                    size="small"
                                    checked={termRow.checked}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                    }}
                                    onChange={() => {
                                      onToggleTerm(row.id, termRow.id)
                                    }}
                                  />
                                </TableCell>
                                <TableCell>
                                  <Box sx={{ pl: 4 }}>
                                    <Typography sx={{ fontSize: '0.74rem', fontWeight: 600, color: 'rgba(255,255,255,0.82)' }}>
                                      {termRow.label}
                                    </Typography>
                                  </Box>
                                </TableCell>
                                <MetricCell align="right">{formatCount(termRow.current.query_volume)}</MetricCell>
                                <MetricCell align="right">{formatPercent(termRow.current.impression_share)}</MetricCell>
                                <MetricCell align="right">{formatRatio(rateRatio(termRow.current.asin_ctr, termRow.current.market_ctr))}</MetricCell>
                                <MetricCell align="right">{formatRatio(rateRatio(termRow.current.asin_cart_add_rate, termRow.current.cart_add_rate))}</MetricCell>
                                <MetricCell align="right">
                                  {formatRatio(rateRatio(
                                    safeDiv(termRow.current.asin_purchases, termRow.current.asin_cart_adds),
                                    safeDiv(termRow.current.market_purchases, termRow.current.market_cart_adds),
                                  ))}
                                </MetricCell>
                                <MetricCell align="right">{formatRatio(rateRatio(termRow.current.asin_cvr, termRow.current.market_cvr))}</MetricCell>
                              </TableRow>
                            ))
                          : null}
                      </Fragment>
                    )
                  })}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
    </WprSelectionPanel>
  )
}
