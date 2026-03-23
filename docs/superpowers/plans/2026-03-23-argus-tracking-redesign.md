# Argus Monitoring Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Argus monitoring page so the change detail is the hero (wide panel) with a compact feed rail as navigator, and Source Health becomes a compact grid with expandable run history.

**Architecture:** Decompose the current 1436-line `page.tsx` into focused components: `FeedRail`, `ChangeDetail`, `SourceHealthGrid`, `SourceCard`. Add one new API route for run history. All existing APIs and data models are untouched.

**Tech Stack:** Next.js 16, React 19, MUI Material v7, TypeScript

---

### Task 1: Extract FeedRail component

**Files:**
- Create: `apps/argus/components/monitoring/FeedRail.tsx`
- Modify: `apps/argus/app/(app)/tracking/page.tsx`

This component encapsulates the filters and the scrollable event list as a narrow (~240px) rail.

- [ ] **Step 1: Create FeedRail.tsx with filter controls and compact event list**

```tsx
// apps/argus/components/monitoring/FeedRail.tsx
'use client'

import { useState } from 'react'
import {
  alpha,
  Box,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type {
  MonitoringCategory,
  MonitoringChangeEvent,
  MonitoringSeverity,
} from '@/lib/monitoring/types'
import { formatMonitoringLabel, type MonitoringLabelSource } from '@/lib/monitoring/labels'

const NAVY = '#0b273f'

type OwnerFilter = 'ALL' | 'OURS' | 'COMPETITOR'

const WINDOWS = [
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: '30d', value: '30d' },
  { label: 'All', value: 'all' },
] as const

const CATEGORY_OPTIONS: Array<{ value: MonitoringCategory | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All categories' },
  { value: 'status', label: 'Status' },
  { value: 'content', label: 'Content' },
  { value: 'images', label: 'Images' },
  { value: 'price', label: 'Price' },
  { value: 'offers', label: 'Offers' },
  { value: 'rank', label: 'Rank' },
  { value: 'catalog', label: 'Catalog' },
]

const SEVERITY_OPTIONS: Array<{ value: MonitoringSeverity | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All severities' },
  { value: 'critical', label: 'Critical' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const SEVERITY_BORDER_COLORS: Record<MonitoringSeverity, string> = {
  critical: '#b5362d',
  high: '#cc6b1e',
  medium: '#7f5f00',
  low: '#94a3b8',
}

interface FeedRailProps {
  changes: MonitoringChangeEvent[]
  loading: boolean
  selectedEventId: string | null
  onSelectEvent: (id: string) => void
  windowValue: '24h' | '7d' | '30d' | 'all'
  onWindowChange: (value: '24h' | '7d' | '30d' | 'all') => void
  owner: OwnerFilter
  onOwnerChange: (value: OwnerFilter) => void
  category: MonitoringCategory | 'ALL'
  onCategoryChange: (value: MonitoringCategory | 'ALL') => void
  severity: MonitoringSeverity | 'ALL'
  onSeverityChange: (value: MonitoringSeverity | 'ALL') => void
  query: string
  onQueryChange: (value: string) => void
}

export default function FeedRail({
  changes,
  loading,
  selectedEventId,
  onSelectEvent,
  windowValue,
  onWindowChange,
  owner,
  onOwnerChange,
  category,
  onCategoryChange,
  severity,
  onSeverityChange,
  query,
  onQueryChange,
}: FeedRailProps) {
  return (
    <Box
      sx={{
        width: 260,
        flexShrink: 0,
        borderRight: '1px solid rgba(15, 23, 42, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      {/* Filters */}
      <Box sx={{ p: 1.5, borderBottom: '1px solid rgba(15, 23, 42, 0.08)' }}>
        <Stack spacing={1}>
          <FormControl size="small" fullWidth>
            <InputLabel>Window</InputLabel>
            <Select
              value={windowValue}
              label="Window"
              onChange={(e) => onWindowChange(e.target.value as typeof windowValue)}
            >
              {WINDOWS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Owner</InputLabel>
            <Select
              value={owner}
              label="Owner"
              onChange={(e) => onOwnerChange(e.target.value as OwnerFilter)}
            >
              <MenuItem value="ALL">All owners</MenuItem>
              <MenuItem value="OURS">Ours</MenuItem>
              <MenuItem value="COMPETITOR">Competitors</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Category</InputLabel>
            <Select
              value={category}
              label="Category"
              onChange={(e) => onCategoryChange(e.target.value as MonitoringCategory | 'ALL')}
            >
              {CATEGORY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" fullWidth>
            <InputLabel>Severity</InputLabel>
            <Select
              value={severity}
              label="Severity"
              onChange={(e) => onSeverityChange(e.target.value as MonitoringSeverity | 'ALL')}
            >
              {SEVERITY_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            fullWidth
            placeholder="Search..."
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
        </Stack>
      </Box>

      {/* Event list */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading ? <LinearProgress /> : null}
        {changes.map((item) => {
          const selected = item.id === selectedEventId
          const label = formatMonitoringLabel(
            (item.currentSnapshot ?? item.baselineSnapshot ?? { asin: item.asin }) as MonitoringLabelSource,
          )
          return (
            <Box
              key={item.id}
              onClick={() => onSelectEvent(item.id)}
              sx={{
                px: 1.5,
                py: 1.2,
                cursor: 'pointer',
                borderLeft: `3px solid ${SEVERITY_BORDER_COLORS[item.severity]}`,
                bgcolor: selected ? 'rgba(24, 88, 78, 0.08)' : 'transparent',
                '&:hover': { bgcolor: selected ? 'rgba(24, 88, 78, 0.08)' : 'rgba(15, 23, 42, 0.03)' },
                borderBottom: '1px solid rgba(15, 23, 42, 0.05)',
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  lineHeight: 1.3,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.headline}
              </Typography>
              <Typography
                variant="caption"
                sx={{ color: 'text.secondary', fontSize: '0.7rem' }}
              >
                {label} · {formatRelativeTime(item.timestamp)}
              </Typography>
            </Box>
          )
        })}
        {!loading && changes.length === 0 ? (
          <Box sx={{ px: 2, py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              No matching events
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  )
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
```

