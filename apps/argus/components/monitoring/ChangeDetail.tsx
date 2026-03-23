'use client'

import Link from 'next/link'
import {
  Box,
  Button,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import ArrowOutwardIcon from '@mui/icons-material/ArrowOutward'
import type { MonitoringChangeEvent } from '@/lib/monitoring/types'
import { formatMonitoringLabel, type MonitoringLabelSource } from '@/lib/monitoring/labels'
import {
  CategorySection,
  ComparisonRow,
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 300 }}>
        <Typography variant="body2" color="text.secondary">
          Select a change to view details
        </Typography>
      </Box>
    )
  }

  const label = formatMonitoringLabel(
    (event.currentSnapshot ?? event.baselineSnapshot ?? { asin: event.asin }) as MonitoringLabelSource,
  )

  return (
    <Box sx={{ p: 3, overflow: 'auto', height: '100%' }}>
      <Stack spacing={2.5}>
        {/* Timestamp — the primary anchor */}
        <Box
          sx={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: '#00C2B9',
          }}
        >
          {formatDateTime(event.timestamp)}
          {event.baselineTimestamp ? (
            <Typography
              component="span"
              sx={{ color: 'text.secondary', fontSize: '0.72rem', ml: 1 }}
            >
              vs {formatDateTime(event.baselineTimestamp)}
            </Typography>
          ) : null}
        </Box>

        {/* Header — severity, owner, headline */}
        <Box>
          <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
            <SeverityChip severity={event.severity} />
            <OwnerChip owner={event.owner} />
          </Stack>
          <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.3 }}>
            {event.headline}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {event.summary}
          </Typography>
        </Box>

        <Divider />

        {/* What changed — grouped by category */}
        <Stack spacing={0}>
          {event.categories.includes('status') && (
            <CategorySection label={event.categories.length > 1 ? 'Status' : ''}>
              <ComparisonRow
                label="Status"
                baseline={event.baselineSnapshot?.status ?? null}
                current={event.currentSnapshot?.status ?? null}
              />
            </CategorySection>
          )}

          {event.categories.includes('price') && (
            <CategorySection label={event.categories.length > 1 ? 'Price' : ''}>
              <ComparisonRow
                label="Landed"
                baseline={formatMoney(event.baselineSnapshot?.landedPrice ?? null, event.baselineSnapshot?.priceCurrency ?? null)}
                current={formatMoney(event.currentSnapshot?.landedPrice ?? null, event.currentSnapshot?.priceCurrency ?? null)}
                numericBaseline={event.baselineSnapshot?.landedPrice}
                numericCurrent={event.currentSnapshot?.landedPrice}
              />
              <ComparisonRow
                label="Listing"
                baseline={formatMoney(event.baselineSnapshot?.listingPrice ?? null, event.baselineSnapshot?.priceCurrency ?? null)}
                current={formatMoney(event.currentSnapshot?.listingPrice ?? null, event.currentSnapshot?.priceCurrency ?? null)}
                numericBaseline={event.baselineSnapshot?.listingPrice}
                numericCurrent={event.currentSnapshot?.listingPrice}
              />
              <ComparisonRow
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
              <ComparisonRow
                label="Root BSR"
                baseline={formatCount(event.baselineSnapshot?.rootBsrRank ?? null)}
                current={formatCount(event.currentSnapshot?.rootBsrRank ?? null)}
                numericBaseline={event.baselineSnapshot?.rootBsrRank}
                numericCurrent={event.currentSnapshot?.rootBsrRank}
                lowerIsBetter
              />
              <ComparisonRow
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
              <ComparisonRow
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
              <ComparisonRow
                label="Title"
                baseline={event.baselineSnapshot?.title ?? null}
                current={event.currentSnapshot?.title ?? null}
              />
              <ComparisonRow
                label="Bullets"
                baseline={formatCount(event.baselineSnapshot?.bulletCount ?? null)}
                current={formatCount(event.currentSnapshot?.bulletCount ?? null)}
                numericBaseline={event.baselineSnapshot?.bulletCount}
                numericCurrent={event.currentSnapshot?.bulletCount}
              />
              <ComparisonRow
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
              <ComparisonRow
                label="Count"
                baseline={formatCount(event.baselineSnapshot?.imageCount ?? null)}
                current={formatCount(event.currentSnapshot?.imageCount ?? null)}
                numericBaseline={event.baselineSnapshot?.imageCount}
                numericCurrent={event.currentSnapshot?.imageCount}
              />
              {event.currentSnapshot?.imageUrls.length ? (
                <Box
                  sx={{
                    display: 'grid',
                    gap: 0.8,
                    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                    mt: 1,
                  }}
                >
                  {event.currentSnapshot.imageUrls.slice(0, 6).map((url) => (
                    <Box
                      key={url}
                      component="img"
                      src={url}
                      alt=""
                      sx={{
                        width: '100%',
                        aspectRatio: '1 / 1',
                        objectFit: 'contain',
                        borderRadius: 1.5,
                        bgcolor: '#f8fafc',
                        border: '1px solid rgba(15, 23, 42, 0.06)',
                        p: 0.6,
                      }}
                    />
                  ))}
                </Box>
              ) : null}
            </CategorySection>
          )}

          {event.categories.includes('catalog') && (
            <CategorySection label={event.categories.length > 1 ? 'Catalog' : ''}>
              <ComparisonRow
                label="Brand"
                baseline={event.baselineSnapshot?.brand ?? null}
                current={event.currentSnapshot?.brand ?? null}
              />
            </CategorySection>
          )}
        </Stack>

        {/* Link to listing detail */}
        <Button
          component={Link}
          href={`/tracking/${event.asin}`}
          variant="contained"
          size="small"
          startIcon={<ArrowOutwardIcon />}
          sx={{ alignSelf: 'flex-start' }}
        >
          View {label}
        </Button>
      </Stack>
    </Box>
  )
}
