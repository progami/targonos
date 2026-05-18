import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  buildFreshStartCogsPlan,
  buildOpeningLayersFromCsv,
  calculateLayerCost,
  deriveSoldUnitsFromSettlementAuditRows,
  type FreshCostLayer,
} from '../lib/plutus/fresh-start-fifo-cogs';
import { isPostableFundTransferStatus } from '../lib/amazon-finances/fund-transfer-status';
import { buildQboJournalEntriesFromUsSettlementDraft } from '../lib/amazon-finances/us-settlement-builder';
import { isBlockingProcessingCode } from '../lib/plutus/settlement-types';

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function read(path: string): string {
  return readFileSync(path, 'utf8');
}

function assertDeleted(path: string): void {
  assert.equal(existsSync(path), false, `${path} should be deleted`);
}

function baseLayer(overrides: Partial<FreshCostLayer> = {}): FreshCostLayer {
  return {
    id: 'layer-1',
    marketplace: 'amazon.com',
    qboPurchaseOrderId: '1492',
    poNumber: 'PO-19-PDS',
    qboPurchaseOrderLineId: '1',
    sku: 'CS-007',
    qboItemId: '21',
    qtyReceived: 100,
    qtyRemaining: 100,
    landedTotal: 125,
    unitCost: 1.25,
    currency: 'USD',
    status: 'READY',
    receiptDate: '2026-05-01',
    ...overrides,
  };
}

