'use client'

import {
  Box,
  Checkbox,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material'
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
import { panelSx } from '@/lib/wpr/panel-tokens'

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
        fontSize: '0.72rem',
        color: 'rgba(255,255,255,0.76)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        whiteSpace: 'pre-line',
      }}
    >
      {value}
    </TableCell>
  )
}

export default function BusinessReportsSelectionTable({
  selectedWeekLabel,
  viewModel,
  sortState,
  setSortState,
  onSelectAll,
  onClearAll,
  onToggleAsin,
}: {
  selectedWeekLabel: string
  viewModel: BusinessReportsSelectionViewModel
  sortState: WprSortState
  setSortState: (nextState: WprSortState) => void
  onSelectAll: () => void
  onClearAll: () => void
  onToggleAsin: (asinId: string) => void
}) {
  const allChecked = viewModel.isAllSelected && viewModel.allIds.length > 0
  const indeterminate = viewModel.selectedIds.length > 0 && !viewModel.isAllSelected
  const rows = sortBusinessReportsRows(viewModel.rows, sortState, selectedWeekLabel)

  return (
    <Box sx={panelSx}>
      <Box
        sx={{
          px: 2,
          py: 1.3,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Stack spacing={0.3}>
          <Typography
            sx={{
              fontSize: '0.64rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.54)',
            }}
          >
            Business Reports Selection
          </Typography>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(255,255,255,0.88)' }}>
            {`Selected week · ${viewModel.selectedIds.length} / ${viewModel.allIds.length} ASINs`}
          </Typography>
        </Stack>
      </Box>

      <TableContainer sx={{ maxHeight: 640 }}>
        <Table stickyHeader size="small" sx={{ minWidth: 1120 }}>
          <TableHead>
            <TableRow>
              <TableCell
                padding="checkbox"
                sx={{
                  bgcolor: 'rgba(0, 20, 35, 0.96)',
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
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
                  sx={{
                    bgcolor: 'rgba(0, 20, 35, 0.96)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}
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
              const currentRecord = selectedWeekBusinessRecord(row.weekly, selectedWeekLabel)
              const current = selectedWeekBusinessMetrics(row.weekly, selectedWeekLabel)
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
                    value={`${row.asin}\n${row.is_target ? 'Target ASIN' : 'Catalog ASIN'} · ${row.weeks_present_selected_week} / 1 weeks`}
                  />
                  <MetricCell align="right" value={formatCount(row.weeks_present_selected_week)} />
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
      </TableContainer>
    </Box>
  )
}
