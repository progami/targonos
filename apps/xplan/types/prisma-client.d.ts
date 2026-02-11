declare module '@targon/prisma-xplan' {
  export type PrismaClientOptions = Record<string, unknown>;
  export type DefaultArgs = Record<string, unknown>;

  export type StrategyStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  export type StrategyRegion = 'US' | 'UK';

  export type PurchaseOrderStatus =
    | 'DRAFT'
    | 'ISSUED'
    | 'MANUFACTURING'
    | 'OCEAN'
    | 'WAREHOUSE'
    | 'SHIPPED';

  export interface Strategy {
    id: string;
    name: string;
    description?: string | null;
    status: StrategyStatus;
    region: StrategyRegion;
    isDefault: boolean;
    strategyAssignees?: StrategyAssignee[];
    createdAt?: Date;
    updatedAt?: Date;
  }

  export interface StrategyAssignee {
    id: string;
    strategyId: string;
    assigneeId: string;
    assigneeEmail: string;
    createdAt?: Date;
  }

  export interface Product {
    id: string;
    strategyId?: string;
    name: string;
    sku: string;
    asin?: string | null;
    isActive: boolean;
    createdAt?: Date;
    updatedAt?: Date;
    sellingPrice?: number | null;
    manufacturingCost?: number | null;
    freightCost?: number | null;
    tariffRate?: number | null;
    tacosPercent?: number | null;
    fbaFee?: number | null;
    amazonReferralRate?: number | null;
    storagePerMonth?: number | null;
    overrideSellingPrice?: number | null;
    overrideManufacturingCost?: number | null;
    overrideFreightCost?: number | null;
    overrideTariffRate?: number | null;
    overrideTacosPercent?: number | null;
    overrideFbaFee?: number | null;
    overrideReferralRate?: number | null;
    overrideStoragePerMonth?: number | null;
    strategy?: Strategy;
  }

  export interface LeadStageTemplate {
    id: string;
    label: string;
    defaultWeeks?: number | null;
    sequence: number;
  }

  export interface LeadTimeOverride {
    id?: string;
    productId: string;
    stageTemplateId: string;
    durationWeeks?: number | null;
  }

  export interface BusinessParameter {
    id: string;
    strategyId?: string;
    label: string;
    valueNumeric?: number | null;
    valueText?: string | null;
  }

  export interface PurchaseOrderPayment {
    id: string;
    purchaseOrderId: string;
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
    createdAt?: Date;
    updatedAt?: Date;
    purchaseOrder: PurchaseOrder;
  }

  export interface BatchTableRow {
    id: string;
    purchaseOrderId: string;
    productId: string;
    quantity?: number | null;
    batchCode?: string | null;
    overrideSellingPrice?: number | null;
    overrideManufacturingCost?: number | null;
    overrideFreightCost?: number | null;
    overrideTariffRate?: number | null;
    overrideTariffCost?: number | null;
    overrideTacosPercent?: number | null;
    overrideFbaFee?: number | null;
    overrideReferralRate?: number | null;
    overrideStoragePerMonth?: number | null;
    createdAt?: Date;
    updatedAt?: Date;
    product: Product;
    purchaseOrder: PurchaseOrder;
  }

  export interface PurchaseOrder {
    id: string;
    strategyId?: string;
    orderCode: string;
    productId: string;
    poDate?: Date | null;
    poWeekNumber?: number | null;
    quantity?: number | null;
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
    weeksUntilArrival?: number | null;
    overrideSellingPrice?: number | null;
    overrideManufacturingCost?: number | null;
    overrideFreightCost?: number | null;
    overrideTariffRate?: number | null;
    overrideTacosPercent?: number | null;
    overrideFbaFee?: number | null;
    overrideReferralRate?: number | null;
    overrideStoragePerMonth?: number | null;
    strategy?: Strategy;
    product: Product;
    payments: PurchaseOrderPayment[];
    batchTableRows: BatchTableRow[];
    createdAt?: Date | null;
    updatedAt?: Date | null;
  }

  export interface SalesWeek {
    id: string;
    strategyId?: string;
    productId: string;
    weekNumber: number;
    weekDate: Date | null;
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

  export interface SalesWeekFinancials {
    id: string;
    strategyId: string;
    productId: string;
    weekNumber: number;
    weekDate: Date | null;
    actualRevenue?: Prisma.Decimal | number | null;
    actualAmazonFees?: Prisma.Decimal | number | null;
    actualReferralFees?: Prisma.Decimal | number | null;
    actualFbaFees?: Prisma.Decimal | number | null;
    actualRefunds?: Prisma.Decimal | number | null;
    actualPpcSpend?: Prisma.Decimal | number | null;
    actualNetProfit?: Prisma.Decimal | number | null;
    syncedAt?: Date;
    createdAt?: Date;
    updatedAt?: Date;
  }

  export interface ProfitAndLossWeek {
    id: string;
    weekNumber: number;
    weekDate: Date | null;
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
    createdAt?: Date | null;
    updatedAt?: Date | null;
  }

  export interface CashFlowWeek {
    id: string;
    weekNumber: number;
    weekDate: Date | null;
    amazonPayout?: number | null;
    inventorySpend?: number | null;
    fixedCosts?: number | null;
    netCash?: number | null;
    cashBalance?: number | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
  }

  export interface MonthlySummary {
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

  export interface QuarterlySummary {
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

  export interface LogisticsEvent {
    id: string;
  }

  interface ModelDelegate<T> {
    findMany(args?: unknown): Promise<T[]>;
    findFirst(args?: unknown): Promise<T | null>;
    findUnique(args?: unknown): Promise<T | null>;
    create(args: unknown): Promise<T>;
    createMany(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<T>;
    delete(args: unknown): Promise<T>;
    deleteMany(args?: unknown): Promise<unknown>;
    upsert(args: unknown): Promise<T>;
    aggregate(args: unknown): Promise<unknown>;
  }

  export namespace Prisma {
    export type PrismaClientOptions = Record<string, unknown>;
    export type TransactionClient = PrismaClient;
    export class Decimal {
      constructor(value: string | number | bigint | Decimal);
      toNumber(): number;
      toString(): string;
      valueOf(): number;
    }
    export class PrismaClientKnownRequestError extends Error {
      code: string;
    }
  }

  export const Prisma: {
    Decimal: typeof Prisma.Decimal;
    PrismaClientKnownRequestError: typeof Prisma.PrismaClientKnownRequestError;
  };

  export type TransactionClient = PrismaClient;

  export class PrismaClient<
    T extends PrismaClientOptions = PrismaClientOptions,
    U = never,
    V = DefaultArgs
  > {
    constructor(options?: T);
    $connect(): Promise<void>;
    $disconnect(): Promise<void>;
    $use(cb: unknown): void;
    $transaction<P>(promises: P): Promise<P>;
    $transaction<R>(fn: (client: PrismaClient) => Promise<R>): Promise<R>;
    $extends<ExtArgs = DefaultArgs>(...args: any[]): PrismaClient<T, U, ExtArgs>;
    $executeRawUnsafe(query: string): Promise<unknown>;
    strategy: ModelDelegate<Strategy>;
    product: ModelDelegate<Product>;
    businessParameter: ModelDelegate<BusinessParameter>;
    leadStageTemplate: ModelDelegate<LeadStageTemplate>;
    leadTimeOverride: ModelDelegate<LeadTimeOverride>;
    purchaseOrder: ModelDelegate<PurchaseOrder>;
    batchTableRow: ModelDelegate<BatchTableRow>;
    purchaseOrderPayment: ModelDelegate<PurchaseOrderPayment>;
    salesWeek: ModelDelegate<SalesWeek>;
    salesWeekFinancials: ModelDelegate<SalesWeekFinancials>;
    profitAndLossWeek: ModelDelegate<ProfitAndLossWeek>;
    cashFlowWeek: ModelDelegate<CashFlowWeek>;
    monthlySummary: ModelDelegate<MonthlySummary>;
    quarterlySummary: ModelDelegate<QuarterlySummary>;
    logisticsEvent: ModelDelegate<LogisticsEvent>;
  }
}
