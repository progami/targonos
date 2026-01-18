import { describe, expect, it } from 'vitest'
import { differenceInCalendarDays } from 'date-fns'
import {
  buildWeekCalendar,
  buildYearSegments,
  getCalendarDateForWeek,
  weekNumberForDate,
} from '@/lib/calculations/calendar'
import {
  buildPoPnlRows,
  buildProductCostIndex,
  computeCashFlow,
  computeDashboardSummary,
  computeProductCostSummary,
  computeProfitAndLoss,
  computePurchaseOrderDerived,
  computeSalesPlan,
} from '@/lib/calculations'
import { buildLeadTimeProfiles } from '@/lib/calculations/lead-times'
import type {
  BusinessParameterMap,
  LeadTimeProfile,
  ProductInput,
  PurchaseOrderDerived,
  PurchaseOrderInput,
  SalesWeekInput,
} from '@/lib/calculations'

const product: ProductInput = {
  id: 'prod-1',
  name: 'Widget',
  sku: 'W-1',
  sellingPrice: 10,
  manufacturingCost: 3,
  freightCost: 1,
  tariffRate: 0.05,
  tacosPercent: 0.1,
  fbaFee: 2,
  amazonReferralRate: 0.15,
  storagePerMonth: 0.5,
}

const productSummary = computeProductCostSummary(product)
const productIndex = buildProductCostIndex([product])

const leadProfile: LeadTimeProfile = {
  productionWeeks: 1,
  sourceWeeks: 0,
  oceanWeeks: 0,
  finalWeeks: 0,
}

const parameters: BusinessParameterMap = {
  startingCash: 1000,
  amazonPayoutDelayWeeks: 2,
  weeklyFixedCosts: 200,
  supplierPaymentSplit: [0.3, 0.3, 0.4],
  stockWarningWeeks: 4,
  defaultProductionWeeks: 1,
  defaultSourceWeeks: 1,
  defaultOceanWeeks: 1,
  defaultFinalWeeks: 1,
}

const productionStart = new Date('2024-01-01T00:00:00.000Z')
const arrivalDate = new Date('2024-01-15T00:00:00.000Z')

// Build a calendar for the test context
const calendar = buildWeekCalendar([
  {
    id: 'w1',
    productId: product.id,
    weekNumber: 1,
    weekDate: productionStart,
  },
  {
    id: 'w2',
    productId: product.id,
    weekNumber: 2,
    weekDate: new Date('2024-01-08T00:00:00.000Z'),
  },
  {
    id: 'w3',
    productId: product.id,
    weekNumber: 3,
    weekDate: arrivalDate,
  }
])

const purchaseOrderInput: PurchaseOrderInput = {
  id: 'po-1',
  orderCode: 'PO-1',
  productId: product.id,
  quantity: 100,
  productionWeeks: leadProfile.productionWeeks,
  sourceWeeks: leadProfile.sourceWeeks,
  oceanWeeks: leadProfile.oceanWeeks,
  finalWeeks: leadProfile.finalWeeks,
  productionStart,
  availableDate: arrivalDate,
  inboundEta: arrivalDate,
  status: 'ISSUED',
  payments: [],
}

const derivedOrder = computePurchaseOrderDerived(
  purchaseOrderInput,
  productIndex,
  leadProfile,
  parameters,
  { calendar }
)

const salesWeeks: SalesWeekInput[] = [
  {
    id: 'w1',
    productId: product.id,
    weekNumber: 1,
    weekDate: new Date('2024-01-01T00:00:00.000Z'),
    stockStart: 500,
    actualSales: 50,
    forecastSales: 60,
  },
  {
    id: 'w2',
    productId: product.id,
    weekNumber: 2,
    weekDate: new Date('2024-01-08T00:00:00.000Z'),
    actualSales: 60,
    forecastSales: 60,
  },
  {
    id: 'w3',
    productId: product.id,
    weekNumber: 3,
    weekDate: new Date('2024-01-15T00:00:00.000Z'),
    forecastSales: 70,
  },
]

