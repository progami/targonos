'use client'

import Link from 'next/link'
import {
  Box,
  Button,
  Chip,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import type { MonitoringChangeEvent, MonitoringFieldChange } from '@/lib/monitoring/types'
import { formatMonitoringLabel, type MonitoringLabelSource } from '@/lib/monitoring/labels'
import {
  CategorySection,
  OwnerChip,
  SeverityChip,
  formatCount,
  formatDateTime,
  formatMoney,
} from '@/components/monitoring/ui'

interface ChangeDetailProps {
  event: MonitoringChangeEvent | null
}

export default function ChangeDetail({ event }: ChangeDetailProps) {
  if (!event) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 6, minHeight: 160 }}>
        <Typography variant="body2" color="text.secondary">
          Select a change to view details
        </Typography>
      </Box>
    )
  }

  const label = formatMonitoringLabel(
    (event.currentSnapshot ?? event.baselineSnapshot ?? { asin: event.asin }) as MonitoringLabelSource,
  )
  const hasStoredFieldChanges = event.fieldChanges.length > 0

  return (
    <Box sx={{ px: 3, py: 2.5 }}>
      <Stack spacing={2}>
        {/* Row 1: chips + headline */}
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
            <SeverityChip severity={event.severity} />
            <OwnerChip owner={event.owner} />
            {event.categories.map((cat) => (
              <Chip
                key={cat}
                label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                size="small"
                variant="outlined"
                sx={{
                  borderRadius: 999,
                  borderColor: 'rgba(255, 255, 255, 0.12)',
                  color: 'text.primary',
                  fontSize: '0.7rem',
                  height: 22,
                }}
              />
            ))}
            <Button
              component={Link}
              href={`/monitoring/${event.asin}`}
              variant="contained"
              size="small"
              startIcon={<ArrowOutwardIcon sx={{ fontSize: 14 }} />}
              sx={{ ml: 'auto', flexShrink: 0 }}
            >
              View {label}
            </Button>
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.3, fontSize: '1.05rem' }}>
            {event.headline}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.3 }}>
            {event.summary}
          </Typography>
        </Box>

        {/* Row 2: Prominent date bar */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1,
            borderRadius: 2,
            bgcolor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {event.baselineTimestamp ? (
            <>
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  sx={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: 'text.secondary',
                  }}
                >
                  Before
                </Typography>
                <Typography
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: 'text.primary',
                  }}
                >
                  {formatDateTime(event.baselineTimestamp)}
                </Typography>
              </Box>
              <ArrowForwardIcon sx={{ fontSize: 18, color: '#00C2B9', flexShrink: 0 }} />
              <Box sx={{ textAlign: 'center' }}>
                <Typography
                  sx={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#00C2B9',
                  }}
                >
                  After
                </Typography>
                <Typography
                  sx={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    color: 'text.primary',
                  }}
                >
                  {formatDateTime(event.timestamp)}
                </Typography>
              </Box>
            </>
          ) : (
            <Box>
              <Typography
                sx={{
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: '#00C2B9',
                }}
              >
                Detected
              </Typography>
              <Typography
                sx={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  color: 'text.primary',
                }}
              >
                {formatDateTime(event.timestamp)}
              </Typography>
            </Box>
          )}
        </Box>

        <Divider />

        {/* Row 3: Field changes with prominent before/after */}
        {hasStoredFieldChanges ? (
          <CategorySection label="Field Changes">
            <Stack spacing={0.8}>
              {event.fieldChanges.map((change, index) => (
                <FieldChangeRow key={`${change.field}-${index}`} change={change} />
              ))}
            </Stack>
          </CategorySection>
        ) : (
          <Stack spacing={0}>
            {event.categories.includes('status') && (
              <CategorySection label={event.categories.length > 1 ? 'Status' : ''}>
                <ProminentComparison
                  label="Status"
                  baseline={event.baselineSnapshot?.status ?? null}
                  current={event.currentSnapshot?.status ?? null}
                />
              </CategorySection>
            )}

            {event.categories.includes('price') && (
              <CategorySection label={event.categories.length > 1 ? 'Price' : ''}>
                <ProminentComparison
                  label="Landed"
                  baseline={formatMoney(event.baselineSnapshot?.landedPrice ?? null, event.baselineSnapshot?.priceCurrency ?? null)}
                  current={formatMoney(event.currentSnapshot?.landedPrice ?? null, event.currentSnapshot?.priceCurrency ?? null)}
                  numericBaseline={event.baselineSnapshot?.landedPrice}
                  numericCurrent={event.currentSnapshot?.landedPrice}
                />
                <ProminentComparison
                  label="Listing"
                  baseline={formatMoney(event.baselineSnapshot?.listingPrice ?? null, event.baselineSnapshot?.priceCurrency ?? null)}
                  current={formatMoney(event.currentSnapshot?.listingPrice ?? null, event.currentSnapshot?.priceCurrency ?? null)}
                  numericBaseline={event.baselineSnapshot?.listingPrice}
                  numericCurrent={event.currentSnapshot?.listingPrice}
                />
                <ProminentComparison
                  label="Shipping"
                  baseline={formatMoney(event.baselineSnapshot?.shippingPrice ?? null, event.baselineSnapshot?.priceCurrency ?? null)}
                  current={formatMoney(event.currentSnapshot?.shippingPrice ?? null, event.currentSnapshot?.priceCurrency ?? null)}
                  numericBaseline={event.baselineSnapshot?.shippingPrice}
                  numericCurrent={event.currentSnapshot?.shippingPrice}
                />
              </CategorySection>
            )}

            {event.categories.includes('rank') && (
              <CategorySection label={event.categories.length > 1 ? 'Rank' : ''}>
                <ProminentComparison
                  label="Root BSR"
                  baseline={formatCount(event.baselineSnapshot?.rootBsrRank ?? null)}
                  current={formatCount(event.currentSnapshot?.rootBsrRank ?? null)}
                  numericBaseline={event.baselineSnapshot?.rootBsrRank}
                  numericCurrent={event.currentSnapshot?.rootBsrRank}
                  lowerIsBetter
                />
                <ProminentComparison
                  label="Sub BSR"
                  baseline={formatCount(event.baselineSnapshot?.subBsrRank ?? null)}
                  current={formatCount(event.currentSnapshot?.subBsrRank ?? null)}
                  numericBaseline={event.baselineSnapshot?.subBsrRank}
                  numericCurrent={event.currentSnapshot?.subBsrRank}
                  lowerIsBetter
                />
              </CategorySection>
            )}

            {event.categories.includes('offers') && (
              <CategorySection label={event.categories.length > 1 ? 'Offers' : ''}>
                <ProminentComparison
                  label="Total offers"
                  baseline={formatCount(event.baselineSnapshot?.totalOfferCount ?? null)}
                  current={formatCount(event.currentSnapshot?.totalOfferCount ?? null)}
                  numericBaseline={event.baselineSnapshot?.totalOfferCount}
                  numericCurrent={event.currentSnapshot?.totalOfferCount}
                />
              </CategorySection>
            )}

            {event.categories.includes('content') && (
              <CategorySection label={event.categories.length > 1 ? 'Content' : ''}>
                <ProminentComparison
                  label="Title"
                  baseline={event.baselineSnapshot?.title ?? null}
                  current={event.currentSnapshot?.title ?? null}
                />
                <ProminentComparison
                  label="Bullets"
                  baseline={formatCount(event.baselineSnapshot?.bulletCount ?? null)}
                  current={formatCount(event.currentSnapshot?.bulletCount ?? null)}
                  numericBaseline={event.baselineSnapshot?.bulletCount}
                  numericCurrent={event.currentSnapshot?.bulletCount}
                />
                <ProminentComparison
                  label="Description"
                  baseline={formatCount(event.baselineSnapshot?.descriptionLength ?? null)}
                  current={formatCount(event.currentSnapshot?.descriptionLength ?? null)}
                  numericBaseline={event.baselineSnapshot?.descriptionLength}
                  numericCurrent={event.currentSnapshot?.descriptionLength}
                />
              </CategorySection>
            )}

            {event.categories.includes('images') && (
              <CategorySection label={event.categories.length > 1 ? 'Images' : ''}>
                <ProminentComparison
                  label="Image count"
                  baseline={formatCount(event.baselineSnapshot?.imageCount ?? null)}
                  current={formatCount(event.currentSnapshot?.imageCount ?? null)}
                  numericBaseline={event.baselineSnapshot?.imageCount}
                  numericCurrent={event.currentSnapshot?.imageCount}
                />
              </CategorySection>
            )}

            {event.categories.includes('catalog') && (
              <CategorySection label={event.categories.length > 1 ? 'Catalog' : ''}>
                <ProminentComparison
                  label="Brand"
                  baseline={event.baselineSnapshot?.brand ?? null}
                  current={event.currentSnapshot?.brand ?? null}
                />
              </CategorySection>
            )}
          </Stack>
        )}
      </Stack>
    </Box>
  )
}

