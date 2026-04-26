import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CustomOpsCostGrid,
  type OpsBatchRow,
} from '@/components/sheets/custom-ops-cost-grid'
import {
  CustomOpsPlanningGrid,
} from '@/components/sheets/custom-ops-planning-grid'
import { SalesPlanningGrid } from '@/components/sheets/sales-planning-grid'
import {
  WorkbookSetupTable,
  type WorkbookSetupRow,
} from '@/components/sheets/workbook-setup-table'
import { TooltipProvider } from '@/components/ui/tooltip'

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0)),
  )
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((handle: number) => window.clearTimeout(handle)),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function expectLabels(labels: string[]) {
  labels.forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument()
  })
}

describe('workbook sheet column labels', () => {
  it('renders Setup with the Excel setup columns', () => {
    const rows: WorkbookSetupRow[] = [
      {
        productId: 'product-1',
        sku: 'CS001',
        openingStock: '100',
        nextYearOpeningOverride: '',
        notes: '',
        region: 'US',
        totalCoverThresholdWeeks: '8',
        fbaCoverThresholdWeeks: '4',
      },
    ]

    render(<WorkbookSetupTable strategyId="strategy-1" activeYear={2026} rows={rows} />)

    expectLabels([
      'SKU',
      'Opening Stock 2026',
      '2027 Opening Override',
      'Notes',
      'REGION',
      'Total Threshold (W)',
      'FBA Threshold (W)',
    ])
  })

  it('renders PO Table with the Excel PO Table columns', () => {
    render(<CustomOpsPlanningGrid rows={[]} />)

    expectLabels([
      'PO CODE',
      'PRODUCT',
      'QTY',
      'UNITS/CTN',
      'CARTON',
      'CTN L (CM)',
      'CTN W (CM)',
      'CTN H (CM)',
      'CBM',
      'MFG START',
      'SHIP',
      'CONTAINER #',
      'STATUS',
      'PO CLASS',
      'MFG (WK)',
      'DEPART (WK)',
      'ARRIVAL (WK)',
      'WH (WK)',
      'INBOUND WK OVERRIDE',
      'INBOUND WK',
      'PO TOTAL QTY',
      'NOTES',
      'PO FIRST ROW',
      'REGION',
    ])
  })

  it('renders PO Finances Table with the Excel finance columns', () => {
    const rows: OpsBatchRow[] = []

    render(<CustomOpsCostGrid rows={rows} products={[]} />)

    expect(screen.getByText('PO Finances Table')).toBeInTheDocument()
    expectLabels([
      'PO CODE',
      'PRODUCT',
      'CARTON',
      'SELL $',
      'MFG $',
      'FREIGHT $',
      'TARIFF $',
      'TACOS %',
      'FBA $',
      'REFERRAL %',
      'STORAGE $',
      'GP $',
      'NP $',
      'REGION',
    ])
  })

  it('renders Forecast with base columns and one Excel SKU block', () => {
    const metrics = [
      'inbound',
      'threePl',
      'fba',
      'fbaCoverWeeks',
      'totalCoverWeeks',
      'actualSales',
      'forecastSales',
      'finalSales',
    ]
    const columnMeta = Object.fromEntries(
      metrics.map((field) => [`product-1_${field}`, { productId: 'product-1', field }]),
    )
    const row: {
      weekNumber: string
      weekLabel: string
      weekDate: string
      arrivalDetail: string
      [key: string]: string
    } = {
      weekNumber: '1',
      weekLabel: 'W1',
      weekDate: '2026-01-05',
      arrivalDetail: '',
    }
    metrics.forEach((field) => {
      row[`product-1_${field}`] = '0'
    })

    render(
      <TooltipProvider>
        <SalesPlanningGrid
          strategyId="strategy-1"
          rows={[row]}
          columnMeta={columnMeta}
          columnKeys={['weekLabel', 'weekDate', 'arrivalDetail', ...Object.keys(columnMeta)]}
          productOptions={[{ id: 'product-1', name: 'CS001' }]}
          stockWarningWeeks={8}
          leadTimeByProduct={{}}
          batchAllocations={new Map()}
          reorderCueByProduct={new Map()}
        />
      </TooltipProvider>,
    )

    expectLabels([
      'WEEK',
      'DATE',
      'Notes',
      'INBOUND',
      '3PL',
      'FBA',
      'FBA COVER (W)',
      'TOTAL COVER (W)',
      'ACTUAL',
      'PLANNER',
      'FINAL',
    ])
  })
})
