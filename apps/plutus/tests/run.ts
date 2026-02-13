import assert from 'node:assert/strict';

import {
  normalizeAuditMarketToMarketplaceId,
  selectAuditInvoiceForSettlement,
  type AuditInvoiceSummary,
} from '../lib/plutus/audit-invoice-matching';
import {
  computeSaleCostFromAverage,
  createEmptyLedgerSnapshot,
  replayInventoryLedger,
} from '../lib/inventory/ledger';
import { buildInventoryEventsFromMappings } from '../lib/inventory/qbo-bills';
import {
  buildAccountComponentMap,
  extractTrackedLinesFromBill,
} from '../lib/plutus/bills/classification';
import {
  allocateManufacturingSplitAmounts,
  normalizeManufacturingSplits,
} from '../lib/plutus/bills/split';
import {
  parseAutoRefreshTimeLocal,
  shouldRefreshCashflowSnapshot,
} from '../lib/plutus/cashflow/auto-refresh';
import { buildCashflowForecast } from '../lib/plutus/cashflow/forecast';
import {
  mapOpenBillsToEvents,
  mapRecurringTransactionsToEvents,
} from '../lib/plutus/cashflow/qbo-mappers';
import { buildProjectedSettlementEvents } from '../lib/plutus/cashflow/settlement-projection';
import { computePnlAllocation } from '../lib/pnl-allocation';
import { parseAmazonTransactionCsv } from '../lib/reconciliation/amazon-csv';
import { parseSpAdvertisedProductCsv } from '../lib/amazon-ads/sp-advertised-product-csv';
import { buildSettlementSkuProfitability } from '../lib/plutus/settlement-ads-profitability';
import { isBlockingProcessingCode } from '../lib/plutus/settlement-types';
import type { QboAccount, QboBill, QboRecurringTransaction } from '../lib/qbo/api';

function test(name: string, fn: () => void) {
  try {
    fn();
    process.stdout.write(`ok - ${name}\n`);
  } catch (error) {
    process.stderr.write(`not ok - ${name}\n`);
    throw error;
  }
}

test('normalizeAuditMarketToMarketplaceId maps common values', () => {
  assert.equal(normalizeAuditMarketToMarketplaceId('Amazon.com'), 'amazon.com');
  assert.equal(normalizeAuditMarketToMarketplaceId('amazon.co.uk'), 'amazon.co.uk');
  assert.equal(normalizeAuditMarketToMarketplaceId('US'), 'amazon.com');
  assert.equal(normalizeAuditMarketToMarketplaceId('UK'), 'amazon.co.uk');
  assert.equal(normalizeAuditMarketToMarketplaceId('unknown'), null);
});

test('selectAuditInvoiceForSettlement picks unique contained invoice', () => {
  const invoices: AuditInvoiceSummary[] = [
    {
      invoiceId: 'INV-US',
      marketplace: 'amazon.com',
      markets: ['Amazon.com'],
      minDate: '2026-02-01',
      maxDate: '2026-02-14',
      rowCount: 10,
    },
    {
      invoiceId: 'INV-UK',
      marketplace: 'amazon.co.uk',
      markets: ['Amazon.co.uk'],
      minDate: '2026-02-01',
      maxDate: '2026-02-14',
      rowCount: 10,
    },
  ];

  const match = selectAuditInvoiceForSettlement({
    settlementMarketplace: 'amazon.com',
    settlementPeriodStart: '2026-02-01',
    settlementPeriodEnd: '2026-02-14',
    invoices,
  });

  assert.deepEqual(match, { kind: 'match', matchType: 'contained', invoiceId: 'INV-US' });
});

test('selectAuditInvoiceForSettlement returns ambiguous when multiple contained match', () => {
  const invoices: AuditInvoiceSummary[] = [
    { invoiceId: 'A', marketplace: 'amazon.com', markets: ['Amazon.com'], minDate: '2026-02-01', maxDate: '2026-02-05', rowCount: 1 },
    { invoiceId: 'B', marketplace: 'amazon.com', markets: ['Amazon.com'], minDate: '2026-02-06', maxDate: '2026-02-10', rowCount: 1 },
  ];

  const match = selectAuditInvoiceForSettlement({
    settlementMarketplace: 'amazon.com',
    settlementPeriodStart: '2026-02-01',
    settlementPeriodEnd: '2026-02-14',
    invoices,
  });

  assert.equal(match.kind, 'ambiguous');
});

