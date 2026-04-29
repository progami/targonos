'use client'

import Link from 'next/link'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { Alert, Box, Button, Stack, Typography } from '@mui/material'
import type { CaseReportMarketSlug } from '@/lib/cases/reader'
import {
  getCaseQueueBorderColor,
  getCaseQueueMutedTextColor,
} from '@/lib/cases/theme'

const CASE_MARKET_LINKS: Array<{ slug: CaseReportMarketSlug; label: string }> = [
  { slug: 'us', label: 'USA - Dust Sheets' },
  { slug: 'uk', label: 'UK - Dust Sheets' },
]

type CasesUnavailablePageProps = {
  marketLabel: string
  marketSlug: CaseReportMarketSlug
  reportDate?: string
}

export function CasesUnavailablePage({
  marketLabel,
  marketSlug,
  reportDate,
}: CasesUnavailablePageProps) {
  const reportLabel = reportDate === undefined ? 'Latest report' : `Report ${reportDate}`

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
          direction={{ xs: 'column', md: 'row' }}
          spacing={1}
          alignItems={{ xs: 'stretch', md: 'center' }}
          justifyContent="space-between"
        >
          <Stack spacing={0.25}>
            <Typography variant="overline" color="text.secondary">
              Cases
            </Typography>
            <Typography variant="h5" fontWeight={800}>
              {marketLabel}
            </Typography>
            <Typography
              variant="body2"
              sx={(theme) => ({ color: getCaseQueueMutedTextColor(theme.palette.mode) })}
            >
              {reportLabel}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1}>
            {CASE_MARKET_LINKS.map((market) => (
              <Button
                key={market.slug}
                component={Link}
                href={`/cases/${market.slug}`}
                size="small"
                variant={market.slug === marketSlug ? 'contained' : 'outlined'}
              >
                {market.label}
              </Button>
            ))}
          </Stack>
        </Stack>
      </Box>

      <Alert severity="warning" icon={<WarningAmberIcon fontSize="small" />}>
        Case report data could not be loaded by this runtime. The route is active; refresh the
        case-agent export or source mount for this market.
      </Alert>

      <Box
        sx={(theme) => ({
          minHeight: 360,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid',
          borderColor: getCaseQueueBorderColor(theme.palette.mode),
          borderRadius: 1,
          px: 2,
          textAlign: 'center',
          bgcolor:
            theme.palette.mode === 'dark'
              ? 'rgba(255, 255, 255, 0.02)'
              : 'rgba(0, 44, 81, 0.02)',
        })}
      >
        <Stack spacing={0.75} alignItems="center">
          <Typography variant="subtitle1" fontWeight={800}>
            No case report bundle available
          </Typography>
          <Typography
            variant="body2"
            sx={(theme) => ({
              maxWidth: 560,
              color: getCaseQueueMutedTextColor(theme.palette.mode),
            })}
          >
            Argus could not read the JSON snapshot and case state needed for this market.
          </Typography>
        </Stack>
      </Box>
    </Stack>
  )
}
