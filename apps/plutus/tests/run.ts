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
import { parseAmazonTransactionCsv } from '../lib/reconciliation/amazon-csv';

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

process.stdout.write('All tests passed.\n');
