import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  buildQboJournalEntriesFromUsSettlementDraft,
  buildUsSettlementDraftFromSpApiFinances,
} from '../lib/amazon-finances/us-settlement-builder';
import {
  buildQboJournalEntriesFromUkSettlementDraft,
  buildUkSettlementDraftFromSpApiFinances,
} from '../lib/amazon-finances/uk-settlement-builder';
import { normalizeSettlementOperatingMemo } from '../lib/amazon-finances/settlement-memo-normalization';
import { isPostableFundTransferStatus } from '../lib/amazon-finances/fund-transfer-status';
import { isBlockingProcessingCode } from '../lib/plutus/settlement-types';
import { computeProcessingHash } from '../lib/plutus/settlement-utils';
import { buildQboInventoryAdjustmentPayload } from '../lib/qbo/inventory-adjustments';
import {
  buildQboInventoryItemPayload,
  buildQboItemBasedBillPayload,
  buildQboPurchaseOrderPayload,
} from '../lib/qbo/inventory-documents';
import { buildSettlementInventoryMovementPlan } from '../lib/plutus/qbo-inventory-movements';
import {
  buildQboInventoryLandedCostPlan,
  buildQboInventoryAssetReclassPlan,
  parseQboInventoryAssetLine,
} from '../lib/plutus/qbo-inventory-asset-lines';
import { assessQboInventoryValuationTieout, parseQboInventoryValuationSummary } from '../lib/plutus/qbo-inventory-valuation';

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

function money(currency: string, amount: number) {
  return { CurrencyCode: currency, CurrencyAmount: amount };
}

test('Plutus nav exposes bridge surfaces only', () => {
  const source = read('components/app-header.tsx');
  assert.equal(source.includes("href: '/settlements'"), true);
  assert.equal(source.includes("href: '/settlement-mapping'"), true);
  assert.equal(source.includes("href: '/qbo-audit'"), true);
  assert.equal(source.includes("href: '/products'"), false);
  assert.equal(source.includes("href: '/purchase-orders'"), false);
  assert.equal(source.includes("href: '/inventory-ledger'"), false);
  assert.equal(source.includes("href: '/cogs-inputs'"), false);
});

test('Plutus inventory owner surfaces are hard deleted', () => {
  for (const path of [
    'app/products/page.tsx',
    'app/purchase-orders/page.tsx',
    'app/inventory-ledger/page.tsx',
    'app/cogs-inputs/page.tsx',
    'app/api/plutus/products/route.ts',
    'app/api/plutus/purchase-orders/route.ts',
    'app/api/plutus/inventory-ledger/route.ts',
    'app/api/plutus/bills/route.ts',
    'app/api/plutus/purchases/create/route.ts',
    'app/api/setup/brands/route.ts',
    'app/api/setup/skus/route.ts',
    'app/api/qbo/accounts/create-plutus-qbo-plan/route.ts',
    'lib/inventory/ledger.ts',
    'lib/inventory/qbo-bills.ts',
    'lib/plutus/settlement-validation.ts',
    'lib/plutus/journal-builder.ts',
    'lib/qbo/plutus-qbo-plan.ts',
    'scripts/inventory-audit.ts',
    'scripts/inventory-bills-audit.ts',
    'scripts/backfill-subledger-foundation.ts',
  ]) {
    assertDeleted(path);
  }
});

test('Prisma schema no longer models Plutus-owned inventory', () => {
  const schema = read('prisma/schema.prisma');
  for (const forbidden of [
    'model Brand',
    'model Sku',
    'model BillMapping',
    'model BillLineMapping',
    'model OrderSale',
    'model OrderReturn',
    'model ProductGroup',
    'model CanonicalProduct',
    'model SkuAlias',
    'model PurchaseOrder',
    'model PoCostLayer',
    'model InventoryMovement',
    'invManufacturing',
    'cogsManufacturing',
    'warehousing3pl',
    'productExpenses',
  ]) {
    assert.equal(schema.includes(forbidden), false, `${forbidden} should not exist in schema`);
  }
});

test('Prisma schema tracks QBO inventory bridge mappings and movement postings only', () => {
  const schema = read('prisma/schema.prisma');
  for (const required of [
    'model QboInventoryItemMapping',
    'model QboInventoryMovementPosting',
    'sellerSku',
    'qboItemId',
    'qboInventoryAdjustmentId',
    'quantityDelta',
    '@@unique([marketplace, sellerSku])',
    '@@unique([marketplace, settlementDocNumber, sellerSku])',
  ]) {
    assert.equal(schema.includes(required), true, `${required} should exist in schema`);
  }
});

test('package scripts do not expose inventory ownership workflows', () => {
  const pkg = read('package.json');
  for (const forbidden of [
    'subledger:backfill',
    'inventory-audit',
    'inventory-bills-audit',
    'repair-missing-processing-jes',
    'reprocess-invoice-conflicts',
  ]) {
    assert.equal(pkg.includes(forbidden), false, `${forbidden} should not be callable`);
  }
});