test('selectAuditInvoiceForSettlement falls back to unique overlap match', () => {
  const invoices: AuditInvoiceSummary[] = [
    { invoiceId: 'A', marketplace: 'amazon.com', markets: ['Amazon.com'], minDate: '2026-02-10', maxDate: '2026-02-20', rowCount: 1 },
  ];

  const match = selectAuditInvoiceForSettlement({
    settlementMarketplace: 'amazon.com',
    settlementPeriodStart: '2026-02-01',
    settlementPeriodEnd: '2026-02-14',
    invoices,
  });

  assert.deepEqual(match, { kind: 'match', matchType: 'overlap', invoiceId: 'A' });
});

test('parseAmazonTransactionCsv parses required totals', () => {
  const csv = ['Order Id,Total,Type', '123-123,10.50,Order'].join('\n');
  const parsed = parseAmazonTransactionCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.orderId, '123-123');
  assert.equal(parsed.rows[0]?.total, 10.5);
});

test('parseAmazonTransactionCsv throws on invalid totals', () => {
  const csv = ['Order Id,Total', '123-123,abc'].join('\n');
  assert.throws(() => parseAmazonTransactionCsv(csv));
});

test('parseSpAdvertisedProductCsv filters rows by selected country', () => {
  const csv = [
    'Date,Country,Advertised SKU,Spend',
    '2026-02-01,United States,sku-a,1.00',
    '2026-02-01,United Kingdom,sku-a,5.00',
    '2026-02-02,U.S.,sku-a,2.50',
    '2026-02-03,UK,sku-b,3.00',
    '2026-02-04,US,sku-b,0.00',
  ].join('\n');

  const parsed = parseSpAdvertisedProductCsv(csv, { allowedCountries: ['United States', 'US'] });

  assert.equal(parsed.rawRowCount, 5);
  assert.equal(parsed.minDate, '2026-02-01');
  assert.equal(parsed.maxDate, '2026-02-04');
  assert.equal(parsed.skuCount, 1);
  assert.deepEqual(parsed.rows, [
    { date: '2026-02-01', sku: 'SKU-A', spendCents: 100 },
    { date: '2026-02-02', sku: 'SKU-A', spendCents: 250 },
  ]);
});

test('parseSpAdvertisedProductCsv requires Country when filtering by marketplace', () => {
  const csv = ['Date,Advertised SKU,Spend', '2026-02-01,sku-a,1.00'].join('\n');
  assert.throws(() => parseSpAdvertisedProductCsv(csv, { allowedCountries: ['United States'] }), /Missing required column: Country/);
});

test('parseSpAdvertisedProductCsv errors when marketplace has no rows', () => {
  const csv = ['Date,Country,Advertised SKU,Spend', '2026-02-01,United Kingdom,sku-a,1.00'].join('\n');
  assert.throws(() => parseSpAdvertisedProductCsv(csv, { allowedCountries: ['United States'] }), /CSV has no rows for selected marketplace/);
});

test('parseSpAdvertisedProductCsv accepts Excel date serials', () => {
  const csv = ['Date,Country,Advertised SKU,Spend', '46012,United States,sku-a,1.00'].join('\n');
  const parsed = parseSpAdvertisedProductCsv(csv, { allowedCountries: ['United States'] });
  assert.equal(parsed.minDate, '2025-12-21');
  assert.equal(parsed.maxDate, '2025-12-21');
  assert.equal(parsed.rows[0]?.date, '2025-12-21');
});

test('computePnlAllocation uses absolute sales quantities for weights', () => {
  const rows = [
    {
      invoice: 'INV-1',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'ORD-1',
      sku: 'SKU-A',
      quantity: -2,
      description: 'Amazon Sales - Principal - Brand A',
      net: 20,
    },
    {
      invoice: 'INV-1',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'ORD-2',
      sku: 'SKU-B',
      quantity: -1,
      description: 'Amazon Sales - Principal - Brand B',
      net: 10,
    },
    {
      invoice: 'INV-1',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'n/a',
      sku: '',
      quantity: 0,
      description: 'Amazon Seller Fees - Commission',
      net: -9,
    },
  ];

  const allocation = computePnlAllocation(rows, {
    getBrandForSku: (sku) => (sku === 'SKU-A' ? 'BrandA' : sku === 'SKU-B' ? 'BrandB' : 'Unknown'),
  });

  assert.equal(allocation.allocationsByBucket.amazonSellerFees.BrandA, -600);
  assert.equal(allocation.allocationsByBucket.amazonSellerFees.BrandB, -300);
});

