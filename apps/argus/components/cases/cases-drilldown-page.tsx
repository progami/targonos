'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Box, FormControl, MenuItem, Select, Stack, TextField } from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import type { CaseReportBundle } from '@/lib/cases/reader'
import {
  createCaseDetailModel,
  createCaseSelectorRows,
  createCaseTimelineRows,
  filterCaseSelectorRows,
  type CaseSelectorRow,
  type CaseTimelineRow,
} from '@/lib/cases/view-model'
import {
  CASES_DRILLDOWN_DESKTOP_GRID_COLUMNS,
  CASES_DRILLDOWN_RIGHT_RAIL_DESKTOP_ROWS,
  CASE_DETAIL_PANEL_DESKTOP_MIN_HEIGHT,
} from '@/lib/cases/layout'
import { getCaseQueueBorderColor } from '@/lib/cases/theme'
import { CaseActivityTable } from './case-activity-table'
import { CaseDetailPanel, type CaseDetailApprovalState } from './case-detail-panel'
import { CaseSelectorTable } from './case-selector-table'

const MARKET_OPTIONS = [
  { slug: 'us', label: 'USA - Dust Sheets' },
  { slug: 'uk', label: 'UK - Dust Sheets' },
] as const

function hasSearchMatch(fields: string[], normalizedQuery: string): boolean {
  return fields.some((field) => field.toLowerCase().includes(normalizedQuery))
}

function matchesTimelineRowSearch(row: CaseTimelineRow, normalizedQuery: string): boolean {
  return hasSearchMatch(
    [
      row.issue,
      row.caseId,
      row.entity,
      row.evidence,
      row.assessment,
      row.nextStep,
      row.signal,
    ],
    normalizedQuery,
  )
}

function filterSelectorRows(
  bundle: CaseReportBundle,
  rows: CaseSelectorRow[],
  query: string,
): CaseSelectorRow[] {
  const normalizedQuery = query.trim().toLowerCase()
  if (normalizedQuery === '') {
    return rows
  }

  const selectorMatches = new Set(filterCaseSelectorRows(rows, normalizedQuery).map((row) => row.caseId))

  return rows.filter((row) => {
    if (selectorMatches.has(row.caseId)) {
      return true
    }

    return createCaseTimelineRows(bundle, row.caseId).some((timelineRow) =>
      matchesTimelineRowSearch(timelineRow, normalizedQuery),
    )
  })
}

function resolveSelectedCaseId(rows: CaseSelectorRow[], selectedCaseId: string | null): string | null {
  if (rows.length === 0) {
    return null
  }

  if (selectedCaseId === null) {
    return rows[0].caseId
  }

  const matchingRow = rows.find((row) => row.caseId === selectedCaseId)
  if (matchingRow === undefined) {
    return rows[0].caseId
  }

  return matchingRow.caseId
}

function resolveSelectedTimelineKey(rows: CaseTimelineRow[], selectedTimelineKey: string | null): string | null {
  if (rows.length === 0) {
    return null
  }

  if (selectedTimelineKey === null) {
    return rows[0].timelineKey
  }

  const matchingRow = rows.find((row) => row.timelineKey === selectedTimelineKey)
  if (matchingRow === undefined) {
    return rows[0].timelineKey
  }

  return matchingRow.timelineKey
}

function resolveApprovalState(
  timelineKey: string,
  approvalStateByTimelineKey: Record<string, CaseDetailApprovalState | undefined>,
): CaseDetailApprovalState {
  const approvalState = approvalStateByTimelineKey[timelineKey]
  if (approvalState === undefined) {
    return 'approval_required'
  }

  return approvalState
}

