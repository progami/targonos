'use client'

import type { ReactNode } from 'react'
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
import {
  getCaseQueueBorderColor,
  getCaseQueueCategoryTone,
  getCaseQueueMutedTextColor,
  getCaseQueueSelectedRowBackground,
} from '@/lib/cases/theme'
import type { CaseTimelineRow } from '@/lib/cases/view-model'

type CaseActivityTableProps = {
  rows: CaseTimelineRow[]
  selectedTimelineKey: string | null
  onSelectTimeline: (timelineKey: string) => void
}

function HeaderCell({ label }: { label: string }) {
  return (
    <TableCell
      sx={(theme) => ({
        px: 1.1,
        py: 0.7,
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
}: {
  children: ReactNode
  mono?: boolean
}) {
  return (
    <TableCell
      sx={{
        px: 1.1,
        py: 0.85,
        borderBottom: 'none',
        verticalAlign: 'top',
        fontFamily: mono ? 'var(--font-mono), "JetBrains Mono", monospace' : 'inherit',
        fontSize: '0.78rem',
        lineHeight: 1.28,
      }}
    >
      {children}
    </TableCell>
  )
}

function CategoryPill({ category }: { category: string }) {
  return (
    <Box
      sx={(theme) => {
        const tone = getCaseQueueCategoryTone(category, theme.palette.mode)

        return {
          display: 'inline-flex',
          alignItems: 'center',
          width: 'fit-content',
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

export function CaseActivityTable({
  rows,
  selectedTimelineKey,
  onSelectTimeline,
}: CaseActivityTableProps) {
  return (
    <TableContainer
      sx={(theme) => ({
        border: '1px solid',
        borderColor: getCaseQueueBorderColor(theme.palette.mode),
        borderRadius: 1,
        maxHeight: {
          xs: 320,
          lg: 248,
        },
        overflow: 'auto',
      })}
    >
      <Table stickyHeader size="small" sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            <HeaderCell label="Date" />
            <HeaderCell label="Type" />
            <HeaderCell label="Status" />
            <HeaderCell label="Signal" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={4} sx={{ py: 4.5, borderBottom: 'none' }}>
                <Typography
                  sx={(theme) => ({
                    color: getCaseQueueMutedTextColor(theme.palette.mode),
                    textAlign: 'center',
                    fontSize: '0.84rem',
                  })}
                >
                  No activity
                </Typography>
              </TableCell>
            </TableRow>
          ) : null}

          {rows.map((row) => (
            <TableRow
              key={row.timelineKey}
              hover
              selected={row.timelineKey === selectedTimelineKey}
              onClick={() => {
                onSelectTimeline(row.timelineKey)
              }}
              sx={(theme) => ({
                cursor: 'pointer',
                '& td': {
                  borderTop: '1px solid',
                  borderColor: getCaseQueueBorderColor(theme.palette.mode),
                  ...(row.timelineKey === selectedTimelineKey
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
                <Box sx={{ display: 'grid', gap: 0.25 }}>
                  <Typography
                    sx={{
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      lineHeight: 1.15,
                    }}
                  >
                    {row.reportDate}
                  </Typography>
                  <Typography
                    sx={(theme) => ({
                      color: getCaseQueueMutedTextColor(theme.palette.mode),
                      fontSize: '0.68rem',
                      lineHeight: 1.15,
                    })}
                  >
                    {row.daysAgo}
                  </Typography>
                </Box>
              </BodyCell>

              <BodyCell>
                <CategoryPill category={row.category} />
              </BodyCell>

              <BodyCell>{row.status}</BodyCell>

              <BodyCell>
                <Typography
                  sx={{
                    fontSize: '0.78rem',
                    lineHeight: 1.35,
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2,
                    overflow: 'hidden',
                  }}
                >
                  {row.signal}
                </Typography>
              </BodyCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
