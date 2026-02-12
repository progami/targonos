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
import { parseAmazonTransactionCsv } from '../lib/reconciliation/amazon-csv';
import { buildSettlementSkuProfitability } from '../lib/plutus/settlement-ads-profitability';
import type { QboAccount, QboBill } from '../lib/qbo/api';

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

process.stdout.write('All tests passed.\n');
