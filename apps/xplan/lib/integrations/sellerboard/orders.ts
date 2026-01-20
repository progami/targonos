import { weekNumberForDate } from '@/lib/calculations/calendar';
import type { PlanningCalendar } from '@/lib/planning';
import { getUtcDateForTimeZone } from '@/lib/utils/dates';
import { parseCsv, hashCsvContent, parseSellerboardDateUtc } from './client';
import type { SellerboardWeeklyUnits, SellerboardOrdersParseResult } from './types';

export type { SellerboardWeeklyUnits, SellerboardOrdersParseResult };

/**
 * Parse Sellerboard Orders CSV and aggregate by product/week
 */
export function parseSellerboardOrdersWeeklyUnits(
  csv: string,
  planning: PlanningCalendar,
  options: {
    weekStartsOn: 0 | 1;
    reportTimeZone: string;
    productCodeHeader?: string;
    purchaseDateHeader?: string;
    unitsHeader?: string;
    statusHeader?: string;
    excludeStatuses?: string[];
  }
): SellerboardOrdersParseResult {
  const productCodeHeader = options.productCodeHeader ?? 'Products';
  const purchaseDateHeader = options.purchaseDateHeader ?? 'PurchaseDate(UTC)';
  const unitsHeader = options.unitsHeader ?? 'NumberOfItems';
  const statusHeader = options.statusHeader ?? 'OrderStatus';
  const excluded = new Set(
    (options.excludeStatuses ?? ['Cancelled']).map((item) => item.toLowerCase())
  );

  const rows = parseCsv(csv);
  if (rows.length === 0) {
    return {
      rowsParsed: 0,
      rowsSkipped: 0,
      weekStartsOn: options.weekStartsOn,
      weeklyUnits: [],
      csvSha256: hashCsvContent(csv),
      oldestPurchaseDateUtc: null,
      newestPurchaseDateUtc: null,
    };
  }

  const headers = rows[0].map((header) => header.trim());
  const headerIndex = new Map<string, number>();
  headers.forEach((header, index) => headerIndex.set(header, index));

  const required = [productCodeHeader, purchaseDateHeader, unitsHeader];
  for (const requiredHeader of required) {
    if (!headerIndex.has(requiredHeader)) {
      throw new Error(`Sellerboard CSV missing required column "${requiredHeader}"`);
    }
  }

  const getCell = (record: string[], key: string): string => {
    const index = headerIndex.get(key);
    if (index == null) return '';
    return record[index] ?? '';
  };

  const weeklyByProduct = new Map<string, Map<number, number>>();

  let rowsParsed = 0;
  let rowsSkipped = 0;
  let oldest: Date | null = null;
  let newest: Date | null = null;

  for (const record of rows.slice(1)) {
    if (record.length === 1 && record[0].trim() === '') continue;

    const productCode = getCell(record, productCodeHeader).trim();
    const purchaseDateValue = getCell(record, purchaseDateHeader);
    const unitsValue = getCell(record, unitsHeader);
    const statusValue = statusHeader ? getCell(record, statusHeader) : '';

    if (!productCode) {
      rowsSkipped += 1;
      continue;
    }

    if (statusValue && excluded.has(statusValue.trim().toLowerCase())) {
      rowsSkipped += 1;
      continue;
    }

    const purchaseDateUtc = parseSellerboardDateUtc(purchaseDateValue);
    if (!purchaseDateUtc) {
      rowsSkipped += 1;
      continue;
    }

    const rawUnits = Number(unitsValue);
    if (!Number.isFinite(rawUnits)) {
      rowsSkipped += 1;
      continue;
    }

    const units = Math.max(0, Math.round(rawUnits));
    const reportDate = getUtcDateForTimeZone(purchaseDateUtc, options.reportTimeZone);
    const weekNumber = weekNumberForDate(reportDate, planning.calendar);
    if (weekNumber == null) {
      rowsSkipped += 1;
      continue;
    }

    if (!oldest || purchaseDateUtc.getTime() < oldest.getTime()) {
      oldest = purchaseDateUtc;
    }
    if (!newest || purchaseDateUtc.getTime() > newest.getTime()) {
      newest = purchaseDateUtc;
    }

    const weekMap = weeklyByProduct.get(productCode) ?? new Map<number, number>();
    weekMap.set(weekNumber, (weekMap.get(weekNumber) ?? 0) + units);
    weeklyByProduct.set(productCode, weekMap);
    rowsParsed += 1;
  }

  const weeklyUnits: SellerboardWeeklyUnits[] = [];
  for (const [productCode, byWeek] of weeklyByProduct.entries()) {
    for (const [weekNumber, units] of byWeek.entries()) {
      const weekDate = planning.calendar.weekDates.get(weekNumber);
      if (!weekDate) continue;
      weeklyUnits.push({ productCode, weekNumber, units });
    }
  }

  weeklyUnits.sort((a, b) => {
    if (a.weekNumber === b.weekNumber) return a.productCode.localeCompare(b.productCode);
    return a.weekNumber - b.weekNumber;
  });

  return {
    rowsParsed,
    rowsSkipped,
    weekStartsOn: options.weekStartsOn,
    weeklyUnits,
    csvSha256: hashCsvContent(csv),
    oldestPurchaseDateUtc: oldest,
    newestPurchaseDateUtc: newest,
  };
}
