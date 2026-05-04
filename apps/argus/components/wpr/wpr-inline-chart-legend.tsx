'use client'

import { Box } from '@mui/material'

export type WprInlineChartLegendItem<TKey extends string> = {
  key: TKey
  label: string
  color: string
  active: boolean
  dash?: boolean
}

export function WprInlineChartLegend<TKey extends string>({
  chartId,
  items,
  onToggle,
}: {
  chartId: string
  items: Array<WprInlineChartLegendItem<TKey>>
  onToggle: (key: TKey) => void
}) {
  return (
    <Box
      data-chart-legend={chartId}
      aria-label={`${chartId} chart legend`}
      sx={{
        minHeight: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: { xs: 1.2, sm: 1.75 },
        flexWrap: 'wrap',
        userSelect: 'none',
      }}
    >
      {items.map((item) => (
        <Box
          key={item.key}
          data-legend-item={item.key}
          data-active={item.active ? 'true' : 'false'}
          aria-label={`${item.label} series`}
          onMouseDown={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            onToggle(item.key)
          }}
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.55,
            cursor: 'pointer',
            outline: 0,
            color: item.active ? 'rgba(255,255,255,0.68)' : 'rgba(255,255,255,0.34)',
            fontSize: '0.5rem',
            fontWeight: 600,
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}
        >
          <Box
            component="span"
            sx={{
              width: 15,
              borderTop: `2px solid ${item.color}`,
              borderTopStyle: item.dash === true ? 'dashed' : 'solid',
              borderRadius: 1,
              opacity: item.active ? 1 : 0.28,
            }}
          />
          <Box component="span">{item.label}</Box>
        </Box>
      ))}
    </Box>
  )
}