- [ ] **Step 2: Verify FeedRail builds**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle && pnpm turbo build --filter=@targon/argus`
Expected: Build succeeds (FeedRail is not yet imported, so it just needs to type-check)

- [ ] **Step 3: Commit**

```bash
git add apps/argus/components/monitoring/FeedRail.tsx
git commit -m "feat(argus): add FeedRail component for compact change feed navigator"
```

---

### Task 2: Extract ChangeDetail component

**Files:**
- Create: `apps/argus/components/monitoring/ChangeDetail.tsx`

This component renders the full detail view for a selected change event — timestamp and what-changed as the anchors.

- [ ] **Step 1: Create ChangeDetail.tsx**

```tsx
// apps/argus/components/monitoring/ChangeDetail.tsx
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
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle && pnpm turbo build --filter=@targon/argus`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/argus/components/monitoring/ChangeDetail.tsx
git commit -m "feat(argus): add ChangeDetail component for change event detail panel"
```

---

### Task 3: Extract SourceCard component

**Files:**
- Create: `apps/argus/components/monitoring/SourceCard.tsx`

Individual source card with status dot, name, type badge, cadence, age, and expandable run history.

- [ ] **Step 1: Create SourceCard.tsx**

```tsx
// apps/argus/components/monitoring/SourceCard.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  alpha,
  Box,
  Chip,
  Collapse,
  Stack,
  Typography,
} from '@mui/material'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import type { MonitoringHealthDataset, MonitoringSchedulerJob, MonitoringSourceType } from '@/lib/monitoring/types'

export type UnifiedSourceStatus = 'healthy' | 'stale' | 'failed'

export interface UnifiedSource {
  job: MonitoringSchedulerJob
  primaryDataset: MonitoringHealthDataset | null
  status: UnifiedSourceStatus
}

interface RunLogEntry {
  timestamp: string
  status: 'ok' | 'failed'
  summary: string
  durationMs: number
  errorMessage?: string
}

const STATUS_COLORS: Record<UnifiedSourceStatus, string> = {
  healthy: '#22c55e',
  stale: '#f59e0b',
  failed: '#ef4444',
}

const SOURCE_TYPE_STYLES: Record<MonitoringSourceType, { bg: string; color: string }> = {
  API: { bg: 'rgba(0, 44, 81, 0.08)', color: '#0b273f' },
  BROWSER: { bg: 'rgba(0, 194, 185, 0.12)', color: '#007a6d' },
  MANUAL: { bg: 'rgba(180, 104, 50, 0.12)', color: '#7b4215' },
}

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? '').replace(/\/$/, '')

interface SourceCardProps {
  source: UnifiedSource
  expanded: boolean
  onToggle: () => void
}

export default function SourceCard({ source, expanded, onToggle }: SourceCardProps) {
  const { job, primaryDataset, status } = source
  const [runs, setRuns] = useState<RunLogEntry[]>([])
  const [loadingRuns, setLoadingRuns] = useState(false)

  useEffect(() => {
    if (!expanded) return
    let cancelled = false
    setLoadingRuns(true)

    fetch(`${basePath}/api/monitoring/health/${job.id}/runs`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: RunLogEntry[]) => {
        if (!cancelled) setRuns(data)
      })
      .finally(() => {
        if (!cancelled) setLoadingRuns(false)
      })

    return () => { cancelled = true }
  }, [expanded, job.id])

  const age = primaryDataset?.ageMinutes != null ? formatAge(primaryDataset.ageMinutes) : '—'
  const typeStyle = SOURCE_TYPE_STYLES[job.sourceType]

  return (
    <Box
      sx={{
        borderRadius: 2,
        border: '1px solid rgba(15, 23, 42, 0.08)',
        bgcolor: 'rgba(255, 255, 255, 0.78)',
        overflow: 'hidden',
        gridColumn: expanded ? '1 / -1' : undefined,
        transition: 'grid-column 0.15s',
      }}
    >
      {/* Card header — always visible */}
      <Box
        onClick={onToggle}
        sx={{
          px: 1.5,
          py: 1.2,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          '&:hover': { bgcolor: 'rgba(15, 23, 42, 0.02)' },
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
          <Box
            sx={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              bgcolor: STATUS_COLORS[status],
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{ fontWeight: 700, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {job.label}
            </Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Chip
                label={job.sourceType}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.6rem',
                  fontWeight: 700,
                  bgcolor: typeStyle.bg,
                  color: typeStyle.color,
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.68rem' }}>
                {job.cadence}
              </Typography>
            </Stack>
          </Box>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0, ml: 1 }}>
          <Typography
            variant="caption"
            sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'text.secondary' }}
          >
            {age}
          </Typography>
          <ExpandMoreIcon
            sx={{
              fontSize: 18,
              color: 'text.secondary',
              transform: expanded ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}
          />
        </Stack>
      </Box>

      {/* Expanded run history */}
      <Collapse in={expanded}>
        <Box sx={{ px: 1.5, pb: 1.5, borderTop: '1px solid rgba(15, 23, 42, 0.06)' }}>
          <Typography
            variant="caption"
            sx={{ display: 'block', mt: 1, mb: 0.5, fontWeight: 700, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}
          >
            Recent runs
          </Typography>
          {loadingRuns ? (
            <Typography variant="caption" color="text.secondary">Loading...</Typography>
          ) : runs.length === 0 ? (
            <Typography variant="caption" color="text.secondary">No run history available</Typography>
          ) : (
            <Stack spacing={0}>
              {runs.map((run, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: '8px 1fr auto',
                    gap: 1,
                    alignItems: 'center',
                    py: 0.5,
                    borderBottom: i < runs.length - 1 ? '1px solid rgba(15, 23, 42, 0.04)' : 'none',
                  }}
                >
                  <Box
                    sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      bgcolor: run.status === 'ok' ? '#22c55e' : '#ef4444',
                    }}
                  />
                  <Box>
                    <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'text.secondary' }}>
                      {new Date(run.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </Typography>
                    <Typography variant="caption" sx={{ display: 'block', fontSize: '0.68rem' }}>
                      {run.summary}
                    </Typography>
                  </Box>
                  <Typography variant="caption" sx={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', color: 'text.secondary' }}>
                    {formatDuration(run.durationMs)}
                  </Typography>
                </Box>
              ))}
            </Stack>
          )}
        </Box>
      </Collapse>
    </Box>
  )
}

function formatAge(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = minutes / 60
  if (hours < 48) return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`
  return `${(hours / 24).toFixed(1)}d`
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${s % 60}s`
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle && pnpm turbo build --filter=@targon/argus`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/argus/components/monitoring/SourceCard.tsx
git commit -m "feat(argus): add SourceCard component with expandable run history"
```

---

### Task 4: Extract SourceHealthGrid component

**Files:**
- Create: `apps/argus/components/monitoring/SourceHealthGrid.tsx`

Summary counters + the grid of SourceCards with unified status logic.

- [ ] **Step 1: Create SourceHealthGrid.tsx**

```tsx
// apps/argus/components/monitoring/SourceHealthGrid.tsx
'use client'