test('package exposes QBO inventory bridge audit workflow', () => {
  const pkg = read('package.json');
  assert.equal(pkg.includes('"inventory:qbo:audit"'), true);
  assert.equal(pkg.includes('scripts/qbo-inventory-bridge-audit.ts'), true);
  assert.equal(pkg.includes('"inventory:qbo:repair"'), true);
  assert.equal(pkg.includes('scripts/qbo-repair-inventory-valuation-tieout.ts'), true);
  assert.equal(existsSync('scripts/qbo-inventory-bridge-audit.ts'), true);
  assert.equal(existsSync('scripts/qbo-repair-inventory-valuation-tieout.ts'), true);
});

test('QBO inventory bridge audit reports live asset bill landed-cost evidence', () => {
  const source = read('scripts/qbo-inventory-bridge-audit.ts');
  assert.equal(source.includes('buildQboInventoryLandedCostPlan'), true);
  assert.equal(source.includes('buildQboInventoryAssetReclassPlan'), true);
  assert.equal(source.includes('parseQboInventoryValuationSummary'), true);
  assert.equal(source.includes('qboInventoryValuationTieout'), true);
  assert.equal(source.includes('qboInventoryAssetLines'), true);
  assert.equal(source.includes('qboLandedCostLayers'), true);
  assert.equal(source.includes('qboInventoryAssetBlocks'), true);
  assert.equal(source.includes('qboNativeInventoryMigration'), false);
});

test('QBO inventory repair script moves only valuation drift lines to clearing', () => {
  const source = read('scripts/qbo-repair-inventory-valuation-tieout.ts');
  assert.equal(source.includes("const INVENTORY_ASSET_ACCOUNT_NAME = 'Inventory Asset'"), true);
  assert.equal(source.includes("const INVENTORY_CLEARING_ACCOUNT_NAME = 'Inventory Clearing'"), true);
  assert.equal(source.includes("const INVENTORY_COGS_RELEASE_ACCOUNT_NAME = 'Inventory COGS Release'"), true);
  assert.equal(source.includes('buildQboInventoryAssetReclassPlan'), true);
  assert.equal(source.includes('updateBillLineAccounts'), true);
  assert.equal(source.includes('afterTieout'), true);
});

test('QBO inventory migration uses explicit COGS release adjustment account', () => {
  const source = read('scripts/qbo-complete-inventory-migration.ts');
  assert.equal(source.includes("requireAccount(accountsResult.accounts, 'Inventory COGS Release')"), true);
  assert.equal(source.includes("requireAccount(accountsResult.accounts, 'Inventory Shrinkage')"), false);
});

test('QBO inventory setup scripts only reuse inventory-tracked SKU items', () => {
  for (const path of ['scripts/qbo-create-inventory-purchase-orders.ts', 'scripts/qbo-complete-inventory-migration.ts']) {
    const source = read(path);
    assert.equal(source.includes("if (item.Type !== 'Inventory') continue;"), true, `${path} should require inventory items`);
  }
});

test('QBO inventory migration scripts paginate bill fetches', () => {
  for (const path of ['scripts/qbo-create-inventory-purchase-orders.ts', 'scripts/qbo-complete-inventory-migration.ts']) {
    const source = read(path);
    assert.equal(source.includes('let startPosition = 1;'), true, `${path} should start paginated bill reads`);
    assert.equal(source.includes('startPosition += result.bills.length;'), true, `${path} should advance paginated bill reads`);
    assert.equal(source.includes('if (result.bills.length < maxResults) break;'), true, `${path} should stop at the final page`);
  }
});

test('QBO audit page uses bridge language, not subledger language', () => {
  const source = read('components/subledger/qbo-audit-page.tsx');
  assert.equal(source.includes('kicker="Subledger"'), false);
  assert.equal(source.includes('Posting drift and attachment state will appear after QBO traces are recorded.'), false);
});

test('SP-API settlements with processing fund transfers are not postable', () => {
  assert.equal(isPostableFundTransferStatus('Succeeded'), true);
  assert.equal(isPostableFundTransferStatus('Failed'), true);
  assert.equal(isPostableFundTransferStatus('Unknown'), true);
  assert.equal(isPostableFundTransferStatus('Processing'), false);
  assert.equal(isPostableFundTransferStatus(' processing '), false);
});

test('US SP-API settlement build does not require SKU brand mapping', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: '26000000001',
    eventGroupId: 'group-us-simple',
    eventGroup: {
      FinancialEventGroupStart: '2026-05-01T08:00:00Z',
      FinancialEventGroupEnd: '2026-05-02T07:59:59Z',
      OriginalTotal: money('USD', 80),
      FundTransferStatus: 'Succeeded',
    } as any,
    events: {
      ShipmentEventList: [
        {
          PostedDate: '2026-05-01T12:00:00Z',
          AmazonOrderId: 'ORDER-1',
          ShipmentItemList: [
            {
              SellerSKU: 'UNMAPPED-SKU',
              QuantityShipped: 1,
              ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money('USD', 100) }],
              ItemFeeList: [{ FeeType: 'Commission', FeeAmount: money('USD', -20) }],
            },
          ],
        },
      ],
    } as any,
  });

  const segment = draft.segments[0]!;
  assert.equal(segment.memoTotalsCents.get('Amazon Sales - Principal'), 10000);
  assert.equal(segment.memoTotalsCents.get('Amazon Seller Fees - Commission'), -2000);
  assert.equal(Array.from(segment.memoTotalsCents.keys()).some((memo) => memo.includes('US-PDS')), false);
});