test('isBlockingProcessingCode treats cost basis and allocation as warnings', () => {
  assert.equal(isBlockingProcessingCode('PNL_ALLOCATION_ERROR'), false);
  assert.equal(isBlockingProcessingCode('LATE_COST_ON_HAND_ZERO'), false);
  assert.equal(isBlockingProcessingCode('MISSING_COST_BASIS'), false);
  assert.equal(isBlockingProcessingCode('MISSING_SETUP'), true);
});

test('ledger blocks missing cost basis', () => {
  const snapshot = createEmptyLedgerSnapshot();
  const { saleCost, blocks } = computeSaleCostFromAverage(snapshot, { orderId: 'O', sku: 'SKU', units: 1 });
  assert.equal(saleCost, undefined);
  assert.equal(blocks[0]?.code, 'MISSING_COST_BASIS');
});

test('ledger blocks negative inventory', () => {
  const parsedBills = {
    events: [
      { kind: 'manufacturing' as const, date: '2026-02-01', poNumber: 'PO-1', sku: 'SKU', units: 10, costCents: 1000 },
    ],
    poUnitsBySku: new Map(),
  };

  const replay = replayInventoryLedger({
    parsedBills,
    knownSales: [],
    knownReturns: [],
    computeSales: [{ date: '2026-02-02', orderId: 'O', sku: 'SKU', units: 15 }],
  });

  assert.equal(replay.blocks.some((b) => b.code === 'NEGATIVE_INVENTORY'), true);
});

test('ledger computes proportional manufacturing COGS', () => {
  const parsedBills = {
    events: [
      { kind: 'manufacturing' as const, date: '2026-02-01', poNumber: 'PO-1', sku: 'SKU', units: 10, costCents: 1000 },
    ],
    poUnitsBySku: new Map(),
  };

  const replay = replayInventoryLedger({
    parsedBills,
    knownSales: [],
    knownReturns: [],
    computeSales: [{ date: '2026-02-02', orderId: 'O', sku: 'SKU', units: 2 }],
  });

  assert.equal(replay.blocks.length, 0);
  assert.equal(replay.computedCosts.length, 1);
  assert.equal(replay.computedCosts[0]?.costByComponentCents.manufacturing, 200);
});

test('ledger defers SKU cost lines until units arrive', () => {
  const parsedBills = {
    events: [
      { kind: 'cost' as const, date: '2026-02-01', poNumber: 'PO-1', component: 'mfgAccessories' as const, costCents: 500, sku: 'SKU' },
      { kind: 'manufacturing' as const, date: '2026-02-02', poNumber: 'PO-1', sku: 'SKU', units: 10, costCents: 1000 },
    ],
    poUnitsBySku: new Map<string, Map<string, number>>(),
  };

  const replay = replayInventoryLedger({
    parsedBills,
    knownSales: [],
    knownReturns: [],
    computeSales: [{ date: '2026-02-03', orderId: 'O', sku: 'SKU', units: 5 }],
  });

  assert.equal(replay.blocks.some((block) => block.code === 'LATE_COST_ON_HAND_ZERO'), false);
  assert.equal(replay.blocks.length, 0);
  assert.equal(replay.computedCosts.length, 1);
  assert.equal(replay.computedCosts[0]?.costByComponentCents.manufacturing, 500);
  assert.equal(replay.computedCosts[0]?.costByComponentCents.mfgAccessories, 250);

  const state = replay.snapshot.bySku.get('SKU');
  assert.equal(state?.deferredValueByComponentCents.mfgAccessories, 0);
});

