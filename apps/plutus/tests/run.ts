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
import {
  buildExactCogsPlan,
  buildPlutusInventoryValuation,
  type ExactCostLayerInput,
} from '../lib/plutus/exact-cost-layer-subledger';
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
  assert.equal(source.includes("href: '/purchase-orders'"), true);
  assert.equal(source.includes("href: '/inventory-ledger'"), true);
  assert.equal(source.includes("href: '/cogs-batches'"), true);
  assert.equal(source.includes("href: '/exceptions'"), true);
  assert.equal(source.includes("href: '/sellerboard-export'"), true);
  assert.equal(source.includes("href: '/settlement-mapping'"), true);
  assert.equal(source.includes("href: '/qbo-audit'"), true);
  assert.equal(source.includes("href: '/products'"), false);
  assert.equal(source.includes("href: '/cogs-inputs'"), false);
});

test('Plutus exact inventory control surfaces are exposed without generic QBO creation flows', () => {
  for (const path of [
    'app/purchase-orders/page.tsx',
    'app/inventory-ledger/page.tsx',
    'app/cogs-batches/page.tsx',
    'app/exceptions/page.tsx',
    'app/sellerboard-export/page.tsx',
    'app/api/plutus/purchase-orders/route.ts',
    'app/api/plutus/inventory-ledger/route.ts',
    'lib/plutus/exact-cost-layer-subledger.ts',
  ]) {
    assert.equal(existsSync(path), true, `${path} should exist`);
  }

  for (const path of [
    'app/products/page.tsx',
    'app/cogs-inputs/page.tsx',
    'app/api/plutus/products/route.ts',
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
    'lib/qbo/inventory-adjustments.ts',
    'lib/qbo/inventory-documents.ts',
    'lib/plutus/qbo-inventory-movements.ts',
    'scripts/inventory-audit.ts',
    'scripts/inventory-bills-audit.ts',
    'scripts/backfill-subledger-foundation.ts',
    'scripts/qbo-complete-inventory-migration.ts',
    'scripts/qbo-create-inventory-purchase-orders.ts',
    'scripts/qbo-repair-inventory-valuation-tieout.ts',
  ]) {
    assertDeleted(path);
  }
});

test('Prisma schema models exact Plutus PO cost layers and consumption records', () => {
  const schema = read('prisma/schema.prisma');
  for (const required of [
    'model ProductGroup',
    'model CanonicalProduct',
    'model SkuAlias',
    'model PurchaseOrder',
    'model SourceDocument',
    'model LandedCostBatch',
    'model PoCostLayer',
    'model InventoryMovement',
    'model CostLayerConsumption',
    'model CogsPostingBatch',
    'model SellerboardCogsExport',
    'model PlutusException',
    '@@unique([marketplace, normalizedSellerSku])',
    '@@unique([purchaseOrderId, canonicalProductId, component])',
    '@@index([settlementDocNumber])',
  ]) {
    assert.equal(schema.includes(required), true, `${required} should exist in schema`);
  }

  for (const forbidden of [
    'model Brand',
    'model Sku {',
    'model BillMapping',
    'model BillLineMapping',
    'model OrderSale',
    'model OrderReturn',
    'invManufacturing',
    'productExpenses',
  ]) {
    assert.equal(schema.includes(forbidden), false, `${forbidden} should not exist in schema`);
  }
});

test('Prisma schema does not keep QBO native inventory adjustment bridge state', () => {
  const schema = read('prisma/schema.prisma');
  for (const forbidden of [
    'model QboInventoryItemMapping',
    'model QboInventoryMovementPosting',
    'qboInventoryAdjustmentId',
    'quantityDelta',
  ]) {
    assert.equal(schema.includes(forbidden), false, `${forbidden} should not exist in schema`);
  }
});