test('UK SP-API settlement build does not require SKU brand mapping', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'EG-group-uk-simple',
    eventGroupId: 'group-uk-simple',
    eventGroup: {
      FinancialEventGroupStart: '2026-05-01T00:00:00Z',
      FinancialEventGroupEnd: '2026-05-01T23:59:59Z',
      OriginalTotal: money('GBP', 80),
      FundTransferStatus: 'Succeeded',
    } as any,
    events: {
      ShipmentEventList: [
        {
          PostedDate: '2026-05-01T12:00:00Z',
          AmazonOrderId: 'ORDER-UK-1',
          MarketplaceName: 'amazon.co.uk',
          ShipmentItemList: [
            {
              SellerSKU: 'UNMAPPED-UK-SKU',
              QuantityShipped: 1,
              ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: money('GBP', 100) }],
              ItemFeeList: [{ FeeType: 'Commission', FeeAmount: money('GBP', -20) }],
            },
          ],
        },
      ],
    } as any,
  });

  const segment = draft.segments[0]!;
  assert.equal(segment.memoTotalsCents.get('Amazon Sales - Principal'), 10000);
  assert.equal(segment.memoTotalsCents.get('Amazon Seller Fees - Commission'), -2000);
  assert.equal(Array.from(segment.memoTotalsCents.keys()).some((memo) => memo.includes('UK-PDS')), false);
});

test('settlement postings use settlement control instead of real bank/payment accounts', () => {
  const usEntries = buildQboJournalEntriesFromUsSettlementDraft({
    draft: {
      settlementId: '26000000001',
      eventGroupId: 'group-us-simple',
      timeZone: 'America/Los_Angeles',
      originalTotalCents: 8000,
      fundTransferStatus: 'Succeeded',
      segments: [
        {
          seq: 1,
          yearMonth: '2026-05',
          startIsoDay: '2026-05-01',
          endIsoDay: '2026-05-01',
          txnDate: '2026-05-01',
          docNumber: 'US-260501-260501-S1',
          memoTotalsCents: new Map([['Amazon Sales - Principal', 8000]]),
          auditRows: [],
        },
      ],
    },
    privateNote: 'test',
    settlementControlAccountId: 'control',
    bankAccountId: 'bank',
    paymentAccountId: 'payment',
    accountIdByMemo: new Map([['Amazon Sales - Principal', 'sales']]),
  });

  assert.equal(usEntries[0]!.lines.some((line) => line.accountId === 'bank'), false);
  assert.equal(usEntries[0]!.lines.some((line) => line.accountId === 'control' && line.postingType === 'Debit'), true);

  const ukEntries = buildQboJournalEntriesFromUkSettlementDraft({
    draft: {
      settlementId: 'EG-group-uk-simple',
      eventGroupId: 'group-uk-simple',
      timeZone: 'Europe/London',
      originalTotalCents: -8000,
      fundTransferStatus: 'Succeeded',
      segments: [
        {
          seq: 1,
          yearMonth: '2026-05',
          startIsoDay: '2026-05-01',
          endIsoDay: '2026-05-01',
          txnDate: '2026-05-01',
          docNumber: 'UK-260501-260501-S1',
          memoTotalsCents: new Map([['Amazon FBA Fees - FBA Inbound Transportation Fee - Domestic Orders', -8000]]),
          auditRows: [],
        },
      ],
    },
    privateNote: 'test',
    settlementControlAccountId: 'control',
    bankAccountId: 'bank',
    paymentAccountId: 'payment',
    accountIdByMemo: new Map([['Amazon FBA Fees - FBA Inbound Transportation Fee - Domestic Orders', 'fees']]),
  });

  assert.equal(ukEntries[0]!.lines.some((line) => line.accountId === 'payment'), false);
  assert.equal(ukEntries[0]!.lines.some((line) => line.accountId === 'control' && line.postingType === 'Credit'), true);
});

test('legacy brand memo suffixes normalize into parent settlement mappings', () => {
  assert.equal(normalizeSettlementOperatingMemo('Amazon Sales - Principal - US-PDS'), 'Amazon Sales - Principal');
  assert.equal(normalizeSettlementOperatingMemo('Amazon Refunds - Refunded Principal - UK-PDS'), 'Amazon Refunds - Refunded Principal');
  assert.equal(normalizeSettlementOperatingMemo('Amazon Seller Fees - Commission'), 'Amazon Seller Fees - Commission');
});

test('processing hash keeps SKU as evidence only', () => {
  const left = computeProcessingHash([
    {
      invoiceId: 'US-260501-260501-S1',
      market: 'us',
      date: '2026-05-01',
      orderId: 'ORDER-1',
      sku: 'cs 007',
      quantity: 1,
      description: 'Amazon Sales - Principal',
      net: 100,
    },
  ]);
  const right = computeProcessingHash([
    {
      invoiceId: 'US-260501-260501-S1',
      market: 'us',
      date: '2026-05-01',
      orderId: 'ORDER-1',
      sku: 'CS-007',
      quantity: 1,
      description: 'Amazon Sales - Principal',
      net: 100,
    },
  ]);
  assert.equal(left, right);
});