import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material'
import type { MonitoringHealthReport } from '@/lib/monitoring/types'
import SourceCard, { type UnifiedSource, type UnifiedSourceStatus } from './SourceCard'

interface SourceHealthGridProps {
  health: MonitoringHealthReport | null
  healthError: string | null
}

export default function SourceHealthGrid({ health, healthError }: SourceHealthGridProps) {
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null)

  const sources = useMemo((): UnifiedSource[] => {
    if (!health) return []

    return health.jobs.map((job) => {
      const primaryDatasetName = job.outputs[0] ?? null
      const primaryDataset = primaryDatasetName
        ? health.datasets.find((ds) => ds.label === primaryDatasetName) ?? null
        : null

      let status: UnifiedSourceStatus
      if (job.status === 'failed' || job.status === 'missing') {
        status = 'failed'
      } else if (primaryDataset && (primaryDataset.status === 'stale' || primaryDataset.status === 'missing')) {
        status = 'stale'
      } else {
        status = 'healthy'
      }

      return { job, primaryDataset, status }
    })
  }, [health])

  // Sort: failed first, then stale, then healthy
  const sortedSources = useMemo(() => {
    const order: Record<UnifiedSourceStatus, number> = { failed: 0, stale: 1, healthy: 2 }
    return [...sources].sort((a, b) => order[a.status] - order[b.status])
  }, [sources])

  const counts = useMemo(() => {
    const total = sources.length
    const healthy = sources.filter((s) => s.status === 'healthy').length
    const stale = sources.filter((s) => s.status === 'stale').length
    const failed = sources.filter((s) => s.status === 'failed').length
    return { total, healthy, stale, failed }
  }, [sources])

  if (healthError) {
    return <Alert severity="error" sx={{ borderRadius: 3 }}>{healthError}</Alert>
  }

  if (!health) {
    return <LinearProgress />
  }

  return (
    <Box sx={{ p: 2.5 }}>
      <Stack spacing={2.5}>
        {/* Summary counters */}
        <Stack direction="row" spacing={3}>
          <CounterChip label="Total" value={counts.total} color="#0b273f" />
          <CounterChip label="Healthy" value={counts.healthy} color="#22c55e" />
          <CounterChip label="Stale" value={counts.stale} color="#f59e0b" />
          <CounterChip label="Failed" value={counts.failed} color="#ef4444" />
        </Stack>

        {/* Source grid */}
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          }}
        >
          {sortedSources.map((source) => (
            <SourceCard
              key={source.job.id}
              source={source}
              expanded={expandedJobId === source.job.id}
              onToggle={() =>
                setExpandedJobId((prev) => (prev === source.job.id ? null : source.job.id))
              }
            />
          ))}
        </Box>
      </Stack>
    </Box>
  )
}

function CounterChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Stack direction="row" spacing={0.75} alignItems="baseline">
      <Typography
        sx={{ fontWeight: 800, fontSize: '1.1rem', fontFamily: 'var(--font-mono)', color }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.62rem' }}
      >
        {label}
      </Typography>
    </Stack>
  )
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle && pnpm turbo build --filter=@targon/argus`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/argus/components/monitoring/SourceHealthGrid.tsx
git commit -m "feat(argus): add SourceHealthGrid with unified status and summary counters"
```

---

### Task 5: Add run history API route

**Files:**
- Create: `apps/argus/app/api/monitoring/health/[jobId]/runs/route.ts`

Reads the JSONL run log for a given job and returns the last 10 entries. Returns empty array if no log exists.

- [ ] **Step 1: Create the API route**

```tsx
// apps/argus/app/api/monitoring/health/[jobId]/runs/route.ts
import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

const MONITORING_BASE =
  '/Users/jarraramjad/Library/CloudStorage/GoogleDrive-jarrar@targonglobal.com/Shared drives/Dust Sheets - US/Sales/Monitoring'

const JOB_LOG_PATHS: Record<string, string> = {
  'tracking-fetch': path.join(MONITORING_BASE, 'Logs/tracking-fetch/run-log.jsonl'),
  'hourly-listing-attributes-api': path.join(MONITORING_BASE, 'Logs/hourly-listing-attributes-api/run-log.jsonl'),
  'daily-account-health': path.join(MONITORING_BASE, 'Logs/daily-account-health/run-log.jsonl'),
  'daily-visuals': path.join(MONITORING_BASE, 'Logs/daily-visuals/run-log.jsonl'),
  'weekly-api-sources': path.join(MONITORING_BASE, 'Logs/weekly-api-sources/run-log.jsonl'),
  'weekly-browser-sources': path.join(MONITORING_BASE, 'Logs/weekly-browser-sources/run-log.jsonl'),
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params
  const logPath = JOB_LOG_PATHS[jobId]

  if (!logPath) {
    return NextResponse.json([])
  }

  try {
    const content = await fs.readFile(logPath, 'utf-8')
    const lines = content.trim().split('\n').filter(Boolean)
    const entries = lines
      .map((line) => {
        try { return JSON.parse(line) }
        catch { return null }
      })
      .filter(Boolean)

    // Return last 10, newest first
    return NextResponse.json(entries.slice(-10).reverse())
  } catch {
    // File doesn't exist yet — no run history
    return NextResponse.json([])
  }
}
```