export function CasesDrilldownPage({ bundle }: { bundle: CaseReportBundle }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCaseIdState, setSelectedCaseIdState] = useState<string | null>(null)
  const [selectedTimelineKeyState, setSelectedTimelineKeyState] = useState<string | null>(null)
  const [approvalStateByTimelineKey, setApprovalStateByTimelineKey] = useState<
    Record<string, CaseDetailApprovalState | undefined>
  >({})
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const selectorRows = createCaseSelectorRows(bundle)
  const filteredSelectorRows = filterSelectorRows(bundle, selectorRows, searchQuery === '' ? '' : deferredSearchQuery)
  const selectedCaseId = resolveSelectedCaseId(filteredSelectorRows, selectedCaseIdState)
  const timelineRows = selectedCaseId === null ? [] : createCaseTimelineRows(bundle, selectedCaseId)
  const selectedTimelineKey = resolveSelectedTimelineKey(timelineRows, selectedTimelineKeyState)
  const selectedTimelineRowMatch =
    selectedTimelineKey === null ? undefined : timelineRows.find((row) => row.timelineKey === selectedTimelineKey)
  const selectedTimelineRow = selectedTimelineRowMatch === undefined ? null : selectedTimelineRowMatch
  const detail = selectedTimelineRow === null ? null : createCaseDetailModel(bundle, selectedTimelineRow)
  const approvalState =
    detail === null || detail.approval === null || selectedTimelineRow === null
      ? null
      : resolveApprovalState(selectedTimelineRow.timelineKey, approvalStateByTimelineKey)

  useEffect(() => {
    if (selectedCaseId !== selectedCaseIdState) {
      setSelectedCaseIdState(selectedCaseId)
    }
  }, [selectedCaseId, selectedCaseIdState])

  useEffect(() => {
    if (selectedTimelineKey !== selectedTimelineKeyState) {
      setSelectedTimelineKeyState(selectedTimelineKey)
    }
  }, [selectedTimelineKey, selectedTimelineKeyState])

  function handleMarketChange(event: SelectChangeEvent<string>) {
    router.push(`/cases/${event.target.value}`)
  }

  function handleApprovalStateChange(state: 'approved' | 'hold') {
    if (selectedTimelineRow === null) {
      throw new Error('Cannot update case approval state without a selected activity row')
    }

    setApprovalStateByTimelineKey((current) => ({
      ...current,
      [selectedTimelineRow.timelineKey]: state,
    }))
  }

  return (
    <Stack spacing={1.5}>
      <Box
        sx={(theme) => ({
          pb: 1.5,
          borderBottom: '1px solid',
          borderColor: getCaseQueueBorderColor(theme.palette.mode),
        })}
      >
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', lg: 'center' }}
        >
          <FormControl size="small" sx={{ minWidth: 190 }}>
            <Select value={bundle.marketSlug} onChange={handleMarketChange}>
              {MARKET_OPTIONS.map((market) => (
                <MenuItem key={market.slug} value={market.slug}>
                  {market.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            placeholder="Search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value)
            }}
            sx={{ flex: 1, minWidth: 280 }}
          />
        </Stack>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            lg: CASES_DRILLDOWN_DESKTOP_GRID_COLUMNS,
          },
          gap: 1.5,
          alignItems: 'start',
        }}
      >
        <CaseSelectorTable
          rows={filteredSelectorRows}
          selectedCaseId={selectedCaseId}
          onSelectCase={setSelectedCaseIdState}
        />

        <Box
          sx={{
            display: 'grid',
            gap: 1.5,
            gridTemplateRows: {
              xs: 'auto auto',
              lg: CASES_DRILLDOWN_RIGHT_RAIL_DESKTOP_ROWS,
            },
            minHeight: {
              xs: 'auto',
              lg: CASE_DETAIL_PANEL_DESKTOP_MIN_HEIGHT,
            },
          }}
        >
          <CaseActivityTable
            rows={timelineRows}
            selectedTimelineKey={selectedTimelineKey}
            onSelectTimeline={setSelectedTimelineKeyState}
          />

          <Box
            sx={{
              minHeight: {
                xs: 280,
                lg: CASE_DETAIL_PANEL_DESKTOP_MIN_HEIGHT,
              },
              display: 'flex',
            }}
          >
            <CaseDetailPanel
              detail={detail}
              approvalState={approvalState}
              onApprovalStateChange={handleApprovalStateChange}
            />
          </Box>
        </Box>
      </Box>
    </Stack>
  )
}