test('rollback/reset tools preserve historical COGS journal entries', () => {
  const rollbackSource = read('lib/plutus/settlement-rollback.ts');
  assert.equal(rollbackSource.includes('deleteJournalEntry(activeConnection, existing.qboCogsJournalEntryId)'), false);

  for (const path of [
    'scripts/rollback-settlement-processing.ts',
    'scripts/us-settlement-reset-spapi.ts',
    'scripts/uk-settlement-reset-spapi.ts',
  ]) {
    const source = read(path);
    assert.equal(source.includes('deleteJournalEntry(activeConnection, row.qboCogsJournalEntryId)'), false);
    assert.equal(source.includes('row.qboSettlementJournalEntryId, row.qboCogsJournalEntryId'), false);
  }
});

test('QBO inventory adjustment payload carries quantities only', () => {
  const payload = buildQboInventoryAdjustmentPayload({
    adjustmentAccountId: 'cogs-account',
    txnDate: '2026-05-08',
    docNumber: 'IA-260501-08-S2',
    privateNote: 'Plutus inventory movement | Settlement: US-260501-260508-S2',
    lines: [
      { qboItemId: 'item-cs007', qtyDiff: -3 },
      { qboItemId: 'item-cs010', qtyDiff: 1 },
    ],
  });

  assert.deepEqual(payload, {
    AdjustAccountRef: { value: 'cogs-account' },
    domain: 'QBO',
    sparse: false,
    TxnDate: '2026-05-08',
    DocNumber: 'IA-260501-08-S2',
    PrivateNote: 'Plutus inventory movement | Settlement: US-260501-260508-S2',
    Line: [
      {
        Id: '1',
        DetailType: 'ItemAdjustmentLineDetail',
        ItemAdjustmentLineDetail: {
          ItemRef: { value: 'item-cs007' },
          QtyDiff: -3,
        },
      },
      {
        Id: '2',
        DetailType: 'ItemAdjustmentLineDetail',
        ItemAdjustmentLineDetail: {
          ItemRef: { value: 'item-cs010' },
          QtyDiff: 1,
        },
      },
    ],
  });
  assert.equal(JSON.stringify(payload).includes('Amount'), false);
  assert.equal(JSON.stringify(payload).includes('UnitPrice'), false);
});

test('QBO inventory item payload creates inventory-tracked SKU item', () => {
  const payload = buildQboInventoryItemPayload({
    name: 'CS-007',
    sku: 'CS-007',
    inventoryStartDate: '2025-12-01',
    initialQuantityOnHand: 0,
    assetAccountId: 'inventory-asset',
    incomeAccountId: 'sales',
    expenseAccountId: 'cogs',
    purchaseCost: 0.84,
    unitPrice: 9.99,
  });

  assert.deepEqual(payload, {
    Name: 'CS-007',
    Sku: 'CS-007',
    Type: 'Inventory',
    TrackQtyOnHand: true,
    QtyOnHand: 0,
    InvStartDate: '2025-12-01',
    AssetAccountRef: { value: 'inventory-asset' },
    IncomeAccountRef: { value: 'sales' },
    ExpenseAccountRef: { value: 'cogs' },
    PurchaseCost: 0.84,
    UnitPrice: 9.99,
  });
});

test('QBO PO and item-based bill payloads carry item quantities and landed unit costs', () => {
  const lines = [
    {
      qboItemId: 'item-cs007',
      description: 'INTERNAL PO: 19; SUPPLIER REF: PH250940; SKU: CS-007',
      quantity: 29440,
      unitCost: 0.841229,
    },
  ];

  assert.deepEqual(
    buildQboPurchaseOrderPayload({
      vendorId: 'jiangsu',
      txnDate: '2025-09-29',
      docNumber: 'PO-19-PDS',
      privateNote: 'INTERNAL PO: 19; SUPPLIER REF: PH250940',
      lines,
    }),
    {
      VendorRef: { value: 'jiangsu' },
      TxnDate: '2025-09-29',
      DocNumber: 'PO-19-PDS',
      PrivateNote: 'INTERNAL PO: 19; SUPPLIER REF: PH250940',
      Line: [
        {
          DetailType: 'ItemBasedExpenseLineDetail',
          Amount: 24765.78,
          Description: 'INTERNAL PO: 19; SUPPLIER REF: PH250940; SKU: CS-007',
          ItemBasedExpenseLineDetail: {
            ItemRef: { value: 'item-cs007' },
            Qty: 29440,
            UnitPrice: 0.841229,
          },
        },
      ],
    },
  );

  assert.deepEqual(
    buildQboItemBasedBillPayload({
      vendorId: 'jiangsu',
      txnDate: '2025-09-29',
      docNumber: 'PH250940',
      privateNote: 'INTERNAL PO: 19; SUPPLIER REF: PH250940',
      lines,
    }),
    {
      VendorRef: { value: 'jiangsu' },
      TxnDate: '2025-09-29',
      DocNumber: 'PH250940',
      PrivateNote: 'INTERNAL PO: 19; SUPPLIER REF: PH250940',
      Line: [
        {
          DetailType: 'ItemBasedExpenseLineDetail',
          Amount: 24765.78,
          Description: 'INTERNAL PO: 19; SUPPLIER REF: PH250940; SKU: CS-007',
          ItemBasedExpenseLineDetail: {
            ItemRef: { value: 'item-cs007' },
            Qty: 29440,
            UnitPrice: 0.841229,
          },
        },
      ],
    },
  );
});