test('ledger defers PO-allocated cost lines until units arrive', () => {
  const poUnitsBySku = new Map<string, Map<string, number>>();
  poUnitsBySku.set('PO-1', new Map([['SKU-A', 1], ['SKU-B', 2]]));

  const parsedBills = {
    events: [
      { kind: 'cost' as const, date: '2026-02-01', poNumber: 'PO-1', component: 'freight' as const, costCents: 300 },
      { kind: 'manufacturing' as const, date: '2026-02-02', poNumber: 'PO-1', sku: 'SKU-A', units: 1, costCents: 100 },
      { kind: 'manufacturing' as const, date: '2026-02-02', poNumber: 'PO-1', sku: 'SKU-B', units: 2, costCents: 200 },
    ],
    poUnitsBySku,
  };

  const replay = replayInventoryLedger({
    parsedBills,
    knownSales: [],
    knownReturns: [],
    computeSales: [],
  });

  assert.equal(replay.blocks.length, 0);
  const stateA = replay.snapshot.bySku.get('SKU-A');
  const stateB = replay.snapshot.bySku.get('SKU-B');
  assert.equal(stateA?.valueByComponentCents.freight, 100);
  assert.equal(stateB?.valueByComponentCents.freight, 200);
  assert.equal(stateA?.deferredValueByComponentCents.freight, 0);
  assert.equal(stateB?.deferredValueByComponentCents.freight, 0);
});

test('bill mappings allocate non-sku costs by PO units', () => {
  const parsed = buildInventoryEventsFromMappings([
    {
      qboBillId: 'B-1',
      poNumber: 'PO-1',
      brandId: 'brand',
      billDate: '2026-02-01',
      lines: [
        { qboLineId: '1', component: 'manufacturing', amountCents: 1000, sku: 'SKU-A', quantity: 1 },
        { qboLineId: '2', component: 'manufacturing', amountCents: 2000, sku: 'SKU-B', quantity: 2 },
        { qboLineId: '3', component: 'freight', amountCents: 300, sku: null, quantity: null },
        { qboLineId: '4', component: 'warehousing3pl', amountCents: 999, sku: null, quantity: null },
      ],
    },
  ]);

  const replay = replayInventoryLedger({
    parsedBills: parsed,
    knownSales: [],
    knownReturns: [],
    computeSales: [],
  });

  const stateA = replay.snapshot.bySku.get('SKU-A');
  const stateB = replay.snapshot.bySku.get('SKU-B');
  assert.equal(stateA?.units, 1);
  assert.equal(stateB?.units, 2);

  // Freight should be allocated by units (SKU-A:1, SKU-B:2) => 100/200 cents.
  assert.equal(stateA?.valueByComponentCents.freight, 100);
  assert.equal(stateB?.valueByComponentCents.freight, 200);
});

test('manufacturing split allocation preserves total cents', () => {
  const splits = normalizeManufacturingSplits([
    { sku: 'sku-a', quantity: 2 },
    { sku: 'sku-b', quantity: 3 },
    { sku: 'sku-c', quantity: 5 },
  ]);

  const allocated = allocateManufacturingSplitAmounts(1000, splits);
  const total = allocated.reduce((sum, line) => sum + line.amountCents, 0);
  assert.equal(total, 1000);
  assert.equal(allocated[0]?.amountCents, 200);
  assert.equal(allocated[1]?.amountCents, 300);
  assert.equal(allocated[2]?.amountCents, 500);
});

test('manufacturing split allocation tie break is deterministic', () => {
  const splits = normalizeManufacturingSplits([
    { sku: 'sku-a', quantity: 1 },
    { sku: 'sku-b', quantity: 1 },
  ]);

  const allocated = allocateManufacturingSplitAmounts(101, splits);
  assert.equal(allocated[0]?.amountCents, 51);
  assert.equal(allocated[1]?.amountCents, 50);
});

test('manufacturing split validation rejects duplicate sku and invalid qty', () => {
  assert.throws(() =>
    normalizeManufacturingSplits([
      { sku: 'sku-a', quantity: 1 },
      { sku: 'SKU A', quantity: 2 },
    ]),
  );

  assert.throws(() =>
    normalizeManufacturingSplits([
      { sku: 'sku-a', quantity: 1.2 },
      { sku: 'sku-b', quantity: 1 },
    ]),
  );
});

