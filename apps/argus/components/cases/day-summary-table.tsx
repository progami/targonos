'use client'

import type { KeyboardEvent, ReactNode } from 'react'
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import type { CaseReportDaySummary } from '@/lib/cases/reader'
import {
  getCaseQueueBorderColor,
  getCaseQueueMutedTextColor,
  getCaseQueueSelectedRowBackground,
} from '@/lib/cases/theme'

type CaseDaySummaryTableProps = {
  daySummaries: CaseReportDaySummary[]
  selectedReportDate: string
  onSelectReportDate: (reportDate: string) => void
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
  align = 'left',
  mono,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  mono?: boolean
}) {
  return (
    <TableCell
      align={align}
      sx={{
        px: 1,
        py: 0.45,
        borderBottom: 'none',
        fontFamily: mono ? 'var(--font-mono), "JetBrains Mono", monospace' : 'inherit',
        fontSize: '0.78rem',
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </TableCell>
  )
}

export function CaseDaySummaryTable({
  daySummaries,
  selectedReportDate,
  onSelectReportDate,
}: CaseDaySummaryTableProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>, reportDate: string) {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSelectReportDate(reportDate)
      return
    }

    if (event.key === ' ') {
      event.preventDefault()
      onSelectReportDate(reportDate)
    }
  }

  return (
    <Box sx={{ mt: 1.2 }}>
      <Typography
        sx={(theme) => ({
          mb: 0.55,
          color: getCaseQueueMutedTextColor(theme.palette.mode),
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        })}
      >
        Day over day
      </Typography>
      <TableContainer
        sx={(theme) => ({
          border: '1px solid',
          borderColor: getCaseQueueBorderColor(theme.palette.mode),
          borderRadius: 1,
          height: 150,
          overflow: 'auto',
        })}
      >
        <Table stickyHeader size="small" sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <HeaderCell label="Day" />
              <HeaderCell label="Total" align="right" />
              <HeaderCell label="Action due" align="right" />
              <HeaderCell label="New" align="right" />
              <HeaderCell label="Forum" align="right" />
              <HeaderCell label="Watching" align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {daySummaries.map((summary) => (
              <TableRow
                key={summary.reportDate}
                hover
                selected={summary.reportDate === selectedReportDate}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelectReportDate(summary.reportDate)
                }}
                onKeyDown={(event) => {
                  handleKeyDown(event, summary.reportDate)
                }}
                sx={(theme) => ({
                  cursor: 'pointer',
                  '& td': {
                    borderTop: '1px solid',
                    borderColor: getCaseQueueBorderColor(theme.palette.mode),
                    ...(summary.reportDate === selectedReportDate
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
                <BodyCell mono>
                  <Typography sx={{ fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 800 }}>
                    {summary.reportDate}
                  </Typography>
                </BodyCell>
                <BodyCell align="right" mono>
                  {summary.totalRows}
                </BodyCell>
                <BodyCell align="right" mono>
                  {summary.actionDueRows}
                </BodyCell>
                <BodyCell align="right" mono>
                  {summary.newCaseRows}
                </BodyCell>
                <BodyCell align="right" mono>
                  {summary.forumWatchRows}
                </BodyCell>
                <BodyCell align="right" mono>
                  {summary.watchingRows}
                </BodyCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