- [ ] **Step 2: Verify build**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle && pnpm turbo build --filter=@targon/argus`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add apps/argus/app/api/monitoring/health/\[jobId\]/runs/route.ts
git commit -m "feat(argus): add run history API route for source health cards"
```

---

### Task 6: Rewrite page.tsx to use new components

**Files:**
- Modify: `apps/argus/app/(app)/tracking/page.tsx`

Replace the 1436-line page with a lean shell that orchestrates data fetching, tab state, and renders the new components. The page structure becomes:

```
Header card (kept as-is)
Stale snapshot warning (kept as-is)
Error alert (kept as-is)
Main card:
  Tabs (Changes | Sources)
  Changes tab: FeedRail (left, 260px) + ChangeDetail (right, flex)
  Sources tab: SourceHealthGrid
```

- [ ] **Step 1: Rewrite page.tsx**

The new page keeps ALL existing data-fetching hooks verbatim (the `useEffect` blocks for overview, changes, health, the `handleRefresh` function, the `snapshotAgeMinutes` memo). What changes is the render: the giant inline JSX is replaced by component calls.

Key layout change for the Changes tab:
```tsx
// Old: grid with 1.45fr / 0.95fr, list on left, detail on right
// New: flex with FeedRail (260px fixed) on left, ChangeDetail (flex: 1) on right
<Box sx={{ display: 'flex', height: 'calc(100vh - 280px)', minHeight: 400 }}>
  <FeedRail
    changes={changes}
    loading={loading}
    selectedEventId={selectedEventId}
    onSelectEvent={setSelectedEventId}
    windowValue={windowValue}
    onWindowChange={setWindowValue}
    owner={owner}
    onOwnerChange={setOwner}
    category={category}
    onCategoryChange={setCategory}
    severity={severity}
    onSeverityChange={setSeverity}
    query={query}
    onQueryChange={setQuery}
  />
  <ChangeDetail event={selectedEvent} />
</Box>
```

Key layout change for the Sources tab:
```tsx
// Old: hundreds of lines of inline Cards, Papers, dataset/job grids
// New: one component call
<SourceHealthGrid health={health} healthError={healthError} />
```

The page keeps these state variables (moved from old page):
- `activeTab`, `overview`, `changes`, `health`, `loading`, `refreshing`, `error`, `healthError`
- `windowValue`, `owner`, `category`, `severity`, `query`, `deferredQuery`
- `selectedEventId`, `selectedEvent` (memo), `snapshotAgeMinutes` (memo)

Remove all helper functions that were only used in the old render:
- `getDatasetPalette`, `getSchedulerPalette`, `formatSchedulerStatus`, `getSourceTypePalette`, `formatAgeLabel`
- `schedulerSummary`, `datasetSummary`, `datasetsBySourceType`, `jobsBySourceType`, `changePipeline` memos

Remove all old imports that are no longer needed (ListItemButton, Divider, List, Paper, chips, etc.). Add imports for FeedRail, ChangeDetail, SourceHealthGrid.

- [ ] **Step 2: Verify build**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle && pnpm turbo build --filter=@targon/argus`
Expected: Build succeeds with no errors

- [ ] **Step 3: Verify dev server renders correctly**

Run: Visit `http://localhost:3216/tracking` and confirm:
- Changes tab shows narrow feed rail on left, wide detail panel on right
- Clicking a change event in the rail shows its detail
- Filters work
- Sources tab shows compact grid with summary counters
- Clicking a source card expands it (run history will show "No run history available" until logs are set up)

- [ ] **Step 4: Commit**

```bash
git add apps/argus/app/(app)/tracking/page.tsx
git commit -m "feat(argus): rewrite monitoring page with compact rail + wide detail layout"
```

---

### Task 7: Clean up and verify full build

**Files:**
- Possibly modify: `apps/argus/components/monitoring/ui.tsx` (only if unused exports need removal)

- [ ] **Step 1: Run full build**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle && pnpm turbo build --filter=@targon/argus`
Expected: Clean build with no errors

- [ ] **Step 2: Run type-check**

Run: `cd /Users/jarraramjad/dev/targonos-main/.claude/worktrees/glittery-noodling-noodle/apps/argus && pnpm tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Verify the detail page (`/tracking/[id]`) is unaffected**

Visit `http://localhost:3216/tracking/<any-asin>` and confirm it still renders correctly. This page was not touched.

- [ ] **Step 4: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore(argus): clean up unused monitoring page code"
```
