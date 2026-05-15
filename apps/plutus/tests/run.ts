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
