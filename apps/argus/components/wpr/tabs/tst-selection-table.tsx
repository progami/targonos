'use client'

import { Fragment } from 'react'
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
import { getBulkSelectionAction } from '@/lib/wpr/bulk-selection'
import type { WprSortDirection, WprSortState } from '@/lib/wpr/dashboard-state'
import {
  type TstAnnotatedTermRow,
  type TstSelectionRootRow,
  type TstSelectionTermRow,
  type TstSelectionViewModel,
} from '@/lib/wpr/tst-view-model'
import { teal, textMuted, textSecondary } from '@/lib/wpr/panel-tokens'
import { formatPercent } from '@/lib/wpr/format'
import type { WeekLabel } from '@/lib/wpr/types'

type TstSortKey =
  | 'term'
  | 'search_frequency_rank'
  | 'weeks_present'
  | 'our_click_share'
  | 'competitor_click_share'
  | 'click_gap'
  | 'our_purchase_share'
  | 'competitor_purchase_share'
  | 'purchase_gap'
  | 'issue'
  | 'priority'
  | 'tst_pool'

type Recommendation = {
  issue: string
  priority: string
  issue_rank: number
  priority_rank: number
  issue_class: string
  priority_class: string
}

type TstColumn = {
  key: TstSortKey
  label: string
}

const TST_COLUMNS: TstColumn[] = [
  { key: 'term', label: 'Term' },
  { key: 'search_frequency_rank', label: 'SFR' },
  { key: 'weeks_present', label: 'Weeks' },
  { key: 'our_click_share', label: 'Our Click %' },
  { key: 'competitor_click_share', label: 'Comp Click %' },
  { key: 'click_gap', label: 'Click Gap' },
  { key: 'our_purchase_share', label: 'Our Purch %' },
  { key: 'competitor_purchase_share', label: 'Comp Purch %' },
  { key: 'purchase_gap', label: 'Purch Gap' },
  { key: 'issue', label: 'Issue' },
  { key: 'priority', label: 'Priority' },
  { key: 'tst_pool', label: 'TST Pool' },
]

function toTstSortKey(value: string): TstSortKey {
  if (
    value === 'term' ||
    value === 'search_frequency_rank' ||
    value === 'weeks_present' ||
    value === 'our_click_share' ||
    value === 'competitor_click_share' ||
    value === 'click_gap' ||
    value === 'our_purchase_share' ||
    value === 'competitor_purchase_share' ||
    value === 'purchase_gap' ||
    value === 'issue' ||
    value === 'priority' ||
    value === 'tst_pool'
  ) {
    return value
  }

  throw new Error(`Unsupported TST sort key: ${value}`)
}

function nextSortDirection(current: WprSortState, key: TstSortKey): WprSortDirection {
  if (current.key === key) {
    return current.dir === 'desc' ? 'asc' : 'desc'
  }

  if (key === 'term') {
    return 'asc'
  }

  return 'desc'
}

function compareSortValues(
  left: number | string,
  right: number | string,
  direction: WprSortDirection,
  kind: 'number' | 'text',
): number {
  if (kind === 'text') {
    const result = String(left).localeCompare(String(right), undefined, { sensitivity: 'base' })
    return direction === 'asc' ? result : -result
  }

  const numericLeft = Number(left)
  const numericRight = Number(right)
  if (direction === 'asc') {
    return numericLeft - numericRight
  }

  return numericRight - numericLeft
}

function competitorRecommendationRules(scopeType: 'root' | 'term') {
  if (scopeType === 'term') {
    return {
      minWeeksPresent: 3,
      minTermWeeks: 3,
      minTermsCovered: 1,
      minClickPool: 0.18,
      minPurchasePool: 0.12,
      actionGap: 0.1,
      strongGap: 0.12,
      closeGap: 0.04,
      winGap: 0.05,
      skewGap: 0.04,
      highOpportunity: 0.25,
      mediumOpportunity: 0.15,
    }
  }

  return {
    minWeeksPresent: 2,
    minTermWeeks: 4,
    minTermsCovered: 2,
    minClickPool: 0.15,
    minPurchasePool: 0.1,
    actionGap: 0.08,
    strongGap: 0.1,
    closeGap: 0.05,
    winGap: 0.03,
    skewGap: 0.04,
    highOpportunity: 0.3,
    mediumOpportunity: 0.18,
  }
}

