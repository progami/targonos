import { describe, expect, it } from 'vitest';
import { loadPlanningCalendar } from '@/lib/planning';
import { parseSellerboardDashboardWeeklyTotals } from '@/lib/integrations/sellerboard/dashboard';

describe('sellerboard dashboard totals parsing', () => {
  it('does not require detailed Amazon fee breakdown columns', async () => {
    const planning = await loadPlanningCalendar(1);

    const headers = [
      'Date',
      'SalesOrganic',
      'SalesPPC',
      'UnitsOrganic',
      'UnitsPPC',
      'Orders',
      'EstimatedPayout',
      'GrossProfit',
      'NetProfit',
      'ProductCost Sales',
      'ProductCost Unsellable Refunds',
      'ProductCost Non-Amazon',
      'ProductCost MissingFromInbound',
      'SponsoredProducts',
      'SponsoredDisplay',
      'SponsoredBrands',
      'SponsoredBrandsVideo',
      'Google ads',
      'Facebook ads',
    ];

    const row = headers.map((header) => {
      if (header === 'Date') return '01/22/2026';
      return '0';
    });

    const csv = `${headers.join(',')}\n${row.join(',')}\n`;

    const result = parseSellerboardDashboardWeeklyTotals(csv, planning, { weekStartsOn: 1 });
    expect(result.rowsParsed).toBe(1);
    expect(result.weeklyTotals.length).toBe(1);
  });

  it('derives Amazon fees from GrossProfit', async () => {
    const planning = await loadPlanningCalendar(1);

    const headers = [
      'Date',
      'SalesOrganic',
      'SalesPPC',
      'UnitsOrganic',
      'UnitsPPC',
      'Orders',
      'EstimatedPayout',
      'GrossProfit',
      'NetProfit',
      'ProductCost Sales',
      'ProductCost Unsellable Refunds',
      'ProductCost Non-Amazon',
      'ProductCost MissingFromInbound',
      'SponsoredProducts',
      'SponsoredDisplay',
      'SponsoredBrands',
      'SponsoredBrandsVideo',
      'Google ads',
      'Facebook ads',
    ];

    const valuesByHeader: Record<string, string> = {
      Date: '01/22/2026',
      SalesOrganic: '10',
      SalesPPC: '0',
      UnitsOrganic: '1',
      UnitsPPC: '0',
      Orders: '1',
      EstimatedPayout: '0',
      'ProductCost Sales': '2',
      'ProductCost Unsellable Refunds': '0',
      'ProductCost Non-Amazon': '0',
      'ProductCost MissingFromInbound': '0',
      SponsoredProducts: '0',
      SponsoredDisplay: '0',
      SponsoredBrands: '0',
      SponsoredBrandsVideo: '0',
      'Google ads': '0',
      'Facebook ads': '0',
      GrossProfit: '7',
      NetProfit: '0',
    };

    const row = headers.map((header) => valuesByHeader[header] ?? '0');
    const csv = `${headers.join(',')}\n${row.join(',')}\n`;

    const result = parseSellerboardDashboardWeeklyTotals(csv, planning, { weekStartsOn: 1 });
    expect(result.weeklyTotals).toHaveLength(1);
    expect(result.weeklyTotals[0]?.amazonFees).toBeCloseTo(1);
    expect(result.weeklyTotals[0]?.grossProfit).toBeCloseTo(7);
  });
});
