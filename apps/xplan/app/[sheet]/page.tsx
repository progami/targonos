import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { OpsPlanningWorkspace } from '@/components/sheets/ops-planning-workspace';
import { ProductSetupWorkspace } from '@/components/sheets/product-setup-workspace';
import { StrategiesWorkspace } from '@/components/sheets/strategies-workspace';
import {
  SalesPlanningGrid,
  SalesPlanningFocusControl,
  SalesPlanningFocusProvider,
} from '@/components/sheets/sales-planning-grid';
import { SalesPlanningVisual } from '@/components/sheets/sales-planning-visual';
import { SellerboardSyncControl } from '@/components/sheets/sellerboard-us-sync-control';
import {
  ProfitAndLossGrid,
  ProfitAndLossFiltersProvider,
  ProfitAndLossHeaderControls,
} from '@/components/sheets/fin-planning-pl-grid';
import { CashFlowGrid } from '@/components/sheets/fin-planning-cash-grid';
import { SheetViewToggle, type SheetViewMode } from '@/components/sheet-view-toggle';
import { SHEET_TOOLBAR_GROUP, SHEET_TOOLBAR_LABEL } from '@/components/sheet-toolbar';
import {
  FinancialTrendsSection,
  type FinancialMetricDefinition,
} from '@/components/sheets/financial-trends-section';
import {
  POProfitabilitySection,
  POProfitabilityFiltersProvider,
  POProfitabilityHeaderControls,
  type POProfitabilityData,
} from '@/components/sheets/po-profitability-section';
import type { OpsInputRow } from '@/components/sheets/custom-ops-planning-grid';
import type { OpsBatchRow } from '@/components/sheets/custom-ops-cost-grid';
import type { OpsTimelineRow } from '@/components/sheets/ops-planning-timeline';
import type { PurchasePaymentRow } from '@/components/sheets/custom-purchase-payments-grid';
import type {
  OpsPlanningCalculatorPayload,
  PurchaseOrderSerialized,
} from '@/components/sheets/ops-planning-workspace';
import prisma from '@/lib/prisma';
import { auth } from '@/lib/auth';
import {
  areStrategyAssignmentFieldsAvailable,
  buildStrategyAccessWhere,
  getStrategyActor,
  isStrategyAssignmentFieldsMissingError,
  markStrategyAssignmentFieldsUnavailable,
} from '@/lib/strategy-access';
import {
  Prisma,
  type BatchTableRow,
  type BusinessParameter,
  type CashFlowWeek,
  type LeadStageTemplate,
  type LeadTimeOverride,
  type Product,
  type ProfitAndLossWeek,
  type PurchaseOrder,
  type PurchaseOrderPayment,
  type SalesWeek,
} from '@targon/prisma-xplan';
import { getCanonicalSheetSlug, getSheetConfig } from '@/lib/sheets';
import { getWorkbookStatus } from '@/lib/workbook';
import { WorkbookLayout } from '@/components/workbook-layout';
import { ActiveStrategyIndicator } from '@/components/active-strategy-indicator';
import { getUtcDateForTimeZone } from '@/lib/utils/dates';
import {
  mapProducts,
  mapLeadStageTemplates,
  mapLeadOverrides,
  mapBusinessParameters,
  mapPurchaseOrders,
  mapSalesWeeks,
  mapProfitAndLossWeeks,
  mapCashFlowWeeks,
} from '@/lib/calculations/adapters';
import {
  buildProductCostIndex,
  buildLeadTimeProfiles,
  getLeadTimeProfile,
  normalizeBusinessParameters,
  computePurchaseOrderDerived,
  computeSalesPlan,
  computeProfitAndLoss,
  computeCashFlow,
  buildAllocationLedger,
  buildPoPnlRows,
  type PoPnlOrderMeta,
  type SalesWeekDerived,
  type PurchaseOrderDerived,
  type PurchaseOrderInput,
  type LeadTimeProfile,
  type BusinessParameterMap,
  type ActualWeekFinancials,
} from '@/lib/calculations';
import type { ProductCostSummary } from '@/lib/calculations/product';
import {
  createTimelineOrderFromDerived,
  type PurchaseTimelineOrder,
} from '@/lib/planning/timeline';
import { addMonths, endOfMonth, format, startOfMonth, startOfWeek } from 'date-fns';
import {
  getCalendarDateForWeek,
  weekNumberForDate,
  type YearSegment,
} from '@/lib/calculations/calendar';
import { findYearSegment, loadPlanningCalendar, resolveActiveYear } from '@/lib/planning';
import type { PlanningCalendar } from '@/lib/planning';
import { weekLabelForWeekNumber, type PlanningWeekConfig } from '@/lib/calculations/planning-week';
import { formatDateDisplay, toIsoDate } from '@/lib/utils/dates';
import {
  sellerboardReportTimeZoneForRegion,
  parseStrategyRegion,
  weekStartsOnForRegion,
  type StrategyRegion,
} from '@/lib/strategy-region';

const SALES_METRICS = [
  'stockStart',
  'actualSales',
  'forecastSales',
  'systemForecastSales',
  'finalSales',
  'finalSalesError',
  'stockWeeks',
  'stockEnd',
] as const;
type SalesMetric = (typeof SALES_METRICS)[number];

type SalesRow = {
  weekNumber: string;
  weekLabel: string;
  weekDate: string;
  arrivalNote?: string;
  [key: string]: string | undefined;
};

type BatchAllocationMeta = {
  orderCode: string;
  batchCode?: string | null;
  quantity: number;
  sellingPrice: number;
  landedUnitCost: number;
};

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  return formatDateDisplay(value);
}

function productLabel(product: { sku?: string | null; name: string }): string {
  const sku = typeof product.sku === 'string' ? product.sku.trim() : '';
  return sku.length ? sku : product.name;
}

function toNumberSafe(value: number | bigint | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  const numeric = Number(value);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function formatNumeric(value: number | null | undefined, fractionDigits = 2): string {
  if (value == null || Number.isNaN(value)) return '';
  return Number(value).toFixed(fractionDigits);
}

function formatPercentDecimal(value: number | null | undefined, fractionDigits = 4): string {
  if (value == null || Number.isNaN(value)) return '';
  return Number(value).toFixed(fractionDigits);
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  return `$${formatNumeric(value)}`;
}

function formatPercent(value: number | null | undefined, fractionDigits = 1): string {
  if (value == null || Number.isNaN(value)) return '';
  return `${(Number(value) * 100).toFixed(fractionDigits)}%`;
}

const DEFAULT_PAYMENT_LABELS: Record<number, string> = {
  1: 'Manufacturing Deposit (25%)',
  2: 'Manufacturing Production (25%)',
  3: 'Freight (100%)',
  4: 'Manufacturing Final (50%)',
  5: 'Tariff (100%)',
};

function buildPaymentLabel(category?: string | null, index?: number): string {
  const normalizedCategory = category?.trim().toLowerCase();
  if (normalizedCategory === 'manufacturing' && index != null) {
    return DEFAULT_PAYMENT_LABELS[index] ?? 'Manufacturing';
  }
  if (normalizedCategory === 'freight') return DEFAULT_PAYMENT_LABELS[3];
  if (normalizedCategory === 'tariff') return DEFAULT_PAYMENT_LABELS[5];

  const explicitLabel = category?.trim();
  if (explicitLabel) return explicitLabel;

  if (index != null && Number.isFinite(index)) {
    return DEFAULT_PAYMENT_LABELS[index] ?? `Payment ${index}`;
  }

  return 'Payment';
}

function serializeDate(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function serializePurchaseOrder(order: PurchaseOrderInput): PurchaseOrderSerialized {
  return {
    id: order.id,
    orderCode: order.orderCode,
    productId: order.productId,
    quantity: Number(order.quantity ?? 0),
    poDate: serializeDate(order.poDate),
    poWeekNumber: order.poWeekNumber ?? null,
    productionWeeks: order.productionWeeks ?? null,
    sourceWeeks: order.sourceWeeks ?? null,
    oceanWeeks: order.oceanWeeks ?? null,
    finalWeeks: order.finalWeeks ?? null,
    pay1Percent: order.pay1Percent ?? null,
    pay2Percent: order.pay2Percent ?? null,
    pay3Percent: order.pay3Percent ?? null,
    pay1Amount: order.pay1Amount ?? null,
    pay2Amount: order.pay2Amount ?? null,
    pay3Amount: order.pay3Amount ?? null,
    pay1Date: serializeDate(order.pay1Date),
    pay2Date: serializeDate(order.pay2Date),
    pay3Date: serializeDate(order.pay3Date),
    productionStart: serializeDate(order.productionStart),
    productionComplete: serializeDate(order.productionComplete),
    productionCompleteWeekNumber: order.productionCompleteWeekNumber ?? null,
    sourceDeparture: serializeDate(order.sourceDeparture),
    sourceDepartureWeekNumber: order.sourceDepartureWeekNumber ?? null,
    transportReference: order.transportReference ?? null,
    createdAt: serializeDate(order.createdAt),
    shipName: order.shipName ?? null,
    containerNumber: order.containerNumber ?? null,
    portEta: serializeDate(order.portEta),
    portEtaWeekNumber: order.portEtaWeekNumber ?? null,
    inboundEta: serializeDate(order.inboundEta),
    inboundEtaWeekNumber: order.inboundEtaWeekNumber ?? null,
    availableDate: serializeDate(order.availableDate),
    availableWeekNumber: order.availableWeekNumber ?? null,
    totalLeadDays: order.totalLeadDays ?? null,
    status: order.status,
    notes: order.notes ?? null,
    payments:
      order.payments?.map((payment) => ({
        paymentIndex: payment.paymentIndex,
        percentage: payment.percentage ?? null,
        amountExpected: payment.amountExpected ?? null,
        amountPaid: payment.amountPaid ?? null,
        category: payment.category ?? null,
        label: payment.label ?? null,
        dueDate: serializeDate(payment.dueDate),
        dueWeekNumber: payment.dueWeekNumber ?? null,
        dueDateDefault: serializeDate(payment.dueDateDefault ?? null),
        dueWeekNumberDefault: payment.dueWeekNumberDefault ?? null,
        dueDateSource: payment.dueDateSource,
      })) ?? [],
    overrideSellingPrice: order.overrideSellingPrice ?? null,
    overrideManufacturingCost: order.overrideManufacturingCost ?? null,
    overrideFreightCost: order.overrideFreightCost ?? null,
    overrideTariffRate: order.overrideTariffRate ?? null,
    overrideTacosPercent: order.overrideTacosPercent ?? null,
    overrideFbaFee: order.overrideFbaFee ?? null,
    overrideReferralRate: order.overrideReferralRate ?? null,
    overrideStoragePerMonth: order.overrideStoragePerMonth ?? null,
    batchTableRows:
      order.batchTableRows?.map((batch) => ({
        id: batch.id,
        batchCode: batch.batchCode ?? null,
        productId: batch.productId,
        quantity: toNumberSafe(batch.quantity),
        overrideSellingPrice: batch.overrideSellingPrice ?? null,
        overrideManufacturingCost: batch.overrideManufacturingCost ?? null,
        overrideFreightCost: batch.overrideFreightCost ?? null,
        overrideTariffRate: batch.overrideTariffRate ?? null,
        overrideTariffCost: batch.overrideTariffCost ?? null,
        overrideTacosPercent: batch.overrideTacosPercent ?? null,
        overrideFbaFee: batch.overrideFbaFee ?? null,
        overrideReferralRate: batch.overrideReferralRate ?? null,
        overrideStoragePerMonth: batch.overrideStoragePerMonth ?? null,
      })) ?? [],
  };
}

function buildWeekRange(
  segment: YearSegment | null,
  calendar: PlanningCalendar['calendar'],
): number[] {
  if (segment) {
    return Array.from({ length: segment.weekCount }, (_, index) => segment.startWeekNumber + index);
  }
  const min = calendar.minWeekNumber;
  const max = calendar.maxWeekNumber;
  if (min == null || max == null) return [];
  const weeks: number[] = [];
  for (let week = min; week <= max; week += 1) {
    weeks.push(week);
  }
  return weeks;
}

function isWeekInSegment(weekNumber: number, segment: YearSegment | null): boolean {
  if (!segment) return true;
  return weekNumber >= segment.startWeekNumber && weekNumber <= segment.endWeekNumber;
}

function filterSummaryByYear<T extends { periodLabel: string }>(
  rows: T[],
  year: number | null,
): T[] {
  if (year == null) return rows;
  const suffix = String(year);
  return rows.filter((row) => row.periodLabel.trim().endsWith(suffix));
}

function resolveViewMode(value: string | string[] | undefined): SheetViewMode {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === 'visual' ? 'visual' : 'tabular';
}

function VisualPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500 shadow-sm dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400">
      <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      <p className="mt-2 text-sm">{description}</p>
    </div>
  );
}

