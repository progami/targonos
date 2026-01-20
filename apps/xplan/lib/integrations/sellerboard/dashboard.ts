import { weekNumberForDate } from '@/lib/calculations/calendar';
import type { PlanningCalendar } from '@/lib/planning';
import { parseCsv, hashCsvContent, parseSellerboardDateUtc } from './client';
import type {
  SellerboardWeeklyFinancials,
  SellerboardWeeklyTotals,
  SellerboardDashboardParseResult,
  SellerboardDashboardTotalsParseResult,
} from './types';

export type {
  SellerboardWeeklyFinancials,
  SellerboardWeeklyTotals,
  SellerboardDashboardParseResult,
  SellerboardDashboardTotalsParseResult,
};

type WeeklyFinancialsAccumulator = {
  revenue: number;
  amazonFees: number;
  referralFees: number;
  fbaFees: number;
  refunds: number;
  ppcSpend: number;
  netProfit: number;
};

/**
 * Parse Sellerboard Dashboard by Day CSV and aggregate by product/week
 *
 * Expected columns (configurable via options):
 * - Date: The date of the data row
 * - Product: SKU or ASIN identifier
 * - Ordered product sales: Revenue
 * - Amazon fees: Combined referral + FBA fees (or separate columns)
 * - Referral fees: Amazon referral fees
 * - FBA fees: Fulfillment by Amazon fees
 * - Refunds: Refunded amounts
 * - PPC spend: Pay-per-click advertising spend
 * - Net profit: Net profit after all costs
 */
export function parseSellerboardDashboardWeeklyFinancials(
  csv: string,
  planning: PlanningCalendar,
  options: {
    weekStartsOn: 0 | 1;
    dateHeader?: string;
    productHeader?: string;
    revenueHeader?: string;
    amazonFeesHeader?: string;
    referralFeesHeader?: string;
    fbaFeesHeader?: string;
    refundsHeader?: string;
    ppcSpendHeader?: string;
    netProfitHeader?: string;
  }
): SellerboardDashboardParseResult {
  const dateHeader = options.dateHeader ?? 'Date';
  const productHeader = options.productHeader ?? 'Product';
  const revenueHeader = options.revenueHeader ?? 'Ordered product sales';
  const amazonFeesHeader = options.amazonFeesHeader ?? 'Amazon fees';
  const referralFeesHeader = options.referralFeesHeader ?? 'Referral fees';
  const fbaFeesHeader = options.fbaFeesHeader ?? 'FBA fees';
  const refundsHeader = options.refundsHeader ?? 'Refunds';
  const ppcSpendHeader = options.ppcSpendHeader ?? 'PPC spend';
  const netProfitHeader = options.netProfitHeader ?? 'Net profit';

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return {
      rowsParsed: 0,
      rowsSkipped: 0,
      weekStartsOn: options.weekStartsOn,
      weeklyFinancials: [],
      csvSha256: hashCsvContent(csv),
      oldestDateUtc: null,
      newestDateUtc: null,
    };
  }

  const headers = rows[0].map((header) => header.trim());
  const headerIndex = new Map<string, number>();
  headers.forEach((header, index) => headerIndex.set(header, index));

  const required = [dateHeader, productHeader];
  for (const requiredHeader of required) {
    if (!headerIndex.has(requiredHeader)) {
      throw new Error(`Sellerboard Dashboard CSV missing required column "${requiredHeader}"`);
    }
  }

  const getCell = (record: string[], key: string): string => {
    const index = headerIndex.get(key);
    if (index == null) return '';
    return record[index] ?? '';
  };

  const parseNumeric = (value: string): number => {
    const trimmed = value.trim();
    if (!trimmed) return 0;

    const negativeParens = trimmed.startsWith('(') && trimmed.endsWith(')');
    const normalized = trimmed.replace(/[()]/g, '').replace(/[^0-9.,-]/g, '');
    const cleaned = normalized.replace(/,/g, '');
    const num = Number(cleaned);

    if (!Number.isFinite(num)) return 0;
    return negativeParens ? -num : num;
  };

  // Map: productCode -> weekNumber -> accumulated financials
  const weeklyByProduct = new Map<string, Map<number, WeeklyFinancialsAccumulator>>();

  let rowsParsed = 0;
  let rowsSkipped = 0;
  let oldest: Date | null = null;
  let newest: Date | null = null;

  for (const record of rows.slice(1)) {
    if (record.length === 1 && record[0].trim() === '') continue;

    const productCode = getCell(record, productHeader).trim();
    const dateValue = getCell(record, dateHeader);

    if (!productCode) {
      rowsSkipped += 1;
      continue;
    }

    const dateUtc = parseSellerboardDateUtc(dateValue);
    if (!dateUtc) {
      rowsSkipped += 1;
      continue;
    }

    const weekNumber = weekNumberForDate(dateUtc, planning.calendar);
    if (weekNumber == null) {
      rowsSkipped += 1;
      continue;
    }

    if (!oldest || dateUtc.getTime() < oldest.getTime()) {
      oldest = dateUtc;
    }
    if (!newest || dateUtc.getTime() > newest.getTime()) {
      newest = dateUtc;
    }

    // Parse financial values
    const revenue = parseNumeric(getCell(record, revenueHeader));
    const amazonFees = parseNumeric(getCell(record, amazonFeesHeader));
    const referralFees = parseNumeric(getCell(record, referralFeesHeader));
    const fbaFees = parseNumeric(getCell(record, fbaFeesHeader));
    const refunds = parseNumeric(getCell(record, refundsHeader));
    const ppcSpend = parseNumeric(getCell(record, ppcSpendHeader));
    const netProfit = parseNumeric(getCell(record, netProfitHeader));

    // Get or create product's week map
    const weekMap =
      weeklyByProduct.get(productCode) ?? new Map<number, WeeklyFinancialsAccumulator>();

    // Get or create week accumulator
    const existing = weekMap.get(weekNumber) ?? {
      revenue: 0,
      amazonFees: 0,
      referralFees: 0,
      fbaFees: 0,
      refunds: 0,
      ppcSpend: 0,
      netProfit: 0,
    };

    // Accumulate values
    existing.revenue += revenue;
    existing.amazonFees += amazonFees;
    existing.referralFees += referralFees;
    existing.fbaFees += fbaFees;
    existing.refunds += refunds;
    existing.ppcSpend += ppcSpend;
    existing.netProfit += netProfit;

    weekMap.set(weekNumber, existing);
    weeklyByProduct.set(productCode, weekMap);
    rowsParsed += 1;
  }

  // Convert to flat array
  const weeklyFinancials: SellerboardWeeklyFinancials[] = [];
  for (const [productCode, byWeek] of weeklyByProduct.entries()) {
    for (const [weekNumber, financials] of byWeek.entries()) {
      const weekDate = planning.calendar.weekDates.get(weekNumber);
      if (!weekDate) continue;
      weeklyFinancials.push({
        productCode,
        weekNumber,
        revenue: financials.revenue,
        amazonFees: financials.amazonFees,
        referralFees: financials.referralFees,
        fbaFees: financials.fbaFees,
        refunds: financials.refunds,
        ppcSpend: financials.ppcSpend,
        netProfit: financials.netProfit,
      });
    }
  }

  weeklyFinancials.sort((a, b) => {
    if (a.weekNumber === b.weekNumber) return a.productCode.localeCompare(b.productCode);
    return a.weekNumber - b.weekNumber;
  });

  return {
    rowsParsed,
    rowsSkipped,
    weekStartsOn: options.weekStartsOn,
    weeklyFinancials,
    csvSha256: hashCsvContent(csv),
    oldestDateUtc: oldest,
    newestDateUtc: newest,
  };
}

