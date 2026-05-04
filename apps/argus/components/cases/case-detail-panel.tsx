'use client'

import type { ReactNode } from 'react'
import { Box, Button, Stack, Typography } from '@mui/material'
import { CASE_DETAIL_BODY_FONT_SIZE, CASE_DETAIL_BODY_LINE_HEIGHT } from '@/lib/cases/layout'
import {
  getCaseApprovalStateTone,
  getCaseQueueBorderColor,
  getCaseQueueCategoryTone,
  getCaseQueueMutedTextColor,
} from '@/lib/cases/theme'
import type { CaseDetailModel } from '@/lib/cases/view-model'

export type CaseDetailApprovalState = 'approval_required' | 'approved' | 'hold'

type CaseDetailPanelProps = {
  detail: CaseDetailModel | null
  approvalState: CaseDetailApprovalState | null
  onApprovalStateChange: (state: 'approved' | 'hold') => void
}

function formatOptionalValue(value: string | null): string {
  if (value === null || value === '') {
    return '—'
  }

  return value
}

function hasIssueContext(detail: CaseDetailModel): boolean {
  return detail.issue !== detail.subject
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={(theme) => ({
        color: getCaseQueueMutedTextColor(theme.palette.mode),
        fontSize: '0.68rem',
        fontWeight: 800,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      })}
    >
      {children}
    </Typography>
  )
}