const salesPlan = computeSalesPlan(salesWeeks, [derivedOrder])

describe('computePurchaseOrderDerived', () => {
  it('calculates landed cost and payment schedule', () => {
    expect(derivedOrder.plannedPoValue).toBeCloseTo(415)
    expect(derivedOrder.supplierCostTotal).toBeCloseTo(415)
    expect(derivedOrder.plannedPayments).toHaveLength(5)

    const [mfgDeposit, mfgProduction, freight, mfgFinal, tariff] = derivedOrder.plannedPayments

    expect(mfgDeposit.category).toBe('MANUFACTURING')
    expect(mfgDeposit.plannedAmount).toBeCloseTo(90)
    expect(mfgDeposit.plannedPercent).toBeCloseTo(90 / 415)
    expect(differenceInCalendarDays(mfgDeposit.plannedDate!, productionStart)).toBe(0)

    expect(mfgProduction.category).toBe('MANUFACTURING')
    expect(mfgProduction.plannedAmount).toBeCloseTo(90)
    expect(differenceInCalendarDays(mfgProduction.plannedDate!, productionStart)).toBe(7)

    expect(freight.category).toBe('FREIGHT')
    expect(freight.plannedAmount).toBeCloseTo(100)

    expect(mfgFinal.category).toBe('MANUFACTURING')
    expect(mfgFinal.plannedAmount).toBeCloseTo(120)

    expect(tariff.category).toBe('TARIFF')
    expect(tariff.plannedAmount).toBeCloseTo(15)

    expect(
      differenceInCalendarDays(
        derivedOrder.productionComplete!,
        productionStart
      )
    ).toBe(7)
  })

  it('honours per-order cost overrides', () => {
    const overrideOrder: PurchaseOrderInput = {
      ...purchaseOrderInput,
      overrideManufacturingCost: 5,
      overrideFreightCost: 2,
      overrideTariffRate: 0.1,
      overrideTacosPercent: 0.2,
      overrideFbaFee: 1,
      overrideStoragePerMonth: 0.3,
      batchTableRows: purchaseOrderInput.batchTableRows,
    }

    const overridden = computePurchaseOrderDerived(
      overrideOrder,
      productIndex,
      leadProfile,
      parameters
    )

    const expectedTariff = (overrideOrder.overrideManufacturingCost ?? product.manufacturingCost) * 0.1
    expect(overridden.landedUnitCost).toBeCloseTo(5 + 2 + expectedTariff)
    expect(overridden.plannedPoValue).toBeCloseTo(overridden.landedUnitCost * overrideOrder.quantity)
  })

  it('preserves manual payment due dates', () => {
    const manualFreightDate = new Date('2024-02-05T00:00:00.000Z')
    const manualOrder: PurchaseOrderInput = {
      ...purchaseOrderInput,
      payments: [
        {
          paymentIndex: 3,
          dueDate: manualFreightDate,
          dueDateSource: 'USER',
          amountExpected: 100,
          percentage: null,
          amountPaid: null,
          category: 'FREIGHT',
          label: 'Freight (manual)',
        },
      ],
    }

    // Create a minimal calendar context so date resolution works
    const calendar = buildWeekCalendar([
      {
        id: 'cal-1',
        productId: product.id,
        weekNumber: weekNumberForDate(manualFreightDate, buildWeekCalendar([])), // Determine week number for date
        weekDate: manualFreightDate
      },
      // Ensure we have the base production dates too if needed, though mostly the target date matters
      {
        id: 'cal-base',
        productId: product.id,
        weekNumber: 1, // Just to have some structure
        weekDate: new Date('2024-01-01T00:00:00.000Z')
      }
    ])
    // Re-build correctly to ensure week 6 (Feb 5) is covered
    const fullCalendar = buildWeekCalendar([
       { id: 'w1', productId: 'p1', weekNumber: 1, weekDate: new Date('2024-01-01T00:00:00.000Z') },
       { id: 'w6', productId: 'p1', weekNumber: 6, weekDate: manualFreightDate }
    ])

    const derivedManual = computePurchaseOrderDerived(
      manualOrder,
      productIndex,
      leadProfile,
      parameters,
      { calendar: fullCalendar }
    )

    const freightPayment = derivedManual.plannedPayments.find((payment) => payment.paymentIndex === 3)
    expect(freightPayment?.plannedDate?.toISOString()).toBe(manualFreightDate.toISOString())
  })
})

