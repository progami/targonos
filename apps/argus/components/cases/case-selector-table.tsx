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
import type { CaseSelectorRow } from '@/lib/cases/view-model'

type CaseSelectorTableProps = {
  rows: CaseSelectorRow[]
  selectedCaseId: string | null
  onSelectCase: (caseId: string) => void
}

function formatOptionalValue(value: string | null): string {
  if (value === null || value === '') {
    return '—'
  }

  return value
}

function HeaderCell({ label, align = 'left' }: { label: string; align?: 'left' | 'right' }) {
  return (
    <TableCell
      align={align}
      sx={(theme) => ({
        px: 1.25,
        py: 0.75,
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
        px: 1.25,
        py: 0.9,
        borderBottom: 'none',
        verticalAlign: 'top',
        fontFamily: mono ? 'var(--font-mono), "JetBrains Mono", monospace' : 'inherit',
        fontSize: '0.78rem',
        lineHeight: 1.3,
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

export function CaseSelectorTable({
  rows,
  selectedCaseId,
  onSelectCase,
}: CaseSelectorTableProps) {
  return (
    <TableContainer
      sx={(theme) => ({
        border: '1px solid',
        borderColor: getCaseQueueBorderColor(theme.palette.mode),
        borderRadius: 1,
        maxHeight: { xs: 360, xl: 'calc(100vh - 238px)' },
        minHeight: 320,
        overflow: 'auto',
      })}
    >
      <Table stickyHeader size="small" sx={{ tableLayout: 'fixed' }}>
        <TableHead>
          <TableRow>
            <HeaderCell label="Case" />
            <HeaderCell label="Entity" />
            <HeaderCell label="Status" />
            <HeaderCell label="Open since" />
            <HeaderCell label="Activity" align="right" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} sx={{ py: 5, borderBottom: 'none' }}>
                <Typography
                  sx={(theme) => ({
                    color: getCaseQueueMutedTextColor(theme.palette.mode),
                    textAlign: 'center',
                    fontSize: '0.84rem',
                  })}
                >
                  No cases
                </Typography>
              </TableCell>
            </TableRow>
          ) : null}

          {rows.map((row) => (
            <TableRow
              key={row.caseId}
              hover
              selected={row.caseId === selectedCaseId}
              onClick={() => {
                onSelectCase(row.caseId)
              }}
              sx={(theme) => ({
                cursor: 'pointer',
                '& td': {
                  borderTop: '1px solid',
                  borderColor: getCaseQueueBorderColor(theme.palette.mode),
                  ...(row.caseId === selectedCaseId
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
                <Box sx={{ display: 'grid', gap: 0.75, minWidth: 0 }}>
                  <CategoryPill category={row.category} />
                  <Typography
                    sx={{
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      lineHeight: 1.28,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 2,
                      overflow: 'hidden',
                    }}
                  >
                    {row.issue}
                  </Typography>
                  <Typography
                    sx={(theme) => ({
                      color: getCaseQueueMutedTextColor(theme.palette.mode),
                      fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                      fontSize: '0.71rem',
                      lineHeight: 1.15,
                    })}
                  >
                    {row.caseId}
                  </Typography>
                </Box>
              </BodyCell>

              <BodyCell>{row.entity}</BodyCell>

              <BodyCell>
                <Typography
                  sx={(theme) => ({
                    color:
                      row.amazonStatus === null || row.amazonStatus === ''
                        ? getCaseQueueMutedTextColor(theme.palette.mode)
                        : 'text.primary',
                    fontSize: '0.78rem',
                    lineHeight: 1.28,
                  })}
                >
                  {formatOptionalValue(row.amazonStatus)}
                </Typography>
              </BodyCell>

              <BodyCell mono>{formatOptionalValue(row.openSince)}</BodyCell>

              <BodyCell align="right" mono>
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700 }}>{row.activityCount}</Typography>
              </BodyCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