function SectionValue({ children }: { children: ReactNode }) {
  return (
    <Typography
      sx={{
        mt: 0.7,
        color: 'text.primary',
        fontSize: CASE_DETAIL_BODY_FONT_SIZE,
        fontWeight: 400,
        lineHeight: CASE_DETAIL_BODY_LINE_HEIGHT,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </Typography>
  )
}

function MetadataChip({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <Box
      sx={(theme) => ({
        minWidth: 124,
        px: 1,
        py: 0.85,
        border: '1px solid',
        borderColor: getCaseQueueBorderColor(theme.palette.mode),
        borderRadius: 1,
        bgcolor: 'background.paper',
      })}
    >
      <Typography
        sx={(theme) => ({
          color: getCaseQueueMutedTextColor(theme.palette.mode),
          fontSize: '0.62rem',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          lineHeight: 1.15,
        })}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          mt: 0.5,
          fontFamily: mono ? 'var(--font-mono), "JetBrains Mono", monospace' : 'inherit',
          fontSize: '0.81rem',
          lineHeight: 1.3,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </Typography>
    </Box>
  )
}

function ApprovalStateChip({
  label,
  approvalState,
}: {
  label: string
  approvalState: CaseDetailApprovalState
}) {
  return (
    <Box
      sx={(theme) => {
        const tone = getCaseApprovalStateTone(approvalState, theme.palette.mode)

        return {
          display: 'inline-flex',
          alignItems: 'center',
          width: 'fit-content',
          px: 0.8,
          py: 0.3,
          border: '1px solid',
          borderColor: tone.border,
          bgcolor: tone.background,
          color: tone.color,
          borderRadius: 1,
          fontSize: '0.68rem',
          fontWeight: 800,
          letterSpacing: '0.04em',
          lineHeight: 1.1,
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }
      }}
    >
      {label}
    </Box>
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
          px: 0.7,
          py: 0.24,
          border: '1px solid',
          borderColor: tone.border,
          bgcolor: tone.background,
          color: tone.color,
          borderRadius: 1,
          fontSize: '0.68rem',
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

function getApprovalStateLabel(
  approvalState: CaseDetailApprovalState,
  detail: NonNullable<CaseDetailModel['approval']>,
): string {
  if (approvalState === 'approval_required') {
    return detail.statusLabel
  }

  if (approvalState === 'approved') {
    return 'Approved'
  }

  return 'Hold'
}

export function CaseDetailPanel({
  detail,
  approvalState,
  onApprovalStateChange,
}: CaseDetailPanelProps) {
  return (
    <Box
      sx={(theme) => ({
        border: '1px solid',
        borderColor: getCaseQueueBorderColor(theme.palette.mode),
        borderRadius: 1,
        p: 1.75,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        height: '100%',
      })}
    >
      {detail === null ? (
        <Typography
          sx={(theme) => ({
            color: getCaseQueueMutedTextColor(theme.palette.mode),
            fontSize: '0.84rem',
          })}
        >
          No detail
        </Typography>
      ) : (
        <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          <Box>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={0.8}
              alignItems={{ xs: 'flex-start', md: 'center' }}
              flexWrap="wrap"
            >
              <CategoryPill category={detail.category} />
              <Typography
                sx={(theme) => ({
                  color: getCaseQueueMutedTextColor(theme.palette.mode),
                  fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                  fontSize: '0.76rem',
                  lineHeight: 1.15,
                })}
              >
                {detail.reportDate}
              </Typography>
              <Typography
                sx={(theme) => ({
                  color: getCaseQueueMutedTextColor(theme.palette.mode),
                  fontSize: '0.76rem',
                  lineHeight: 1.15,
                })}
              >
                {detail.status}
              </Typography>
            </Stack>

            <SectionLabel>Issue</SectionLabel>
            <Typography
              sx={{
                mt: 0.7,
                fontSize: '1.18rem',
                fontWeight: 700,
                lineHeight: 1.24,
              }}
            >
              {detail.subject}
            </Typography>

            {hasIssueContext(detail) ? (
              <Typography
                sx={(theme) => ({
                  mt: 0.7,
                  color: getCaseQueueMutedTextColor(theme.palette.mode),
                  fontSize: '0.84rem',
                  lineHeight: 1.55,
                })}
              >
                {detail.issue}
              </Typography>
            ) : null}
          </Box>

          <Box>
            <SectionLabel>Next step</SectionLabel>
            <SectionValue>{detail.nextStep}</SectionValue>
          </Box>

          {detail.sourceLinks.length > 0 ? (
            <Box>
              <SectionLabel>Sources</SectionLabel>
              <Stack direction="row" spacing={0.8} flexWrap="wrap" sx={{ mt: 0.8 }}>
                {detail.sourceLinks.map((sourceLink) => (
                  <Button
                    key={sourceLink.label}
                    component="a"
                    href={sourceLink.href}
                    target="_blank"
                    rel="noreferrer"
                    size="small"
                    variant="outlined"
                    sx={{
                      minWidth: 0,
                      px: 1.05,
                      py: 0.48,
                      fontSize: '0.76rem',
                      fontWeight: 700,
                      lineHeight: 1.1,
                      textTransform: 'none',
                    }}
                  >
                    {sourceLink.label}
                  </Button>
                ))}
              </Stack>
            </Box>
          ) : null}

          {detail.approval !== null && approvalState !== null ? (
            <Box
              sx={(theme) => {
                const tone = getCaseApprovalStateTone(approvalState, theme.palette.mode)

                return {
                  px: 1.15,
                  py: 1,
                  border: '1px solid',
                  borderColor: tone.border,
                  bgcolor: tone.background,
                  borderRadius: 1,
                }
              }}
            >
              <Stack
                direction={{ xs: 'column', lg: 'row' }}
                spacing={1}
                justifyContent="space-between"
                alignItems={{ xs: 'flex-start', lg: 'center' }}
              >
                <Box>
                  <ApprovalStateChip
                    label={getApprovalStateLabel(approvalState, detail.approval)}
                    approvalState={approvalState}
                  />
                  <Typography
                    sx={(theme) => ({
                      mt: 0.7,
                      color: getCaseQueueMutedTextColor(theme.palette.mode),
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      lineHeight: 1.1,
                    })}
                  >
                    {detail.approval.sourceLabel}
                  </Typography>
                </Box>

                <Stack direction="row" spacing={0.8}>
                  <Button
                    size="small"
                    variant={approvalState === 'approved' ? 'contained' : 'outlined'}
                    onClick={() => {
                      onApprovalStateChange('approved')
                    }}
                    sx={(theme) => {
                      const tone = getCaseApprovalStateTone('approved', theme.palette.mode)

                      return {
                        minWidth: 0,
                        px: 1.1,
                        py: 0.45,
                        borderColor: tone.border,
                        bgcolor: approvalState === 'approved' ? tone.background : 'transparent',
                        color: tone.color,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        textTransform: 'none',
                      }
                    }}
                  >
                    {detail.approval.primaryActionLabel}
                  </Button>

                  <Button
                    size="small"
                    variant={approvalState === 'hold' ? 'contained' : 'outlined'}
                    onClick={() => {
                      onApprovalStateChange('hold')
                    }}
                    sx={(theme) => {
                      const tone = getCaseApprovalStateTone('hold', theme.palette.mode)

                      return {
                        minWidth: 0,
                        px: 1.1,
                        py: 0.45,
                        borderColor: tone.border,
                        bgcolor: approvalState === 'hold' ? tone.background : 'transparent',
                        color: tone.color,
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        lineHeight: 1.1,
                        textTransform: 'none',
                      }
                    }}
                  >
                    {detail.approval.secondaryActionLabel}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ) : null}

          <Box>
            <SectionLabel>Evidence</SectionLabel>
            <SectionValue>{detail.evidence}</SectionValue>
          </Box>

          <Box>
            <SectionLabel>Assessment</SectionLabel>
            <SectionValue>{detail.assessment}</SectionValue>
          </Box>

          <Box>
            <SectionLabel>Metadata</SectionLabel>
            <Box sx={{ mt: 0.85, display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
              <MetadataChip label="Case ID" value={detail.caseId} mono />
              <MetadataChip label="Entity" value={detail.metadata.entity} />
              <MetadataChip label="Amazon status" value={formatOptionalValue(detail.metadata.amazonStatus)} />
              <MetadataChip label="Our status" value={formatOptionalValue(detail.metadata.ourStatus)} />
              <MetadataChip label="Last reply" value={formatOptionalValue(detail.metadata.lastReply)} mono />
              <MetadataChip label="Created" value={formatOptionalValue(detail.metadata.created)} mono />
            </Box>
          </Box>
        </Stack>
      )}
    </Box>
  )
}