test('QBO inventory asset line parser enforces the bill-line description contract', () => {
  assert.deepEqual(
    parseQboInventoryAssetLine({
      billId: '49',
      billDocNumber: 'PH250940',
      billDate: '2025-09-29',
      vendorName: 'JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD',
      qboLineId: '5',
      accountName: 'Inventory Asset:Manufacturing - US-PDS',
      amount: 17310.72,
      description: 'MFG; OWNER=US-PDS; PO=PO-19-PDS; SKU=CS-007; QTY=29440; UNIT_COST=0.588; SOURCE=PH250940',
    }),
    {
      billId: '49',
      billDocNumber: 'PH250940',
      billDate: '2025-09-29',
      vendorName: 'JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD',
      qboLineId: '5',
      accountName: 'Inventory Asset:Manufacturing - US-PDS',
      amount: 17310.72,
      component: 'manufacturing',
      marketCode: 'US-PDS',
      descriptionKind: 'MFG',
      owner: 'US-PDS',
      internalPo: 'PO-19-PDS',
      sellerSku: 'CS-007',
      quantity: 29440,
      sourceRef: 'PH250940',
    },
  );

  assert.deepEqual(
    parseQboInventoryAssetLine({
      billId: '51',
      billDocNumber: 'FSHY2509087198',
      billDate: '2025-10-07',
      vendorName: 'FOREST SHIPPING WORLDWIDE LTD',
      qboLineId: '5',
      accountName: 'Inventory Asset',
      amount: 2514.18,
      description:
        'DUTY; OWNER=US-PDS; PO=PO-19-PDS; SKU=CS-007; ENTRY=N/A; SHIP=FBA19523CMQ9; SERVICE=CUSTOMS DUTY; ALLOC=FOB_VALUE; SOURCE=FSHY2509087198',
    }).component,
    'duty',
  );

  assert.deepEqual(
    parseQboInventoryAssetLine({
      billId: '48',
      billDocNumber: 'ABC20250923007',
      billDate: '2025-09-23',
      vendorName: 'Huizhou Anboson Technology Co., Ltd',
      qboLineId: '1',
      accountName: 'Inventory Asset:Mfg Accessories - US-PDS',
      amount: 560,
      description:
        'PKG; OWNER=US-PDS; ITEM=NITRILE_GLOVES; QTY=196 boxes; FOR_SKU=N/A; SOURCE=ABC20250923007; NOTES=item $490 plus shipping $70',
    }).sellerSku,
    null,
  );
});

