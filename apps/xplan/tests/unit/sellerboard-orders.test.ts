import { describe, expect, it } from 'vitest';
import { loadPlanningCalendar } from '@/lib/planning';
import { weekNumberForDate } from '@/lib/calculations/calendar';
import { parseCsv, parseSellerboardDateUtc } from '@/lib/integrations/sellerboard/client';
import { parseSellerboardOrdersWeeklyUnits } from '@/lib/integrations/sellerboard/orders';

describe('sellerboard orders parsing', () => {
  it('parses CSV with BOM and quoted commas', () => {
    const csv = '\uFEFF"a","b","c"\n"1","hello, world","3"\n';
    expect(parseCsv(csv)).toEqual([
      ['a', 'b', 'c'],
      ['1', 'hello, world', '3'],
    ]);
  });

  it('parses Sellerboard PurchaseDate(UTC) as a UTC Date', () => {
    const parsed = parseSellerboardDateUtc('12/30/2025 6:07:04 PM');
    expect(parsed?.toISOString()).toBe('2025-12-30T18:07:04.000Z');
  });

  it('aggregates weekly units per product and excludes cancelled orders', async () => {
    // Use Monday start (1) which is now the default for all regions
    const planning = await loadPlanningCalendar(1);
    const csv = [
      '"AmazonOrderId","PurchaseDate(UTC)","OrderStatus","NumberOfItems","Products"',
      '"111","1/1/2026 11:36:55 PM","Shipped","2.00","SKU-1"',
      '"222","1/2/2026 1:00:00 AM","Cancelled","1.00","SKU-1"',
      '"333","1/2/2026 5:00:00 AM","Shipped","1.00","SKU-1"',
      '',
    ].join('\n');

    const expectedWeek = weekNumberForDate(
      new Date(Date.UTC(2026, 0, 1, 23, 36, 55)),
      planning.calendar,
    );
    if (expectedWeek == null) {
      throw new Error('Expected planning week number');
    }

    const result = parseSellerboardOrdersWeeklyUnits(csv, planning, {
      weekStartsOn: 1,
      reportTimeZone: 'UTC',
      excludeStatuses: ['Cancelled'],
    });

    expect(result.weeklyUnits).toEqual([
      { productCode: 'SKU-1', weekNumber: expectedWeek, units: 3 },
    ]);
  });
});
