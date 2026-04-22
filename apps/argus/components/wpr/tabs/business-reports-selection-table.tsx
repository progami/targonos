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
import { getBulkSelectionAction } from '@/lib/wpr/bulk-selection'
import type { WprSortDirection, WprSortState } from '@/lib/wpr/dashboard-state'
import {
  selectedWeekBusinessMetrics,
  selectedWeekBusinessRecord,
  type BusinessReportsSelectionViewModel,
  type BusinessReportsSortKey,
  sortBusinessReportsRows,
} from '@/lib/wpr/business-reports-view-model'
import { formatCount, formatMoney, formatPercent } from '@/lib/wpr/format'
import type { WeekLabel } from '@/lib/wpr/types'

const BR_COLUMNS: Array<{ key: BusinessReportsSortKey; label: string }> = [
  { key: 'asin', label: 'ASIN' },
  { key: 'weeks_present_selected_week', label: 'Weeks' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'page_views', label: 'Page Views' },
  { key: 'order_items', label: 'Order Items' },
  { key: 'order_item_session_percentage', label: 'Order Item %' },
  { key: 'units_ordered', label: 'Units' },
  { key: 'unit_session_percentage', label: 'Unit Session %' },
  { key: 'buy_box_percentage', label: 'Buy Box %' },
  { key: 'sales', label: 'Sales' },
]

function nextSortDirection(current: WprSortState, key: BusinessReportsSortKey): WprSortDirection {
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

export default function BusinessReportsSelectionTable({
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
  viewModel: BusinessReportsSelectionViewModel
  sortState: WprSortState
  setSortState: (nextState: WprSortState) => void
  onSelectWeek: (week: WeekLabel) => void
  onSelectAll: () => void
  onClearAll: () => void
  onToggleAsin: (asinId: string) => void
}) {
  const allChecked = viewModel.isAllSelected && viewModel.allIds.length > 0
  const indeterminate = viewModel.selectedIds.length > 0 && !viewModel.isAllSelected
  const rows = sortBusinessReportsRows(viewModel.rows, sortState, selectedWeek)

  return (
    <WprSelectionPanel
      title="Business Reports Selection"
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
        <Table stickyHeader size="small" sx={{ minWidth: 1120 }}>
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
              {BR_COLUMNS.map((column) => (
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
              const currentRecord = selectedWeekBusinessRecord(row.weekly, selectedWeek)
              const current = selectedWeekBusinessMetrics(row.weekly, selectedWeek)
              const checked = viewModel.selectedIds.includes(row.id)

              let sessionsValue = '—'
              let pageViewsValue = '—'
              let orderItemsValue = '—'
              let orderItemRateValue = '—'
              let unitsValue = '—'
              let unitSessionValue = '—'
              let buyBoxValue = '—'
              let salesValue = '—'

              if (currentRecord !== null) {
                sessionsValue = formatCount(current.sessions)
                pageViewsValue = formatCount(current.page_views)
                orderItemsValue = formatCount(current.order_items)
                orderItemRateValue = formatPercent(current.order_item_session_percentage)
                unitsValue = formatCount(current.units_ordered)
                unitSessionValue = formatPercent(current.unit_session_percentage)
                buyBoxValue = formatPercent(current.buy_box_percentage)
                salesValue = formatMoney(current.sales)
              }

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
                    value={`${row.asin}\n${row.is_target ? 'Target ASIN' : 'Catalog ASIN'} · ${currentRecord === null ? 0 : 1} / 1 weeks`}
                  />
                  <MetricCell align="right" value={formatCount(currentRecord === null ? 0 : 1)} />
                  <MetricCell align="right" value={sessionsValue} />
                  <MetricCell align="right" value={pageViewsValue} />
                  <MetricCell align="right" value={orderItemsValue} />
                  <MetricCell align="right" value={orderItemRateValue} />
                  <MetricCell align="right" value={unitsValue} />
                  <MetricCell align="right" value={unitSessionValue} />
                  <MetricCell align="right" value={buyBoxValue} />
                  <MetricCell align="right" value={salesValue} />
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
    </WprSelectionPanel>
  )
}