describe('computeSalesPlan', () => {
  it('derives final sales and ending inventory', () => {
    const week1 = salesPlan.find((row) => row.weekNumber === 1 && row.productId === product.id)
    const week3 = salesPlan.find((row) => row.weekNumber === 3 && row.productId === product.id)

    expect(week1).toBeDefined()
    expect(week1?.finalSales).toBe(50)
    expect(week1?.stockEnd).toBe(450)

    expect(week3).toBeDefined()
    expect(week3?.stockStart).toBe(490)
    expect(week3?.finalSales).toBe(0)
    expect(week3?.stockEnd).toBe(490)

    const arrivalRow = salesPlan.find((row) => row.arrivalOrders.length > 0)
    expect(arrivalRow?.arrivalOrders[0]?.orderCode).toBe(purchaseOrderInput.orderCode)
  })

  it('allocates inbound quantities to the correct batch products', () => {
    const productTwo: ProductInput = {
      id: 'prod-2',
      name: 'Gadget',
      sku: 'G-1',
      sellingPrice: 12,
      manufacturingCost: 4,
      freightCost: 1,
      tariffRate: 0.05,
      tacosPercent: 0.1,
      fbaFee: 2,
      amazonReferralRate: 0.15,
      storagePerMonth: 0.5,
    }
    const productIndexMulti = buildProductCostIndex([product, productTwo])
    const multiProductOrder: PurchaseOrderInput = {
      id: 'po-multi',
      orderCode: 'PO-MULTI',
      productId: product.id,
      quantity: 300,
      productionWeeks: leadProfile.productionWeeks,
      sourceWeeks: leadProfile.sourceWeeks,
      oceanWeeks: leadProfile.oceanWeeks,
      finalWeeks: leadProfile.finalWeeks,
      productionStart,
      availableDate: arrivalDate,
      inboundEta: arrivalDate,
      status: 'ISSUED',
      payments: [],
      batchTableRows: [
        { id: 'b1', purchaseOrderId: 'po-multi', productId: product.id, quantity: 120, batchCode: 'B1' },
        { id: 'b2', purchaseOrderId: 'po-multi', productId: productTwo.id, quantity: 180, batchCode: 'B2' },
      ],
    }

    const derivedMulti = computePurchaseOrderDerived(multiProductOrder, productIndexMulti, leadProfile, parameters)
    const multiSalesWeeks: SalesWeekInput[] = [
      { id: 'mw1a', productId: product.id, weekNumber: 1, weekDate: new Date('2024-01-01T00:00:00.000Z'), stockStart: 0 },
      { id: 'mw1b', productId: productTwo.id, weekNumber: 1, weekDate: new Date('2024-01-01T00:00:00.000Z'), stockStart: 0 },
      { id: 'mw3a', productId: product.id, weekNumber: 3, weekDate: new Date('2024-01-15T00:00:00.000Z'), forecastSales: 0 },
      { id: 'mw3b', productId: productTwo.id, weekNumber: 3, weekDate: new Date('2024-01-15T00:00:00.000Z'), forecastSales: 0 },
    ]

    const multiPlan = computeSalesPlan(multiSalesWeeks, [derivedMulti], { productIds: [product.id, productTwo.id] })
    const widgetArrival = multiPlan.find((row) => row.productId === product.id && row.weekNumber === 3)
    const gadgetArrival = multiPlan.find((row) => row.productId === productTwo.id && row.weekNumber === 3)

    expect(widgetArrival?.arrivals).toBe(120)
    expect(widgetArrival?.arrivalOrders[0]?.productId).toBe(product.id)
    expect(widgetArrival?.arrivalOrders[0]?.quantity).toBe(120)

    expect(gadgetArrival?.arrivals).toBe(180)
    expect(gadgetArrival?.arrivalOrders[0]?.productId).toBe(productTwo.id)
    expect(gadgetArrival?.arrivalOrders[0]?.quantity).toBe(180)
  })

  it('computes weeks of cover from projected demand', () => {
    const coverageInput: SalesWeekInput[] = [
      { id: 'c1', productId: product.id, weekNumber: 10, stockStart: 100, forecastSales: 20 },
      { id: 'c2', productId: product.id, weekNumber: 11, forecastSales: 20 },
      { id: 'c3', productId: product.id, weekNumber: 12, forecastSales: 20 },
      { id: 'c4', productId: product.id, weekNumber: 13, forecastSales: 20 },
      { id: 'c5', productId: product.id, weekNumber: 14, forecastSales: 20 },
    ]

    const coveragePlan = computeSalesPlan(coverageInput, [])
    const week10 = coveragePlan.find((row) => row.weekNumber === 10)
    const week12 = coveragePlan.find((row) => row.weekNumber === 12)

    expect(week10?.stockWeeks).toBe(5)
    expect(week12?.stockWeeks).toBe(3)

    const inboundInput: SalesWeekInput[] = Array.from({ length: 10 }, (_, index) => ({
      id: `inbound-${index + 1}`,
      productId: product.id,
      weekNumber: index + 1,
      stockStart: index === 0 ? 100 : undefined,
      forecastSales: 10,
    }))
    const inboundOrder: PurchaseOrderInput = {
      ...purchaseOrderInput,
      id: 'po-inbound',
      orderCode: 'PO-INBOUND',
      quantity: 1000,
      availableWeekNumber: 5,
    }
    const inboundDerived = computePurchaseOrderDerived(
      inboundOrder,
      productIndex,
      leadProfile,
      parameters,
    )

    const inboundPlan = computeSalesPlan(inboundInput, [inboundDerived])
    const inboundWeek1 = inboundPlan.find((row) => row.weekNumber === 1)
    expect(inboundWeek1?.stockWeeks).toBe(10)

    const plateauInput: SalesWeekInput[] = [
      { id: 'p1', productId: product.id, weekNumber: 20, stockStart: 80, forecastSales: 0 },
      { id: 'p2', productId: product.id, weekNumber: 21, forecastSales: 0 },
      { id: 'p3', productId: product.id, weekNumber: 22, forecastSales: 0 },
    ]

    const plateauPlan = computeSalesPlan(plateauInput, [])
    const plateauWeek = plateauPlan.find((row) => row.weekNumber === 20)
    expect(plateauWeek?.stockWeeks).toBe(Number.POSITIVE_INFINITY)

    const zeroInventoryInput: SalesWeekInput[] = [
      { id: 'z1', productId: product.id, weekNumber: 30, stockStart: 0, actualSales: 0, forecastSales: 0 },
    ]
    const zeroPlan = computeSalesPlan(zeroInventoryInput, [])
    const zeroWeek = zeroPlan.find((row) => row.weekNumber === 30)
    expect(zeroWeek?.stockWeeks).toBe(0)
  })

  it('caps inventory at zero and preserves fractional stock weeks', () => {
    const fractionalInput: SalesWeekInput[] = [
      { id: 'f1', productId: product.id, weekNumber: 1, stockStart: 10, forecastSales: 20 },
    ]

    const fractionalPlan = computeSalesPlan(fractionalInput, [])
    const week1 = fractionalPlan.find((row) => row.weekNumber === 1)

    expect(week1?.finalSales).toBe(20)
    expect(week1?.stockEnd).toBe(0)
    expect(week1?.stockWeeks).toBeCloseTo(0.5)

    const negativeInput: SalesWeekInput[] = [
      { id: 'n1', productId: product.id, weekNumber: 1, stockStart: 10, forecastSales: 30 },
      { id: 'n2', productId: product.id, weekNumber: 2, forecastSales: 10 },
    ]

    const negativePlan = computeSalesPlan(negativeInput, [])
    const week2 = negativePlan.find((row) => row.weekNumber === 2)

    expect(week2?.stockStart).toBe(0)
    expect(week2?.stockWeeks).toBe(0)
  })

  it('carries ending inventory into the next planning year', () => {
    const multiYearInput: SalesWeekInput[] = [
      { id: 'y52', productId: product.id, weekNumber: 52, stockStart: 40, forecastSales: 10 },
      { id: 'y53', productId: product.id, weekNumber: 53, forecastSales: 10 },
      { id: 'y54', productId: product.id, weekNumber: 54, forecastSales: 10 },
    ]

    const multiYearPlan = computeSalesPlan(multiYearInput, [])
    const week52 = multiYearPlan.find((row) => row.weekNumber === 52)
    const week53 = multiYearPlan.find((row) => row.weekNumber === 53)

    expect(week52?.stockEnd).toBe(30)
    expect(week53?.stockStart).toBe(30)
  })

  it('carries inventory forward when future weeks are only provided by the fallback calendar', () => {
    const placeholder: SalesWeekInput[] = [
      { id: 'p52', productId: '__planning__', weekNumber: 52, weekDate: new Date('2025-12-22T00:00:00Z') },
      { id: 'p53', productId: '__planning__', weekNumber: 53, weekDate: new Date('2025-12-29T00:00:00Z') },
    ]
    const sparse: SalesWeekInput[] = [
      { id: 's52', productId: product.id, weekNumber: 52, stockStart: 40, forecastSales: 10 },
    ]

    const plan = computeSalesPlan([...sparse, ...placeholder], [], { productIds: [product.id] })
    const week52 = plan.find((row) => row.productId === product.id && row.weekNumber === 52)
    const week53 = plan.find((row) => row.productId === product.id && row.weekNumber === 53)

    expect(week52?.stockEnd).toBe(40)
    expect(week53).toBeDefined()
    expect(week53?.stockStart).toBe(40)
    expect(week53?.finalSales).toBe(0)
  })

  it('supports projected vs real sales modes', () => {
    const input: SalesWeekInput[] = [
      {
        id: 'm1',
        productId: product.id,
        weekNumber: 1,
        weekDate: new Date('2024-01-01T00:00:00.000Z'),
        stockStart: 100,
        actualSales: 10,
        forecastSales: 20,
        systemForecastSales: 30,
      },
      {
        id: 'm2',
        productId: product.id,
        weekNumber: 2,
        weekDate: new Date('2024-01-08T00:00:00.000Z'),
        stockStart: 90,
        forecastSales: 20,
        systemForecastSales: 30,
      },
    ]

    const defaultPlan = computeSalesPlan(input, [], { mode: 'DEFAULT' })
    expect(defaultPlan.find((row) => row.weekNumber === 1)?.finalSalesSource).toBe('ACTUAL')
    expect(defaultPlan.find((row) => row.weekNumber === 1)?.finalSales).toBe(10)

    const projected = computeSalesPlan(input, [], { mode: 'PROJECTED' })
    expect(projected.find((row) => row.weekNumber === 1)?.finalSalesSource).toBe('PLANNER')
    expect(projected.find((row) => row.weekNumber === 1)?.finalSales).toBe(20)

    const real = computeSalesPlan(input, [], { mode: 'REAL' })
    expect(real.find((row) => row.weekNumber === 2)?.finalSalesSource).toBe('ZERO')
    expect(real.find((row) => row.weekNumber === 2)?.finalSales).toBe(0)
  })
})