/* ── Prominent before → after display ───────────────────────── */

function ProminentComparison(props: {
  label: string
  baseline: string | null
  current: string | null
  numericBaseline?: number | null
  numericCurrent?: number | null
  lowerIsBetter?: boolean
}) {
  const { label, baseline, current, numericBaseline, numericCurrent, lowerIsBetter } = props
  const baselineDisplay = baseline ?? '—'
  const currentDisplay = current ?? '—'
  const unchanged = baselineDisplay === currentDisplay

  let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral'
  if (numericBaseline != null && numericCurrent != null && numericBaseline !== numericCurrent) {
    if (lowerIsBetter) {
      sentiment = numericCurrent < numericBaseline ? 'positive' : 'negative'
    } else {
      sentiment = numericCurrent > numericBaseline ? 'positive' : 'negative'
    }
  }

  const currentColor =
    sentiment === 'positive' ? '#22c55e' : sentiment === 'negative' ? '#ef4444' : 'inherit'

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: '120px 1fr',
        gap: 1.5,
        alignItems: 'center',
        py: 0.6,
      }}
    >
      <Typography
        sx={{
          fontSize: '0.78rem',
          fontWeight: 600,
          color: 'text.secondary',
        }}
      >
        {label}
      </Typography>
      {unchanged ? (
        <Typography sx={{ fontWeight: 700, fontSize: '0.88rem', color: 'text.secondary' }}>
          {currentDisplay}
        </Typography>
      ) : (
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography
            sx={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 600,
              fontSize: '0.88rem',
              color: 'text.secondary',
              textDecoration: 'line-through',
            }}
          >
            {baselineDisplay}
          </Typography>
          <ArrowForwardIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
          <Typography
            sx={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 800,
              fontSize: '0.95rem',
              color: currentColor,
            }}
          >
            {currentDisplay}
          </Typography>
        </Stack>
      )}
    </Box>
  )
}

/* ── Field change rows (for stored field changes) ──────────── */

function FieldChangeRow({ change }: { change: MonitoringFieldChange }) {
  if (isImageFieldChange(change)) {
    return (
      <Box>
        <ProminentComparison
          label={humanizeField(change.field)}
          baseline={`${change.removed.length} removed`}
          current={`${change.added.length} added`}
        />
        {change.added.length > 0 ? (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', ml: '136px' }}>
            Added: {change.added.join(' | ')}
          </Typography>
        ) : null}
        {change.removed.length > 0 ? (
          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', ml: '136px', mt: 0.2 }}>
            Removed: {change.removed.join(' | ')}
          </Typography>
        ) : null}
      </Box>
    )
  }

  return (
    <ProminentComparison
      label={humanizeField(change.field)}
      baseline={displayFieldValue(change.from)}
      current={displayFieldValue(change.to)}
    />
  )
}

function isImageFieldChange(
  change: MonitoringFieldChange,
): change is Extract<MonitoringFieldChange, { field: 'image_urls' }> {
  return change.field === 'image_urls' && 'added' in change && 'removed' in change
}

function humanizeField(field: string): string {
  return field
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function displayFieldValue(value: string): string {
  return value === '' ? 'n/a' : value
}