function competitorIssueRank(issue: string): number {
  if (issue === 'Visibility / Traffic + Conversion / PDP') return 7
  if (issue === 'Conversion / PDP') return 6
  if (issue === 'Visibility / Traffic') return 5
  if (issue === 'Winning / Defend') return 2
  if (issue === 'Competitive') return 1
  return 0
}

function competitorPriorityRank(priority: string): number {
  if (priority === 'High') return 3
  if (priority === 'Medium') return 2
  if (priority === 'Low') return 1
  return 0
}

function competitorIssueClass(issue: string): string {
  if (issue === 'Visibility / Traffic + Conversion / PDP') return 'rec-threat'
  if (issue === 'Conversion / PDP') return 'rec-warning'
  if (issue === 'Visibility / Traffic') return 'rec-opportunity'
  if (issue === 'Winning / Defend') return 'rec-safe'
  if (issue === 'Competitive') return 'rec-neutral'
  return 'rec-watch'
}

function competitorPriorityClass(priority: string): string {
  if (priority === 'High') return 'rec-threat'
  if (priority === 'Medium') return 'rec-warning'
  if (priority === 'Low') return 'rec-neutral'
  return 'rec-watch'
}

function competitorRecommendation(
  scopeType: 'root' | 'term',
  observed: {
    click_gap: number
    purchase_gap: number
  },
  coverage: {
    weeks_present: number
    terms_covered: number
    term_weeks_covered: number
    avg_click_pool_share: number
    avg_purchase_pool_share: number
  },
): Recommendation {
  const rules = competitorRecommendationRules(scopeType)
  const clickGap = observed.click_gap
  const purchaseGap = observed.purchase_gap
  const maxGap = Math.max(Math.abs(clickGap), Math.abs(purchaseGap))
  const opportunity = Math.max(coverage.avg_click_pool_share, coverage.avg_purchase_pool_share)
  const competitorAheadClicks = clickGap < -rules.closeGap
  const competitorAheadPurchases = purchaseGap < -rules.closeGap
  const ourAheadClicks = clickGap > rules.closeGap
  const ourAheadPurchases = purchaseGap > rules.closeGap

  let lowConfidence = false
  if (coverage.weeks_present < rules.minWeeksPresent) {
    lowConfidence = true
  }
  if (!lowConfidence && coverage.term_weeks_covered < rules.minTermWeeks) {
    lowConfidence = true
  }
  if (!lowConfidence && coverage.terms_covered < rules.minTermsCovered) {
    lowConfidence = true
  }
  if (
    !lowConfidence &&
    coverage.avg_click_pool_share < rules.minClickPool &&
    coverage.avg_purchase_pool_share < rules.minPurchasePool
  ) {
    lowConfidence = true
  }

  if (lowConfidence) {
    return {
      issue: 'Low Confidence',
      priority: 'Watch',
      issue_rank: competitorIssueRank('Low Confidence'),
      priority_rank: competitorPriorityRank('Watch'),
      issue_class: competitorIssueClass('Low Confidence'),
      priority_class: competitorPriorityClass('Watch'),
    }
  }

  let issue = 'Competitive'
  let priority = 'Low'

  if (competitorAheadClicks && competitorAheadPurchases) {
    if (clickGap <= -rules.actionGap && purchaseGap <= -rules.actionGap) {
      issue = 'Visibility / Traffic + Conversion / PDP'
    } else if (purchaseGap <= clickGap - rules.skewGap) {
      issue = 'Conversion / PDP'
    } else if (clickGap <= purchaseGap - rules.skewGap) {
      issue = 'Visibility / Traffic'
    } else {
      issue = 'Visibility / Traffic + Conversion / PDP'
    }
  } else if (ourAheadClicks && competitorAheadPurchases) {
    issue = 'Conversion / PDP'
  } else if (competitorAheadClicks) {
    issue = 'Visibility / Traffic'
  } else if (competitorAheadPurchases) {
    issue = 'Conversion / PDP'
  } else if (ourAheadClicks && ourAheadPurchases) {
    issue = 'Winning / Defend'
  }

  if (issue === 'Winning / Defend') {
    priority = opportunity >= rules.highOpportunity ? 'Medium' : 'Low'
  } else if (issue === 'Competitive') {
    priority = opportunity >= rules.highOpportunity && maxGap >= rules.closeGap ? 'Medium' : 'Low'
  } else if (issue === 'Visibility / Traffic + Conversion / PDP') {
    priority = opportunity >= rules.mediumOpportunity || maxGap >= rules.strongGap ? 'High' : 'Medium'
  } else {
    priority = opportunity >= rules.mediumOpportunity && maxGap >= rules.actionGap ? 'High' : 'Medium'
  }

  return {
    issue,
    priority,
    issue_rank: competitorIssueRank(issue),
    priority_rank: competitorPriorityRank(priority),
    issue_class: competitorIssueClass(issue),
    priority_class: competitorPriorityClass(priority),
  }
}