test('Plutus nav exposes fresh-start bridge surfaces only', () => {
  const source = read('components/app-header.tsx');
  for (const href of [
    "href: '/settlements'",
    "href: '/purchase-orders'",
    "href: '/exceptions'",
    "href: '/settlement-mapping'",
    "href: '/qbo-audit'",
  ]) {
    assert.equal(source.includes(href), true, `${href} should be in nav`);
  }
  assert.equal(source.includes('{ALL_NAV_ITEMS.map((item)'), true, 'desktop nav should expose every Plutus section');

  for (const forbidden of [
    "href: '/products'",
    "href: '/cogs-inputs'",
    "href: '/inventory-ledger'",
    "href: '/landed-cost-allocations'",
    "href: '/cogs-batches'",
    "href: '/sellerboard-export'",
    "href: '/settings'",
    'More Plutus sections',
    'MoreHorizIcon',
    'plutus-more-menu',
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not be in nav`);
  }
});

test('useless settings route is deleted because QBO controls live in the header', () => {
  assertDeleted('app/settings/page.tsx');
  const header = read('components/app-header.tsx');
  assert.equal(header.includes('QboStatusIndicator'), true);
  assert.equal(header.includes('SettingsIcon'), false);
  assert.equal(header.includes('QBO Connection'), false);
});

test('Prisma schema is fresh-start FIFO, not component-row inventory ownership', () => {
  const schema = read('prisma/schema.prisma');
  for (const required of [
    'enum CostLayerStatus',
    'NOT_READY',
    'READY',
    'model CostLayer',
    'qboPurchaseOrderId',
    'poNumber',
    'qboPurchaseOrderLineId',
    'qboItemId',
    'qtyReceived',
    'qtyRemaining',
    'landedTotalCents',
    'unitCost',
    'status                 CostLayerStatus',
    'model LandedCostAllocation',
    'qboBillId',
    'qboBillLineId',
    'costType',
    'allocatedAmountCents',
    'model CogsConsumption',
    'settlementId',
    'costLayerId',
    'qtyConsumed',
    'cogsAmountCents',
    'qboJournalId',
    'model SettlementPosting',
    '@@unique([marketplace, settlementId, postingType])',
    'model PlutusException',
  ]) {
    assert.equal(schema.includes(required), true, `${required} should exist in schema`);
  }

  for (const forbidden of [
    'model PurchaseOrder',
    'model LandedCostBatch',
    'model PoCostLayer',
    'model InventoryMovement',
    'model CostLayerConsumption',
    'model SellerboardCogsExport',
    'model QboInventoryItemMapping',
    'model QboInventoryMovementPosting',
    'qboInventoryAdjustmentId',
    'quantityDelta',
    'componentAmounts',
    'status          String    @default("draft")',
  ]) {
    assert.equal(schema.includes(forbidden), false, `${forbidden} should not exist in schema`);
  }
});

test('package exposes fresh-start inventory scripts and removes native adjustment cleanup flow', () => {
  const pkg = read('package.json');
  for (const required of [
    '"inventory:opening:import"',
    'scripts/plutus-import-opening-layers.ts',
    '"inventory:fresh:cogs:sync"',
    'scripts/plutus-sync-fresh-cogs.ts',
    '"inventory:fresh:cogs:post"',
    'scripts/plutus-post-fresh-cogs-to-qbo.ts',
    '"inventory:fresh:audit"',
    'scripts/plutus-fresh-cogs-audit.ts',
  ]) {
    assert.equal(pkg.includes(required), true, `${required} should be exposed`);
  }

  for (const forbidden of [
    'inventory:native:retire',
    'InventoryAdjustment',
    'inventory:exact:sync',
    'inventory:exact:cogs:sync',
    'inventory:exact:cogs:post',
    'plutus-retire-native-inventory-adjustments.ts',
    'qbo-inventory-bridge-audit.ts',
  ]) {
    assert.equal(pkg.includes(forbidden), false, `${forbidden} should not be exposed`);
  }
});

test('legacy QBO inventory adjustment and component-layer files are deleted', () => {
  for (const path of [
    'scripts/plutus-retire-native-inventory-adjustments.ts',
    'scripts/qbo-inventory-bridge-audit.ts',
    'scripts/plutus-sync-exact-cost-layers-from-qbo.ts',
    'scripts/plutus-sync-exact-cogs-from-audit.ts',
    'scripts/plutus-post-exact-cogs-to-qbo.ts',
    'scripts/plutus-exact-cost-layer-audit.ts',
    'lib/plutus/exact-cost-layer-subledger.ts',
    'lib/qbo/inventory-adjustments.ts',
    'lib/qbo/inventory-documents.ts',
  ]) {
    assertDeleted(path);
  }
});

test('fresh FIFO consumes READY layers only and oldest layer first', () => {
  const plan = buildFreshStartCogsPlan({
    settlementId: 'US-260501-260515-S1',
    marketplace: 'amazon.com',
    txnDate: '2026-05-16',
    currency: 'USD',
    soldUnits: [{ sku: 'CS-007', quantity: 90 }],
    layers: [
      baseLayer({
        id: 'new-ready',
        poNumber: 'PO-20-PDS',
        qtyRemaining: 80,
        unitCost: 2,
        receiptDate: '2026-05-10',
      }),
      baseLayer({
        id: 'old-not-ready',
        poNumber: 'PO-18-PDS',
        qtyRemaining: 1000,
        unitCost: 0.5,
        status: 'NOT_READY',
        receiptDate: '2026-04-01',
      }),
      baseLayer({
        id: 'old-ready',
        poNumber: 'PO-19-PDS',
        qtyRemaining: 75,
        unitCost: 1.25,
        receiptDate: '2026-05-01',
      }),
    ],
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(
    plan.consumptions.map((line) => ({
      layerId: line.costLayerId,
      poNumber: line.poNumber,
      qty: line.qtyConsumed,
      amount: line.cogsAmount,
    })),
    [
      { layerId: 'old-ready', poNumber: 'PO-19-PDS', qty: 75, amount: 93.75 },
      { layerId: 'new-ready', poNumber: 'PO-20-PDS', qty: 15, amount: 30 },
    ],
  );
  assert.equal(plan.cogsTotal, 123.75);
  assert.equal(plan.qboCogsJournalDraft?.docNumber, 'C-US-260501-260515-S1');
  assert.equal(plan.qboCogsJournalDraft?.lines[0]?.accountName, 'COGS - Product FIFO');
  assert.equal(plan.qboCogsJournalDraft?.lines[1]?.accountName, 'Inventory Asset - Plutus');
});

test('fresh FIFO blocks when sold SKU has no enough READY quantity', () => {
  const plan = buildFreshStartCogsPlan({
    settlementId: 'US-260501-260515-S1',
    marketplace: 'amazon.com',
    txnDate: '2026-05-16',
    currency: 'USD',
    soldUnits: [{ sku: 'CS-007', quantity: 20 }],
    layers: [baseLayer({ status: 'NOT_READY', qtyRemaining: 500 })],
  });

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.blocks, [
    {
      code: 'INSUFFICIENT_READY_LAYER',
      sku: 'CS-007',
      requestedQuantity: 20,
      availableReadyQuantity: 0,
      missingQuantity: 20,
    },
  ]);
  assert.equal(plan.qboCogsJournalDraft, null);
});

test('COGS sold-unit derivation uses principal sale quantities only', () => {
  assert.deepEqual(
    deriveSoldUnitsFromSettlementAuditRows([
      {
        invoiceId: 'US-260501-260515-S1',
        market: 'us',
        date: '2026-05-02',
        orderId: 'ORDER-1',
        sku: 'cs-007',
        quantity: 2,
        description: 'Amazon Sales - Principal',
        net: -2000,
      },
      {
        invoiceId: 'US-260501-260515-S1',
        market: 'us',
        date: '2026-05-02',
        orderId: 'ORDER-REMOVAL',
        sku: 'B09HXC3NL8',
        quantity: 1,
        description: 'Amazon Sales - Removal Shipment Revenue',
        net: 75,
      },
      {
        invoiceId: 'US-260501-260515-S1',
        market: 'us',
        date: '2026-05-02',
        orderId: 'ORDER-1',
        sku: 'cs-007',
        quantity: 2,
        description: 'Amazon FBA Fees - FBA Per Unit Fulfilment Fee',
        net: 500,
      },
      {
        invoiceId: 'US-260501-260515-S1',
        market: 'us',
        date: '2026-05-03',
        orderId: 'ORDER-2',
        sku: 'CS-010',
        quantity: 1,
        description: 'Amazon Sales - Principal',
        net: -1200,
      },
      {
        invoiceId: 'US-260501-260515-S1',
        market: 'us',
        date: '2026-05-04',
        orderId: 'ORDER-3',
        sku: 'CS-007',
        quantity: -1,
        description: 'Amazon Refunds - Refunded Principal',
        net: 1000,
      },
    ]),
    [
      { sku: 'CS-007', quantity: 2 },
      { sku: 'CS-010', quantity: 1 },
    ],
  );
});

test('opening CSV import creates READY OPENING layers and validates value math', () => {
  const layers = buildOpeningLayersFromCsv(
    'marketplace,sku,qty,value,unit_cost,currency,opening_ref\namazon.com,CS-007,100,125.00,1.25,USD,CUTOVER-2026-05\n',
  );
  assert.deepEqual(layers, [
    {
      marketplace: 'amazon.com',
      poNumber: 'OPENING-CUTOVER-2026-05',
      sku: 'CS-007',
      qtyReceived: 100,
      qtyRemaining: 100,
      landedTotal: 125,
      unitCost: 1.25,
      currency: 'USD',
      status: 'READY',
      openingRef: 'CUTOVER-2026-05',
    },
  ]);

  assert.throws(
    () =>
      buildOpeningLayersFromCsv(
        'marketplace,sku,qty,value,unit_cost,currency,opening_ref\namazon.com,CS-007,100,126.00,1.25,USD,CUTOVER-2026-05\n',
      ),
    /does not equal qty x unit_cost/,
  );
});

test('landed-cost allocations recalculate one PO/SKU layer cost deterministically', () => {
  assert.deepEqual(
    calculateLayerCost({
      qtyReceived: 10000,
      nativeManufacturingAmount: 8000,
      allocations: [
        { costType: 'PACKAGING', allocatedAmount: 1000 },
        { costType: 'FREIGHT', allocatedAmount: 700 },
        { costType: 'DUTY', allocatedAmount: 300 },
      ],
    }),
    {
      landedTotal: 10000,
      unitCost: 1,
    },
  );
});

test('settlement mapping fails closed when an Amazon category has no configured account', () => {
  assert.throws(
    () =>
      buildQboJournalEntriesFromUsSettlementDraft({
        draft: {
          settlementId: 'US-260501-260515-S1',
          eventGroupId: 'event-group',
          timeZone: 'America/Los_Angeles',
          originalTotalCents: 0,
          fundTransferStatus: 'Succeeded',
          segments: [
            {
              seq: 1,
              yearMonth: '2026-05',
              startIsoDay: '2026-05-01',
              endIsoDay: '2026-05-15',
              txnDate: '2026-05-16',
              docNumber: 'US-260501-260515-S1',
              memoTotalsCents: new Map([['Amazon Mystery Fee - New Category', 1234]]),
              auditRows: [],
            },
          ],
        },
        privateNote: 'test',
        settlementControlAccountId: 'control',
        accountIdByMemo: new Map(),
      }),
    /Missing account mapping/,
  );
});

test('settlement mapping screen is category rules only', () => {
  const page = read('app/settlement-mapping/page.tsx');
  for (const forbidden of [
    'Bank Accounts',
    'Transfer to Bank',
    'Payment to Amazon',
    'bankAndCardAccounts',
    'bankAccountId',
    'paymentAccountId',
  ]) {
    assert.equal(page.includes(forbidden), false, `${forbidden} should not be editable on settlement mappings`);
  }

  assert.equal(page.includes('Plutus Settlement Control'), true);
});

test('settlement sync does not require editable cash-leg mapping accounts', () => {
  for (const path of [
    'lib/amazon-finances/us-settlement-sync.ts',
    'lib/amazon-finances/uk-settlement-sync.ts',
  ]) {
    const source = read(path);
    assert.equal(source.includes("Missing 'Transfer to Bank' account id"), false, `${path} should not require transfer account mapping`);
    assert.equal(source.includes("Missing 'Payment to Amazon' account id"), false, `${path} should not require payment account mapping`);
  }
});

test('settlement cash lines use settlement control wording', () => {
  const [entry] = buildQboJournalEntriesFromUsSettlementDraft({
    draft: {
      settlementId: 'US-260501-260515-S1',
      eventGroupId: 'event-group',
      timeZone: 'America/Los_Angeles',
      originalTotalCents: -2500,
      fundTransferStatus: 'Succeeded',
      segments: [
        {
          seq: 1,
          yearMonth: '2026-05',
          startIsoDay: '2026-05-01',
          endIsoDay: '2026-05-15',
          txnDate: '2026-05-16',
          docNumber: 'US-260501-260515-S1',
          memoTotalsCents: new Map(),
          auditRows: [],
        },
      ],
    },
    privateNote: 'test',
    settlementControlAccountId: 'control',
    accountIdByMemo: new Map(),
  });

  assert.equal(entry?.lines.length, 1);
  assert.equal(entry?.lines[0]?.accountId, 'control');
  assert.equal(entry?.lines[0]?.description, 'Settlement Control (FundTransferStatus=Succeeded)');
});

test('fresh-start pages read new layer/allocation/consumption tables', () => {
  for (const path of [
    'app/purchase-orders/page.tsx',
    'app/purchase-orders/inventory-tabs.tsx',
    'app/landed-cost-allocations/page.tsx',
    'app/sellerboard-export/page.tsx',
    'app/api/plutus/purchase-orders/route.ts',
    'app/api/plutus/inventory-ledger/route.ts',
    'app/api/plutus/landed-cost-allocations/route.ts',
  ]) {
    assert.equal(existsSync(path), true, `${path} should exist`);
  }

  assert.equal(read('app/api/plutus/inventory-ledger/route.ts').includes('FROM "CostLayer"'), true);
  assert.equal(read('app/api/plutus/purchase-orders/route.ts').includes('FROM "CostLayer"'), true);
  assert.equal(read('app/api/plutus/purchase-orders/route.ts').includes('"status" = \'READY\''), true);
  assert.equal(
    read('app/api/plutus/purchase-orders/route.ts').includes('"status" = \'NOT_READY\''),
    true,
  );
  assert.equal(read('app/purchase-orders/inventory-tabs.tsx').includes("'use client'"), true);
  assert.equal(read('app/purchase-orders/inventory-tabs.tsx').includes("queryValue: 'ledger'"), true);
  assert.equal(read('app/purchase-orders/inventory-tabs.tsx').includes("queryValue: 'cogs'"), true);
  assert.equal(read('app/purchase-orders/inventory-tabs.tsx').includes('window.history.pushState'), true);
  assert.equal(read('app/purchase-orders/inventory-tabs.tsx').includes('hidden={activeTab !== tab.value}'), true);
  assert.equal(read('app/purchase-orders/page.tsx').includes('Promise.all(['), true);
  assert.equal(read('app/purchase-orders/page.tsx').includes('href={tabHref(tab.value)}'), false);
  assert.equal(read('app/purchase-orders/page.tsx').includes("activeTab === 'purchase-orders'"), false);
  assert.equal(read('app/purchase-orders/page.tsx').includes('PO / SKU'), true);
  assert.equal(read('app/purchase-orders/page.tsx').includes('QBO PO line'), true);
  assert.equal(read('app/purchase-orders/page.tsx').includes('FIFO layer'), true);
  assert.equal(read('app/purchase-orders/page.tsx').includes('COGS journal'), true);
  assert.equal(read('app/purchase-orders/page.tsx').includes('Sellerboard export'), true);
  assert.equal(read('app/purchase-orders/page.tsx').includes('Inventory in Transit - Plutus'), true);
  assertDeleted('app/inventory-ledger/page.tsx');
  assertDeleted('app/cogs-batches/page.tsx');
  assert.equal(
    read('app/api/plutus/landed-cost-allocations/route.ts').includes('LandedCostAllocation'),
    true,
  );
  assert.equal(read('app/purchase-orders/page.tsx').includes('FROM "CogsConsumption"'), true);
});

test('inventory tables avoid repeating connection columns', () => {
  const source = read('app/purchase-orders/page.tsx');
  for (const forbidden of [
    '<TableCell>PO</TableCell>',
    '<TableCell>SKU</TableCell>',
    '<TableCell>Marketplace</TableCell>',
    '<TableCell>QBO PO</TableCell>',
    '<TableCell align="right">Live Qty</TableCell>',
    '<TableCell align="right">In Transit Qty</TableCell>',
    '<TableCell align="right">Live Value</TableCell>',
    '<TableCell align="right">In Transit Value</TableCell>',
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not be repeated as a standalone column`);
  }
});

