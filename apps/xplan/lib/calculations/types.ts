export interface ProductInput {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number;
  manufacturingCost: number;
  freightCost: number;
  tariffRate: number;
  tacosPercent: number;
  fbaFee: number;
  amazonReferralRate: number;
  storagePerMonth: number;
}

export interface LeadStageTemplateInput {
  id: string;
  label: string;
  defaultWeeks: number;
  sequence: number;
}

export interface LeadStageOverrideInput {
  productId: string;
  stageTemplateId: string;
  durationWeeks: number;
}

export interface LeadTimeProfile {
  productionWeeks: number;
  sourceWeeks: number;
  oceanWeeks: number;
  finalWeeks: number;
}

export interface BusinessParameterInput {
  id: string;
  label: string;
  valueNumeric?: number | null;
  valueText?: string | null;
}

export type BusinessParameterMap = {
  startingCash: number;
  amazonPayoutDelayWeeks: number;
  weeklyFixedCosts: number;
  supplierPaymentSplit: [number, number, number];
  stockWarningWeeks: number;
  defaultProductionWeeks: number;
  defaultSourceWeeks: number;
  defaultOceanWeeks: number;
  defaultFinalWeeks: number;
};

export interface PurchaseOrderPaymentInput {
  paymentIndex: number;
  percentage?: number | null;
  amountExpected?: number | null;
  amountPaid?: number | null;
  category?: string | null;
  label?: string | null;
  dueDate?: Date | null;
  dueWeekNumber?: number | null;
  dueDateDefault?: Date | null;
  dueWeekNumberDefault?: number | null;
  dueDateSource?: 'SYSTEM' | 'USER';
}

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'ISSUED'
  | 'MANUFACTURING'
  | 'OCEAN'
  | 'WAREHOUSE'
  | 'SHIPPED';

export interface PurchaseOrderInput {
  id: string;
  orderCode: string;
  productId: string;
  poDate?: Date | null;
  poWeekNumber?: number | null;
  quantity: number;
  productionWeeks?: number | null;
  sourceWeeks?: number | null;
  oceanWeeks?: number | null;
  finalWeeks?: number | null;
  pay1Percent?: number | null;
  pay2Percent?: number | null;
  pay3Percent?: number | null;
  pay1Amount?: number | null;
  pay2Amount?: number | null;
  pay3Amount?: number | null;
  pay1Date?: Date | null;
  pay2Date?: Date | null;
  pay3Date?: Date | null;
  productionStart?: Date | null;
  productionComplete?: Date | null;
  productionCompleteWeekNumber?: number | null;
  sourceDeparture?: Date | null;
  sourceDepartureWeekNumber?: number | null;
  transportReference?: string | null;
  createdAt?: Date | null;
  shipName?: string | null;
  containerNumber?: string | null;
  portEta?: Date | null;
  portEtaWeekNumber?: number | null;
  inboundEta?: Date | null;
  inboundEtaWeekNumber?: number | null;
  availableDate?: Date | null;
  availableWeekNumber?: number | null;
  totalLeadDays?: number | null;
  status: PurchaseOrderStatus;
  statusIcon?: string | null;
  notes?: string | null;
  payments?: PurchaseOrderPaymentInput[];
  overrideSellingPrice?: number | null;
  overrideManufacturingCost?: number | null;
  overrideFreightCost?: number | null;
  overrideTariffRate?: number | null;
  overrideTacosPercent?: number | null;
  overrideFbaFee?: number | null;
  overrideReferralRate?: number | null;
  overrideStoragePerMonth?: number | null;
  batchTableRows?: BatchTableRowInput[];
}

export interface BatchTableRowInput {
  id: string;
  purchaseOrderId: string;
  batchCode?: string | null;
  productId: string;
  quantity: number;
  overrideSellingPrice?: number | null;
  overrideManufacturingCost?: number | null;
  overrideFreightCost?: number | null;
  overrideTariffRate?: number | null;
  overrideTariffCost?: number | null;
  overrideTacosPercent?: number | null;
  overrideFbaFee?: number | null;
  overrideReferralRate?: number | null;
  overrideStoragePerMonth?: number | null;
}

export interface SalesWeekInput {
  id: string;
  productId: string;
  weekNumber: number;
  weekDate?: Date | null;
  stockStart?: number | null;
  actualSales?: number | null;
  forecastSales?: number | null;
  systemForecastSales?: number | null;
  systemForecastVersion?: string | null;
  finalSales?: number | null;
  stockWeeks?: number | null;
  stockEnd?: number | null;
  hasActualData?: boolean;
}

export interface ProfitAndLossWeekInput {
  id: string;
  weekNumber: number;
  weekDate?: Date | null;
  units?: number | null;
  revenue?: number | null;
  cogs?: number | null;
  grossProfit?: number | null;
  grossMargin?: number | null;
  amazonFees?: number | null;
  ppcSpend?: number | null;
  fixedCosts?: number | null;
  totalOpex?: number | null;
  netProfit?: number | null;
}

export interface CashFlowWeekInput {
  id: string;
  weekNumber: number;
  weekDate?: Date | null;
  amazonPayout?: number | null;
  inventorySpend?: number | null;
  fixedCosts?: number | null;
  netCash?: number | null;
  cashBalance?: number | null;
}

export interface MonthlySummaryInput {
  id: string;
  periodLabel: string;
  year: number;
  month: number;
  revenue?: number | null;
  cogs?: number | null;
  grossProfit?: number | null;
  amazonFees?: number | null;
  ppcSpend?: number | null;
  fixedCosts?: number | null;
  totalOpex?: number | null;
  netProfit?: number | null;
  amazonPayout?: number | null;
  inventorySpend?: number | null;
  netCash?: number | null;
  closingCash?: number | null;
}

export interface QuarterlySummaryInput {
  id: string;
  periodLabel: string;
  year: number;
  quarter: number;
  revenue?: number | null;
  cogs?: number | null;
  grossProfit?: number | null;
  amazonFees?: number | null;
  ppcSpend?: number | null;
  fixedCosts?: number | null;
  totalOpex?: number | null;
  netProfit?: number | null;
  amazonPayout?: number | null;
  inventorySpend?: number | null;
  netCash?: number | null;
  closingCash?: number | null;
}

export type NumericLike = number | null | undefined;