function recommendationForRoot(row: TstSelectionRootRow): Recommendation {
  return competitorRecommendation(
    'root',
    row.current.observed,
    row.current.coverage,
  )
}

function recommendationForTerm(row: TstAnnotatedTermRow): Recommendation {
  return competitorRecommendation(
    'term',
    row,
    {
      weeks_present: row.weeks_present,
      terms_covered: 1,
      term_weeks_covered: row.weeks_present,
      avg_click_pool_share: row.avg_click_pool_share,
      avg_purchase_pool_share: row.avg_purchase_pool_share,
    },
  )
}

function sortType(key: TstSortKey): 'number' | 'text' {
  if (key === 'term' || key === 'issue') {
    return 'text'
  }

  return 'number'
}

function sortValueForRoot(row: TstSelectionRootRow, key: TstSortKey): number | string {
  const recommendation = recommendationForRoot(row)
  if (key === 'term') return row.label
  if (key === 'search_frequency_rank') return 0
  if (key === 'weeks_present') return row.current.coverage.term_weeks_covered
  if (key === 'our_click_share') return row.current.observed.our_click_share
  if (key === 'competitor_click_share') return row.current.observed.competitor_click_share
  if (key === 'click_gap') return row.current.observed.click_gap
  if (key === 'our_purchase_share') return row.current.observed.our_purchase_share
  if (key === 'competitor_purchase_share') return row.current.observed.competitor_purchase_share
  if (key === 'purchase_gap') return row.current.observed.purchase_gap
  if (key === 'issue') return recommendation.issue_rank
  if (key === 'priority') return recommendation.priority_rank
  if (key === 'tst_pool') return row.current.coverage.avg_purchase_pool_share
  return row.current.observed.competitor_purchase_share
}

function sortValueForTerm(row: TstAnnotatedTermRow, key: TstSortKey): number | string {
  const recommendation = recommendationForTerm(row)
  if (key === 'term') return row.term
  if (key === 'search_frequency_rank') {
    return row.search_frequency_rank > 0 ? row.search_frequency_rank : Number.POSITIVE_INFINITY
  }
  if (key === 'weeks_present') return row.weeks_present
  if (key === 'our_click_share') return row.our_click_share
  if (key === 'competitor_click_share') return row.competitor_click_share
  if (key === 'click_gap') return row.click_gap
  if (key === 'our_purchase_share') return row.our_purchase_share
  if (key === 'competitor_purchase_share') return row.competitor_purchase_share
  if (key === 'purchase_gap') return row.purchase_gap
  if (key === 'issue') return recommendation.issue_rank
  if (key === 'priority') return recommendation.priority_rank
  if (key === 'tst_pool') return row.avg_purchase_pool_share
  return row.competitor_purchase_share
}

function sortRootRows(
  rows: TstSelectionRootRow[],
  key: TstSortKey,
  dir: WprSortDirection,
): TstSelectionRootRow[] {
  return rows.slice().sort((left, right) => {
    return compareSortValues(sortValueForRoot(left, key), sortValueForRoot(right, key), dir, sortType(key))
  })
}