type WeeklyTotalsAccumulator = {
  revenue: number;
  units: number;
  orders: number;
  cogs: number;
  amazonFees: number;
  ppcSpend: number;
  grossProfit: number;
  netProfit: number;
  estimatedPayout: number;
};

function parseSellerboardDateLabel(value: string): Date | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const matchDateOnlyMdy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!matchDateOnlyMdy) return null;
  const month = Number(matchDateOnlyMdy[1]);
  const day = Number(matchDateOnlyMdy[2]);
  const year = Number(matchDateOnlyMdy[3]);
  if (![month, day, year].every(Number.isFinite)) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Use mid-day to avoid any DST edge cases; week bucketing relies on date-only.
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseSellerboardNumber(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const negativeParens = trimmed.startsWith('(') && trimmed.endsWith(')');
  const normalized = trimmed.replace(/[()]/g, '').replace(/[^0-9.,-]/g, '');
  const cleaned = normalized.replace(/,/g, '');
  const num = Number(cleaned);

  if (!Number.isFinite(num)) return 0;
  return negativeParens ? -num : num;
}

/**
 * Parse Sellerboard Dashboard by day CSV with "detailed breakdown" enabled and
 * aggregate by week (strategy totals, no Product column).
 */
export function parseSellerboardDashboardWeeklyTotals(
  csv: string,
  planning: PlanningCalendar,
  options: {
    weekStartsOn: 0 | 1;
    dateHeader?: string;
    salesOrganicHeader?: string;
    salesPpcHeader?: string;
    unitsOrganicHeader?: string;
    unitsPpcHeader?: string;
    ordersHeader?: string;
    estimatedPayoutHeader?: string;
    grossProfitHeader?: string;
    netProfitHeader?: string;
    productCostSalesHeader?: string;
    productCostUnsellableRefundsHeader?: string;
    productCostNonAmazonHeader?: string;
    productCostMissingFromInboundHeader?: string;
    sponsoredProductsSpendHeader?: string;
    sponsoredDisplaySpendHeader?: string;
    sponsoredBrandsSpendHeader?: string;
    sponsoredBrandsVideoSpendHeader?: string;
    googleAdsSpendHeader?: string;
    facebookAdsSpendHeader?: string;
  },
): SellerboardDashboardTotalsParseResult {
  const dateHeader = options.dateHeader ?? 'Date';
  const salesOrganicHeader = options.salesOrganicHeader ?? 'SalesOrganic';
  const salesPpcHeader = options.salesPpcHeader ?? 'SalesPPC';
  const unitsOrganicHeader = options.unitsOrganicHeader ?? 'UnitsOrganic';
  const unitsPpcHeader = options.unitsPpcHeader ?? 'UnitsPPC';
  const ordersHeader = options.ordersHeader ?? 'Orders';
  const estimatedPayoutHeader = options.estimatedPayoutHeader ?? 'EstimatedPayout';
  const grossProfitHeader = options.grossProfitHeader ?? 'GrossProfit';
  const netProfitHeader = options.netProfitHeader ?? 'NetProfit';
  const productCostSalesHeader = options.productCostSalesHeader ?? 'ProductCost Sales';
  const productCostUnsellableRefundsHeader =
    options.productCostUnsellableRefundsHeader ?? 'ProductCost Unsellable Refunds';
  const productCostNonAmazonHeader =
    options.productCostNonAmazonHeader ?? 'ProductCost Non-Amazon';
  const productCostMissingFromInboundHeader =
    options.productCostMissingFromInboundHeader ?? 'ProductCost MissingFromInbound';
  const sponsoredProductsSpendHeader =
    options.sponsoredProductsSpendHeader ?? 'SponsoredProducts';
  const sponsoredDisplaySpendHeader = options.sponsoredDisplaySpendHeader ?? 'SponsoredDisplay';
  const sponsoredBrandsSpendHeader = options.sponsoredBrandsSpendHeader ?? 'SponsoredBrands';
  const sponsoredBrandsVideoSpendHeader =
    options.sponsoredBrandsVideoSpendHeader ?? 'SponsoredBrandsVideo';
  const googleAdsSpendHeader = options.googleAdsSpendHeader ?? 'Google ads';
  const facebookAdsSpendHeader = options.facebookAdsSpendHeader ?? 'Facebook ads';
  const amazonFeeHeaders = [
    'GiftWrap',
    'Shipping',
    'Refund Commission',
    'Refund Principal',
    'Refund RefundCommission',
    'Value of returned items',
    'Adjustment_FBAPerUnitFulfillmentFee',
    'AmazonUpstreamProcessingFee',
    'AmazonUpstreamStorageTransportationFee',
    'Commission',
    'FBAPerUnitFulfillmentFee',
    'FBAStorageFee',
    'MicroDeposit',
    'STARStorageFee',
    'Subscription',
  ] as const;

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return {
      rowsParsed: 0,
      rowsSkipped: 0,
      weekStartsOn: options.weekStartsOn,
      weeklyTotals: [],
      csvSha256: hashCsvContent(csv),
      oldestDate: null,
      newestDate: null,
    };
  }

  const headers = rows[0].map((header) => header.trim());
  const headerIndex = new Map<string, number>();
  headers.forEach((header, index) => headerIndex.set(header, index));

  const required = [
    dateHeader,
    salesOrganicHeader,
    salesPpcHeader,
    unitsOrganicHeader,
    unitsPpcHeader,
    ordersHeader,
    estimatedPayoutHeader,
    grossProfitHeader,
    netProfitHeader,
    productCostSalesHeader,
    productCostUnsellableRefundsHeader,
    productCostNonAmazonHeader,
    productCostMissingFromInboundHeader,
    sponsoredProductsSpendHeader,
    sponsoredDisplaySpendHeader,
    sponsoredBrandsSpendHeader,
    sponsoredBrandsVideoSpendHeader,
    googleAdsSpendHeader,
    facebookAdsSpendHeader,
    ...amazonFeeHeaders,
  ];

  for (const requiredHeader of required) {
    if (!headerIndex.has(requiredHeader)) {
      throw new Error(`Sellerboard Dashboard CSV missing required column "${requiredHeader}"`);
    }
  }

  const getCell = (record: string[], key: string): string => {
    const index = headerIndex.get(key);
    if (index == null) return '';
    return record[index] ?? '';
  };

  const weeklyTotalsByWeek = new Map<number, WeeklyTotalsAccumulator>();

  let rowsParsed = 0;
  let rowsSkipped = 0;
  let oldest: Date | null = null;
  let newest: Date | null = null;

  for (const record of rows.slice(1)) {
    if (record.length === 1 && record[0].trim() === '') continue;

    const dateLabel = getCell(record, dateHeader);
    const date = parseSellerboardDateLabel(dateLabel);
    if (!date) {
      rowsSkipped += 1;
      continue;
    }

    const weekNumber = weekNumberForDate(date, planning.calendar);
    if (weekNumber == null) {
      rowsSkipped += 1;
      continue;
    }

    if (!oldest || date.getTime() < oldest.getTime()) {
      oldest = date;
    }
    if (!newest || date.getTime() > newest.getTime()) {
      newest = date;
    }

    const revenue =
      parseSellerboardNumber(getCell(record, salesOrganicHeader)) +
      parseSellerboardNumber(getCell(record, salesPpcHeader));
    const units =
      parseSellerboardNumber(getCell(record, unitsOrganicHeader)) +
      parseSellerboardNumber(getCell(record, unitsPpcHeader));
    const orders = parseSellerboardNumber(getCell(record, ordersHeader));
    const estimatedPayout = parseSellerboardNumber(getCell(record, estimatedPayoutHeader));
    const netProfit = parseSellerboardNumber(getCell(record, netProfitHeader));

    const rawCogs =
      parseSellerboardNumber(getCell(record, productCostSalesHeader)) +
      parseSellerboardNumber(getCell(record, productCostUnsellableRefundsHeader)) +
      parseSellerboardNumber(getCell(record, productCostNonAmazonHeader)) +
      parseSellerboardNumber(getCell(record, productCostMissingFromInboundHeader));
    const cogs = Math.abs(rawCogs);

    const rawPpcSpend =
      parseSellerboardNumber(getCell(record, sponsoredProductsSpendHeader)) +
      parseSellerboardNumber(getCell(record, sponsoredDisplaySpendHeader)) +
      parseSellerboardNumber(getCell(record, sponsoredBrandsSpendHeader)) +
      parseSellerboardNumber(getCell(record, sponsoredBrandsVideoSpendHeader)) +
      parseSellerboardNumber(getCell(record, googleAdsSpendHeader)) +
      parseSellerboardNumber(getCell(record, facebookAdsSpendHeader));
    const ppcSpend = Math.abs(rawPpcSpend);

    const rawAmazonFees = amazonFeeHeaders.reduce((sum, header) => {
      return sum + parseSellerboardNumber(getCell(record, header));
    }, 0);
    const amazonFees = Math.abs(rawAmazonFees);

    // Align to X-Plan conventions:
    // - Revenue is positive
    // - Costs are positive magnitudes
    // - Gross profit excludes PPC
    const grossProfit = revenue - cogs - amazonFees;

    const existing = weeklyTotalsByWeek.get(weekNumber) ?? {
      revenue: 0,
      units: 0,
      orders: 0,
      cogs: 0,
      amazonFees: 0,
      ppcSpend: 0,
      grossProfit: 0,
      netProfit: 0,
      estimatedPayout: 0,
    };

    existing.revenue += revenue;
    existing.units += units;
    existing.orders += orders;
    existing.cogs += cogs;
    existing.amazonFees += amazonFees;
    existing.ppcSpend += ppcSpend;
    existing.grossProfit += grossProfit;
    existing.netProfit += netProfit;
    existing.estimatedPayout += estimatedPayout;

    weeklyTotalsByWeek.set(weekNumber, existing);
    rowsParsed += 1;
  }

  const weeklyTotals: SellerboardWeeklyTotals[] = Array.from(weeklyTotalsByWeek.entries())
    .map(([weekNumber, totals]) => ({
      weekNumber,
      revenue: totals.revenue,
      units: totals.units,
      orders: totals.orders,
      cogs: totals.cogs,
      amazonFees: totals.amazonFees,
      ppcSpend: totals.ppcSpend,
      grossProfit: totals.grossProfit,
      netProfit: totals.netProfit,
      estimatedPayout: totals.estimatedPayout,
    }))
    .sort((a, b) => a.weekNumber - b.weekNumber);

  return {
    rowsParsed,
    rowsSkipped,
    weekStartsOn: options.weekStartsOn,
    weeklyTotals,
    csvSha256: hashCsvContent(csv),
    oldestDate: oldest,
    newestDate: newest,
  };
}