test('settlement mapping is framed as category to QBO account rules', () => {
  const source = read('app/settlement-mapping/page.tsx');
  for (const required of [
    'Settlement Rules',
    'Amazon Category',
    'QBO Account',
    'Every Amazon settlement category must map to a QBO account',
  ]) {
    assert.equal(source.includes(required), true, `${required} should be visible on settlement rules`);
  }

  for (const forbidden of [
    'Settlement Mappings',
    'Search memos',
    'memo mappings',
    'Transaction Category',
    'Account Name',
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not be visible settlement-rule wording`);
  }
});

test('fresh-start UI displays unit costs at two decimals', () => {
  for (const path of [
    'app/purchase-orders/page.tsx',
    'app/sellerboard-export/page.tsx',
  ]) {
    const source = read(path);
    assert.equal(source.includes('toFixed(2)'), true, `${path} should display unit cost at two decimals`);
    assert.equal(source.includes('toFixed(6)'), false, `${path} should not display six-decimal unit cost`);
  }
});

test('Sellerboard export is PO/SKU COGS output, not settlement audit output', () => {
  const source = read('app/sellerboard-export/page.tsx');
  for (const required of [
    'GROUP BY',
    '"marketplace"',
    '"sku"',
    '"poNumber"',
    '"unitCost"',
    'qtyConsumed',
    'cogsAmountCents',
    'Qty Sold',
    'COGS',
  ]) {
    assert.equal(source.includes(required), true, `${required} should be in Sellerboard export`);
  }

  for (const forbidden of [
    'settlementId',
    'qboJournalId',
    'Settlement',
    'QBO JE',
  ]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} should not be in Sellerboard export`);
  }
});