test('settlement ads profitability combines sales returns and ads by sku', () => {
  const result = buildSettlementSkuProfitability({
    sales: [
      {
        sku: 'sku-a',
        quantity: 3,
        principalCents: 3000,
        costManufacturingCents: 900,
        costFreightCents: 150,
        costDutyCents: 90,
        costMfgAccessoriesCents: 60,
      },
      {
        sku: 'SKU-B',
        quantity: 1,
        principalCents: 1000,
        costManufacturingCents: 250,
        costFreightCents: 80,
        costDutyCents: 40,
        costMfgAccessoriesCents: 30,
      },
    ],
    returns: [
      {
        sku: 'SKU A',
        quantity: 1,
        principalCents: -1000,
        costManufacturingCents: 300,
        costFreightCents: 50,
        costDutyCents: 30,
        costMfgAccessoriesCents: 20,
      },
    ],
    allocationLines: [
      { sku: 'SKU-A', allocatedCents: 600 },
      { sku: 'SKU-B', allocatedCents: 400 },
      { sku: 'SKU-C', allocatedCents: 100 },
    ],
  });

  assert.equal(result.lines.length, 3);
  assert.deepEqual(
    result.lines.map((line) => line.sku),
    ['SKU-A', 'SKU-B', 'SKU-C'],
  );

  const skuA = result.lines[0];
  assert.equal(skuA?.soldUnits, 3);
  assert.equal(skuA?.returnedUnits, 1);
  assert.equal(skuA?.netUnits, 2);
  assert.equal(skuA?.principalCents, 2000);
  assert.equal(skuA?.cogsCents, 800);
  assert.equal(skuA?.adsAllocatedCents, 600);
  assert.equal(skuA?.contributionBeforeAdsCents, 1200);
  assert.equal(skuA?.contributionAfterAdsCents, 600);

  const skuB = result.lines[1];
  assert.equal(skuB?.principalCents, 1000);
  assert.equal(skuB?.cogsCents, 400);
  assert.equal(skuB?.adsAllocatedCents, 400);
  assert.equal(skuB?.contributionAfterAdsCents, 200);

  const skuC = result.lines[2];
  assert.equal(skuC?.principalCents, 0);
  assert.equal(skuC?.cogsCents, 0);
  assert.equal(skuC?.adsAllocatedCents, 100);
  assert.equal(skuC?.contributionAfterAdsCents, -100);

  assert.equal(result.totals.soldUnits, 4);
  assert.equal(result.totals.returnedUnits, 1);
  assert.equal(result.totals.netUnits, 3);
  assert.equal(result.totals.principalCents, 3000);
  assert.equal(result.totals.cogsCents, 1200);
  assert.equal(result.totals.adsAllocatedCents, 1100);
  assert.equal(result.totals.contributionBeforeAdsCents, 1800);
  assert.equal(result.totals.contributionAfterAdsCents, 700);
});

test('settlement ads profitability normalizes sku keys and sums duplicate ads lines', () => {
  const result = buildSettlementSkuProfitability({
    sales: [],
    returns: [],
    allocationLines: [
      { sku: ' sku-a ', allocatedCents: 101 },
      { sku: 'SKU A', allocatedCents: 202 },
    ],
  });

  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0]?.sku, 'SKU-A');
  assert.equal(result.lines[0]?.adsAllocatedCents, 303);
  assert.equal(result.totals.adsAllocatedCents, 303);
});

test('tracked line extraction includes configured and inventory accounts', () => {
  const accounts: QboAccount[] = [
    {
      Id: 'acc-mfg',
      SyncToken: '0',
      Name: 'Inv Manufacturing',
      AccountType: 'Other Current Asset',
      AccountSubType: 'Inventory',
    },
    {
      Id: 'acc-3pl',
      SyncToken: '0',
      Name: 'Warehousing 3PL',
      AccountType: 'Expense',
    },
    {
      Id: 'acc-3pl-child',
      SyncToken: '0',
      Name: 'Warehousing 3PL Child',
      AccountType: 'Expense',
      ParentRef: { value: 'acc-3pl' },
    },
    {
      Id: 'acc-ignored',
      SyncToken: '0',
      Name: 'General Expense',
      AccountType: 'Expense',
    },
  ];

  const map = buildAccountComponentMap(accounts, {
    warehousing3pl: 'acc-3pl',
    warehousingAmazonFc: null,
    warehousingAwd: null,
    productExpenses: null,
  });

  const bill: QboBill = {
    Id: 'bill-1',
    SyncToken: '1',
    TxnDate: '2026-02-01',
    TotalAmt: 300,
    Line: [
      {
        Id: 'line-1',
        Amount: 100,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'acc-mfg', name: 'Inv Manufacturing' },
        },
      },
      {
        Id: 'line-2',
        Amount: 150,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'acc-3pl-child', name: 'Warehousing 3PL Child' },
        },
      },
      {
        Id: 'line-3',
        Amount: 50,
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'acc-ignored', name: 'General Expense' },
        },
      },
    ],
  };

  const tracked = extractTrackedLinesFromBill(bill, map);
  assert.equal(tracked.length, 2);
  assert.equal(tracked[0]?.component, 'manufacturing');
  assert.equal(tracked[1]?.component, 'warehousing3pl');
});