describe('buildPoPnlRows', () => {
  it('allocates weekly fixed costs by revenue share and preserves totals', () => {
    const ledger = [
      {
        weekNumber: 1,
        weekDate: null,
        productId: 'p1',
        orderCode: 'PO-A',
        batchCode: 'B1',
        units: 10,
        revenue: 100,
        manufacturingCost: 0,
        freightCost: 0,
        tariffCost: 0,
        cogs: 50,
        referralFees: 0,
        fbaFees: 0,
        storageFees: 0,
        amazonFees: 0,
        ppcSpend: 0,
      },
      {
        weekNumber: 1,
        weekDate: null,
        productId: 'p1',
        orderCode: 'PO-B',
        batchCode: 'B1',
        units: 10,
        revenue: 100,
        manufacturingCost: 0,
        freightCost: 0,
        tariffCost: 0,
        cogs: 50,
        referralFees: 0,
        fbaFees: 0,
        storageFees: 0,
        amazonFees: 0,
        ppcSpend: 0,
      },
    ]

    const weeklyTargets = [
      {
        weekNumber: 1,
        weekDate: null,
        units: 20,
        revenue: 220,
        cogs: 110,
        grossProfit: 110,
        grossMargin: 0.5,
        amazonFees: 0,
        ppcSpend: 0,
        fixedCosts: 100,
        totalOpex: 100,
        netProfit: 10,
      },
    ]

    const orderMetaByCode = new Map([
      [
        'PO-A',
        {
          orderCode: 'PO-A',
          status: 'ISSUED',
          productionStart: null,
          availableDate: null,
          totalLeadDays: null,
        },
      ],
      [
        'PO-B',
        {
          orderCode: 'PO-B',
          status: 'ISSUED',
          productionStart: null,
          availableDate: null,
          totalLeadDays: null,
        },
      ],
    ])

    const productNameById = new Map([['p1', 'SKU-1']])

    const result = buildPoPnlRows({
      ledger,
      weeklyTargets,
      orderMetaByCode,
      productNameById,
    })

    const rowA = result.rows.find((row) => row.orderCode === 'PO-A')
    const rowB = result.rows.find((row) => row.orderCode === 'PO-B')
    expect(rowA?.revenue).toBeCloseTo(110)
    expect(rowB?.revenue).toBeCloseTo(110)
    expect(rowA?.fixedCosts).toBeCloseTo(50)
    expect(rowB?.fixedCosts).toBeCloseTo(50)

    const totals = result.rows.reduce(
      (acc, row) => ({
        revenue: acc.revenue + row.revenue,
        cogs: acc.cogs + row.cogs,
        fixedCosts: acc.fixedCosts + row.fixedCosts,
      }),
      { revenue: 0, cogs: 0, fixedCosts: 0 },
    )

    expect(totals.revenue).toBeCloseTo(weeklyTargets[0].revenue)
    expect(totals.cogs).toBeCloseTo(weeklyTargets[0].cogs)
    expect(totals.fixedCosts).toBeCloseTo(weeklyTargets[0].fixedCosts)
  })
})

