import { describe, expect, it } from 'vitest'
import { computeCashFlow } from '@/lib/calculations'
import type {
  BusinessParameterMap,
  ProfitAndLossWeekDerived,
  PurchaseOrderDerived,
  PurchaseOrderPaymentInput,
} from '@/lib/calculations'

describe('computeCashFlow payment selection', () => {
  it('uses expected amounts when paid is empty', () => {
    const parameters: BusinessParameterMap = {
      startingCash: 0,
      amazonPayoutDelayWeeks: 0,
      weeklyFixedCosts: 0,
      supplierPaymentSplit: [0.5, 0.3, 0.2],
      stockWarningWeeks: 0,
      defaultProductionWeeks: 1,
      defaultSourceWeeks: 1,
      defaultOceanWeeks: 1,
      defaultFinalWeeks: 1,
    }

    const weeklyPnl: ProfitAndLossWeekDerived[] = [
      {
        weekNumber: 1,
        weekDate: new Date('2025-01-06T00:00:00.000Z'),
        units: 0,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        amazonFees: 0,
        ppcSpend: 0,
        fixedCosts: 0,
        totalOpex: 0,
        netProfit: 0,
      },
    ]

    const payments: PurchaseOrderPaymentInput[] = [
      {
        paymentIndex: 1,
        amountExpected: 100,
        amountPaid: 0,
        dueWeekNumber: 1,
        dueWeekNumberDefault: null,
        percentage: null,
        category: 'MANUFACTURING',
        label: 'Unpaid',
        dueDate: null,
        dueDateDefault: null,
        dueDateSource: 'SYSTEM',
      },
      {
        paymentIndex: 2,
        amountExpected: 200,
        amountPaid: 50,
        dueWeekNumber: 10,
        dueWeekNumberDefault: null,
        percentage: null,
        category: 'MANUFACTURING',
        label: 'Paid',
        dueDate: null,
        dueDateDefault: null,
        dueDateSource: 'SYSTEM',
      },
    ]

    const purchaseOrders: PurchaseOrderDerived[] = [
      {
        payments,
        plannedPayments: [],
      } as unknown as PurchaseOrderDerived,
    ]

    const cash = computeCashFlow(weeklyPnl, purchaseOrders, parameters, [])
    const week1 = cash.weekly.find((row) => row.weekNumber === 1)
    const week10 = cash.weekly.find((row) => row.weekNumber === 10)

    expect(week1?.inventorySpend).toBeCloseTo(100)
    expect(week10?.inventorySpend).toBeCloseTo(50)
  })

  it('prefers user due dates when week numbers are missing', () => {
    const parameters: BusinessParameterMap = {
      startingCash: 0,
      amazonPayoutDelayWeeks: 0,
      weeklyFixedCosts: 0,
      supplierPaymentSplit: [0.5, 0.3, 0.2],
      stockWarningWeeks: 0,
      defaultProductionWeeks: 1,
      defaultSourceWeeks: 1,
      defaultOceanWeeks: 1,
      defaultFinalWeeks: 1,
    }

    const week1Date = new Date('2025-01-06T00:00:00.000Z')
    const week10Date = new Date('2025-03-10T00:00:00.000Z')

    const weeklyPnl: ProfitAndLossWeekDerived[] = [
      {
        weekNumber: 1,
        weekDate: week1Date,
        units: 0,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        amazonFees: 0,
        ppcSpend: 0,
        fixedCosts: 0,
        totalOpex: 0,
        netProfit: 0,
      },
      {
        weekNumber: 10,
        weekDate: week10Date,
        units: 0,
        revenue: 0,
        cogs: 0,
        grossProfit: 0,
        grossMargin: 0,
        amazonFees: 0,
        ppcSpend: 0,
        fixedCosts: 0,
        totalOpex: 0,
        netProfit: 0,
      },
    ]

    const payments: PurchaseOrderPaymentInput[] = [
      {
        paymentIndex: 1,
        amountExpected: 123,
        amountPaid: null,
        dueWeekNumber: null,
        dueWeekNumberDefault: 1,
        dueDate: week10Date,
        dueDateDefault: week1Date,
        dueDateSource: 'USER',
        percentage: null,
        category: 'MANUFACTURING',
        label: 'Manual due date without week',
      },
    ]

    const purchaseOrders: PurchaseOrderDerived[] = [
      {
        payments,
        plannedPayments: [],
      } as unknown as PurchaseOrderDerived,
    ]

    const cash = computeCashFlow(weeklyPnl, purchaseOrders, parameters, [])
    const week1 = cash.weekly.find((row) => row.weekNumber === 1)
    const week10 = cash.weekly.find((row) => row.weekNumber === 10)

    expect(week1?.inventorySpend).toBeCloseTo(0)
    expect(week10?.inventorySpend).toBeCloseTo(123)
  })
})
