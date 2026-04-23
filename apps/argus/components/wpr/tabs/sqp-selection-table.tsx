'use client'

import { Fragment, type ReactNode } from 'react'
import {
  Box,
  Checkbox,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
import {
  WprSelectionPanel,
  wprSelectionHeaderCellSx,
  wprSelectionMetricCellSx,
} from '@/components/wpr/wpr-selection-panel'
import WprWeekSelect from '@/components/wpr/wpr-week-select'
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

  return (
    <WprSelectionPanel
      title="SQP Selection"
      summary={`${viewModel.selectedRootIds.length} roots · ${viewModel.selectedTermIds.length} terms`}
      toolbar={(
        <WprWeekSelect
          label="Table week"
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
            {familyOrder.map((family) => {
              const familyRows = viewModel.rootRows.filter((row) => row.family === family)
              const sortedFamilyRows = sortSqpRootRows(familyRows, sortKey, sortState.dir)
              if (sortedFamilyRows.length === 0) {
                return null
              }

              return (
                <Fragment key={family}>
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
                      {family}
                    </TableCell>
                  </TableRow>

                  {sortedFamilyRows.map((row) => {
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
                                  {`${row.selectedCount} / ${row.totalCount} terms selected`}
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
