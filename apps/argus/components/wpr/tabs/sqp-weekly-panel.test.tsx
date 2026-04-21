import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { emptySqpMetrics, type SqpWeeklyPoint } from '../../../lib/wpr/sqp-view-model'
import type { WprChangeLogEntry } from '../../../lib/wpr/types'
import { SQP_WOW_SERIES, SqpWeeklySvg } from './sqp-weekly-panel'

function buildMetrics(overrides: Partial<SqpWeeklyPoint['metrics']>): SqpWeeklyPoint['metrics'] {
  return {
    ...emptySqpMetrics(),
    ...overrides,
  }
}

const weekly: SqpWeeklyPoint[] = [
  {
    week_label: 'W01',
    week_number: 1,
    start_date: '2026-01-01',
    metrics: buildMetrics({
      impression_share: 0.08,
      asin_ctr: 0.12,
      market_ctr: 0.1,
      asin_cart_add_rate: 0.09,
      cart_add_rate: 0.08,
      asin_cvr: 0.07,
      market_cvr: 0.05,
    }),
  },
  {
    week_label: 'W02',
    week_number: 2,
    start_date: '2026-01-08',
    metrics: buildMetrics({
      impression_share: 0.12,
      asin_ctr: 0.15,
      market_ctr: 0.1,
      asin_cart_add_rate: 0.11,
      cart_add_rate: 0.1,
      asin_cvr: 0.08,
      market_cvr: 0.05,
    }),
  },
]

const changeEntries: WprChangeLogEntry[] = [
  {
    id: 'chg-1',
    kind: 'listing',
    source: 'LISTING ATTRIBUTES',
    week_label: 'W02',
    week_number: 2,
    timestamp: '2026-01-08T00:00:00Z',
    date_label: '08 Jan 2026',
    title: 'Content update across 4 ASINs',
    summary: 'Backend terms',
    category: 'CONTENT',
    asins: ['B09HXC3NL8'],
    field_labels: ['Backend terms'],
  },
  {
    id: 'chg-2',
    kind: 'listing',
    source: 'LISTING ATTRIBUTES',
    week_label: 'W02',
    week_number: 2,
    timestamp: '2026-01-08T00:00:00Z',
    date_label: '08 Jan 2026',
    title: 'Price update across 4 ASINs',
    summary: 'Buy box landed price',
    category: 'PRICING',
    asins: ['B09HXC3NL8'],
    field_labels: ['Buy box landed price'],
  },
]

test('SQP weekly chart renders hover tooltip content for the active week', () => {
  const markup = renderToStaticMarkup(
    <SqpWeeklySvg
      weekly={weekly}
      changeEntries={changeEntries}
      visibleSeries={SQP_WOW_SERIES}
      width={800}
      height={320}
      hoveredIndex={1}
      onHoverIndexChange={() => {}}
    />,
  )

  assert.match(markup, /data-hover-tooltip=\"sqp\"/)
  assert.match(markup, /W02 · 2 changes/)
  assert.match(markup, /Content update across 4 ASINs/)
  assert.match(markup, /Price update across 4 ASINs/)
  assert.doesNotMatch(markup, /tracked changes/)
  assert.match(markup, /Impr Share/)
  assert.match(markup, /CTR x/)
  assert.match(markup, /1\.50x/)
})

test('SQP weekly chart omits hover tooltip markup when no week is active', () => {
  const markup = renderToStaticMarkup(
    <SqpWeeklySvg
      weekly={weekly}
      changeEntries={changeEntries}
      visibleSeries={SQP_WOW_SERIES}
      width={800}
      height={320}
      hoveredIndex={null}
      onHoverIndexChange={() => {}}
    />,
  )

  assert.doesNotMatch(markup, /data-hover-tooltip=\"sqp\"/)
  assert.doesNotMatch(markup, /W02 · 2 changes/)
  assert.doesNotMatch(markup, /Impr Share/)
})

test('SQP weekly chart uses the shared shell with grouped metric controls only', () => {
  const source = readFileSync(new URL('./sqp-weekly-panel.tsx', import.meta.url), 'utf8')

  assert.match(source, /<WprChartShell/)
  assert.doesNotMatch(source, /<WprChartShell[^>]*title=/)
  assert.doesNotMatch(source, /<WprChartShell[^>]*description=/)
  assert.doesNotMatch(source, /<WprChartShell[^>]*changeSummary=/)
  assert.match(source, /<WprChartControlGroup label="Metrics">/)
})