test('QBO landed cost plan aggregates US asset bills by internal PO and SKU', () => {
  const plan = buildQboInventoryLandedCostPlan({
    marketplace: 'amazon.com',
    lines: [
      {
        billId: '49',
        billDocNumber: 'PH250940',
        billDate: '2025-09-29',
        vendorName: 'JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD',
        qboLineId: '5',
        accountName: 'Inventory Asset',
        amount: 17310.72,
        description: 'MFG; OWNER=US-PDS; PO=PO-19-PDS; SKU=CS-007; QTY=29440; UNIT_COST=0.588; SOURCE=PH250940',
      },
      {
        billId: '46',
        billDocNumber: 'PI-250804BOXB',
        billDate: '2025-08-04',
        vendorName: 'VICTOR HERO HOLDINGS LIMITED',
        qboLineId: '16',
        accountName: 'Inventory Asset',
        amount: 2266.88,
        description: 'PKG; OWNER=PO-19-PDS; ITEM=CS-007-BOX; QTY=29440; FOR_SKU=CS-007; PO=PO-19-PDS; SOURCE=PI-250804BOXB',
      },
      {
        billId: '44',
        billDocNumber: 'PI-2508204A',
        billDate: '2025-08-20',
        vendorName: 'JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD',
        qboLineId: '1',
        accountName: 'Inventory Asset',
        amount: 971.52,
        description: 'PKG; OWNER=PO-19-PDS; ITEM=CS-007-BOX-PRESSING; QTY=29440; FOR_SKU=CS-007; PO=PO-19-PDS; SOURCE=PI-2508204A',
      },
      {
        billId: '51',
        billDocNumber: 'FSHY2509087198',
        billDate: '2025-10-07',
        vendorName: 'FOREST SHIPPING WORLDWIDE LTD',
        qboLineId: '1',
        accountName: 'Inventory Asset:Freight - US-PDS',
        amount: 1702.48,
        description:
          'FREIGHT; OWNER=US-PDS; PO=PO-19-PDS; SKU=CS-007; SERVICE=FOREST SHIPPING; SHIP=FBA19523CMQ9; ALLOC=CBM; SOURCE=FSHY2509087198',
      },
      {
        billId: '51',
        billDocNumber: 'FSHY2509087198',
        billDate: '2025-10-07',
        vendorName: 'FOREST SHIPPING WORLDWIDE LTD',
        qboLineId: '5',
        accountName: 'Inventory Asset:Duty - US-PDS',
        amount: 2514.18,
        description:
          'DUTY; OWNER=US-PDS; PO=PO-19-PDS; SKU=CS-007; ENTRY=N/A; SHIP=FBA19523CMQ9; SERVICE=CUSTOMS DUTY; ALLOC=FOB_VALUE; SOURCE=FSHY2509087198',
      },
      {
        billId: '46',
        billDocNumber: 'PI-250804BOXB',
        billDate: '2025-08-04',
        vendorName: 'VICTOR HERO HOLDINGS LIMITED',
        qboLineId: '18',
        accountName: 'Inventory Asset:Mfg Accessories - US-PDS',
        amount: 1.23,
        description: 'PKG; OWNER=RESIDUAL; ITEM=CS-007-BOX; QTY=16; FOR_SKU=CS-007; SOURCE=PI-250804BOXB',
      },
      {
        billId: '48',
        billDocNumber: 'ABC20250923007',
        billDate: '2025-09-23',
        vendorName: 'Huizhou Anboson Technology Co., Ltd',
        qboLineId: '1',
        accountName: 'Inventory Asset:Mfg Accessories - US-PDS',
        amount: 560,
        description:
          'PKG; OWNER=US-PDS; ITEM=NITRILE_GLOVES; QTY=196 boxes; FOR_SKU=N/A; SOURCE=ABC20250923007; NOTES=item $490 plus shipping $70',
      },
      {
        billId: '605',
        billDocNumber: 'FSHY2512091572',
        billDate: '2026-02-24',
        vendorName: 'FOREST SHIPPING WORLDWIDE LTD',
        qboLineId: '1',
        accountName: 'Inventory Asset:Freight - UK-PDS',
        amount: 6694.15,
        description: 'Freight invoice FSHY2512091572 - awaiting goods receipt for future UK-PDS shipment',
      },
    ],
  });

  assert.equal(plan.marketCode, 'US-PDS');
  assert.deepEqual(plan.layers, [
    {
      internalPo: 'PO-19-PDS',
      sellerSku: 'CS-007',
      quantity: 29440,
      componentAmounts: {
        manufacturing: 17310.72,
        freight: 1702.48,
        duty: 2514.18,
        mfgAccessories: 3238.4,
      },
      totalAmount: 24765.78,
      unitCost: 0.841229,
      sourceRefs: ['FSHY2509087198', 'PH250940', 'PI-250804BOXB', 'PI-2508204A'],
      qboBillLineRefs: ['44:1', '46:16', '49:5', '51:1', '51:5'],
    },
  ]);
  assert.deepEqual(plan.blocks, [
    { code: 'RESIDUAL_ASSET_LINE', billId: '46', qboLineId: '18', owner: 'RESIDUAL', sellerSku: 'CS-007' },
    { code: 'NON_SKU_ASSET_LINE', billId: '48', qboLineId: '1', owner: 'US-PDS' },
  ]);
});