test('package scripts do not expose inventory ownership workflows', () => {
  const pkg = read('package.json');
  for (const forbidden of [
    'subledger:backfill',
    'inventory-audit',
    'inventory-bills-audit',
    'inventory:qbo:repair',
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
  assert.equal(pkg.includes('"inventory:exact:sync"'), true);
  assert.equal(pkg.includes('scripts/plutus-sync-exact-cost-layers-from-qbo.ts'), true);
  assert.equal(pkg.includes('"inventory:exact:cogs:sync"'), true);
  assert.equal(pkg.includes('scripts/plutus-sync-exact-cogs-from-audit.ts'), true);
  assert.equal(pkg.includes('"inventory:exact:audit"'), true);
  assert.equal(pkg.includes('scripts/plutus-exact-cost-layer-audit.ts'), true);
  assert.equal(existsSync('scripts/qbo-inventory-bridge-audit.ts'), true);
  assert.equal(existsSync('scripts/plutus-sync-exact-cost-layers-from-qbo.ts'), true);
  assert.equal(existsSync('scripts/plutus-sync-exact-cogs-from-audit.ts'), true);
  assert.equal(existsSync('scripts/plutus-exact-cost-layer-audit.ts'), true);
});

test('QBO inventory audit reports exact Plutus cost-layer evidence', () => {
  const source = read('scripts/qbo-inventory-bridge-audit.ts');
  assert.equal(source.includes('buildQboInventoryLandedCostPlan'), true);
  assert.equal(source.includes('buildQboInventoryAssetReclassPlan'), true);
  assert.equal(source.includes('buildExactCogsPlan'), true);
  assert.equal(source.includes('buildPlutusInventoryValuation'), true);
  assert.equal(source.includes('parseQboInventoryValuationSummary'), true);
  assert.equal(source.includes('plutusExactInventoryValuation'), true);
  assert.equal(source.includes('plutusExactCogsPreview'), true);
  assert.equal(source.includes('qboInventoryValuationTieout'), true);
  assert.equal(source.includes('qboInventoryAssetLines'), true);
  assert.equal(source.includes('qboLandedCostLayers'), true);
  assert.equal(source.includes('qboInventoryAssetBlocks'), true);
  assert.equal(source.includes('qboVsPlutusExactInventoryTieout'), true);
  assert.equal(source.includes('buildSettlementInventoryMovementPlan'), false);
  assert.equal(source.includes('qboNativeInventoryMigration'), false);
});

test('QBO audit page explains Plutus exact subledger controls', () => {
  const source = read('components/subledger/qbo-audit-page.tsx');
  assert.equal(source.includes('Exact cost subledger'), true);
  assert.equal(source.includes('QBO is the ledger; Plutus owns PO-layer COGS proof.'), true);
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

test('exact cost subledger values remaining inventory from unconsumed PO layers', () => {
  const valuation = buildPlutusInventoryValuation({
    layers: [
      {
        layerId: 'PO-19-PDS:CS-007',
        marketplace: 'amazon.com',
        internalPo: 'PO-19-PDS',
        sellerSku: 'CS-007',
        receiptDate: '2025-09-29',
        quantity: 29440,
        componentAmounts: {
          manufacturing: 17310.72,
          freight: 1702.48,
          duty: 2514.18,
          mfgAccessories: 3238.4,
        },
        sourceRefs: ['FSHY2509087198', 'PH250940', 'PI-250804BOXB', 'PI-2508204A'],
        qboBillLineRefs: ['44:1', '46:16', '49:5', '51:1', '51:5'],
      },
    ],
    consumptions: [
      {
        layerId: 'PO-19-PDS:CS-007',
        settlementDocNumber: 'US-260102-260116-S1',
        sellerSku: 'CS-007',
        quantity: 226,
        componentAmounts: {
          manufacturing: 132.89,
          freight: 13.07,
          duty: 19.3,
          mfgAccessories: 24.86,
        },
        totalAmount: 190.12,
      },
    ],
  });

  assert.deepEqual(valuation.layers, [
    {
      layerId: 'PO-19-PDS:CS-007',
      marketplace: 'amazon.com',
      internalPo: 'PO-19-PDS',
      sellerSku: 'CS-007',
      receiptDate: '2025-09-29',
      quantityReceived: 29440,
      quantityConsumed: 226,
      quantityRemaining: 29214,
      totalAmount: 24765.78,
      consumedAmount: 190.12,
      remainingAmount: 24575.66,
      unitCost: 0.841229,
      componentRemainingAmounts: {
        manufacturing: 17177.83,
        freight: 1689.41,
        duty: 2494.88,
        mfgAccessories: 3213.54,
      },
    },
  ]);
  assert.equal(valuation.totalRemainingAmount, 24575.66);
});

test('exact COGS engine consumes FIFO PO layers and builds QBO COGS journal draft', () => {
  const layers: ExactCostLayerInput[] = [
    {
      layerId: 'PO-19-PDS:CS-007',
      marketplace: 'amazon.com',
      internalPo: 'PO-19-PDS',
      sellerSku: 'CS-007',
      receiptDate: '2025-09-29',
      quantity: 29440,
      componentAmounts: {
        manufacturing: 17310.72,
        freight: 1702.48,
        duty: 2514.18,
        mfgAccessories: 3238.4,
      },
      sourceRefs: ['FSHY2509087198', 'PH250940', 'PI-250804BOXB', 'PI-2508204A'],
      qboBillLineRefs: ['44:1', '46:16', '49:5', '51:1', '51:5'],
    },
    {
      layerId: 'PO-20-PDS:CS-007',
      marketplace: 'amazon.com',
      internalPo: 'PO-20-PDS',
      sellerSku: 'CS-007',
      receiptDate: '2026-01-08',
      quantity: 33920,
      componentAmounts: {
        manufacturing: 20792.96,
        freight: 0,
        duty: 0,
        mfgAccessories: 0,
      },
      sourceRefs: ['PI-2601082'],
      qboBillLineRefs: ['362:4'],
    },
  ];

  const plan = buildExactCogsPlan({
    marketplace: 'amazon.com',
    settlementDocNumber: 'US-260102-260116-S1',
    txnDate: '2026-01-16',
    soldUnits: [{ sellerSku: 'CS-007', quantity: 226 }],
    layers,
    componentAccountIds: {
      manufacturing: 'cogs-mfg',
      freight: 'cogs-freight',
      duty: 'cogs-duty',
      mfgAccessories: 'cogs-accessories',
    },
    inventoryAssetAccountId: 'inventory-asset-plutus',
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.blocks, []);
  assert.deepEqual(plan.consumptions, [
    {
      layerId: 'PO-19-PDS:CS-007',
      settlementDocNumber: 'US-260102-260116-S1',
      marketplace: 'amazon.com',
      internalPo: 'PO-19-PDS',
      sellerSku: 'CS-007',
      receiptDate: '2025-09-29',
      quantity: 226,
      unitCost: 0.841229,
      componentUnitCosts: {
        manufacturing: 0.588,
        freight: 0.057829,
        duty: 0.0854,
        mfgAccessories: 0.11,
      },
      componentAmounts: {
        manufacturing: 132.89,
        freight: 13.07,
        duty: 19.3,
        mfgAccessories: 24.86,
      },
      totalAmount: 190.12,
      sourceRefs: ['FSHY2509087198', 'PH250940', 'PI-250804BOXB', 'PI-2508204A'],
      qboBillLineRefs: ['44:1', '46:16', '49:5', '51:1', '51:5'],
    },
  ]);
  assert.deepEqual(plan.componentTotals, {
    manufacturing: 132.89,
    freight: 13.07,
    duty: 19.3,
    mfgAccessories: 24.86,
  });
  assert.deepEqual(plan.qboJournalEntryDraft, {
    txnDate: '2026-01-16',
    docNumber: 'COGS-US-260102-260116-S1',
    privateNote: 'Plutus exact COGS | Settlement: US-260102-260116-S1 | Marketplace: amazon.com',
    lines: [
      {
        accountId: 'cogs-mfg',
        postingType: 'Debit',
        amount: 132.89,
        description: 'Manufacturing COGS; SKU=CS-007; PO=PO-19-PDS; QTY=226; UNIT=0.588000',
      },
      {
        accountId: 'cogs-freight',
        postingType: 'Debit',
        amount: 13.07,
        description: 'Freight COGS; SKU=CS-007; PO=PO-19-PDS; QTY=226; UNIT=0.057829',
      },
      {
        accountId: 'cogs-duty',
        postingType: 'Debit',
        amount: 19.3,
        description: 'Duty COGS; SKU=CS-007; PO=PO-19-PDS; QTY=226; UNIT=0.085400',
      },
      {
        accountId: 'cogs-accessories',
        postingType: 'Debit',
        amount: 24.86,
        description: 'Mfg Accessories COGS; SKU=CS-007; PO=PO-19-PDS; QTY=226; UNIT=0.110000',
      },
      {
        accountId: 'inventory-asset-plutus',
        postingType: 'Credit',
        amount: 190.12,
        description: 'Inventory Asset release; SKU=CS-007; PO=PO-19-PDS; QTY=226; UNIT=0.841229',
      },
    ],
  });
});

test('exact COGS engine blocks when sold units exceed available PO layers', () => {
  const plan = buildExactCogsPlan({
    marketplace: 'amazon.com',
    settlementDocNumber: 'US-260102-260116-S1',
    txnDate: '2026-01-16',
    soldUnits: [{ sellerSku: 'CS-007', quantity: 3 }],
    layers: [
      {
        layerId: 'PO-19-PDS:CS-007',
        marketplace: 'amazon.com',
        internalPo: 'PO-19-PDS',
        sellerSku: 'CS-007',
        receiptDate: '2025-09-29',
        quantity: 2,
        componentAmounts: {
          manufacturing: 1.18,
          freight: 0.12,
          duty: 0.17,
          mfgAccessories: 0.22,
        },
        sourceRefs: ['PH250940'],
        qboBillLineRefs: ['49:5'],
      },
    ],
    componentAccountIds: {
      manufacturing: 'cogs-mfg',
      freight: 'cogs-freight',
      duty: 'cogs-duty',
      mfgAccessories: 'cogs-accessories',
    },
    inventoryAssetAccountId: 'inventory-asset-plutus',
  });

  assert.equal(plan.ok, false);
  assert.deepEqual(plan.blocks, [
    {
      code: 'INSUFFICIENT_INVENTORY_LAYER',
      sellerSku: 'CS-007',
      requestedQuantity: 3,
      availableQuantity: 2,
      missingQuantity: 1,
    },
  ]);
  assert.equal(plan.qboJournalEntryDraft, null);
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
