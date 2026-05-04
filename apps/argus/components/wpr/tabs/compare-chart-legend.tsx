import { textSecondary } from '@/lib/wpr/panel-tokens'

type CompareLegendEntry = {
  color?: string
  value?: string | number
}

type CompareChartLegendProps = {
  payload?: readonly CompareLegendEntry[]
}

function entryColor(entry: CompareLegendEntry): string {
  if (entry.color === undefined) {
    throw new Error('Missing compare legend color')
  }

  return entry.color
}

function entryLabel(entry: CompareLegendEntry): string {
  if (entry.value === undefined) {
    throw new Error('Missing compare legend label')
  }

  return String(entry.value)
}

export function CompareChartLegend({ payload }: CompareChartLegendProps) {
  if (payload === undefined) {
    throw new Error('Missing compare legend payload')
  }

  return (
    <ul
      style={{
        margin: 0,
        padding: '8px 0 0',
        listStyle: 'none',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px 14px',
      }}
    >
      {payload.map((entry) => (
        <li
          key={entryLabel(entry)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: textSecondary,
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.01em',
            cursor: 'default',
            userSelect: 'none',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '999px',
              backgroundColor: entryColor(entry),
              boxShadow: '0 0 0 1px rgba(255,255,255,0.14)',
              flexShrink: 0,
            }}
          />
          <span>{entryLabel(entry)}</span>
        </li>
      ))}
    </ul>
  )
}