test('QBO inventory asset reclass plan moves only non-item valuation drift lines', () => {
  const plan = buildQboInventoryAssetReclassPlan({
    marketplace: 'amazon.com',
    lines: [
      {
        billId: '49',
        billDocNumber: 'PH250940',
        billDate: '2025-09-29',
        vendorName: 'JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD',
        qboLineId: '5',
        accountName: 'Inventory Asset',
        amount: 17310.72,
        description: 'MFG; OWNER=US-PDS; PO=PO-19-PDS; SKU=CS-007; QTY=29440; UNIT_COST=0.588; SOURCE=PH250940',
      },
      {
        billId: '44',
        billDocNumber: 'PI-2508204A',
        billDate: '2025-08-20',
        vendorName: 'JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD',
        qboLineId: '1',
        accountName: 'Inventory Asset',
        amount: 971.52,
        description: 'PKG; OWNER=PO-19-PDS; ITEM=CS-007-BOX-PRESSING; QTY=29440; FOR_SKU=CS-007; PO=PO-19-PDS; SOURCE=PI-2508204A',
      },
      {
        billId: '44',
        billDocNumber: 'PI-2508204A',
        billDate: '2025-08-20',
        vendorName: 'JIANGSU ZHEWEI ELECTROMECHANICAL CO., LTD',
        qboLineId: '2',
        accountName: 'Inventory Asset',
        amount: 413.95,
        description: 'PKG; OWNER=UK-PDS; ITEM=CS-007-BOX-PRESSING; QTY=12544; FOR_SKU=CS-007; SOURCE=PI-2508204A',
      },
      {
        billId: '46',
        billDocNumber: 'PI-250804BOXB',
        billDate: '2025-08-04',
        vendorName: 'VICTOR HERO HOLDINGS LIMITED',
        qboLineId: '17',
        accountName: 'Inventory Asset',
        amount: 965.89,
        description: 'PKG; OWNER=UK; ITEM=CS-007-BOX; QTY=12544; FOR_SKU=CS-007; SOURCE=PI-250804BOXB',
      },
      {
        billId: '46',
        billDocNumber: 'PI-250804BOXB',
        billDate: '2025-08-04',
        vendorName: 'VICTOR HERO HOLDINGS LIMITED',
        qboLineId: '18',
        accountName: 'Inventory Asset',
        amount: 1.23,
        description: 'PKG; OWNER=RESIDUAL; ITEM=CS-007-BOX; QTY=16; FOR_SKU=CS-007; SOURCE=PI-250804BOXB',
      },
      {
        billId: '46',
        billDocNumber: 'PI-250804BOXB',
        billDate: '2025-08-04',
        vendorName: 'VICTOR HERO HOLDINGS LIMITED',
        qboLineId: '21',
        accountName: 'Inventory Asset',
        amount: 2,
        description: 'PKG; OWNER=RESIDUAL; ITEM=CS-12LD-7M-BOX; QTY=20; FOR_SKU=CS-12LD-7M; SOURCE=PI-250804BOXB',
      },
      {
        billId: '46',
        billDocNumber: 'PI-250804BOXB',
        billDate: '2025-08-04',
        vendorName: 'VICTOR HERO HOLDINGS LIMITED',
        qboLineId: '24',
        accountName: 'Inventory Asset',
        amount: 0.77,
        description: 'PKG; OWNER=RESIDUAL; ITEM=CS-1SD-32M-BOX; QTY=10; FOR_SKU=CS-1SD-32M; SOURCE=PI-250804BOXB',
      },
      {
        billId: '46',
        billDocNumber: 'PI-250804BOXB',
        billDate: '2025-08-04',
        vendorName: 'VICTOR HERO HOLDINGS LIMITED',
        qboLineId: '27',
        accountName: 'Inventory Asset',
        amount: 0.95,
        description: 'PKG; OWNER=RESIDUAL; ITEM=CS-010-BOX; QTY=10; FOR_SKU=CS-010; SOURCE=PI-250804BOXB',
      },
      {
        billId: '48',
        billDocNumber: 'ABC20250923007',
        billDate: '2025-09-23',
        vendorName: 'Huizhou Anboson Technology Co., Ltd',
        qboLineId: '1',
        accountName: 'Inventory Asset',
        amount: 560,
        description:
          'PKG; OWNER=US-PDS; ITEM=NITRILE_GLOVES; QTY=196 boxes; FOR_SKU=N/A; SOURCE=ABC20250923007; NOTES=item $490 plus shipping $70',
      },
      {
        billId: '605',
        billDocNumber: 'FSHY2512091572',
        billDate: '2026-02-24',
        vendorName: 'FOREST SHIPPING WORLDWIDE LTD',
        qboLineId: '1',
        accountName: 'Inventory Asset',
        amount: 6694.15,
        description: 'Freight invoice FSHY2512091572 - awaiting goods receipt for future UK-PDS shipment',
      },
    ],
  });

  assert.equal(plan.totalAmount, 8638.94);
  assert.deepEqual(
    plan.lines.map((line) => [line.billId, line.qboLineId, line.reason, line.amount]),
    [
      ['44', '2', 'NON_TARGET_MARKET_ASSET_LINE', 413.95],
      ['46', '17', 'NON_TARGET_MARKET_ASSET_LINE', 965.89],
      ['46', '18', 'RESIDUAL_ASSET_LINE', 1.23],
      ['46', '21', 'RESIDUAL_ASSET_LINE', 2],
      ['46', '24', 'RESIDUAL_ASSET_LINE', 0.77],
      ['46', '27', 'RESIDUAL_ASSET_LINE', 0.95],
      ['48', '1', 'NON_SKU_ASSET_LINE', 560],
      ['605', '1', 'UNPARSEABLE_ASSET_LINE', 6694.15],
    ],
  );
});

test('QBO inventory valuation tieout compares item valuation to Inventory Asset GL', () => {
  assert.deepEqual(
    assessQboInventoryValuationTieout({
      inventoryAssetBalance: 84134.69,
      inventoryValuationAssetValue: 75495.75,
    }),
    {
      ok: false,
      inventoryAssetBalance: 84134.69,
      inventoryValuationAssetValue: 75495.75,
      delta: 8638.94,
      tolerance: 0.01,
    },
  );

  assert.equal(
    assessQboInventoryValuationTieout({
      inventoryAssetBalance: 75495.75,
      inventoryValuationAssetValue: 75495.75,
    }).ok,
    true,
  );
});

test('QBO inventory valuation summary parser reads item rows and report total', () => {
  const parsed = parseQboInventoryValuationSummary({
    Rows: {
      Row: [
        {
          ColData: [
            { value: 'CS-007', id: '4' },
            { value: 'CS-007' },
            { value: '54634.00' },
            { value: '38218.18' },
            { value: '0.70' },
          ],
        },
        {
          ColData: [{ value: 'TOTAL' }, { value: ' ' }, { value: '' }, { value: '75495.75' }, { value: '' }],
          group: 'GrandTotal',
        },
      ],
    },
  });

  assert.equal(parsed.totalAssetValue, 75495.75);
  assert.deepEqual(parsed.rows, [
    {
      itemId: '4',
      name: 'CS-007',
      sku: 'CS-007',
      quantity: 54634,
      assetValue: 38218.18,
      averageCost: 0.7,
    },
  ]);
});

