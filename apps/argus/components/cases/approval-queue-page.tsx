'use client'

import { useDeferredValue, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Box,
  FormControl,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material/Select'
import type { CaseReportBundle } from '@/lib/cases/reader'
import {
  createCaseApprovalRows,
  createCaseReportDateOptions,
  filterCaseApprovalRows,
  type CaseApprovalDecision,
  type CaseApprovalRow,
} from '@/lib/cases/view-model'
import { getCaseQueueBorderColor } from '@/lib/cases/theme'
import { CaseApprovalQueueTable } from './approval-queue-table'
import { CaseApprovalDetailBand } from './approval-detail-band'

const MARKET_OPTIONS = [
  { slug: 'us', label: 'USA - Dust Sheets' },
  { slug: 'uk', label: 'UK - Dust Sheets' },
] as const

type ResolvedDecision = Exclude<CaseApprovalDecision, 'pending'>
type DecisionFilter = CaseApprovalDecision | 'all'

function getResolvedDecision(
  rowKey: string,
  decisionByRowKey: Record<string, ResolvedDecision | undefined>,
): CaseApprovalDecision {
  const decision = decisionByRowKey[rowKey]
  if (decision === undefined) {
    return 'pending'
  }

  return decision
}

function applyDecisionsToRows(
  rows: CaseApprovalRow[],
  decisionByRowKey: Record<string, ResolvedDecision | undefined>,
): CaseApprovalRow[] {
  return rows.map((row) => ({
    ...row,
    decision: getResolvedDecision(row.rowKey, decisionByRowKey),
  }))
}

function getSelectedRow(rows: CaseApprovalRow[], selectedRowKey: string | null): CaseApprovalRow | null {
  if (selectedRowKey === null) {
    if (rows.length === 0) {
      return null
    }

    return rows[0]
  }

  const row = rows.find((item) => item.rowKey === selectedRowKey)
  if (row === undefined) {
    if (rows.length === 0) {
      return null
    }

    return rows[0]
  }

  return row
}

export function CaseApprovalQueuePage({ bundle }: { bundle: CaseReportBundle }) {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [decisionFilter, setDecisionFilter] = useState<DecisionFilter>('pending')
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null)
  const [decisionByRowKey, setDecisionByRowKey] = useState<Record<string, ResolvedDecision | undefined>>({})
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const baseRows = createCaseApprovalRows(bundle)
  const reportDateOptions = createCaseReportDateOptions(bundle)
  const rows = applyDecisionsToRows(baseRows, decisionByRowKey)
  const filteredRows = filterCaseApprovalRows(rows, {
    decision: decisionFilter,
    query: deferredSearchQuery,
  })
  const selectedRow = getSelectedRow(filteredRows, selectedRowKey)

  useEffect(() => {
    if (selectedRow === null) {
      if (selectedRowKey !== null) {
        setSelectedRowKey(null)
      }
      return
    }

    if (selectedRow.rowKey !== selectedRowKey) {
      setSelectedRowKey(selectedRow.rowKey)
    }
  }, [selectedRow, selectedRowKey])

  function handleMarketChange(event: SelectChangeEvent<string>) {
    router.push(`/cases/${event.target.value}`)
  }

  function handleReportDateChange(event: SelectChangeEvent<string>) {
    router.push(`/cases/${bundle.marketSlug}/${event.target.value}`)
  }

  function handleDecisionFilterChange(event: SelectChangeEvent<string>) {
    setDecisionFilter(event.target.value as DecisionFilter)
  }

  function handleDecision(rowKey: string, decision: ResolvedDecision) {
    setDecisionByRowKey((current) => ({
      ...current,
      [rowKey]: decision,
    }))
  }

  return (
    <Stack spacing={0}>
      <Box
        sx={(theme) => ({
          pb: 1.5,
          mb: 1.5,
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

          <FormControl size="small" sx={{ minWidth: 320 }}>
            <Select value={bundle.reportDate} onChange={handleReportDateChange}>
              {reportDateOptions.map((option) => (
                <MenuItem key={option.reportDate} value={option.reportDate}>
                  {option.label}
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
            sx={{ flex: 1, minWidth: 220 }}
          />

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <Select value={decisionFilter} onChange={handleDecisionFilterChange}>
              <MenuItem value="pending">Pending</MenuItem>
              <MenuItem value="approved">Approved</MenuItem>
              <MenuItem value="rejected">Rejected</MenuItem>
              <MenuItem value="all">All</MenuItem>
            </Select>
          </FormControl>
        </Stack>
      </Box>

      <CaseApprovalQueueTable
        rows={filteredRows}
        selectedRowKey={selectedRowKey}
        onSelectRow={setSelectedRowKey}
        onDecision={handleDecision}
      />

      <CaseApprovalDetailBand row={selectedRow} />
    </Stack>
  )
}