test('COGS posting uses direct FIFO journal accounts and no QtyDiff path', () => {
  const source = read('scripts/plutus-post-fresh-cogs-to-qbo.ts');
  assert.equal(
    source.includes("requireOneActiveAccountByName(accounts, 'COGS - Product FIFO')"),
    true,
  );
  assert.equal(
    source.includes("requireOneActiveAccountByName(accounts, 'Inventory Asset - Plutus')"),
    true,
  );
  assert.equal(source.includes('createJournalEntry'), true);
  assert.equal(source.includes('InventoryAdjustment'), false);
  assert.equal(source.includes('QtyDiff'), false);
});

test('fresh FIFO audit ties READY and NOT_READY layers to separate QBO control accounts', () => {
  const source = read('scripts/plutus-fresh-cogs-audit.ts');
  assert.equal(source.includes("'Inventory Asset - Plutus'"), true);
  assert.equal(source.includes("'Inventory in Transit - Plutus'"), true);
  assert.equal(source.includes('WHERE "status" = \'READY\''), true);
  assert.equal(source.includes('WHERE "status" = \'NOT_READY\''), true);
  assert.equal(source.includes('inventoryInTransitTieout'), true);
  assert.equal(source.includes('combinedInventoryTieout'), true);
});

test('settlement processing creates FIFO COGS journal support rows', () => {
  const source = read('lib/plutus/settlement-processing.ts');
  assert.equal(source.includes("'COGS - Product FIFO'"), true);
  assert.equal(source.includes("'Inventory Asset - Plutus'"), true);
  assert.equal(source.includes('tx.cogsConsumption.create'), true);
  assert.equal(source.includes('data: { qtyRemaining: { decrement: line.qtyConsumed } }'), true);
  assert.equal(source.includes('InventoryAdjustment'), false);
  assert.equal(source.includes('QtyDiff'), false);
});

test('US SP-API reconcile ignores FIFO COGS journals', () => {
  const source = read('scripts/us-settlement-reconcile-spapi.ts');
  assert.equal(source.includes("trimmed.toUpperCase().startsWith('C-')"), true);
  assert.equal(source.includes("trimmed.toUpperCase().startsWith('COGS-')"), true);
});

test('SP-API settlements with processing fund transfers are not postable', () => {
  assert.equal(isPostableFundTransferStatus('Succeeded'), true);
  assert.equal(isPostableFundTransferStatus('Failed'), true);
  assert.equal(isPostableFundTransferStatus('Unknown'), true);
  assert.equal(isPostableFundTransferStatus('Processing'), false);
  assert.equal(isPostableFundTransferStatus(' processing '), false);
});

test('processing blocks fail closed', () => {
  assert.equal(isBlockingProcessingCode(''), false);
  assert.equal(isBlockingProcessingCode('INVOICE_CONFLICT'), true);
});

void (async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      process.stdout.write(`ok - ${name}\n`);
    } catch (error) {
      process.stderr.write(`not ok - ${name}\n`);
      throw error;
    }
  }

  process.stdout.write('All tests passed.\n');
})().catch(() => {
  process.exitCode = 1;
});