test('inventory movement planning blocks missing QBO item mappings and ignores refund stockbacks without proof', () => {
  const plan = buildSettlementInventoryMovementPlan({
    marketplace: 'amazon.com',
    settlementDocNumber: 'US-260501-260508-S2',
    txnDate: '2026-05-08',
    adjustmentAccountId: 'cogs-account',
    itemMappings: [{ marketplace: 'amazon.com', sellerSku: 'CS-007', qboItemId: 'item-cs007' }],
    auditRows: [
      {
        invoiceId: 'US-260501-260508-S2',
        market: 'us',
        date: '2026-05-01',
        orderId: 'ORDER-1',
        sku: 'CS-007',
        quantity: 3,
        description: 'Amazon Sales - Principal - US-PDS',
        net: 3000,
      },
      {
        invoiceId: 'US-260501-260508-S2',
        market: 'us',
        date: '2026-05-02',
        orderId: 'ORDER-2',
        sku: 'CS-007',
        quantity: -1,
        description: 'Amazon Refunds - Refunded Principal',
        net: -1000,
      },
      {
        invoiceId: 'US-260501-260508-S2',
        market: 'us',
        date: '2026-05-03',
        orderId: 'ORDER-3',
        sku: 'CS-010',
        quantity: 2,
        description: 'Amazon Sales - Principal - US-PDS',
        net: 2000,
      },
    ],
  });

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.blocks, [{ code: 'MISSING_QBO_ITEM_MAPPING', sellerSku: 'CS-010' }]);
  assert.deepEqual(plan.adjustmentLines, [{ sellerSku: 'CS-007', qboItemId: 'item-cs007', qtyDiff: -3 }]);
});

test('inventory movement planning emits QBO adjustment when every sold SKU is mapped', () => {
  const plan = buildSettlementInventoryMovementPlan({
    marketplace: 'amazon.com',
    settlementDocNumber: 'US-260501-260508-S2',
    txnDate: '2026-05-08',
    adjustmentAccountId: 'cogs-account',
    itemMappings: [
      { marketplace: 'amazon.com', sellerSku: 'CS-007', qboItemId: 'item-cs007' },
      { marketplace: 'amazon.com', sellerSku: 'CS-010', qboItemId: 'item-cs010' },
    ],
    auditRows: [
      {
        invoiceId: 'US-260501-260508-S2',
        market: 'us',
        date: '2026-05-01',
        orderId: 'ORDER-1',
        sku: 'CS-007',
        quantity: 3,
        description: 'Amazon Sales - Principal',
        net: 3000,
      },
      {
        invoiceId: 'US-260501-260508-S2',
        market: 'us',
        date: '2026-05-03',
        orderId: 'ORDER-3',
        sku: 'CS-010',
        quantity: 2,
        description: 'Amazon Sales - Principal',
        net: 2000,
      },
    ],
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.blocks, []);
  assert.deepEqual(plan.qboInventoryAdjustmentPayload, {
    AdjustAccountRef: { value: 'cogs-account' },
    domain: 'QBO',
    sparse: false,
    TxnDate: '2026-05-08',
    DocNumber: 'IA-260501-08-S2',
    PrivateNote: 'Plutus inventory movement | Settlement: US-260501-260508-S2 | Marketplace: amazon.com',
    Line: [
      {
        Id: '1',
        DetailType: 'ItemAdjustmentLineDetail',
        ItemAdjustmentLineDetail: {
          ItemRef: { value: 'item-cs007' },
          QtyDiff: -3,
        },
      },
      {
        Id: '2',
        DetailType: 'ItemAdjustmentLineDetail',
        ItemRef: undefined,
        ItemAdjustmentLineDetail: {
          ItemRef: { value: 'item-cs010' },
          QtyDiff: -2,
        },
      },
    ].map((line) => {
      const next = { ...line };
      delete (next as { ItemRef?: unknown }).ItemRef;
      return next;
    }),
  });
});

test('inventory movement planning supports UK settlement adjustment doc numbers', () => {
  const plan = buildSettlementInventoryMovementPlan({
    marketplace: 'amazon.co.uk',
    settlementDocNumber: 'UK-260501-260508-S2',
    txnDate: '2026-05-08',
    adjustmentAccountId: 'cogs-account',
    itemMappings: [{ marketplace: 'amazon.co.uk', sellerSku: 'CS-007', qboItemId: 'item-cs007' }],
    auditRows: [
      {
        invoiceId: 'UK-260501-260508-S2',
        market: 'uk',
        date: '2026-05-01',
        orderId: 'ORDER-UK-1',
        sku: 'CS-007',
        quantity: 4,
        description: 'Amazon Sales - Principal - UK-PDS',
        net: 4000,
      },
    ],
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.qboInventoryAdjustmentPayload?.DocNumber, 'IA-UK-260501-08-S2');
  assert.equal(plan.qboInventoryAdjustmentPayload?.Line[0]?.ItemAdjustmentLineDetail.QtyDiff, -4);
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
