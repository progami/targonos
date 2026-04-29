'use client'

import {
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
} from '@mui/material'
import {
  WprSelectionPanel,
  wprSelectionHeaderCellSx,
  wprSelectionMetricCellSx,
} from '@/components/wpr/wpr-selection-panel'
import WprWeekSelect from '@/components/wpr/wpr-week-select'
import { formatAsinDisplayName } from '@/lib/product-labels'
import { getBulkSelectionAction } from '@/lib/wpr/bulk-selection'
import type { WprSortDirection, WprSortState } from '@/lib/wpr/dashboard-state'
import {
  emptyScpMetrics,
  finalizeScpMetrics,
  safeDiv,
  selectedWeekScpMetrics,
  type ScpSelectionViewModel,
  type ScpSortKey,
  sortScpRows,
} from '@/lib/wpr/scp-view-model'
import { formatCount, formatMoney, formatPercent } from '@/lib/wpr/format'
import type { WeekLabel } from '@/lib/wpr/types'

const SCP_COLUMNS: Array<{ key: ScpSortKey; label: string }> = [
  { key: 'asin', label: 'ASIN' },
  { key: 'weeks_present_selected_week', label: 'Weeks' },
  { key: 'impressions', label: 'Impr' },
  { key: 'impression_share', label: 'Impr %' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'click_share', label: 'Click %' },
  { key: 'ctr', label: 'CTR' },
  { key: 'cart_adds', label: 'Cart Adds' },
  { key: 'atc_rate', label: 'ATC Rate' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'purchase_share', label: 'Purch %' },
  { key: 'purchase_rate', label: 'Purch Rate' },
  { key: 'cvr', label: 'CVR' },
  { key: 'sales', label: 'Sales' },
]

function nextSortDirection(current: WprSortState, key: ScpSortKey): WprSortDirection {
  if (current.key === key) {
    if (current.dir === 'desc') {
      return 'asc'
    }

    return 'desc'
  }

  if (key === 'asin') {
    return 'asc'
  }

  return 'desc'
}

function MetricCell({
  value,
  align,
}: {
  value: string
  align: 'left' | 'right' | 'center'
}) {
  return (
    <TableCell
      align={align}
      sx={{
        ...wprSelectionMetricCellSx,
        whiteSpace: 'pre-line',
      }}
    >
      {value}
    </TableCell>
  )
}

export default function ScpSelectionTable({
  selectedWeek,
  weeks,
  weekStartDates,
  viewModel,
  sortState,
  setSortState,
  onSelectWeek,
  onSelectAll,
  onClearAll,
  onToggleAsin,
}: {
  selectedWeek: WeekLabel
  weeks: WeekLabel[]
  weekStartDates: Record<WeekLabel, string>
  viewModel: ScpSelectionViewModel
  sortState: WprSortState
  setSortState: (nextState: WprSortState) => void
  onSelectWeek: (week: WeekLabel) => void
  onSelectAll: () => void
  onClearAll: () => void
  onToggleAsin: (asinId: string) => void
}) {
  const allChecked = viewModel.isAllSelected && viewModel.allIds.length > 0
  const indeterminate = viewModel.selectedIds.length > 0 && !viewModel.isAllSelected
  const total = viewModel.current === null ? finalizeScpMetrics(emptyScpMetrics()) : viewModel.current
  const rows = sortScpRows(viewModel.rows, sortState, selectedWeek, viewModel.current)

  return (
    <WprSelectionPanel
      title="SCP Selection"
      summary={`${viewModel.selectedIds.length} / ${viewModel.allIds.length} ASINs`}
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
        <Table stickyHeader size="small" sx={{ minWidth: 1280 }}>
          <TableHead>
            <TableRow>
              <TableCell
                padding="checkbox"
                sx={wprSelectionHeaderCellSx}
              >
                <Checkbox
                  size="small"
                  checked={allChecked}
                  indeterminate={indeterminate}
                  onChange={() => {
                    if (getBulkSelectionAction(viewModel.allIds.length, viewModel.selectedIds.length) === 'clear-all') {
                      onClearAll()
                      return
                    }

                    onSelectAll()
                  }}
                />
              </TableCell>
              {SCP_COLUMNS.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.key === 'asin' ? 'left' : 'right'}
                  sx={wprSelectionHeaderCellSx}
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
            {rows.map((row) => {
              const current = selectedWeekScpMetrics(row.weekly, selectedWeek)
              const weeksPresent = current.start_date === '' ? 0 : 1
              const checked = viewModel.selectedIds.includes(row.id)

              return (
                <TableRow
                  key={row.id}
                  hover
                  selected={checked}
                  onClick={() => {
                    onToggleAsin(row.id)
                  }}
                  sx={{
                    cursor: 'pointer',
                    '&.Mui-selected': {
                      bgcolor: 'rgba(0, 194, 185, 0.08)',
                    },
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={checked}
                      onClick={(event) => {
                        event.stopPropagation()
                      }}
                      onChange={() => {
                        onToggleAsin(row.id)
                      }}
                    />
                  </TableCell>
                  <MetricCell
                    align="left"
                    value={`${formatAsinDisplayName(row)}\n${row.asin} · ${row.is_target ? 'Target ASIN' : 'Catalog ASIN'} · ${weeksPresent} / 1 weeks`}
                  />
                  <MetricCell align="right" value={formatCount(weeksPresent)} />
                  <MetricCell align="right" value={formatCount(current.impressions)} />
                  <MetricCell align="right" value={formatPercent(safeDiv(current.impressions, total.impressions))} />
                  <MetricCell align="right" value={formatCount(current.clicks)} />
                  <MetricCell align="right" value={formatPercent(safeDiv(current.clicks, total.clicks))} />
                  <MetricCell align="right" value={formatPercent(current.ctr)} />
                  <MetricCell align="right" value={formatCount(current.cart_adds)} />
                  <MetricCell align="right" value={formatPercent(current.atc_rate)} />
                  <MetricCell align="right" value={formatCount(current.purchases)} />
                  <MetricCell align="right" value={formatPercent(safeDiv(current.purchases, total.purchases))} />
                  <MetricCell align="right" value={formatPercent(current.purchase_rate)} />
                  <MetricCell align="right" value={formatPercent(current.cvr)} />
                  <MetricCell align="right" value={formatMoney(current.sales)} />
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
    </WprSelectionPanel>
  )
}
