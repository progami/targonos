import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { WprChangeLogEntry } from '@/lib/wpr/types'
import {
  buildChangeMarkerLabelParts,
  buildDailyChangeMarkers,
  buildWeeklyChangeMarkers,
  formatChangeMarkerLabel,
  summarizeChangeMarkers,
  WprChangeTooltipContent,
} from './chart-change-markers'

const weeklyEntries: WprChangeLogEntry[] = [
  {
    id: 'chg-1',
    kind: 'listing',
    week_label: 'W14',
    week_number: 14,
    timestamp: '2026-04-04T00:00:00Z',
    date_label: '04 Apr 2026',
    source: 'LISTING ATTRIBUTES',
    title: 'Content update across 4 ASINs',
    summary: 'Backend terms',
    category: 'CONTENT',
    asins: ['B09HXC3NL8'],
    field_labels: ['Backend terms'],
  },
  {
    id: 'chg-2',
    kind: 'listing',
    week_label: 'W14',
    week_number: 14,
    timestamp: '2026-04-04T00:00:00Z',
    date_label: '04 Apr 2026',
    source: 'LISTING ATTRIBUTES',
    title: 'Price update across 4 ASINs',
    summary: 'Buy box landed price',
    category: 'PRICING',
    asins: ['B09HXC3NL8'],
    field_labels: ['Buy box landed price'],
  },
  {
    id: 'chg-3',
    kind: 'listing',
    week_label: 'W15',
    week_number: 15,
    timestamp: '2026-04-09T00:00:00Z',
    date_label: '09 Apr 2026',
    source: 'LISTING ATTRIBUTES',
    title: 'Price update across 3 ASINs',
    summary: 'List price',
    category: 'PRICING',
    asins: ['B0CR1GSBQ9'],
    field_labels: ['List price'],
  },
]

test('buildWeeklyChangeMarkers groups change entries by week', () => {
  const markers = buildWeeklyChangeMarkers(weeklyEntries)

  assert.deepEqual(markers, [
    {
      label: 'W14',
      count: 2,
      titles: ['Content update across 4 ASINs', 'Price update across 4 ASINs'],
      details: [
        {
          id: 'chg-1',
          title: 'Content update across 4 ASINs',
          summary: 'Backend terms',
          category: 'CONTENT',
        },
        {
          id: 'chg-2',
          title: 'Price update across 4 ASINs',
          summary: 'Buy box landed price',
          category: 'PRICING',
        },
      ],
    },
    {
      label: 'W15',
      count: 1,
      titles: ['Price update across 3 ASINs'],
      details: [
        {
          id: 'chg-3',
          title: 'Price update across 3 ASINs',
          summary: 'List price',
          category: 'PRICING',
        },
      ],
    },
  ])
})

test('buildDailyChangeMarkers keeps only days with tracked changes', () => {
  const markers = buildDailyChangeMarkers([
    { day_label: 'Apr 04', change_count: 0, change_titles: [] },
    { day_label: 'Apr 05', change_count: 2, change_titles: ['Title A', 'Title B'] },
  ])

  assert.deepEqual(markers, [
    {
      label: 'Apr 05',
      count: 2,
      titles: ['Title A', 'Title B'],
      details: [
        { id: 'Apr 05-0', title: 'Title A' },
        { id: 'Apr 05-1', title: 'Title B' },
      ],
    },
  ])
})

test('formatChangeMarkerLabel includes tracked changes in hover labels', () => {
  const marker = buildWeeklyChangeMarkers(weeklyEntries)[0]
  if (marker === undefined) {
    throw new Error('Missing weekly change marker')
  }

  assert.equal(
    formatChangeMarkerLabel('W14', marker),
    'W14 · 2 changes · Content update across 4 ASINs · Price update across 4 ASINs',
  )
  assert.equal(formatChangeMarkerLabel('W16', undefined), 'W16')
})

test('summarizeChangeMarkers reports all tracked changes and marked buckets', () => {
  const weeklyMarkers = buildWeeklyChangeMarkers(weeklyEntries)

  assert.equal(summarizeChangeMarkers(weeklyMarkers, 'week'), '3 changes · 2 marked weeks')
  assert.equal(summarizeChangeMarkers([], 'day'), 'No marked days')
})

test('buildChangeMarkerLabelParts keeps standardized change copy split into display lines', () => {
  const marker = buildWeeklyChangeMarkers(weeklyEntries)[0]
  if (marker === undefined) {
    throw new Error('Missing weekly change marker')
  }

  assert.deepEqual(buildChangeMarkerLabelParts('W14', marker), [
    'W14 · 2 changes',
    'Content update across 4 ASINs',
    'Price update across 4 ASINs',
  ])
  assert.deepEqual(buildChangeMarkerLabelParts('W16', undefined), ['W16'])
})

test('WprChangeTooltipContent renders every change title on its own line', () => {
  const marker = buildWeeklyChangeMarkers(weeklyEntries)[0]
  if (marker === undefined) {
    throw new Error('Missing weekly change marker')
  }

  const markup = renderToStaticMarkup(
    React.createElement(WprChangeTooltipContent, {
      active: true,
      label: 'W14',
      changeMarker: marker,
      payload: [
        {
          name: 'CTR',
          value: '12.4%',
          color: '#8fc7ff',
        },
      ],
      formatRow: (entry) => ({
        label: String(entry.name),
        value: String(entry.value),
        color: String(entry.color),
      }),
    }),
  )

  assert.match(markup, /W14 · 2 changes/)
  assert.match(markup, /Content/)
  assert.match(markup, /Pricing/)
  assert.match(markup, /Content update across 4 ASINs/)
  assert.match(markup, /Backend terms/)
  assert.match(markup, /Price update across 4 ASINs/)
  assert.match(markup, /Buy box landed price/)
})

test('RechartsChangeMarkers renders the reference lines on a front z-index layer', () => {
  const source = readFileSync(new URL('./chart-change-markers.tsx', import.meta.url), 'utf8')

  assert.match(source, /<ReferenceLine[\s\S]*zIndex=\{900\}/)
})
