'use client'

import type { ReactNode } from 'react'
import {
  Box,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import {
  getCaseQueueActionColor,
  getCaseQueueBorderColor,
  getCaseQueueCategoryTone,
  getCaseQueueMutedTextColor,
  getCaseQueueSelectedRowBackground,
} from '@/lib/cases/theme'
import type { CaseApprovalDecision, CaseApprovalRow } from '@/lib/cases/view-model'

type ResolvedDecision = Exclude<CaseApprovalDecision, 'pending'>

type CaseApprovalQueueTableProps = {
  rows: CaseApprovalRow[]
  selectedRowKey: string | null
  onSelectRow: (rowKey: string) => void
  onDecision: (rowKey: string, decision: ResolvedDecision) => void
}

function DecisionCell({
  row,
  onDecision,
}: {
  row: CaseApprovalRow
  onDecision: (rowKey: string, decision: ResolvedDecision) => void
}) {
  if (row.decision !== 'pending') {
    return (
      <Typography
        sx={(theme) => ({
          color: getCaseQueueActionColor(row.decision === 'approved' ? 'approve' : 'reject', theme.palette.mode),
          fontSize: '0.75rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        })}
      >
        {row.decision}
      </Typography>
    )
  }

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Button
        size="small"
        onClick={(event) => {
          event.stopPropagation()
          onDecision(row.rowKey, 'approved')
        }}
        sx={(theme) => ({
          minWidth: 0,
          px: 0.45,
          py: 0,
          color: getCaseQueueActionColor('approve', theme.palette.mode),
          fontSize: '0.72rem',
          fontWeight: 700,
          lineHeight: 1.15,
          textTransform: 'none',
        })}
      >
        Approve
      </Button>
      <Button
        size="small"
        onClick={(event) => {
          event.stopPropagation()
          onDecision(row.rowKey, 'rejected')
        }}
        sx={(theme) => ({
          minWidth: 0,
          px: 0.45,
          py: 0,
          color: getCaseQueueActionColor('reject', theme.palette.mode),
          fontSize: '0.72rem',
          fontWeight: 700,
          lineHeight: 1.15,
          textTransform: 'none',
        })}
      >
        Reject
      </Button>
    </Box>
  )
}

function CategoryCell({ category }: { category: string }) {
  return (
    <Box
      sx={(theme) => {
        const tone = getCaseQueueCategoryTone(category, theme.palette.mode)
        return {
          display: 'inline-flex',
          alignItems: 'center',
          px: 0.65,
          py: 0.22,
          border: '1px solid',
          borderColor: tone.border,
          bgcolor: tone.background,
          color: tone.color,
          borderRadius: 1,
          fontSize: '0.66rem',
          fontWeight: 700,
          lineHeight: 1.1,
          whiteSpace: 'nowrap',
        }
      }}
    >
      {category}
    </Box>
  )
}

function HeaderCell({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <TableCell
      align={align}
      sx={(theme) => ({
        px: 1,
        py: 0.55,
        borderBottom: '1px solid',
        borderColor: getCaseQueueBorderColor(theme.palette.mode),
        bgcolor: 'background.paper',
        color: getCaseQueueMutedTextColor(theme.palette.mode),
        fontSize: '0.62rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      })}
    >
      {label}
    </TableCell>
  )
}

function BodyCell({
  children,
  mono,
  align = 'left',
}: {
  children: ReactNode
  mono?: boolean
  align?: 'left' | 'right'
}) {
  return (
    <TableCell
      align={align}
      sx={{
        px: 1,
        py: 0.45,
        borderBottom: 'none',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        fontFamily: mono ? 'var(--font-mono), "JetBrains Mono", monospace' : 'inherit',
        fontSize: '0.78rem',
        lineHeight: 1.25,
      }}
    >
      {children}
    </TableCell>
  )
}

export function CaseApprovalQueueTable({
  rows,
  selectedRowKey,
  onSelectRow,
  onDecision,
}: CaseApprovalQueueTableProps) {
  return (
    <TableContainer
      sx={(theme) => ({
        border: '1px solid',
        borderColor: getCaseQueueBorderColor(theme.palette.mode),
        borderRadius: 1,
        height: 260,
        overflow: 'auto',
      })}
    >
      <Table stickyHeader size="small" sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            <HeaderCell label="Type" />
            <HeaderCell label="Issue" />
            <HeaderCell label="Assessment" />
            <HeaderCell label="Next step" />
            <HeaderCell label="Entity" />
            <HeaderCell label="Age" align="right" />
            <HeaderCell label="Decision" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} sx={{ py: 4, borderBottom: 'none' }}>
                <Typography
                  sx={(theme) => ({
                    color: getCaseQueueMutedTextColor(theme.palette.mode),
                    textAlign: 'center',
                  })}
                >
                  No rows match the current filters.
                </Typography>
              </TableCell>
            </TableRow>
          ) : null}

          {rows.map((row) => (
            <TableRow
              key={row.rowKey}
              hover
              selected={row.rowKey === selectedRowKey}
              onClick={() => {
                onSelectRow(row.rowKey)
              }}
              sx={(theme) => ({
                cursor: 'pointer',
                '& td': {
                  borderTop: '1px solid',
                  borderColor: getCaseQueueBorderColor(theme.palette.mode),
                  ...(row.rowKey === selectedRowKey
                    ? {
                        bgcolor: getCaseQueueSelectedRowBackground(theme.palette.mode),
                      }
                    : null),
                },
                '&:first-of-type td': {
                  borderTop: 'none',
                },
              })}
            >
              <BodyCell>
                <CategoryCell category={row.category} />
              </BodyCell>
              <BodyCell>
                <Typography sx={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {row.issue}
                </Typography>
              </BodyCell>
              <BodyCell>{row.assessment}</BodyCell>
              <BodyCell>{row.nextStep}</BodyCell>
              <BodyCell>{row.entity}</BodyCell>
              <BodyCell align="right" mono>
                {row.daysAgo}
              </BodyCell>
              <BodyCell>
                <DecisionCell row={row} onDecision={onDecision} />
              </BodyCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