function sortTermRows(
  rows: TstSelectionTermRow[],
  key: TstSortKey,
  dir: WprSortDirection,
): TstSelectionTermRow[] {
  return rows.slice().sort((left, right) => {
    return compareSortValues(sortValueForTerm(left.current, key), sortValueForTerm(right.current, key), dir, sortType(key))
  })
}

function formatPctDelta(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatPercent(value, 1)}`
}

function Pill({
  label,
  kind,
}: {
  label: string
  kind: Recommendation['issue_class'] | Recommendation['priority_class']
}) {
  let color = textMuted
  let borderColor = 'rgba(255,255,255,0.1)'
  let background = 'rgba(255,255,255,0.04)'

  if (kind === 'rec-threat') {
    color = '#ef4444'
    borderColor = 'rgba(239,68,68,0.4)'
    background = 'rgba(239,68,68,0.12)'
  } else if (kind === 'rec-warning') {
    color = '#eab308'
    borderColor = 'rgba(234,179,8,0.35)'
    background = 'rgba(234,179,8,0.1)'
  } else if (kind === 'rec-opportunity') {
    color = teal
    borderColor = 'rgba(0,194,185,0.35)'
    background = 'rgba(0,194,185,0.1)'
  } else if (kind === 'rec-safe') {
    color = '#34d399'
    borderColor = 'rgba(52,211,153,0.35)'
    background = 'rgba(52,211,153,0.1)'
  }

  return (
    <Box
      component="span"
      sx={{
        px: '8px',
        py: '3px',
        borderRadius: '999px',
        fontSize: '0.68rem',
        fontWeight: 700,
        border: `1px solid ${borderColor}`,
        bgcolor: background,
        color,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  )
}

function MetricCell({
  align = 'right',
  children,
}: {
  align?: 'left' | 'right' | 'center'
  children: React.ReactNode
}) {
  return (
    <TableCell
      align={align}
      sx={{
        ...wprSelectionMetricCellSx,
        color: textSecondary,
      }}
    >
      {children}
    </TableCell>
  )
}

export default function TstSelectionTable({
  selectedWeek,
  weeks,
  weekStartDates,
  competitorBrand,
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
  competitorBrand: string
  familyOrder: string[]
  viewModel: TstSelectionViewModel
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
  const allTermsChecked =
    viewModel.allTermIds.length > 0 && viewModel.selectedTermIds.length === viewModel.allTermIds.length
  const allTermsIndeterminate =
    viewModel.selectedTermIds.length > 0 && viewModel.selectedTermIds.length < viewModel.allTermIds.length
  const sortKey = toTstSortKey(sortState.key)

  const columns = TST_COLUMNS.map((column) => {
    if (column.key === 'competitor_click_share') {
      return { ...column, label: `${competitorBrand} Click %` }
    }

    if (column.key === 'competitor_purchase_share') {
      return { ...column, label: `${competitorBrand} Purch %` }
    }

    return column
  })

  return (
    <WprSelectionPanel
      title="TST Selection"
      summary={`${viewModel.rootIds.length} roots · ${viewModel.selectedTermIds.length} terms`}
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
        <Table stickyHeader size="small" sx={{ minWidth: 1320 }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={wprSelectionHeaderCellSx}>
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
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  align={column.key === 'term' ? 'left' : 'right'}
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
                      color: textSecondary,
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
              const sortedFamilyRows = sortRootRows(familyRows, sortKey, sortState.dir)
              if (sortedFamilyRows.length === 0) {
                return null
              }

              return (
                <Fragment key={family}>
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + 1}
                      sx={{
                        bgcolor: 'rgba(0,194,185,0.05)',
                        color: teal,
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
                      throw new Error(`Missing TST term rows for root ${row.id}`)
                    }

                    const sortedTermRows = sortTermRows(termRows, sortKey, sortState.dir)
                    const recommendation = recommendationForRoot(row)
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
                          sx={{ cursor: 'pointer', bgcolor: rowBackground }}
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
                          <MetricCell align="left">
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
                                  color: rowIsExpanded ? teal : textMuted,
                                  fontSize: '0.65rem',
                                  lineHeight: 1,
                                  cursor: 'pointer',
                                }}
                              >
                                {rowIsExpanded ? '▾' : '▸'}
                              </Box>
                              <Stack spacing={0.25}>
                                <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                                  {row.label}
                                </Typography>
                                <Typography sx={{ fontSize: '0.68rem', color: textMuted }}>
                                  {`${row.selectedCount} / ${row.totalCount} terms selected`}
                                </Typography>
                              </Stack>
                            </Box>
                          </MetricCell>
                          <MetricCell>—</MetricCell>
                          <MetricCell>{row.current.coverage.term_weeks_covered}</MetricCell>
                          <MetricCell>{formatPercent(row.current.observed.our_click_share, 1)}</MetricCell>
                          <MetricCell>{formatPercent(row.current.observed.competitor_click_share, 1)}</MetricCell>
                          <MetricCell>{formatPctDelta(row.current.observed.click_gap)}</MetricCell>
                          <MetricCell>{formatPercent(row.current.observed.our_purchase_share, 1)}</MetricCell>
                          <MetricCell>{formatPercent(row.current.observed.competitor_purchase_share, 1)}</MetricCell>
                          <MetricCell>{formatPctDelta(row.current.observed.purchase_gap)}</MetricCell>
                          <MetricCell align="center">
                            <Pill label={recommendation.issue} kind={recommendation.issue_class} />
                          </MetricCell>
                          <MetricCell align="center">
                            <Pill label={recommendation.priority} kind={recommendation.priority_class} />
                          </MetricCell>
                          <MetricCell>
                            {`${formatPercent(row.current.coverage.avg_click_pool_share, 1)} click · ${formatPercent(row.current.coverage.avg_purchase_pool_share, 1)} purch`}
                          </MetricCell>
                        </TableRow>

                        {rowIsExpanded
                          ? sortedTermRows.map((termRow) => {
                              const termRecommendation = recommendationForTerm(termRow.current)
                              return (
                                <TableRow
                                  key={termRow.id}
                                  hover
                                  onClick={() => {
                                    onToggleTerm(termRow.rootId, termRow.id)
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
                                        onToggleTerm(termRow.rootId, termRow.id)
                                      }}
                                    />
                                  </TableCell>
                                  <MetricCell align="left">
                                    <Box sx={{ pl: 4 }}>
                                      <Typography sx={{ fontSize: '0.74rem', color: 'rgba(255,255,255,0.84)' }}>
                                        {termRow.label}
                                      </Typography>
                                    </Box>
                                  </MetricCell>
                                  <MetricCell>
                                    {termRow.current.search_frequency_rank > 0 ? termRow.current.search_frequency_rank : '—'}
                                  </MetricCell>
                                  <MetricCell>{termRow.current.weeks_present}</MetricCell>
                                  <MetricCell>{formatPercent(termRow.current.our_click_share, 1)}</MetricCell>
                                  <MetricCell>{formatPercent(termRow.current.competitor_click_share, 1)}</MetricCell>
                                  <MetricCell>{formatPctDelta(termRow.current.click_gap)}</MetricCell>
                                  <MetricCell>{formatPercent(termRow.current.our_purchase_share, 1)}</MetricCell>
                                  <MetricCell>{formatPercent(termRow.current.competitor_purchase_share, 1)}</MetricCell>
                                  <MetricCell>{formatPctDelta(termRow.current.purchase_gap)}</MetricCell>
                                  <MetricCell align="center">
                                    <Pill label={termRecommendation.issue} kind={termRecommendation.issue_class} />
                                  </MetricCell>
                                  <MetricCell align="center">
                                    <Pill label={termRecommendation.priority} kind={termRecommendation.priority_class} />
                                  </MetricCell>
                                  <MetricCell>
                                    {`${formatPercent(termRow.current.avg_click_pool_share, 1)} click · ${formatPercent(termRow.current.avg_purchase_pool_share, 1)} purch`}
                                  </MetricCell>
                                </TableRow>
                              )
                            })
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
