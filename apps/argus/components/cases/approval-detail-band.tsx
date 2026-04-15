'use client'

import { Box, Stack, Typography } from '@mui/material'
import {
  getCaseQueueActionColor,
  getCaseQueueBorderColor,
  getCaseQueueCategoryTone,
  getCaseQueueMutedTextColor,
} from '@/lib/cases/theme'
import type { CaseApprovalRow } from '@/lib/cases/view-model'

function MetaBlock({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        sx={(theme) => ({
          color: getCaseQueueMutedTextColor(theme.palette.mode),
          fontSize: '0.68rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        })}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.4,
          fontFamily: mono ? 'var(--font-mono), "JetBrains Mono", monospace' : 'inherit',
          fontSize: '0.92rem',
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

function DecisionLabel({ decision }: { decision: CaseApprovalRow['decision'] }) {
  if (decision === 'pending') {
    return null
  }

  return (
    <Typography
      sx={(theme) => ({
        color: getCaseQueueActionColor(decision === 'approved' ? 'approve' : 'reject', theme.palette.mode),
        fontSize: '0.72rem',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      })}
    >
      {decision}
    </Typography>
  )
}

export function CaseApprovalDetailBand({ row }: { row: CaseApprovalRow | null }) {
  return (
    <Box
      sx={(theme) => ({
        mt: 1.5,
        borderTop: '1px solid',
        borderColor: getCaseQueueBorderColor(theme.palette.mode),
        pt: 2,
      })}
    >
      {row === null ? (
        <Typography
          sx={(theme) => ({
            color: getCaseQueueMutedTextColor(theme.palette.mode),
            fontSize: '0.92rem',
          })}
        >
          Select a row to inspect the full rationale.
        </Typography>
      ) : (
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            spacing={1.5}
            alignItems={{ xs: 'flex-start', md: 'flex-start' }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Box
                sx={(theme) => {
                  const tone = getCaseQueueCategoryTone(row.category, theme.palette.mode)
                  return {
                    display: 'inline-flex',
                    alignItems: 'center',
                    px: 0.9,
                    py: 0.35,
                    border: '1px solid',
                    borderColor: tone.border,
                    bgcolor: tone.background,
                    color: tone.color,
                    borderRadius: 1,
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    lineHeight: 1.1,
                    whiteSpace: 'nowrap',
                  }
                }}
              >
                {row.category}
              </Box>
              <Typography
                sx={{
                  mt: 1,
                  fontSize: { xs: '1.15rem', md: '1.35rem' },
                  fontWeight: 700,
                  lineHeight: 1.15,
                }}
              >
                {row.issue}
              </Typography>
              <Typography
                sx={(theme) => ({
                  mt: 0.75,
                  color: getCaseQueueMutedTextColor(theme.palette.mode),
                  fontSize: '0.92rem',
                })}
              >
                Proposed next step
              </Typography>
              <Typography sx={{ mt: 0.35, fontSize: '1rem', fontWeight: 600 }}>
                {row.nextStep}
              </Typography>
            </Box>

            <DecisionLabel decision={row.decision} />
          </Stack>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            <MetaBlock label="Assessment" value={row.assessment} />
            <MetaBlock label="Evidence" value={row.evidence} />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: {
                xs: 'repeat(2, minmax(0, 1fr))',
                lg: 'repeat(5, minmax(0, 1fr))',
              },
              gap: 2,
            }}
          >
            <MetaBlock label="Entity" value={row.entity} />
            <MetaBlock label="Case ID" value={row.caseId} mono />
            <MetaBlock label="Support status" value={row.status} />
            <MetaBlock label="Age" value={row.daysAgo} mono />
            <MetaBlock label="Decision" value={row.decision} />
          </Box>
        </Stack>
      )}
    </Box>
  )
}
