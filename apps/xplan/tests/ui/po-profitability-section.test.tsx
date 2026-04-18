import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { POProfitabilitySection, type POProfitabilityDataset } from '@/components/sheets/po-profitability-section'

const row = {
  id: 'row-1',
  orderCode: 'PO-1-PDS',
  batchCode: null,
  productId: 'prod-1',
  productName: 'Widget',
  status: 'WAREHOUSE' as const,
  units: 10,
  revenue: 0,
  manufacturingCost: 0,
  freightCost: 0,
  tariffCost: 0,
  cogs: 0,
  cogsAdjustment: 0,
  referralFees: 0,
  fbaFees: 0,
  storageFees: 0,
  amazonFees: 0,
  amazonFeesAdjustment: 0,
  ppcSpend: 0,
  fixedCosts: 0,
  grossProfit: 0,
  grossMarginPercent: 0,
  netProfit: 0,
  netMarginPercent: 0,
  roi: 0,
  productionStart: null,
  availableDate: null,
  totalLeadDays: null,
}

function renderSection(dataset: POProfitabilityDataset) {
  render(
    <POProfitabilitySection
      strategyRegion="US"
      datasets={{ projected: dataset, real: dataset }}
      showChart={false}
    />,
  )
}

describe('POProfitabilitySection', () => {
  it('includes unattributed totals in the default total column', () => {
    renderSection({
      data: [row],
      totals: {
        units: 10,
        revenue: 0,
        cogs: 0,
        amazonFees: 0,
        ppcSpend: 0,
        fixedCosts: 0,
        grossProfit: 0,
        netProfit: 0,
      },
      unattributed: {
        units: 5,
        revenue: 100,
        cogs: 30,
        amazonFees: 10,
        ppcSpend: 5,
        fixedCosts: 15,
        grossProfit: 60,
        netProfit: 40,
      },
    })

    expect(screen.getByText(/Unattributed:/)).toBeInTheDocument()

    const unitsRow = screen.getByText('Units').closest('tr')
    expect(unitsRow).not.toBeNull()
    expect(within(unitsRow!).getByText('15')).toBeInTheDocument()

    const revenueRow = screen.getByText('Revenue').closest('tr')
    expect(revenueRow).not.toBeNull()
    expect(within(revenueRow!).getByText('$100')).toBeInTheDocument()

    const totalCogsRow = screen.getByText('Total COGS').closest('tr')
    expect(totalCogsRow).not.toBeNull()
    expect(within(totalCogsRow!).getByText('$30')).toBeInTheDocument()

    const netProfitRow = screen.getByText('Net Profit').closest('tr')
    expect(netProfitRow).not.toBeNull()
    expect(within(netProfitRow!).getByText('$40')).toBeInTheDocument()
  })
})