describe('buildLeadTimeProfiles', () => {
  it('clamps negative lead-time durations to zero', () => {
    const templates = [
      { id: 'prod', label: 'Production', defaultWeeks: -8.68, sequence: 1 },
      { id: 'source', label: 'Source Prep', defaultWeeks: 4.43, sequence: 2 },
      { id: 'ocean', label: 'Ocean Transit', defaultWeeks: 3.29, sequence: 3 },
      { id: 'final', label: 'Final Mile', defaultWeeks: -3, sequence: 4 },
    ]

    const profiles = buildLeadTimeProfiles(templates, [], ['prod-1'])

    expect(profiles.get('prod-1')).toEqual({
      productionWeeks: 0,
      sourceWeeks: 4.43,
      oceanWeeks: 3.29,
      finalWeeks: 0,
    })
  })
})

const profitResult = computeProfitAndLoss(
  salesPlan,
  productIndex,
  parameters,
  []
)

// TODO: Update assertions when profit/loss math is stabilised.
describe.skip('computeProfitAndLoss', () => {
  it('aggregates weekly revenue and expenses', () => {
    const week1 = profitResult.weekly[0]
    expect(week1.weekNumber).toBe(1)
    expect(week1.revenue).toBeCloseTo(500)
    expect(week1.cogs).toBeCloseTo(350)
    expect(week1.grossProfit).toBeCloseTo(150)
    expect(week1.amazonFees).toBeCloseTo(175)
    expect(week1.ppcSpend).toBeCloseTo(50)
    expect(week1.fixedCosts).toBe(parameters.weeklyFixedCosts)
    expect(week1.netProfit).toBeCloseTo(-275)
  })

  it('derives non-editable columns from driver cells', () => {
    const week1 = profitResult.weekly[0]
    expect(week1.grossProfit).toBeCloseTo(week1.revenue - week1.cogs)
    expect(week1.totalOpex).toBeCloseTo(week1.amazonFees + week1.ppcSpend + week1.fixedCosts)
    expect(week1.netProfit).toBeCloseTo(week1.grossProfit - week1.totalOpex)
    const expectedMargin = week1.revenue === 0 ? 0 : week1.grossProfit / week1.revenue
    expect(week1.grossMargin).toBeCloseTo(expectedMargin)
  })
})

