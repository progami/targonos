import { describe, expect, it } from 'vitest'
import {
  EXCEL_FORECAST_METRICS,
  EXCEL_PO_FINANCE_COLUMNS,
  EXCEL_PO_TABLE_COLUMNS,
  computeForecastWorkbookRow,
  computePoFinanceWorkbookRow,
  computePoTableWorkbookRow,
  excelSetupColumns,
} from '@/lib/calculations/workbook-parity'

const mfgStart = new Date('2026-04-17T00:00:00.000Z')

describe('workbook visible column parity', () => {
  it('keeps the Excel setup columns year-specific', () => {
    expect(excelSetupColumns(2026)).toEqual([
      'SKU',
      'Opening Stock 2026',
      '2027 Opening Override',
      'Notes',
      'REGION',
      'Total Threshold (W)',
      'FBA Threshold (W)',
    ])
  })

  it('keeps the Excel PO Table labels separate from PO finance labels', () => {
    expect(EXCEL_PO_TABLE_COLUMNS).toEqual([
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

    expect(EXCEL_PO_FINANCE_COLUMNS).toEqual([
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
})

describe('workbook PO table parity', () => {
  it('computes Excel PO Table derived columns', () => {
    const poRows = [
      {
        orderCode: 'PO-18',
        product: '1SD32M',
        quantity: 1680,
        unitsPerCarton: 84,
        cartonLengthCm: 51.99,
        cartonWidthCm: 42.42,
        cartonHeightCm: 34.95,
        mfgStart,
        arrivalWeeks: 7,
        warehouseWeeks: 8,
        region: 'UK',
      },
      {
        orderCode: 'PO-18',
        product: 'CS010',
        quantity: 840,
        unitsPerCarton: 30,
        cartonLengthCm: 25.98,
        cartonWidthCm: 41.38,
        cartonHeightCm: 59.99,
        mfgStart,
        arrivalWeeks: 7,
        warehouseWeeks: 8,
        region: 'UK',
      },
    ]

    const first = computePoTableWorkbookRow(poRows[0], poRows, 0)
    const second = computePoTableWorkbookRow(poRows[1], poRows, 1)

    expect(first.carton).toBe(20)
    expect(first.cbm).toBe(1.542)
    expect(first.inboundWeek?.toISOString()).toBe('2026-06-08T00:00:00.000Z')
    expect(first.poTotalQty).toBe(2520)
    expect(first.poFirstRow).toBe(1)

    expect(second.carton).toBe(28)
    expect(second.cbm).toBe(1.806)
    expect(second.inboundWeek?.toISOString()).toBe('2026-06-08T00:00:00.000Z')
    expect(second.poTotalQty).toBe(2520)
    expect(second.poFirstRow).toBe(2)
  })
})

describe('workbook PO finance parity', () => {
  it('computes Excel PO Finances Table values from separate PO table rows', () => {
    const poTableRows = [
      { orderCode: 'PO-20', product: 'CS007', region: 'UK', carton: 645 },
      { orderCode: 'PO-20', product: 'CS010', region: 'UK', carton: 60 },
    ]

    const row = computePoFinanceWorkbookRow({
      orderCode: 'PO-20',
      product: 'CS007',
      region: 'UK',
      poTableRows,
      sellPrice: 7.5161,
      manufacturingCost: 0.4492,
      freightCost: 0.1508,
      tariffCost: 0,
      tacosPercent: 0.12,
      fbaFee: 1.23,
      referralPercent: 0.15,
      storageCost: 0.05,
    })

    expect(row.carton).toBe(645)
    expect(row.grossProfit).toBeCloseTo(4.558685)
    expect(row.netProfit).toBeCloseTo(3.606753)
  })
})

describe('workbook forecast parity', () => {
  it('uses the Excel forecast SKU block columns', () => {
    expect(EXCEL_FORECAST_METRICS).toEqual([
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

  it('computes opening and carry-forward inventory like the forecast sheet', () => {
    const first = computeForecastWorkbookRow({
      openingStock: 44028,
      inbound: 0,
      actual: 1646,
      planner: null,
      previous: null,
    })

    expect(first.threePl).toBe(0)
    expect(first.fba).toBe(44028)
    expect(first.final).toBe(1646)
    expect(first.fbaCoverWeeks).toBeCloseTo(26.7484811664)
    expect(first.totalCoverWeeks).toBeCloseTo(26.7484811664)

    const second = computeForecastWorkbookRow({
      openingStock: 44028,
      inbound: 0,
      actual: null,
      planner: 1116,
      previous: first,
    })

    expect(second.threePl).toBe(0)
    expect(second.fba).toBe(42382)
    expect(second.final).toBe(1116)
    expect(second.fbaCoverWeeks).toBeCloseTo(37.976702509)
    expect(second.totalCoverWeeks).toBeCloseTo(37.976702509)
  })

  it('uses explicit final demand for overrides and system forecast fallback', () => {
    const row = computeForecastWorkbookRow({
      openingStock: 100,
      inbound: 0,
      actual: null,
      planner: 20,
      final: 12,
      previous: null,
    })

    expect(row.final).toBe(12)
    expect(row.fbaCoverWeeks).toBeCloseTo(8.333333333)
    expect(row.totalCoverWeeks).toBeCloseTo(8.333333333)
  })
})