function limitRows<T>(rows: T[], limit: number): T[] {
  if (rows.length <= limit) return rows;
  return rows.slice(-limit);
}

function buildTrendSeries<T>(rows: T[], key: Extract<keyof T, string>) {
  const labels: string[] = [];
  const values: number[] = [];

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const raw = record[key];
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(numeric)) continue;

    let label = '';
    if (
      'periodLabel' in record &&
      typeof record.periodLabel === 'string' &&
      record.periodLabel.trim()
    ) {
      label = record.periodLabel;
    } else {
      // Get week label (relative to year segment)
      const weekLabel =
        'weekLabel' in record ? (record.weekLabel as string | number | null | undefined) : null;
      const weekNumber =
        'weekNumber' in record ? (record.weekNumber as string | number | null | undefined) : null;
      const weekIdentifier = weekLabel ?? weekNumber;

      // Get formatted date
      let formattedDate = '';
      if ('weekDate' in record) {
        const weekDate = record.weekDate as Date | string | number | null | undefined;
        if (weekDate != null) {
          formattedDate = formatDateDisplay(weekDate) ?? '';
        }
      }

      // Combine week number and date if both available
      if (
        weekIdentifier != null &&
        !(typeof weekIdentifier === 'string' && weekIdentifier.trim() === '')
      ) {
        if (formattedDate) {
          label = `W${weekIdentifier} · ${formattedDate}`;
        } else {
          label = `W${weekIdentifier}`;
        }
      } else if (formattedDate) {
        label = formattedDate;
      }
    }

    labels.push(label);
    values.push(Number(numeric));
  }

  return { labels, values };
}

function buildCashFlowTrendSeries<T>(rows: T[], key: Extract<keyof T, string>) {
  const labels: string[] = [];
  const values: number[] = [];
  const impactFlags: boolean[] = [];

  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    const record = row as Record<string, unknown>;
    const raw = record[key];
    const numeric = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(numeric)) continue;

    let label = '';
    if (
      'periodLabel' in record &&
      typeof record.periodLabel === 'string' &&
      record.periodLabel.trim()
    ) {
      label = record.periodLabel;
    } else {
      // Get week label (relative to year segment)
      const weekLabel =
        'weekLabel' in record ? (record.weekLabel as string | number | null | undefined) : null;
      const weekNumber =
        'weekNumber' in record ? (record.weekNumber as string | number | null | undefined) : null;
      const weekIdentifier = weekLabel ?? weekNumber;

      // Get formatted date
      let formattedDate = '';
      if ('weekDate' in record) {
        const weekDate = record.weekDate as Date | string | number | null | undefined;
        if (weekDate != null) {
          formattedDate = formatDateDisplay(weekDate) ?? '';
        }
      }

      // Combine week number and date if both available
      if (
        weekIdentifier != null &&
        !(typeof weekIdentifier === 'string' && weekIdentifier.trim() === '')
      ) {
        if (formattedDate) {
          label = `W${weekIdentifier} · ${formattedDate}`;
        } else {
          label = `W${weekIdentifier}`;
        }
      } else if (formattedDate) {
        label = formattedDate;
      }
    }

    const inventorySpend = record.inventorySpend as number | null | undefined;
    const hasImpact =
      typeof inventorySpend === 'number' &&
      Number.isFinite(inventorySpend) &&
      Math.abs(inventorySpend) > 0;

    labels.push(label);
    values.push(Number(numeric));
    impactFlags.push(hasImpact);
  }

  return { labels, values, impactFlags };
}