const cashResult = computeCashFlow(
  profitResult.weekly,
  [derivedOrder],
  parameters,
  []
)

// TODO: Align cash-flow fixtures with the new planning model before re-enabling.
describe.skip('computeCashFlow', () => {
  it('delays payouts and offsets inventory spend', () => {
    const week1 = cashResult.weekly.find((row) => row.weekNumber === 1)
    const week2 = cashResult.weekly.find((row) => row.weekNumber === 2)
    const week3 = cashResult.weekly.find((row) => row.weekNumber === 3)

    expect(week1?.cashBalance).toBeCloseTo(725)
    expect(week2?.inventorySpend).toBeCloseTo(340)
    expect(week3?.amazonPayout).toBeCloseTo(500)
    expect(week3?.cashBalance).toBeCloseTo(485)
  })

  it('keeps derived cash metrics in sync with editable inputs', () => {
    const rows = cashResult.weekly
    for (const row of rows) {
      expect(row.netCash).toBeCloseTo(row.amazonPayout - row.inventorySpend - row.fixedCosts)
    }

    for (let index = 1; index < rows.length; index += 1) {
      const previous = rows[index - 1]
      const current = rows[index]
      const expectedBalance = previous.cashBalance + current.netCash
      expect(current.cashBalance).toBeCloseTo(expectedBalance)
    }
  })

  it('carries delayed payouts into future planning years', () => {
    const delayed = computeCashFlow(
      profitResult.weekly,
      [derivedOrder],
      { ...parameters, amazonPayoutDelayWeeks: 60 },
      []
    )

    const payoutWeek = delayed.weekly.find((row) => row.weekNumber === 61)
    expect(payoutWeek).toBeDefined()
    expect(payoutWeek?.amazonPayout).toBeCloseTo(500)
    expect(payoutWeek?.cashBalance).toBeCloseTo(285)
    expect(payoutWeek?.weekDate).toBeInstanceOf(Date)
    expect(payoutWeek?.weekDate?.getFullYear()).toBeGreaterThanOrEqual(2024)
  })
})