test('cashflow week bucketing ignores events earlier in the as-of week', () => {
  const forecast = buildCashflowForecast({
    asOfDate: '2026-02-11',
    weekStartsOn: 1,
    horizonWeeks: 2,
    startingCashCents: 100_000,
    events: [
      {
        date: '2026-02-10',
        amountCents: 5_000,
        label: 'Earlier this week',
        source: 'manual_adjustment',
      },
      {
        date: '2026-02-11',
        amountCents: -2_500,
        label: 'Same day',
        source: 'manual_adjustment',
      },
    ],
  });

  assert.equal(forecast.weeks[0]?.events.length, 1);
  assert.equal(forecast.weeks[0]?.events[0]?.label, 'Same day');
  assert.equal(forecast.weeks[0]?.endingCashCents, 97_500);
});

test('open bill mapping warns on missing due date and falls back to txn date', () => {
  const warnings: Array<{ code: string; message: string }> = [];
  const bill: QboBill = {
    Id: 'bill-1',
    SyncToken: '0',
    TxnDate: '2026-03-05',
    TotalAmt: 125.5,
    Balance: 125.5,
  };

  const mapped = mapOpenBillsToEvents({
    bills: [bill],
    asOfDate: '2026-03-01',
    warnings,
  });

  assert.equal(mapped.events.length, 1);
  assert.equal(mapped.events[0]?.date, '2026-03-05');
  assert.equal(mapped.events[0]?.amountCents, -12_550);
  assert.equal(warnings[0]?.code, 'OPEN_BILL_MISSING_DUEDATE');
});

test('recurring monthly expansion creates expected occurrences in horizon', () => {
  const warnings: Array<{ code: string; message: string }> = [];
  const recurring: QboRecurringTransaction = {
    Id: 'rec-1',
    RecurringInfo: {
      Name: 'Rent',
      Active: true,
      ScheduleInfo: {
        IntervalType: 'Monthly',
        NumInterval: 1,
        DayOfMonth: 1,
        NextDate: '2026-01-01',
      },
    },
    Purchase: {
      Id: 'purchase-template',
      SyncToken: '0',
      TxnDate: '2026-01-01',
      TotalAmt: 1000,
      PaymentType: 'Cash',
      AccountRef: { value: 'cash-1', name: 'Operating Bank' },
    },
  };

  const mapped = mapRecurringTransactionsToEvents({
    recurringTransactions: [recurring],
    horizonStart: '2026-01-15',
    horizonEnd: '2026-04-20',
    cashAccountIds: ['cash-1'],
    warnings,
  });

  assert.deepEqual(
    mapped.events.map((event) => event.date),
    ['2026-02-01', '2026-03-01', '2026-04-01'],
  );
  assert.equal(mapped.events[0]?.amountCents, -100_000);
  assert.equal(warnings.length, 0);
});

test('recurring transfer netting respects selected cash accounts', () => {
  const transfer: QboRecurringTransaction = {
    Id: 'rec-transfer',
    RecurringInfo: {
      Name: 'Transfer sweep',
      Active: true,
      ScheduleInfo: {
        IntervalType: 'Weekly',
        NumInterval: 1,
        NextDate: '2026-02-16',
      },
    },
    Transfer: {
      Amount: 500,
      FromAccountRef: { value: 'acc-a', name: 'Bank A' },
      ToAccountRef: { value: 'acc-b', name: 'Bank B' },
    },
  };

  const bothIncluded = mapRecurringTransactionsToEvents({
    recurringTransactions: [transfer],
    horizonStart: '2026-02-09',
    horizonEnd: '2026-02-23',
    cashAccountIds: ['acc-a', 'acc-b'],
    warnings: [],
  });

  const fromOnly = mapRecurringTransactionsToEvents({
    recurringTransactions: [transfer],
    horizonStart: '2026-02-09',
    horizonEnd: '2026-02-23',
    cashAccountIds: ['acc-a'],
    warnings: [],
  });

  const toOnly = mapRecurringTransactionsToEvents({
    recurringTransactions: [transfer],
    horizonStart: '2026-02-09',
    horizonEnd: '2026-02-23',
    cashAccountIds: ['acc-b'],
    warnings: [],
  });

  assert.equal(bothIncluded.events.length, 0);
  assert.equal(fromOnly.events[0]?.amountCents, -50_000);
  assert.equal(toOnly.events[0]?.amountCents, 50_000);
});