type SheetPageProps = {
  params: Promise<{ sheet: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function safeFindMany<T>(
  delegate: { findMany: (args?: unknown) => Promise<T> } | undefined,
  args: unknown,
  _fallback: T,
  label: string,
): Promise<T> {
  try {
    if (!delegate) {
      throw new Error(`[xplan] Prisma delegate for ${label} unavailable`);
    }

    return await delegate.findMany(args);
  } catch (error) {
    console.error(`[xplan] Prisma query for ${label} failed`, error);
    throw error;
  }
}

type BusinessParameterView = {
  id: string;
  label: string;
  value: string;
  type: 'numeric' | 'text';
};

type NestedHeaderCell =
  | string
  | { label: string; colspan?: number; rowspan?: number; title?: string };

const FINANCE_PARAMETER_LABELS = new Set(
  ['amazon payout delay (weeks)', 'starting cash', 'weekly fixed costs', 'fixed costs'].map(
    (label) => label.toLowerCase(),
  ),
);
const SALES_PARAMETER_LABELS = new Set(
  ['weeks of stock warning threshold', 'stockout warning (weeks)'].map((label) =>
    label.toLowerCase(),
  ),
);
const HIDDEN_PARAMETER_LABELS = new Set(
  [
    'forecast smoothing factor',
    'low stock threshold (%)',
    'inventory carrying cost (%/year)',
    'target gross margin (%)',
    'default moq (units)',
    'production buffer (%)',
  ].map((label) => label.toLowerCase()),
);
const OPERATIONS_PARAMETER_EXCLUDES = new Set([
  'product ordering',
  'supplier payment split 1 (%)',
  'supplier payment split 2 (%)',
  'supplier payment split 3 (%)',
  'supplier payment terms (weeks)',
]);

function isFinanceParameterLabel(label: string) {
  return FINANCE_PARAMETER_LABELS.has(label.trim().toLowerCase());
}

function isSalesParameterLabel(label: string) {
  return SALES_PARAMETER_LABELS.has(label.trim().toLowerCase());
}

function isHiddenParameterLabel(label: string) {
  return HIDDEN_PARAMETER_LABELS.has(label.trim().toLowerCase());
}

async function resolveStrategyId(
  searchParamStrategy: string | string[] | undefined,
  actor: ReturnType<typeof getStrategyActor>,
): Promise<string | null> {
  const prismaAny = prisma as unknown as Record<string, any>;

  try {
    // If strategyId is provided in URL, validate it exists
    if (typeof searchParamStrategy === 'string' && searchParamStrategy) {
      const exists = await prismaAny.strategy.findFirst({
        where: {
          id: searchParamStrategy,
          ...buildStrategyAccessWhere(actor),
        },
        select: { id: true },
      });
      if (exists) return searchParamStrategy;
    }

    const firstStrategy = await prismaAny.strategy.findFirst({
      where: buildStrategyAccessWhere(actor),
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (firstStrategy) return firstStrategy.id;

    return null;
  } catch (error) {
    if (!isStrategyAssignmentFieldsMissingError(error)) {
      throw error;
    }

    markStrategyAssignmentFieldsUnavailable();

    const where = buildStrategyAccessWhere(actor);

    if (typeof searchParamStrategy === 'string' && searchParamStrategy) {
      const exists = await prismaAny.strategy.findFirst({
        where: {
          id: searchParamStrategy,
          ...where,
        },
        select: { id: true },
      });
      if (exists) return searchParamStrategy;
    }

    const firstStrategy = await prismaAny.strategy.findFirst({
      where,
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    if (firstStrategy) return firstStrategy.id;

    return null;
  }
}

function columnKey(productIndex: number, metric: SalesMetric) {
  return `p${productIndex}_${metric}`;
}

function metricHeader(metric: SalesMetric): NestedHeaderCell {
  switch (metric) {
    case 'stockStart':
      return 'Stock Start';
    case 'actualSales':
      return 'Actual';
    case 'forecastSales':
      return 'Planner';
    case 'systemForecastSales':
      return 'System';
    case 'finalSales':
      return {
        label: 'Demand',
        title: 'Demand precedence: Override (if set) → Actual → Planner → System.',
      };
    case 'finalSalesError':
      return {
        label: '% Error',
        title: 'Percent error between actual and forecast sales when both values are present.',
      };
    case 'stockWeeks':
      return {
        label: 'Cover (w)',
        title:
          'Cover (weeks) = projected Stock Start ÷ projected Demand (higher is safer). ∞ means Demand is 0 for that week.',
      };
    case 'stockEnd':
      return 'Stock Qty';
    default:
      return metric;
  }
}

async function getProductSetupView(strategyId: string) {
  const prismaAny = prisma as unknown as Record<string, unknown>;
  const productDelegate = prismaAny.product as
    | { findMany: (args?: unknown) => Promise<Product[]> }
    | undefined;
  const businessParameterDelegate = prismaAny.businessParameter as
    | {
        findMany: (args?: unknown) => Promise<BusinessParameter[]>;
      }
    | undefined;

  const [products, businessParameters] = await Promise.all([
    safeFindMany<Product[]>(
      productDelegate,
      { where: { strategyId }, orderBy: { name: 'asc' } },
      [],
      'product',
    ),
    safeFindMany<BusinessParameter[]>(
      businessParameterDelegate,
      { where: { strategyId }, orderBy: { label: 'asc' } },
      [],
      'businessParameter',
    ),
  ]);

  const activeProducts = products.filter((product) => {
    const sku = product.sku?.trim();
    return product.isActive && sku && sku.length > 0;
  });

  const parameterInputs = mapBusinessParameters(businessParameters);
  const visibleParameterInputs = parameterInputs.filter(
    (parameter) => !isHiddenParameterLabel(parameter.label),
  );

  const operationsParameters = visibleParameterInputs
    .filter((parameter) => {
      const normalized = parameter.label.trim().toLowerCase();
      return (
        !isFinanceParameterLabel(parameter.label) &&
        !isSalesParameterLabel(parameter.label) &&
        !OPERATIONS_PARAMETER_EXCLUDES.has(normalized)
      );
    })
    .map<BusinessParameterView>((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      value:
        parameter.valueNumeric != null
          ? formatNumeric(parameter.valueNumeric)
          : (parameter.valueText ?? ''),
      type: parameter.valueNumeric != null ? 'numeric' : 'text',
    }));

  const salesParameters = visibleParameterInputs
    .filter((parameter) => isSalesParameterLabel(parameter.label))
    .map<BusinessParameterView>((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      value:
        parameter.valueNumeric != null
          ? formatNumeric(parameter.valueNumeric)
          : (parameter.valueText ?? ''),
      type: parameter.valueNumeric != null ? 'numeric' : 'text',
    }));

  const financeParameters = visibleParameterInputs
    .filter((parameter) => isFinanceParameterLabel(parameter.label))
    .map<BusinessParameterView>((parameter) => ({
      id: parameter.id,
      label: parameter.label,
      value:
        parameter.valueNumeric != null
          ? formatNumeric(parameter.valueNumeric)
          : (parameter.valueText ?? ''),
      type: parameter.valueNumeric != null ? 'numeric' : 'text',
    }));

  const productRows = activeProducts
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((product) => ({
      id: product.id,
      sku: product.sku ?? '',
      name: product.name,
    }));

  return {
    products: productRows,
    operationsParameters,
    salesParameters,
    financeParameters,
  };
}

async function loadOperationsContext(strategyId: string, calendar?: PlanningCalendar['calendar']) {
  const prismaAny = prisma as unknown as Record<string, unknown>;
  const productDelegate = prismaAny.product as
    | { findMany: (args?: unknown) => Promise<Product[]> }
    | undefined;
  const leadStageDelegate = prismaAny.leadStageTemplate as
    | {
        findMany: (args?: unknown) => Promise<LeadStageTemplate[]>;
      }
    | undefined;
  const leadOverrideDelegate = prismaAny.leadTimeOverride as
    | {
        findMany: (args?: unknown) => Promise<LeadTimeOverride[]>;
      }
    | undefined;
  const businessParameterDelegate = prismaAny.businessParameter as
    | {
        findMany: (args?: unknown) => Promise<BusinessParameter[]>;
      }
    | undefined;
  const purchaseOrderDelegate = prismaAny.purchaseOrder as
    | {
        findMany: (
          args?: unknown,
        ) => Promise<Array<PurchaseOrder & { payments: PurchaseOrderPayment[] }>>;
      }
    | undefined;
  const batchTableRowDelegate = prismaAny.batchTableRow as
    | { findMany: (args?: unknown) => Promise<BatchTableRow[]> }
    | undefined;
  const paymentsDelegate = prismaAny.purchaseOrderPayment as
    | typeof prisma.purchaseOrderPayment
    | undefined;

  const [products, leadStages, overrides, businessParameters, purchaseOrders, batchTableRows] =
    await Promise.all([
      safeFindMany<Product[]>(
        productDelegate,
        { where: { strategyId }, orderBy: { name: 'asc' } },
        [],
        'product',
      ),
      safeFindMany<LeadStageTemplate[]>(
        leadStageDelegate,
        { orderBy: { sequence: 'asc' } },
        [],
        'leadStageTemplate',
      ),
      safeFindMany<LeadTimeOverride[]>(
        leadOverrideDelegate,
        { where: { product: { strategyId } } },
        [],
        'leadTimeOverride',
      ),
      safeFindMany<BusinessParameter[]>(
        businessParameterDelegate,
        { where: { strategyId }, orderBy: { label: 'asc' } },
        [],
        'businessParameter',
      ),
      safeFindMany<Array<PurchaseOrder & { payments: PurchaseOrderPayment[] }>>(
        purchaseOrderDelegate,
        {
          where: { strategyId },
          orderBy: [{ productionStart: 'asc' }, { orderCode: 'asc' }],
          include: {
            payments: { orderBy: { paymentIndex: 'asc' } },
          },
        },
        [],
        'purchaseOrder',
      ),
      safeFindMany<BatchTableRow[]>(
        batchTableRowDelegate,
        {
          where: { purchaseOrder: { strategyId } },
          orderBy: [{ purchaseOrderId: 'asc' }, { createdAt: 'asc' }],
        },
        [],
        'batchTableRow',
      ),
    ]);

  const productInputs = mapProducts(products);
  const productIndex = buildProductCostIndex(productInputs);
  const productNameById = new Map(products.map((product) => [product.id, productLabel(product)]));
  const leadProfiles = buildLeadTimeProfiles(
    mapLeadStageTemplates(leadStages),
    mapLeadOverrides(overrides),
    productInputs.map((product) => product.id),
  );
  const parameters = normalizeBusinessParameters(mapBusinessParameters(businessParameters));
  const batchesByOrder = new Map<string, typeof batchTableRows>();
  for (const batch of batchTableRows) {
    const list = batchesByOrder.get(batch.purchaseOrderId) ?? [];
    list.push(batch);
    batchesByOrder.set(batch.purchaseOrderId, list);
  }

  const purchaseOrdersWithBatches = purchaseOrders.map((order) => ({
    ...order,
    batchTableRows: (batchesByOrder.get(order.id) ?? []) as BatchTableRow[],
  })) as Array<
    (typeof purchaseOrders)[number] & {
      payments: PurchaseOrderPayment[];
      batchTableRows: BatchTableRow[];
    }
  >;

  const purchaseOrderInputsInitial = mapPurchaseOrders(purchaseOrdersWithBatches);

  const didSeedInvoices = await ensureDefaultSupplierInvoices({
    purchaseOrders: purchaseOrdersWithBatches,
    purchaseOrderInputs: purchaseOrderInputsInitial,
    productIndex,
    leadProfiles,
    parameters,
    paymentsDelegate,
    calendar,
  });

  const purchaseOrderInputs = didSeedInvoices
    ? mapPurchaseOrders(purchaseOrdersWithBatches)
    : purchaseOrderInputsInitial;

  return {
    productInputs,
    productIndex,
    productNameById,
    leadProfiles,
    parameters,
    purchaseOrderInputs,
    rawPurchaseOrders: purchaseOrdersWithBatches,
  };
}

async function ensureDefaultSupplierInvoices({
  purchaseOrders,
  purchaseOrderInputs,
  productIndex,
  leadProfiles,
  parameters,
  paymentsDelegate,
  calendar,
}: {
  purchaseOrders: Array<
    PurchaseOrder & { payments: PurchaseOrderPayment[]; batchTableRows: BatchTableRow[] }
  >;
  purchaseOrderInputs: PurchaseOrderInput[];
  productIndex: Map<string, ProductCostSummary>;
  leadProfiles: Map<string, LeadTimeProfile>;
  parameters: BusinessParameterMap;
  paymentsDelegate?: typeof prisma.purchaseOrderPayment;
  calendar?: PlanningCalendar['calendar'];
}): Promise<boolean> {
  if (!paymentsDelegate) {
    console.warn('[xplan] purchase order payments delegate unavailable; skipping invoice seeding');
    return false;
  }

  let didSeedInvoices = false;
  for (let index = 0; index < purchaseOrders.length; index += 1) {
    const record = purchaseOrders[index];
    const input = purchaseOrderInputs[index];
    if (!input) continue;
    const profile = getLeadTimeProfile(input.productId, leadProfiles);
    if (!profile) continue;
    const derived = computePurchaseOrderDerived(input, productIndex, profile, parameters, {
      calendar,
    });
    if (!derived.plannedPayments.length) continue;

    const existingByIndex = new Map<number, PurchaseOrderPayment>();
    for (const payment of record.payments) {
      existingByIndex.set(payment.paymentIndex, payment);
    }

    const updates: Promise<PurchaseOrderPayment | null>[] = [];

    for (const planned of derived.plannedPayments) {
      const amountNumber = Number(planned.plannedAmount);
      const amountValue = Number.isFinite(amountNumber) ? amountNumber : 0;
      const percentValue =
        planned.plannedPercent != null && Number.isFinite(planned.plannedPercent)
          ? Number(planned.plannedPercent)
          : null;
      const dueDateDefault =
        planned.plannedDefaultDate ??
        planned.plannedDate ??
        input.poDate ??
        record.poDate ??
        record.createdAt ??
        new Date();
      const dueDate = dueDateDefault;
      const dueWeekNumberDefault =
        planned.plannedDefaultWeekNumber ??
        (calendar ? weekNumberForDate(dueDateDefault, calendar) : null);
      const dueWeekNumber = dueWeekNumberDefault;

      const percentageDecimal =
        percentValue != null ? new Prisma.Decimal(percentValue.toFixed(4)) : null;
      const amountExpectedDecimal = new Prisma.Decimal(Math.max(amountValue, 0).toFixed(2));

      const existing = existingByIndex.get(planned.paymentIndex);

      const existingDueDateSource = existing?.dueDateSource ?? 'SYSTEM';

      if (existing?.amountPaid != null) {
        continue;
      }

      if (existing) {
        const updatePayload: UpdatePaymentInput = {
          paymentIndex: planned.paymentIndex,
          category: planned.category,
          label: planned.label,
          dueDateDefault,
          dueWeekNumberDefault,
        };

        if (existingDueDateSource === 'SYSTEM') {
          updatePayload.dueDate = dueDate;
          updatePayload.dueWeekNumber = dueWeekNumber;
          updatePayload.dueDateSource = 'SYSTEM';
        }

        updatePayload.amountExpected = amountExpectedDecimal;
        updatePayload.percentage = percentageDecimal;

        if (Object.keys(updatePayload).length > 0) {
          updates.push(updatePurchaseOrderPayment(existing.id, updatePayload, paymentsDelegate));
        }
      } else {
        updates.push(
          createPurchaseOrderPayment(
            {
              purchaseOrderId: record.id,
              paymentIndex: planned.paymentIndex,
              dueDate,
              dueWeekNumber,
              dueDateDefault,
              dueWeekNumberDefault,
              dueDateSource: 'SYSTEM',
              percentage: percentageDecimal,
              amountExpected: amountExpectedDecimal,
              category: planned.category,
              label: planned.label,
            },
            paymentsDelegate,
          ),
        );
      }
    }

    if (updates.length > 0) {
      didSeedInvoices = true;
      const results = await Promise.all(updates);
      for (const result of results) {
        if (!result) continue;
        const idx = record.payments.findIndex(
          (payment) => payment.paymentIndex === result.paymentIndex,
        );
        if (idx === -1) {
          record.payments.push(result);
        } else {
          record.payments[idx] = result;
        }
      }
      record.payments.sort((a, b) => a.paymentIndex - b.paymentIndex);
    }
  }

  return didSeedInvoices;
}

type PaymentDueDateSource = 'SYSTEM' | 'USER';

const PAYMENT_METADATA_MISSING_REGEX =
  /Unknown argument `(?:category|label|amountExpected|amountPaid|dueWeekNumber|dueWeekNumberDefault)`/;

function isMissingPaymentMetadataError(error: unknown): error is { message: string } {
  if (typeof error !== 'object' || error === null) return false;
  const message = 'message' in error ? (error as { message?: unknown }).message : undefined;
  return typeof message === 'string' && PAYMENT_METADATA_MISSING_REGEX.test(message);
}

type SeedPaymentInput = {
  purchaseOrderId: string;
  paymentIndex: number;
  dueDate: Date;
  dueWeekNumber?: number | null;
  dueDateDefault: Date;
  dueWeekNumberDefault?: number | null;
  dueDateSource: PaymentDueDateSource;
  percentage: Prisma.Decimal | null;
  amountExpected: Prisma.Decimal;
  amountPaid?: Prisma.Decimal | null;
  category?: string;
  label?: string;
};

type UpdatePaymentInput = {
  paymentIndex?: number;
  dueDate?: Date;
  dueWeekNumber?: number | null;
  dueDateDefault?: Date;
  dueWeekNumberDefault?: number | null;
  dueDateSource?: PaymentDueDateSource;
  percentage?: Prisma.Decimal | null;
  amountExpected?: Prisma.Decimal | null;
  amountPaid?: Prisma.Decimal | null;
  category?: string;
  label?: string;
};

async function createPurchaseOrderPayment(
  data: SeedPaymentInput,
  delegate?: typeof prisma.purchaseOrderPayment,
): Promise<PurchaseOrderPayment | null> {
  const paymentsDelegate =
    delegate ??
    ((prisma as unknown as Record<string, unknown>).purchaseOrderPayment as
      | typeof prisma.purchaseOrderPayment
      | undefined);
  if (!paymentsDelegate) {
    console.warn('[xplan] purchaseOrderPayment delegate unavailable; skipping create');
    return null;
  }
  try {
    return await paymentsDelegate.create({ data });
  } catch (error) {
    if (isMissingPaymentMetadataError(error)) {
      const { amountExpected, dueDateDefault, dueWeekNumber, dueWeekNumberDefault, ...fallback } =
        data;
      void dueWeekNumber;
      void dueWeekNumberDefault;
      console.warn(
        '[xplan] purchase_order_payment.metadata-missing: run `pnpm --filter @targon/xplan prisma:migrate:deploy` to add amountExpected/amountPaid metadata columns',
      );
      const legacyData: Record<string, unknown> = {
        ...fallback,
      };
      if (dueDateDefault != null) {
        legacyData.dueDate = dueDateDefault;
      }
      legacyData.amount = amountExpected;
      return paymentsDelegate.create({ data: legacyData }).catch((fallbackError) => {
        console.error('Failed to seed supplier payment (fallback)', fallbackError);
        return null;
      });
    }

    console.error('Failed to seed supplier payment', error);
    return null;
  }
}

async function updatePurchaseOrderPayment(
  id: string,
  data: UpdatePaymentInput,
  delegate?: typeof prisma.purchaseOrderPayment,
): Promise<PurchaseOrderPayment | null> {
  const paymentsDelegate =
    delegate ??
    ((prisma as unknown as Record<string, unknown>).purchaseOrderPayment as
      | typeof prisma.purchaseOrderPayment
      | undefined);
  if (!paymentsDelegate) {
    console.warn('[xplan] purchaseOrderPayment delegate unavailable; skipping update');
    return null;
  }
  try {
    return await paymentsDelegate.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (isMissingPaymentMetadataError(error)) {
      const { amountExpected, dueDateDefault, dueWeekNumber, dueWeekNumberDefault, ...fallback } =
        data;
      void dueWeekNumber;
      void dueWeekNumberDefault;
      console.warn(
        '[xplan] purchase_order_payment.metadata-missing: run `pnpm --filter @targon/xplan prisma:migrate:deploy` to add amountExpected/amountPaid metadata columns',
      );
      const legacyData: Record<string, unknown> = {
        ...fallback,
      };
      if (amountExpected != null) legacyData.amount = amountExpected;
      if (dueDateDefault != null) legacyData.dueDate = dueDateDefault;
      return paymentsDelegate.update({ where: { id }, data: legacyData }).catch((fallbackError) => {
        console.error('Failed to update supplier payment (fallback)', fallbackError);
        return null;
      });
    }

    console.error('Failed to update supplier payment', error);
    return null;
  }
}

function deriveOrders(
  context: Awaited<ReturnType<typeof loadOperationsContext>>,
  calendar?: PlanningCalendar['calendar'],
  options: { includeDraft?: boolean } = {},
) {
  const includeDraft = options.includeDraft === true;
  return context.purchaseOrderInputs
    .map((order) => {
      if (
        !includeDraft &&
        typeof order.status === 'string' &&
        order.status.trim().toUpperCase() === 'DRAFT'
      ) {
        return null;
      }
      if (!context.productIndex.has(order.productId)) return null;
      const profile = getLeadTimeProfile(order.productId, context.leadProfiles);
      const productNames =
        Array.isArray(order.batchTableRows) && order.batchTableRows.length > 1
          ? order.batchTableRows
              .map((batch) => context.productNameById.get(batch.productId) ?? '')
              .filter(Boolean)
              .slice(0, 3)
              .join(', ') + (order.batchTableRows.length > 3 ? '…' : '')
          : (context.productNameById.get(order.productId) ?? '');
      return {
        derived: computePurchaseOrderDerived(
          order,
          context.productIndex,
          profile,
          context.parameters,
          { calendar },
        ),
        input: order,
        productName: productNames,
      };
    })
    .filter(
      (
        item,
      ): item is {
        derived: PurchaseOrderDerived;
        input: (typeof context.purchaseOrderInputs)[number];
        productName: string;
      } => Boolean(item),
    );
}

// SalesWeekFinancials row from database
type SalesWeekFinancialsRow = {
  productId: string;
  weekNumber: number;
  actualRevenue: { toNumber: () => number } | number | null;
  actualAmazonFees: { toNumber: () => number } | number | null;
  actualReferralFees: { toNumber: () => number } | number | null;
  actualFbaFees: { toNumber: () => number } | number | null;
  actualRefunds: { toNumber: () => number } | number | null;
  actualPpcSpend: { toNumber: () => number } | number | null;
  actualNetProfit: { toNumber: () => number } | number | null;
};

function coerceDecimal(value: { toNumber: () => number } | number | null): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  return value.toNumber();
}

async function loadFinancialData(planning: PlanningCalendar, strategyId: string, asOfDate: Date) {
  const prismaAny = prisma as unknown as Record<string, unknown>;
  const salesDelegate = prismaAny.salesWeek as
    | {
        findMany: (args?: unknown) => Promise<SalesWeek[]>;
      }
    | undefined;
  const profitDelegate = prismaAny.profitAndLossWeek as
    | {
        findMany: (args?: unknown) => Promise<ProfitAndLossWeek[]>;
      }
    | undefined;
  const cashDelegate = prismaAny.cashFlowWeek as
    | {
        findMany: (args?: unknown) => Promise<CashFlowWeek[]>;
      }
    | undefined;
  const financialsDelegate = prismaAny.salesWeekFinancials as
    | {
        findMany: (args?: unknown) => Promise<SalesWeekFinancialsRow[]>;
      }
    | undefined;

  const [operations, salesRows, profitOverrideRows, cashOverrideRows] = await Promise.all([
    loadOperationsContext(strategyId, planning.calendar),
    safeFindMany<SalesWeek[]>(
      salesDelegate,
      { where: { strategyId }, orderBy: { weekNumber: 'asc' } },
      [],
      'salesWeek',
    ),
    safeFindMany<ProfitAndLossWeek[]>(
      profitDelegate,
      { where: { strategyId }, orderBy: { weekNumber: 'asc' } },
      [],
      'profitAndLossWeek',
    ),
    safeFindMany<CashFlowWeek[]>(
      cashDelegate,
      { where: { strategyId }, orderBy: { weekNumber: 'asc' } },
      [],
      'cashFlowWeek',
    ),
  ]);

  // SalesWeekFinancials table may not exist yet - gracefully handle missing table
  let financialsRows: SalesWeekFinancialsRow[] = [];
  if (financialsDelegate) {
    try {
      financialsRows = await financialsDelegate.findMany({
        where: { strategyId },
        orderBy: { weekNumber: 'asc' },
      });
    } catch {
      // Table doesn't exist yet - this is expected until migration is run
      console.log('[xplan] SalesWeekFinancials table not available, using empty array');
    }
  }

  const derivedOrders = deriveOrders(operations, planning.calendar);
  const salesOverrides = mapSalesWeeks(salesRows);
  const salesPlan = computeSalesPlan(
    salesOverrides,
    derivedOrders.map((item) => item.derived),
    {
      productIds: operations.productInputs.map((product) => product.id),
      calendar: planning.calendar,
      asOfDate,
    },
  );

  const profitOverrides = mapProfitAndLossWeeks(profitOverrideRows);
  const cashOverrides = mapCashFlowWeeks(cashOverrideRows);

  // Map SalesWeekFinancials rows to ActualWeekFinancials format
  const actualFinancials: ActualWeekFinancials[] = financialsRows.map((row) => ({
    productId: row.productId,
    weekNumber: row.weekNumber,
    actualRevenue: coerceDecimal(row.actualRevenue),
    actualAmazonFees: coerceDecimal(row.actualAmazonFees),
    actualReferralFees: coerceDecimal(row.actualReferralFees),
    actualFbaFees: coerceDecimal(row.actualFbaFees),
    actualRefunds: coerceDecimal(row.actualRefunds),
    actualPpcSpend: coerceDecimal(row.actualPpcSpend),
    actualNetProfit: coerceDecimal(row.actualNetProfit),
  }));

  const profit = computeProfitAndLoss(
    salesPlan,
    operations.productIndex,
    operations.parameters,
    profitOverrides,
    actualFinancials,
    { calendar: planning.calendar, asOfDate },
  );
  const cash = computeCashFlow(
    profit.weekly,
    derivedOrders.map((item) => item.derived),
    operations.parameters,
    cashOverrides,
    { calendar: planning.calendar },
  );
  return {
    operations,
    derivedOrders,
    salesOverrides,
    profitOverrides,
    salesPlan,
    actualFinancials,
    profit,
    cash,
  };
}

type FinancialData = Awaited<ReturnType<typeof loadFinancialData>>;

async function getOpsPlanningView(
  strategyId: string,
  planning?: PlanningCalendar,
  activeSegment?: YearSegment | null,
): Promise<{
  poTableRows: OpsInputRow[];
  batchTableRows: OpsBatchRow[];
  timelineRows: OpsTimelineRow[];
  timelineOrders: PurchaseTimelineOrder[];
  payments: PurchasePaymentRow[];
  calculator: OpsPlanningCalculatorPayload;
  timelineMonths: { start: string; end: string; label: string }[];
}> {
  const context = await loadOperationsContext(strategyId, planning?.calendar);
  const { rawPurchaseOrders } = context;

  const derivedOrders = deriveOrders(context, planning?.calendar, { includeDraft: true });

  const visibleOrders = derivedOrders;
  const visibleOrderIds = new Set(visibleOrders.map((item) => item.derived.id));

  const inputRows: OpsInputRow[] = visibleOrders.map(({ input, derived, productName }) => ({
    id: input.id,
    productId: input.productId,
    orderCode: input.orderCode,
    poDate: formatDate(input.poDate ?? null),
    productionStart: toIsoDate(input.productionStart ?? null) ?? '',
    productionComplete: toIsoDate(input.productionComplete ?? null) ?? '',
    sourceDeparture: toIsoDate(input.sourceDeparture ?? null) ?? '',
    portEta: toIsoDate(input.portEta ?? null) ?? '',
    availableDate: toIsoDate(input.availableDate ?? null) ?? '',
    productName,
    shipName: input.shipName ?? '',
    containerNumber: input.containerNumber ?? input.transportReference ?? '',
    quantity: formatNumeric(input.quantity ?? null, 0),
    pay1Date: formatDate(input.pay1Date ?? null),
    productionWeeks: formatNumeric(derived.stageProfile.productionWeeks),
    sourceWeeks: formatNumeric(derived.stageProfile.sourceWeeks),
    oceanWeeks: formatNumeric(derived.stageProfile.oceanWeeks),
    finalWeeks: formatNumeric(derived.stageProfile.finalWeeks),
    sellingPrice: formatNumeric(input.overrideSellingPrice ?? null),
    manufacturingCost: formatNumeric(input.overrideManufacturingCost ?? null),
    freightCost: formatNumeric(input.overrideFreightCost ?? null),
    tariffRate: formatPercentDecimal(input.overrideTariffRate ?? null),
    tacosPercent: formatPercentDecimal(input.overrideTacosPercent ?? null),
    fbaFee: formatNumeric(input.overrideFbaFee ?? null),
    referralRate: formatPercentDecimal(input.overrideReferralRate ?? null),
    storagePerMonth: formatNumeric(input.overrideStoragePerMonth ?? null),
    status: input.status,
  }));

  const timelineRows: OpsTimelineRow[] = visibleOrders.map(({ derived, productName }) => ({
    id: derived.id,
    orderCode: derived.orderCode,
    productName,
    landedUnitCost: formatCurrency(derived.landedUnitCost),
    poValue: formatCurrency(derived.plannedPoValue),
    paidAmount: formatCurrency(derived.paidAmount),
    paidPercent: formatPercent(derived.paidPercent),
    productionStart: formatDate(derived.productionStart),
    productionComplete: formatDate(derived.productionComplete),
    sourceDeparture: formatDate(derived.sourceDeparture),
    portEta: formatDate(derived.portEta),
    inboundEta: formatDate(derived.inboundEta),
    availableDate: formatDate(derived.availableDate),
    totalLeadDays: derived.totalLeadDays != null ? String(derived.totalLeadDays) : '',
    weeksUntilArrival: derived.weeksUntilArrival != null ? String(derived.weeksUntilArrival) : '',
  }));

  const timelineOrders: PurchaseTimelineOrder[] = visibleOrders.map(({ derived, productName }) =>
    createTimelineOrderFromDerived({ derived, productName }),
  );

  let timelineMonths: { start: string; end: string; label: string }[] = [];
  if (planning) {
    const segment = activeSegment ?? planning.yearSegments[0] ?? null;
    if (segment) {
      const segmentStartDate = getCalendarDateForWeek(segment.startWeekNumber, planning.calendar);
      const segmentEndDate = getCalendarDateForWeek(segment.endWeekNumber, planning.calendar);
      if (segmentStartDate && segmentEndDate) {
        let cursor = startOfMonth(segmentStartDate);
        const finalDate = endOfMonth(segmentEndDate);
        const buckets: { start: string; end: string; label: string }[] = [];
        while (cursor.getTime() <= finalDate.getTime()) {
          const bucketStart = cursor;
          const bucketEnd = endOfMonth(cursor);
          buckets.push({
            start: bucketStart.toISOString(),
            end: bucketEnd.toISOString(),
            label: format(bucketStart, 'MMM'),
          });
          cursor = addMonths(cursor, 1);
        }
        timelineMonths = buckets;
      }
    }
  }

  const derivedByOrderId = new Map(visibleOrders.map((item) => [item.derived.id, item.derived]));

  const payments = rawPurchaseOrders
    .filter((order) => visibleOrderIds.has(order.id))
    .flatMap((order) => {
      const derived = derivedByOrderId.get(order.id);
      const denominator = derived?.supplierCostTotal ?? derived?.plannedPoValue ?? 0;

      return order.payments.map((payment) => {
        const amountExpectedNumeric =
          payment.amountExpected != null ? Number(payment.amountExpected) : null;
        const amountPaidNumeric = payment.amountPaid != null ? Number(payment.amountPaid) : null;
        const percentNumeric =
          payment.percentage != null
            ? Number(payment.percentage)
            : denominator > 0 && amountPaidNumeric != null
              ? amountPaidNumeric / denominator
              : null;
        const dueDateIso = toIsoDate(payment.dueDate ?? null);
        const dueDateDefaultIso = toIsoDate(payment.dueDateDefault ?? payment.dueDate ?? null);
        let weekNumber = '';
        if (planning) {
          const planningWeekNumber =
            payment.dueWeekNumber ?? weekNumberForDate(payment.dueDate ?? null, planning.calendar);
          if (planningWeekNumber != null) {
            weekNumber = weekLabelForWeekNumber(planningWeekNumber, planning.yearSegments);
          }
        }

        return {
          id: payment.id,
          purchaseOrderId: order.id,
          orderCode: order.orderCode,
          category: payment.category ?? '',
          label: payment.label ?? buildPaymentLabel(payment.category, payment.paymentIndex),
          weekNumber,
          paymentIndex: payment.paymentIndex,
          dueDate: formatDate(dueDateIso),
          dueDateIso,
          dueDateDefault: formatDate(dueDateDefaultIso),
          dueDateDefaultIso,
          dueDateSource: payment.dueDateSource ?? 'SYSTEM',
          percentage: formatPercentDecimal(percentNumeric),
          amountExpected: formatNumeric(amountExpectedNumeric),
          amountPaid: formatNumeric(amountPaidNumeric),
        };
      });
    });

  const leadProfilesPayload = Array.from(context.leadProfiles.entries()).map(
    ([productId, profile]) => ({
      productId,
      productionWeeks: Number(profile.productionWeeks ?? 0),
      sourceWeeks: Number(profile.sourceWeeks ?? 0),
      oceanWeeks: Number(profile.oceanWeeks ?? 0),
      finalWeeks: Number(profile.finalWeeks ?? 0),
    }),
  );

  const batchRows = rawPurchaseOrders
    .filter((order) => visibleOrderIds.has(order.id))
    .flatMap((order) => {
      if (!Array.isArray(order.batchTableRows) || order.batchTableRows.length === 0) return [];
      return order.batchTableRows.map((batch) => ({
        id: batch.id,
        purchaseOrderId: order.id,
        orderCode: order.orderCode,
        batchCode: batch.batchCode ?? undefined,
        productId: batch.productId,
        productName: context.productNameById.get(batch.productId) ?? '',
        quantity: formatNumeric(toNumberSafe(batch.quantity), 0),
        sellingPrice: formatNumeric(
          batch.overrideSellingPrice ?? order.overrideSellingPrice ?? null,
        ),
        manufacturingCost: formatNumeric(
          batch.overrideManufacturingCost ?? order.overrideManufacturingCost ?? null,
        ),
        freightCost: formatNumeric(batch.overrideFreightCost ?? order.overrideFreightCost ?? null),
        tariffRate: formatPercentDecimal(
          batch.overrideTariffRate ?? order.overrideTariffRate ?? null,
        ),
        tariffCost: formatNumeric(batch.overrideTariffCost ?? null, 3),
        tacosPercent: formatPercentDecimal(
          batch.overrideTacosPercent ?? order.overrideTacosPercent ?? null,
        ),
        fbaFee: formatNumeric(batch.overrideFbaFee ?? order.overrideFbaFee ?? null),
        referralRate: formatPercentDecimal(
          batch.overrideReferralRate ?? order.overrideReferralRate ?? null,
        ),
        storagePerMonth: formatNumeric(
          batch.overrideStoragePerMonth ?? order.overrideStoragePerMonth ?? null,
        ),
        // Carton dimensions for CBM - cast to any to handle optional fields
        cartonSide1Cm: formatNumeric((batch as any).cartonSide1Cm ?? null, 2),
        cartonSide2Cm: formatNumeric((batch as any).cartonSide2Cm ?? null, 2),
        cartonSide3Cm: formatNumeric((batch as any).cartonSide3Cm ?? null, 2),
        cartonWeightKg: formatNumeric((batch as any).cartonWeightKg ?? null, 3),
        unitsPerCarton: formatNumeric(toNumberSafe((batch as any).unitsPerCarton), 0),
      }));
    });

  const calculator: OpsPlanningCalculatorPayload = {
    parameters: context.parameters,
    products: context.productInputs,
    leadProfiles: leadProfilesPayload,
    purchaseOrders: context.purchaseOrderInputs
      .filter((order) => visibleOrderIds.has(order.id))
      .map(serializePurchaseOrder),
  };

  return {
    poTableRows: inputRows,
    batchTableRows: batchRows,
    timelineRows,
    timelineOrders,
    payments,
    calculator,
    timelineMonths,
  };
}

function getSalesPlanningView(
  financialData: FinancialData,
  planning: PlanningCalendar,
  activeSegment: YearSegment | null,
) {
  const context = financialData.operations;
  const productList = [...context.productInputs].sort((a, b) =>
    productLabel(a).localeCompare(productLabel(b)),
  );
  const leadTimeByProduct = Object.fromEntries(
    productList.map((product) => {
      const profile = getLeadTimeProfile(product.id, context.leadProfiles);
      const profileTotal =
        Number(profile.productionWeeks ?? 0) +
        Number(profile.sourceWeeks ?? 0) +
        Number(profile.oceanWeeks ?? 0) +
        Number(profile.finalWeeks ?? 0);

      const fallback = context.parameters;
      const fallbackProfile = {
        productionWeeks: fallback.defaultProductionWeeks,
        sourceWeeks: fallback.defaultSourceWeeks,
        oceanWeeks: fallback.defaultOceanWeeks,
        finalWeeks: fallback.defaultFinalWeeks,
      };
      const fallbackTotal =
        Number(fallbackProfile.productionWeeks) +
        Number(fallbackProfile.sourceWeeks) +
        Number(fallbackProfile.oceanWeeks) +
        Number(fallbackProfile.finalWeeks);

      const resolved = profileTotal > 0 ? profile : fallbackProfile;
      const totalWeeks = profileTotal > 0 ? profileTotal : fallbackTotal;

      return [
        product.id,
        {
          productionWeeks: Number(resolved.productionWeeks ?? 0),
          sourceWeeks: Number(resolved.sourceWeeks ?? 0),
          oceanWeeks: Number(resolved.oceanWeeks ?? 0),
          finalWeeks: Number(resolved.finalWeeks ?? 0),
          totalWeeks: Number(totalWeeks ?? 0),
        },
      ];
    }),
  ) as Record<
    string,
    {
      productionWeeks: number;
      sourceWeeks: number;
      oceanWeeks: number;
      finalWeeks: number;
      totalWeeks: number;
    }
  >;

  const reorderCueByProduct = new Map<
    string,
    {
      startWeekNumber: number;
      startWeekLabel: string | null;
      startYear: number | null;
      startDate: string;
      breachWeekNumber: number;
      breachWeekLabel: string | null;
      breachYear: number | null;
      breachDate: string;
      leadTimeWeeks: number;
    }
  >();

  const warningThreshold = Number(context.parameters.stockWarningWeeks);
  if (Number.isFinite(warningThreshold) && warningThreshold > 0) {
    const describeWeek = (weekNumber: number): { year: number; weekLabel: string } | null => {
      const segment = planning.yearSegments.find(
        (entry) =>
          entry.weekCount > 0 &&
          weekNumber >= entry.startWeekNumber &&
          weekNumber <= entry.endWeekNumber,
      );
      if (!segment) return null;
      return { year: segment.year, weekLabel: String(weekNumber - segment.startWeekNumber + 1) };
    };

    const salesByProduct = new Map<string, SalesWeekDerived[]>();
    for (const entry of financialData.salesPlan) {
      const bucket = salesByProduct.get(entry.productId) ?? [];
      bucket.push(entry);
      salesByProduct.set(entry.productId, bucket);
    }

    productList.forEach((product) => {
      const leadProfile = leadTimeByProduct[product.id];
      const leadTimeWeeks = leadProfile
        ? Math.max(0, Math.ceil(Number(leadProfile.totalWeeks)))
        : 0;
      if (leadTimeWeeks <= 0) return;

      const series = salesByProduct.get(product.id);
      if (!series || series.length === 0) return;

      const sortedSeries = [...series].sort((a, b) => a.weekNumber - b.weekNumber);
      let hasBeenAbove = false;
      for (const row of sortedSeries) {
        const weeksValue = row.stockWeeks;
        if (Number.isNaN(weeksValue)) continue;

        const isBelow = weeksValue <= warningThreshold;
        if (isBelow && hasBeenAbove) {
          const breachWeekNumber = row.weekNumber;
          const startWeekNumber = breachWeekNumber - leadTimeWeeks;

          const startDesc = describeWeek(startWeekNumber);
          const breachDesc = describeWeek(breachWeekNumber);
          const startDate = formatDate(getCalendarDateForWeek(startWeekNumber, planning.calendar));
          const breachDate = formatDate(
            row.weekDate ?? getCalendarDateForWeek(breachWeekNumber, planning.calendar),
          );

          reorderCueByProduct.set(product.id, {
            startWeekNumber,
            startWeekLabel: startDesc?.weekLabel ?? null,
            startYear: startDesc?.year ?? null,
            startDate,
            breachWeekNumber,
            breachWeekLabel: breachDesc?.weekLabel ?? null,
            breachYear: breachDesc?.year ?? null,
            breachDate,
            leadTimeWeeks,
          });
          break;
        }

        if (!isBelow) {
          hasBeenAbove = true;
        }
      }
    });
  }
  const visibleWeeks = buildWeekRange(activeSegment, planning.calendar);
  const weekNumbers = visibleWeeks.length
    ? activeSegment
      ? (() => {
          const maxWeek = planning.calendar.maxWeekNumber ?? activeSegment.endWeekNumber;
          const endWeek =
            maxWeek != null
              ? Math.max(activeSegment.endWeekNumber, maxWeek)
              : activeSegment.endWeekNumber;
          return Array.from(
            { length: endWeek - activeSegment.startWeekNumber + 1 },
            (_, index) => activeSegment.startWeekNumber + index,
          );
        })()
      : visibleWeeks
    : activeSegment
      ? []
      : Array.from(new Set(financialData.salesPlan.map((row) => row.weekNumber))).sort(
          (a, b) => a - b,
        );
  const weekSet = new Set(weekNumbers);
  const visibleWeekSet = new Set(visibleWeeks);
  const hiddenRowIndices =
    activeSegment && weekNumbers.length > 0
      ? weekNumbers
          .map((weekNumber, index) => (!visibleWeekSet.has(weekNumber) ? index : null))
          .filter((value): value is number => value != null)
      : [];
  const columnMeta: Record<string, { productId: string; field: string }> = {};
  const columnKeys: string[] = [];
  const hasProducts = productList.length > 0;
  const nestedHeaders: NestedHeaderCell[][] = hasProducts
    ? [
        ['', '', ''],
        ['Week', 'Date', 'Inbound PO'],
      ]
    : [['Week', 'Date', 'Inbound PO']];

  productList.forEach((product, productIdx) => {
    nestedHeaders[0].push({ label: productLabel(product), colspan: SALES_METRICS.length });
    if (hasProducts) {
      nestedHeaders[1]?.push(...SALES_METRICS.map((metric) => metricHeader(metric)));
    }
    SALES_METRICS.forEach((metric) => {
      const key = columnKey(productIdx, metric);
      columnKeys.push(key);
      columnMeta[key] = { productId: product.id, field: metric };
    });
  });

  const salesLookup = new Map<string, SalesWeekDerived>();
  financialData.salesPlan.forEach((row) => {
    if (!weekSet.size || weekSet.has(row.weekNumber)) {
      salesLookup.set(`${row.productId}-${row.weekNumber}`, row);
    }
  });

  const weeksWithActualData = new Set<number>();
  for (const entry of financialData.salesPlan) {
    if (entry.hasActualData) {
      weeksWithActualData.add(entry.weekNumber);
    }
  }

  const segmentForWeek = (weekNumber: number): YearSegment | null => {
    if (!planning.yearSegments.length) return null;
    return (
      planning.yearSegments.find(
        (segment) =>
          segment.weekCount > 0 &&
          weekNumber >= segment.startWeekNumber &&
          weekNumber <= segment.endWeekNumber,
      ) ?? null
    );
  };

  const rows = weekNumbers.map((weekNumber) => {
    const segment = segmentForWeek(weekNumber);
    const weekLabel =
      segment != null ? String(weekNumber - segment.startWeekNumber + 1) : String(weekNumber);
    const calendarDate = getCalendarDateForWeek(weekNumber, planning.calendar);

    const row: SalesRow = {
      weekNumber: String(weekNumber),
      weekLabel,
      weekDate: calendarDate ? formatDate(calendarDate) : '',
      hasActualData: weeksWithActualData.has(weekNumber) ? 'true' : undefined,
    };

    const inboundSummary: InboundSummary = new Map();
    for (const product of productList) {
      const derived = salesLookup.get(`${product.id}-${weekNumber}`);
      for (const order of derived?.arrivalOrders ?? []) {
        addToInboundSummary(inboundSummary, order.shipName, productLabel(product), order.quantity);
      }
    }
    const inboundFormatted = formatInboundSummary(inboundSummary);
    row.arrivalDetail = inboundFormatted.display;
    if (inboundFormatted.note) {
      row.arrivalNote = inboundFormatted.note;
    }

    productList.forEach((product, productIdx) => {
      const keyRoot = `${product.id}-${weekNumber}`;
      const derived = salesLookup.get(keyRoot);
      if (!row.weekDate && derived?.weekDate) {
        row.weekDate = formatDate(derived.weekDate);
      }
      if (derived && derived.arrivals > 0) {
        row[`p${productIdx}_hasInbound`] = 'true';
      }
      row[`p${productIdx}_arrivals`] = formatNumeric(derived?.arrivals ?? null, 0);

      SALES_METRICS.forEach((metric) => {
        const key = columnKey(productIdx, metric);
        switch (metric) {
          case 'stockStart':
            row[key] = formatNumeric(derived?.stockStart ?? null, 0);
            break;
          case 'actualSales':
            row[key] = formatNumeric(derived?.actualSales ?? null, 0);
            break;
          case 'forecastSales':
            row[key] = formatNumeric(derived?.forecastSales ?? null, 0);
            break;
          case 'systemForecastSales':
            row[key] = formatNumeric(derived?.systemForecastSales ?? null, 0);
            break;
          case 'finalSales':
            row[key] = formatNumeric(derived?.finalSales ?? null, 0);
            if (derived?.finalSalesSource) {
              row[`p${productIdx}_finalSalesSource`] = derived.finalSalesSource;
            }
            if (derived?.systemForecastVersion) {
              row[`p${productIdx}_systemForecastVersion`] = derived.systemForecastVersion;
            }
            break;
          case 'finalSalesError':
            row[key] = formatPercent(derived?.finalPercentError ?? null, 1);
            break;
          case 'stockWeeks':
            if (derived?.stockWeeks == null) {
              row[key] = '';
            } else if (!Number.isFinite(derived.stockWeeks)) {
              row[key] = '∞';
            } else {
              row[key] = formatNumeric(derived.stockWeeks, 2);
            }
            break;
          case 'stockEnd':
            row[key] = formatNumeric(derived?.stockEnd ?? null, 0);
            break;
          default:
            break;
        }
      });
    });

    return row;
  });

  const batchAllocations = new Map<string, BatchAllocationMeta[]>();
  productList.forEach((product, productIdx) => {
    weekNumbers.forEach((weekNumber) => {
      const derived = salesLookup.get(`${product.id}-${weekNumber}`);
      if (derived?.batchAllocations && derived.batchAllocations.length > 0) {
        const key = columnKey(productIdx, 'finalSales');
        const cellKey = `${weekNumber}-${key}`;
        batchAllocations.set(
          cellKey,
          derived.batchAllocations.map((alloc) => ({
            orderCode: alloc.orderCode,
            batchCode: alloc.batchCode,
            quantity: alloc.quantity,
            sellingPrice: alloc.sellingPrice,
            landedUnitCost: alloc.landedUnitCost,
          })),
        );
      }
    });
  });

  const hiddenRowSet = new Set(hiddenRowIndices);
  const visibleRows =
    hiddenRowIndices.length > 0 ? rows.filter((_, index) => !hiddenRowSet.has(index)) : rows;

  return {
    rows,
    visibleRows,
    columnMeta,
    columnKeys,
    nestedHeaders,
    productOptions: productList.map((product) => ({ id: product.id, name: productLabel(product) })),
    stockWarningWeeks: context.parameters.stockWarningWeeks,
    leadTimeByProduct,
    batchAllocations,
    reorderCueByProduct,
    hiddenRowIndices,
  };
}

type InboundSummary = Map<string, { shipName: string | null; items: Map<string, number> }>;

function addToInboundSummary(
  summary: InboundSummary,
  shipName: string | null | undefined,
  productName: string,
  quantity: number,
) {
  const key = shipName ?? '—';
  const entry = summary.get(key) ?? { shipName: shipName ?? null, items: new Map() };
  const current = entry.items.get(productName) ?? 0;
  entry.items.set(productName, current + quantity);
  summary.set(key, entry);
}

function formatInboundSummary(summary: InboundSummary): { display: string; note: string } {
  if (!summary.size) return { display: '', note: '' };
  const displayLines: string[] = [];
  const noteLines: string[] = [];

  summary.forEach((entry) => {
    const ship = entry.shipName && entry.shipName.trim().length ? entry.shipName : '—';
    const totalQuantity = Array.from(entry.items.values()).reduce((sum, qty) => {
      return Number.isFinite(qty) ? sum + qty : sum;
    }, 0);
    const skuParts = Array.from(entry.items.entries())
      .filter(([, qty]) => Number.isFinite(qty) && qty > 0)
      .map(([name, qty]) => `${name}: ${formatNumeric(qty, 0)} units`);

    const totalLabel =
      Number.isFinite(totalQuantity) && totalQuantity > 0
        ? `${ship} - ${formatNumeric(totalQuantity, 0)}`
        : ship;

    displayLines.push(totalLabel);
    if (skuParts.length) {
      noteLines.push(`${ship}:`, ...skuParts);
    }
  });

  const note = noteLines.length > 0 ? `Inbound Breakdown:\n${noteLines.join('\n')}` : '';

  return { display: displayLines.join('\n'), note };
}

function getProfitAndLossView(
  financialData: FinancialData,
  activeSegment: YearSegment | null,
  activeYear: number | null,
) {
  const { weekly, monthly, quarterly } = financialData.profit;
  const filteredWeekly = weekly.filter((entry) => isWeekInSegment(entry.weekNumber, activeSegment));
  const monthlySummary = filterSummaryByYear(monthly, activeYear);
  const quarterlySummary = filterSummaryByYear(quarterly, activeYear);
  const segmentStart = activeSegment?.startWeekNumber ?? null;

  // Build lookup for weeks with actual data from salesPlan
  const weeksWithActualData = new Set<number>();
  for (const entry of financialData.salesPlan) {
    if (entry.hasActualData) {
      weeksWithActualData.add(entry.weekNumber);
    }
  }

  return {
    weekly: filteredWeekly.map((entry) => ({
      weekNumber: String(entry.weekNumber),
      weekLabel:
        segmentStart != null
          ? String(entry.weekNumber - segmentStart + 1)
          : String(entry.weekNumber),
      weekDate: entry.weekDate ? formatDate(entry.weekDate) : '',
      units: formatNumeric(entry.units, 0),
      revenue: formatNumeric(entry.revenue),
      cogs: formatNumeric(entry.cogs),
      grossProfit: formatNumeric(entry.grossProfit),
      grossMargin: formatPercentDecimal(entry.grossMargin),
      amazonFees: formatNumeric(entry.amazonFees),
      ppcSpend: formatNumeric(entry.ppcSpend),
      // OPEX = Fixed Costs only (PPC is part of GP calculation, not OPEX)
      fixedCosts: formatNumeric(entry.fixedCosts),
      netProfit: formatNumeric(entry.netProfit),
      netMargin: formatPercentDecimal(entry.revenue === 0 ? 0 : entry.netProfit / entry.revenue),
      hasActualData: weeksWithActualData.has(entry.weekNumber) ? 'true' : undefined,
    })),
    monthlySummary: monthlySummary.map((entry) => ({
      periodLabel: entry.periodLabel,
      revenue: formatNumeric(entry.revenue),
      cogs: formatNumeric(entry.cogs),
      grossProfit: formatNumeric(entry.grossProfit),
      amazonFees: formatNumeric(entry.amazonFees),
      ppcSpend: formatNumeric(entry.ppcSpend),
      fixedCosts: formatNumeric(entry.fixedCosts),
      netProfit: formatNumeric(entry.netProfit),
    })),
    quarterlySummary: quarterlySummary.map((entry) => ({
      periodLabel: entry.periodLabel,
      revenue: formatNumeric(entry.revenue),
      cogs: formatNumeric(entry.cogs),
      grossProfit: formatNumeric(entry.grossProfit),
      amazonFees: formatNumeric(entry.amazonFees),
      ppcSpend: formatNumeric(entry.ppcSpend),
      fixedCosts: formatNumeric(entry.fixedCosts),
      netProfit: formatNumeric(entry.netProfit),
    })),
  };
}

function getCashFlowView(
  financialData: FinancialData,
  activeSegment: YearSegment | null,
  _activeYear: number | null,
) {
  const { weekly } = financialData.cash;
  const filteredWeekly = weekly.filter((entry) => isWeekInSegment(entry.weekNumber, activeSegment));
  const segmentStart = activeSegment?.startWeekNumber ?? null;

  // Build lookup for weeks with actual data from salesPlan
  const weeksWithActualData = new Set<number>();
  for (const entry of financialData.salesPlan) {
    if (entry.hasActualData) {
      weeksWithActualData.add(entry.weekNumber);
    }
  }

  return {
    weekly: filteredWeekly.map((entry) => ({
      weekNumber: String(entry.weekNumber),
      weekLabel:
        segmentStart != null
          ? String(entry.weekNumber - segmentStart + 1)
          : String(entry.weekNumber),
      weekDate: entry.weekDate ? formatDate(entry.weekDate) : '',
      amazonPayout: formatNumeric(entry.amazonPayout),
      inventorySpend: formatNumeric(entry.inventorySpend),
      fixedCosts: formatNumeric(entry.fixedCosts),
      netCash: formatNumeric(entry.netCash),
      cashBalance: formatNumeric(entry.cashBalance),
      hasActualData: weeksWithActualData.has(entry.weekNumber) ? 'true' : undefined,
    })),
  };
}

type POProfitabilityDataset = {
  data: POProfitabilityData[];
  totals: {
    units: number;
    revenue: number;
    cogs: number;
    amazonFees: number;
    ppcSpend: number;
    fixedCosts: number;
    grossProfit: number;
    netProfit: number;
  };
  unattributed: {
    units: number;
    revenue: number;
    cogs: number;
    amazonFees: number;
    ppcSpend: number;
    fixedCosts: number;
    grossProfit: number;
    netProfit: number;
  };
};

function getPOProfitabilityView(
  financialData: FinancialData,
  planning: PlanningCalendar,
  asOfDate: Date,
): { projected: POProfitabilityDataset; real: POProfitabilityDataset } {
  const productIds = financialData.operations.productInputs.map((product) => product.id);
  const orders = financialData.derivedOrders.map((item) => item.derived);

  const orderMetaByCode = new Map<string, PoPnlOrderMeta>();
  for (const order of orders) {
    orderMetaByCode.set(order.orderCode, {
      orderCode: order.orderCode,
      status: order.status,
      productionStart: order.productionStart ?? null,
      availableDate: order.availableDate ?? null,
      totalLeadDays: order.totalLeadDays ?? null,
    });
  }

  const buildDataset = (mode: 'PROJECTED' | 'REAL'): POProfitabilityDataset => {
    const salesPlan = computeSalesPlan(financialData.salesOverrides, orders, {
      productIds,
      calendar: planning.calendar,
      mode,
      asOfDate,
    });
    const profit = computeProfitAndLoss(
      salesPlan,
      financialData.operations.productIndex,
      financialData.operations.parameters,
      financialData.profitOverrides,
      financialData.actualFinancials,
      { calendar: planning.calendar, asOfDate },
    );
    const ledger = buildAllocationLedger(salesPlan, financialData.operations.productIndex);
    const result = buildPoPnlRows({
      ledger,
      weeklyTargets: profit.weekly,
      productNameById: financialData.operations.productNameById,
      orderMetaByCode,
    });

    return {
      data: result.rows,
      totals: result.totals,
      unattributed: result.unattributed,
    };
  };

  return {
    projected: buildDataset('PROJECTED'),
    real: buildDataset('REAL'),
  };
}

export default async function SheetPage({ params, searchParams }: SheetPageProps) {
  const [routeParams, rawSearchParams, session] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({}),
    auth(),
  ]);
  const parsedSearch = rawSearchParams as Record<string, string | string[] | undefined>;

  const toQueryString = (params: Record<string, string | string[] | undefined>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value == null) continue;
      if (Array.isArray(value)) {
        for (const entry of value) {
          next.append(key, entry);
        }
        continue;
      }
      next.set(key, value);
    }
    return next;
  };

  const canonicalSlug = getCanonicalSheetSlug(routeParams.sheet);
  if (!canonicalSlug) notFound();

  if (canonicalSlug !== routeParams.sheet) {
    const nextParams = toQueryString(parsedSearch);
    const query = nextParams.toString();
    redirect(`/${canonicalSlug}${query ? `?${query}` : ''}`);
  }

  const config = getSheetConfig(canonicalSlug);
  if (!config) notFound();

  const actor = getStrategyActor(session);
  const viewer = {
    id: actor.id,
    email: actor.email,
    isSuperAdmin: actor.isSuperAdmin,
  };

  const requestedStrategyId =
    typeof parsedSearch.strategy === 'string' ? parsedSearch.strategy : null;
  const resolvedStrategyId = await resolveStrategyId(parsedSearch.strategy, actor);

  if (!resolvedStrategyId) {
    if (config.slug !== '1-strategies') {
      const nextParams = toQueryString(parsedSearch);
      nextParams.delete('strategy');
      const query = nextParams.toString();
      redirect(`/1-strategies${query ? `?${query}` : ''}`);
    }
  } else if (requestedStrategyId && requestedStrategyId !== resolvedStrategyId) {
    const nextParams = toQueryString(parsedSearch);
    nextParams.set('strategy', resolvedStrategyId);
    const query = nextParams.toString();
    redirect(`/${canonicalSlug}${query ? `?${query}` : ''}`);
  }

  const strategyId = resolvedStrategyId;

  const prismaAnyLocal = prisma as unknown as Record<string, any>;
  const activeStrategyRow = strategyId
    ? await prismaAnyLocal.strategy?.findUnique?.({
        where: { id: strategyId },
        select: { name: true, region: true },
      })
    : null;
  const activeStrategyName: string | null = activeStrategyRow?.name ?? null;
  const strategyRegion: StrategyRegion =
    strategyId && activeStrategyRow
      ? (() => {
          const parsedRegion = parseStrategyRegion(activeStrategyRow.region);
          if (!parsedRegion) {
            throw new Error('StrategyRegionInvalid');
          }
          return parsedRegion;
        })()
      : 'US';
  const weekStartsOn = weekStartsOnForRegion(strategyRegion);
  const reportTimeZone = strategyId ? sellerboardReportTimeZoneForRegion(strategyRegion) : null;
  const reportAsOfDate = reportTimeZone ? getUtcDateForTimeZone(new Date(), reportTimeZone) : new Date();

  const [workbookStatus, planningCalendar] = await Promise.all([
    getWorkbookStatus(),
    loadPlanningCalendar(weekStartsOn),
  ]);
  const sheetStatus = workbookStatus.sheets.find((item) => item.slug === config.slug);
  const activeYear = resolveActiveYear(parsedSearch.year, planningCalendar.yearSegments);
  const activeSegment = findYearSegment(activeYear, planningCalendar.yearSegments);
  const viewMode = resolveViewMode(parsedSearch.view);
  const anchorWeekNumber = planningCalendar.calendar.anchorWeekNumber;
  const anchorWeekDateIso = toIsoDate(planningCalendar.calendar.calendarStart ?? null);
  const planningWeekConfig: PlanningWeekConfig | null =
    anchorWeekNumber != null && anchorWeekDateIso
      ? {
          anchorWeekNumber,
          anchorWeekDateIso,
          weekStartsOn,
          minWeekNumber: planningCalendar.calendar.minWeekNumber,
          maxWeekNumber: planningCalendar.calendar.maxWeekNumber,
          yearSegments: planningCalendar.yearSegments,
        }
      : null;

  const controls: ReactNode[] = [];
  let contextPane: React.ReactNode = null;
  let wrapLayout: (node: ReactNode) => ReactNode = (node) => node;
  let tabularContent: React.ReactNode = null;
  let visualContent: React.ReactNode = null;

  const requireStrategyId = () => {
    if (!strategyId) {
      throw new Error('StrategyRequired');
    }
    return strategyId;
  };

  const getFinancialData = () => loadFinancialData(planningCalendar, requireStrategyId(), reportAsOfDate);
  const weeklyLabelControl = (label: string) => (
    <div key="weekly-label" className={SHEET_TOOLBAR_GROUP}>
      <span className={SHEET_TOOLBAR_LABEL}>{label}</span>
    </div>
  );

  switch (config.slug) {
    case '1-strategies': {
      // Type assertion for strategy model (Prisma types are generated but not resolved correctly at build time)
      const prismaAnyLocal = prisma as unknown as Record<string, any>;

      const countsSelect = {
        products: true,
        purchaseOrders: true,
        salesWeeks: true,
      };

      const orderBy = [{ updatedAt: 'desc' }];

      const strategySelect = {
        id: true,
        name: true,
        description: true,
        status: true,
        region: true,
        isDefault: true,
        createdById: true,
        createdByEmail: true,
        assigneeId: true,
        assigneeEmail: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: countsSelect },
      };

      const legacyStrategySelect = {
        id: true,
        name: true,
        description: true,
        status: true,
        region: true,
        isDefault: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: countsSelect },
      };

      let strategiesData: any[];

      if (areStrategyAssignmentFieldsAvailable()) {
        try {
          strategiesData = await prismaAnyLocal.strategy.findMany({
            where: buildStrategyAccessWhere(actor),
            orderBy,
            select: strategySelect,
          });
        } catch (error) {
          if (!isStrategyAssignmentFieldsMissingError(error)) {
            throw error;
          }
          markStrategyAssignmentFieldsUnavailable();
          strategiesData = await prismaAnyLocal.strategy.findMany({
            where: buildStrategyAccessWhere(actor),
            orderBy,
            select: legacyStrategySelect,
          });
        }
      } else {
        strategiesData = await prismaAnyLocal.strategy.findMany({
          where: buildStrategyAccessWhere(actor),
          orderBy,
          select: legacyStrategySelect,
        });
      }

      type StrategyRow = {
        id: string;
        name: string;
        description: string | null;
        status: string;
        region: 'US' | 'UK';
        isDefault: boolean;
        createdById: string | null;
        createdByEmail: string | null;
        assigneeId: string | null;
        assigneeEmail: string | null;
        createdAt: string;
        updatedAt: string;
        _count: {
          products: number;
          purchaseOrders: number;
          salesWeeks: number;
        };
      };

      const strategies: StrategyRow[] = strategiesData.map((s: any) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        region: s.region === 'UK' ? 'UK' : 'US',
        isDefault: Boolean(s.isDefault),
        createdById: s.createdById ?? null,
        createdByEmail: s.createdByEmail ?? null,
        assigneeId: s.assigneeId ?? null,
        assigneeEmail: s.assigneeEmail ?? null,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
        _count: s._count,
      }));
      tabularContent = (
        <StrategiesWorkspace
          strategies={strategies}
          activeStrategyId={resolvedStrategyId}
          viewer={viewer}
        />
      );
      visualContent = null;
      break;
    }
    case '2-product-setup': {
      const activeStrategyId = requireStrategyId();
      const view = await getProductSetupView(activeStrategyId);
      tabularContent = (
        <ProductSetupWorkspace
          strategyId={activeStrategyId}
          products={view.products}
          operationsParameters={view.operationsParameters}
          salesParameters={view.salesParameters}
          financeParameters={view.financeParameters}
        />
      );
      // Product setup doesn't need visual mode
      visualContent = null;
      break;
    }
    case '3-ops-planning': {
      const activeStrategyId = requireStrategyId();
      const view = await getOpsPlanningView(activeStrategyId, planningCalendar, activeSegment);
      tabularContent = (
        <OpsPlanningWorkspace
          strategyId={activeStrategyId}
          activeYear={activeYear}
          planningWeekConfig={planningWeekConfig}
          poTableRows={view.poTableRows}
          batchTableRows={view.batchTableRows}
          timeline={view.timelineRows}
          timelineOrders={view.timelineOrders}
          payments={view.payments}
          calculator={view.calculator}
          timelineMonths={view.timelineMonths}
          mode="tabular"
        />
      );
      visualContent = (
        <OpsPlanningWorkspace
          strategyId={activeStrategyId}
          activeYear={activeYear}
          planningWeekConfig={planningWeekConfig}
          poTableRows={view.poTableRows}
          batchTableRows={view.batchTableRows}
          timeline={view.timelineRows}
          timelineOrders={view.timelineOrders}
          payments={view.payments}
          calculator={view.calculator}
          timelineMonths={view.timelineMonths}
          mode="visual"
        />
      );
      break;
    }
    case '4-sales-planning': {
      const activeStrategyId = requireStrategyId();
      if (activeSegment && activeSegment.weekCount === 0) {
        tabularContent = (
          <VisualPlaceholder
            title="No planning weeks for this year"
            description={`No planning calendar coverage found for ${activeYear ?? 'this year'}. Select another year to continue.`}
          />
        );
        visualContent = tabularContent;
        break;
      }
      const data = await getFinancialData();
      const view = getSalesPlanningView(data, planningCalendar, activeSegment);
      controls.push(
        <SalesPlanningFocusControl key="sales-focus" productOptions={view.productOptions} />,
      );
      controls.push(
        <SellerboardSyncControl
          key="sellerboard-sync"
          isSuperAdmin={viewer.isSuperAdmin}
          strategyRegion={strategyRegion}
          strategyId={activeStrategyId}
        />,
      );
      wrapLayout = (node) => (
        <SalesPlanningFocusProvider key={activeStrategyId} strategyId={activeStrategyId}>
          {node}
        </SalesPlanningFocusProvider>
      );
      tabularContent = (
        <SalesPlanningGrid
          strategyId={activeStrategyId}
          rows={view.rows}
          hiddenRowIndices={view.hiddenRowIndices}
          columnMeta={view.columnMeta}
          columnKeys={view.columnKeys}
          nestedHeaders={view.nestedHeaders}
          productOptions={view.productOptions}
          stockWarningWeeks={view.stockWarningWeeks}
          leadTimeByProduct={view.leadTimeByProduct}
          batchAllocations={view.batchAllocations}
          reorderCueByProduct={view.reorderCueByProduct}
        />
      );
      visualContent = (
        <SalesPlanningVisual
          rows={view.visibleRows}
          columnMeta={view.columnMeta}
          columnKeys={view.columnKeys}
          productOptions={view.productOptions}
          stockWarningWeeks={view.stockWarningWeeks}
        />
      );
      break;
    }
    case '5-fin-planning-pl': {
      const activeStrategyId = requireStrategyId();
      if (activeSegment && activeSegment.weekCount === 0) {
        tabularContent = (
          <VisualPlaceholder
            title="No planning weeks for this year"
            description={`No planning calendar coverage found for ${activeYear ?? 'this year'}. Select another year to continue.`}
          />
        );
        visualContent = tabularContent;
        break;
      }
      const data = await getFinancialData();
      const view = getProfitAndLossView(data, activeSegment, activeYear);
      controls.push(<ProfitAndLossHeaderControls key="pnl-controls" />);
      wrapLayout = (node) => (
        <ProfitAndLossFiltersProvider key={activeStrategyId} strategyId={activeStrategyId}>
          {node}
        </ProfitAndLossFiltersProvider>
      );
      tabularContent = <ProfitAndLossGrid strategyId={activeStrategyId} weekly={view.weekly} />;

      const segmentStart = activeSegment?.startWeekNumber ?? null;
      const pnlWeeklyBase = data.profit.weekly
        .filter((entry) => isWeekInSegment(entry.weekNumber, activeSegment))
        .map((entry) => ({
          ...entry,
          weekLabel:
            segmentStart != null
              ? String(entry.weekNumber - segmentStart + 1)
              : String(entry.weekNumber),
        }));
      const pnlWeekly = activeSegment ? pnlWeeklyBase : limitRows(pnlWeeklyBase, 52);
      const pnlMonthly = limitRows(filterSummaryByYear(data.profit.monthly, activeYear), 12);
      const pnlQuarterly = limitRows(filterSummaryByYear(data.profit.quarterly, activeYear), 8);
      const metrics: FinancialMetricDefinition[] = [
        {
          key: 'revenue',
          title: 'Revenue',
          description: '',
          helper: '',
          series: {
            weekly: buildTrendSeries(pnlWeekly, 'revenue'),
            monthly: buildTrendSeries(pnlMonthly, 'revenue'),
            quarterly: buildTrendSeries(pnlQuarterly, 'revenue'),
          },
          format: 'currency',
          accent: 'sky',
        },
        {
          key: 'netProfit',
          title: 'Net profit',
          description: '',
          helper: '',
          series: {
            weekly: buildTrendSeries(pnlWeekly, 'netProfit'),
            monthly: buildTrendSeries(pnlMonthly, 'netProfit'),
            quarterly: buildTrendSeries(pnlQuarterly, 'netProfit'),
          },
          format: 'currency',
          accent: 'emerald',
        },
      ];

      visualContent = (
        <FinancialTrendsSection
          title="Performance graphs"
          description=""
          metrics={metrics}
          storageKey="xplan:visual:pnl"
        />
      );
      break;
    }
    case '6-po-profitability': {
      const activeStrategyId = requireStrategyId();
      const data = await getFinancialData();
      const view = getPOProfitabilityView(data, planningCalendar, reportAsOfDate);
      const productOptions = data.operations.productInputs
        .map((product) => ({ id: product.id, name: productLabel(product) }))
        .sort((a, b) => a.name.localeCompare(b.name));

      controls.push(
        <POProfitabilityHeaderControls
          key="po-profitability-controls"
          productOptions={productOptions}
        />,
      );
      wrapLayout = (node) => (
        <POProfitabilityFiltersProvider key={activeStrategyId} strategyId={activeStrategyId}>
          {node}
        </POProfitabilityFiltersProvider>
      );
      visualContent = (
        <POProfitabilitySection
          datasets={view}
          productOptions={productOptions}
          title="Margin trends"
          description="Performance across purchase orders by arrival date"
          showChart
          showTable={false}
        />
      );
      tabularContent = (
        <POProfitabilitySection
          datasets={view}
          productOptions={productOptions}
          title="P&L breakdown"
          description="FIFO-based PO-level P&L (Projected vs Real)"
          showChart={false}
          showTable
        />
      );
      break;
    }
    case '7-fin-planning-cash-flow': {
      const activeStrategyId = requireStrategyId();
      if (activeSegment && activeSegment.weekCount === 0) {
        tabularContent = (
          <VisualPlaceholder
            title="No planning weeks for this year"
            description={`No planning calendar coverage found for ${activeYear ?? 'this year'}. Select another year to continue.`}
          />
        );
        visualContent = tabularContent;
        break;
      }
      const data = await getFinancialData();
      const view = getCashFlowView(data, activeSegment, activeYear);
      tabularContent = <CashFlowGrid strategyId={activeStrategyId} weekly={view.weekly} />;

      const cashSegmentStart = activeSegment?.startWeekNumber ?? null;
      const cashWeeklyBase = data.cash.weekly
        .filter((entry) => isWeekInSegment(entry.weekNumber, activeSegment))
        .map((entry) => ({
          ...entry,
          weekLabel:
            cashSegmentStart != null
              ? String(entry.weekNumber - cashSegmentStart + 1)
              : String(entry.weekNumber),
        }));
      const cashWeekly = activeSegment ? cashWeeklyBase : limitRows(cashWeeklyBase, 52);

      const cashWeeklyWithOpening = (() => {
        if (!activeSegment || cashWeekly.length === 0) return cashWeekly;

        const startWeekNumber = activeSegment.startWeekNumber;
        const firstWeek =
          cashWeekly.find((row) => row.weekNumber === startWeekNumber) ?? cashWeekly[0];
        if (!firstWeek) return cashWeekly;

        const byWeek = new Map<number, (typeof data.cash.weekly)[number]>();
        for (const row of data.cash.weekly) {
          byWeek.set(row.weekNumber, row);
        }

        const previousWeek = byWeek.get(startWeekNumber - 1);
        const openingCashBalance =
          previousWeek?.cashBalance ?? firstWeek.cashBalance - firstWeek.netCash;

        return [
          {
            periodLabel: activeYear != null ? `Opening ${activeYear}` : 'Opening cash',
            weekNumber: startWeekNumber,
            weekDate: firstWeek.weekDate,
            amazonPayout: 0,
            inventorySpend: 0,
            fixedCosts: 0,
            netCash: 0,
            cashBalance: openingCashBalance,
          },
          ...cashWeekly,
        ];
      })();
      const cashMonthly = limitRows(filterSummaryByYear(data.cash.monthly, activeYear), 12);
      const cashQuarterly = limitRows(filterSummaryByYear(data.cash.quarterly, activeYear), 8);
      const metrics: FinancialMetricDefinition[] = [
        {
          key: 'closingCash',
          title: 'Ending cash',
          description: '',
          helper: '',
          series: {
            weekly: buildCashFlowTrendSeries(cashWeeklyWithOpening, 'cashBalance'),
            monthly: buildTrendSeries(cashMonthly, 'closingCash'),
            quarterly: buildTrendSeries(cashQuarterly, 'closingCash'),
          },
          format: 'currency',
          accent: 'violet',
        },
        {
          key: 'netCash',
          title: 'Net cash flow',
          description: '',
          helper: '',
          series: {
            weekly: buildCashFlowTrendSeries(cashWeekly, 'netCash'),
            monthly: buildTrendSeries(cashMonthly, 'netCash'),
            quarterly: buildTrendSeries(cashQuarterly, 'netCash'),
          },
          format: 'currency',
          accent: 'emerald',
        },
      ];

      visualContent = (
        <FinancialTrendsSection
          title="Cash flow charts"
          description=""
          metrics={metrics}
          storageKey="xplan:visual:cashflow"
        />
      );
      break;
    }
    default: {
      const placeholder = (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          <p>Implementation in progress for {config.label}. Check back soon.</p>
        </div>
      );
      tabularContent = placeholder;
      visualContent = placeholder;
      break;
    }
  }

  // Only show view toggle if both tabular and visual content exist
  // Use unshift to place view toggle first (leftmost) for consistent positioning
  const hasVisualMode = Boolean(visualContent);
  if (hasVisualMode) {
    controls.unshift(<SheetViewToggle key="sheet-view-toggle" value={viewMode} slug={config.slug} />);
  }
  const headerControls = controls.length ? controls : undefined;

  if (!tabularContent) {
    const fallback = (
      <VisualPlaceholder
        title={`${config.label} coming soon`}
        description={`Implementation in progress for ${config.label}. Check back soon.`}
      />
    );
    tabularContent = fallback;
    visualContent = fallback;
  } else if (!visualContent) {
    visualContent = (
      <VisualPlaceholder
        title="Visual view coming soon"
        description="Visualizations for this sheet are still under construction."
      />
    );
  }

  // If no visual content for this sheet, always show tabular
  const selectedContent = hasVisualMode && viewMode === 'visual' ? visualContent : tabularContent;

  const meta = {
    rows: sheetStatus?.recordCount,
    updated: sheetStatus?.lastUpdated,
  };

  const ribbon = activeStrategyName ? (
    <ActiveStrategyIndicator strategyName={activeStrategyName} />
  ) : null;

  const layout = (
    <WorkbookLayout
      sheets={workbookStatus.sheets}
      activeSlug={config.slug}
      planningYears={planningCalendar.yearSegments}
      activeYear={activeYear}
      reportTimeZone={reportTimeZone ?? undefined}
      meta={meta}
      ribbon={ribbon}
      contextPane={contextPane}
      headerControls={headerControls}
    >
      {selectedContent}
    </WorkbookLayout>
  );

  return wrapLayout(layout);
}