// TODO: Dashboard summary depends on the skipped cash/profit suites above.
describe.skip('computeDashboardSummary', () => {
  it('summarises revenue, cash, and pipeline', () => {
    const dashboard = computeDashboardSummary(
      profitResult.weekly,
      cashResult.weekly,
      [derivedOrder],
      salesPlan,
      productIndex
    )
    expect(dashboard.revenueYtd).toBeCloseTo(1800)
    expect(dashboard.cashBalance).toBeCloseTo(1385)
    expect(dashboard.pipeline).toEqual([{ status: 'ISSUED', quantity: 100 }])
    expect(dashboard.inventory[0]?.stockEnd).toBe(420)
  })
})

describe('calendar continuity', () => {
  it('fills missing weeks and derives year segments through 2027', () => {
    const multiYearWeeks: SalesWeekInput[] = [
      {
        id: 'w1',
        productId: product.id,
        weekNumber: 1,
        weekDate: new Date('2025-01-06T00:00:00.000Z'),
        stockStart: 500,
      },
      {
        id: 'w60',
        productId: product.id,
        weekNumber: 60,
        actualSales: 40,
      },
      {
        id: 'w120',
        productId: product.id,
        weekNumber: 120,
        forecastSales: 50,
      },
      {
        id: 'w156',
        productId: product.id,
        weekNumber: 156,
      },
    ]

    const calendar = buildWeekCalendar(multiYearWeeks)
    expect(calendar.calendarStart).toBeInstanceOf(Date)
    expect(calendar.weekDates.has(2)).toBe(true)

    const weekTwoDate = getCalendarDateForWeek(2, calendar)
    expect(weekTwoDate).toBeInstanceOf(Date)
    expect(weekTwoDate?.getFullYear()).toBe(2025)

    const segments = buildYearSegments(calendar)
    const years = segments.map((segment) => segment.year)
    expect(years).toEqual([2025, 2026, 2027])

    const segment2025 = segments.find((segment) => segment.year === 2025)
    const segment2026 = segments.find((segment) => segment.year === 2026)
    const segment2027 = segments.find((segment) => segment.year === 2027)

    expect(segment2025?.startWeekNumber).toBe(1)
    expect(segment2026?.startWeekNumber).toBe((segment2025?.endWeekNumber ?? 0) + 1)
    expect(segment2027?.endWeekNumber).toBe(156)

    const first2027Date = segment2027
      ? getCalendarDateForWeek(segment2027.startWeekNumber, calendar)
      : null
    expect(first2027Date?.getFullYear()).toBe(2027)
  })

  it('anchors relative weeks when the first dated row is not week 1', () => {
    const anchoredWeeks: SalesWeekInput[] = [
      {
        id: 'w40',
        productId: product.id,
        weekNumber: 40,
      },
      {
        id: 'w41',
        productId: product.id,
        weekNumber: 41,
      },
      {
        id: 'w42',
        productId: product.id,
        weekNumber: 42,
        weekDate: new Date('2025-10-20T00:00:00.000Z'),
      },
      {
        id: 'w60',
        productId: product.id,
        weekNumber: 60,
      },
    ]

    // Now using Monday as week start (weekStartsOn=1 by default)
    const calendar = buildWeekCalendar(anchoredWeeks)
    expect(calendar.calendarStart?.toISOString()).toBe('2025-10-20T00:00:00.000Z') // Monday
    expect(calendar.anchorWeekNumber).toBe(42)

    const filledWeek40 = getCalendarDateForWeek(40, calendar)
    expect(filledWeek40?.toISOString().slice(0, 10)).toBe('2025-10-06') // Monday

    const filledWeek60 = getCalendarDateForWeek(60, calendar)
    expect(filledWeek60?.toISOString().slice(0, 10)).toBe('2026-02-23') // Monday

    const derivedWeek42 = weekNumberForDate(new Date('2025-10-20T12:00:00.000Z'), calendar)
    const derivedWeek40 = weekNumberForDate(new Date('2025-10-06T00:00:00.000Z'), calendar)
    const derivedWeekBefore = weekNumberForDate(new Date('2025-09-29T00:00:00.000Z'), calendar)

    expect(derivedWeek42).toBe(42)
    expect(derivedWeek40).toBe(40)
    expect(derivedWeekBefore).toBeNull()
  })
})