test('settlement projection infers cadence and average from recent history', () => {
  const warnings: Array<{ code: string; message: string }> = [];
  const projected = buildProjectedSettlementEvents({
    history: [
      {
        journalEntryId: 'je-1',
        channel: 'US',
        docNumber: 'LMB-US-01JAN-14JAN-26-001',
        txnDate: '2026-01-16',
        periodEnd: '2026-01-14',
        cashImpactCents: 100_000,
      },
      {
        journalEntryId: 'je-2',
        channel: 'US',
        docNumber: 'LMB-US-15JAN-28JAN-26-002',
        txnDate: '2026-01-30',
        periodEnd: '2026-01-28',
        cashImpactCents: 120_000,
      },
      {
        journalEntryId: 'je-3',
        channel: 'US',
        docNumber: 'LMB-US-29JAN-11FEB-26-003',
        txnDate: '2026-02-13',
        periodEnd: '2026-02-11',
        cashImpactCents: 140_000,
      },
    ],
    asOfDate: '2026-02-12',
    forecastEndDate: '2026-03-20',
    settlementAverageCount: 3,
    settlementDefaultIntervalDays: 14,
    warnings,
  });

  assert.equal(projected.events.length > 0, true);
  assert.equal(projected.events[0]?.date, '2026-02-27');
  assert.equal(projected.events[0]?.amountCents, 120_000);
  assert.equal(warnings.length, 0);
});

test('cashflow roll-forward arithmetic and minimum cash summary are correct', () => {
  const forecast = buildCashflowForecast({
    asOfDate: '2026-02-09',
    weekStartsOn: 1,
    horizonWeeks: 3,
    startingCashCents: 100_000,
    events: [
      { date: '2026-02-09', amountCents: -30_000, label: 'Week 1 expense', source: 'manual_adjustment' },
      { date: '2026-02-10', amountCents: 10_000, label: 'Week 1 income', source: 'manual_adjustment' },
      { date: '2026-02-18', amountCents: -50_000, label: 'Week 2 expense', source: 'manual_adjustment' },
      { date: '2026-02-25', amountCents: 20_000, label: 'Week 3 income', source: 'manual_adjustment' },
    ],
  });

  assert.equal(forecast.weeks[0]?.endingCashCents, 80_000);
  assert.equal(forecast.weeks[1]?.endingCashCents, 30_000);
  assert.equal(forecast.weeks[2]?.endingCashCents, 50_000);
  assert.equal(forecast.summary.minCashCents, 30_000);
  assert.equal(forecast.summary.minCashWeekStart, '2026-02-16');
  assert.equal(forecast.summary.endCashCents, 50_000);
});

test('auto refresh time parser rejects invalid HH:MM values', () => {
  assert.throws(() => parseAutoRefreshTimeLocal('6:00'));
  assert.throws(() => parseAutoRefreshTimeLocal('24:00'));
  assert.throws(() => parseAutoRefreshTimeLocal('aa:bb'));
});

test('shouldRefreshCashflowSnapshot handles no snapshot, stale date, and min age guard', () => {
  const now = new Date('2026-02-12T10:00:00Z');

  const noSnapshot = shouldRefreshCashflowSnapshot({
    now,
    todayLocalDate: '2026-02-12',
    latestSnapshot: null,
    autoRefreshMinSnapshotAgeMinutes: 720,
  });
  assert.equal(noSnapshot, true);

  const staleDateSnapshot = shouldRefreshCashflowSnapshot({
    now,
    todayLocalDate: '2026-02-12',
    latestSnapshot: {
      asOfDate: '2026-02-11',
      createdAt: new Date('2026-02-11T06:00:00Z'),
    },
    autoRefreshMinSnapshotAgeMinutes: 720,
  });
  assert.equal(staleDateSnapshot, true);

  const todayTooFresh = shouldRefreshCashflowSnapshot({
    now,
    todayLocalDate: '2026-02-12',
    latestSnapshot: {
      asOfDate: '2026-02-12',
      createdAt: new Date('2026-02-12T09:50:00Z'),
    },
    autoRefreshMinSnapshotAgeMinutes: 30,
  });
  assert.equal(todayTooFresh, false);
});

process.stdout.write('All tests passed.\n');
