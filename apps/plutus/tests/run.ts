import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

import {
  normalizeAuditMarketToMarketplaceId,
  selectAuditInvoiceForSettlement,
  type AuditInvoiceSummary,
} from '../lib/plutus/audit-invoice-matching';
import {
  formatAuditInvoiceResolutionMessage,
  resolveAuditInvoiceForSettlementChild,
} from '../lib/plutus/audit-invoice-resolution';
import { dbTableIdentifier, getDatasourceSchema } from '../lib/db';
import {
  computeSaleCostFromAverage,
  createEmptyLedgerSnapshot,
  replayInventoryLedger,
} from '../lib/inventory/ledger';
import {
  buildInventoryEventsFromMappings,
  parseQboBillsToInventoryEvents,
  parseSkuFromDescription,
  parseSkuQuantityFromDescription,
} from '../lib/inventory/qbo-bills';
import {
  buildAccountComponentMap,
  extractTrackedLinesFromBill,
} from '../lib/plutus/bills/classification';
import {
  buildBillMappingPullSyncUpdates,
  extractPoNumberFromBill,
} from '../lib/plutus/bills/pull-sync';
import { filterCogsInputRows } from '../lib/plutus/cogs-inputs/scope';
import {
  allocateManufacturingSplitAmounts,
  normalizeManufacturingSplits,
} from '../lib/plutus/bills/split';
import { buildCogsJournalLines } from '../lib/plutus/journal-builder';
import { parseAmazonTransactionCsv } from '../lib/reconciliation/amazon-csv';
import { parseAmazonUnifiedTransactionCsv } from '../lib/amazon-payments/unified-transaction-csv';
import {
  buildQboJournalEntriesFromUsSettlementDraft,
  buildUsSettlementDraftFromSpApiFinances,
} from '../lib/amazon-finances/us-settlement-builder';
import {
  buildQboJournalEntriesFromUkSettlementDraft,
  buildUkSettlementDraftFromSpApiFinances,
} from '../lib/amazon-finances/uk-settlement-builder';
import {
  parseSettlementSyncCliPostFlag,
  parseSettlementSyncWorkerPostMode,
} from '../lib/amazon-finances/settlement-sync-post-mode';
import { POST as postUsSpApiSettlementSync } from '../app/api/plutus/settlements/spapi/us/sync/route';
import { POST as postUkSpApiSettlementSync } from '../app/api/plutus/settlements/spapi/uk/sync/route';
import {
  buildSyntheticUkSettlementId,
  extractEventGroupIdFromSyntheticUkSettlementId,
} from '../lib/amazon-finances/uk-settlement-id';
import {
  buildSettlementAuditCsvBytes,
  buildSettlementAuditFilename,
  buildSettlementFullAuditTrailCsvBytes,
  buildSettlementFullAuditTrailFilename,
  buildSettlementMtdDailySummaryCsvBytes,
  buildSettlementMtdDailySummaryFilename,
} from '../lib/amazon-finances/settlement-evidence';
import { settlementJournalEntryMatchesSource } from '../lib/amazon-finances/settlement-sync-existing';
import { assertSettlementCashMappingDoesNotUseRealBankMovement } from '../lib/amazon-finances/settlement-cash-account-guardrails';
import {
  isSettlementOperatingBrandAccountName,
  normalizeSettlementOperatingMemo,
} from '../lib/amazon-finances/settlement-memo-normalization';
import { isBlockingProcessingCode } from '../lib/plutus/settlement-types';
import { buildPrincipalGroupsByDate, matchRefundsToSales } from '../lib/plutus/settlement-validation';
import {
  buildPlutusSettlementDocNumber,
  computeSettlementTotalFromJournalEntry,
  isSettlementDocNumber,
  normalizeSettlementDocNumber,
  parseSettlementDocNumber,
  stripPlutusDocPrefix,
} from '../lib/plutus/settlement-doc-number';
import {
  extractSourceSettlementIdFromPrivateNote,
  groupSettlementChildren,
} from '../lib/plutus/settlement-parents';
import { getSettlementDisplayId } from '../lib/plutus/settlement-display';
import {
  buildSettlementListRowViewModel,
  buildSettlementHistoryViewModel,
  buildSettlementPostingSectionViewModels,
  formatPlutusSettlementStatus,
} from '../lib/plutus/settlement-review';
import { normalizeSettlementMarketplaceQuery } from '../lib/plutus/settlement-marketplace-query';
import {
  marketplaceFromSettlementMappingRegion,
  settlementMappingRegionFromMarketplace,
} from '../lib/plutus/settlement-mapping-region';
import {
  buildLegacySettlementApiPath,
  buildLegacySettlementApiPreviewPath,
  buildLegacySettlementApiProcessPath,
  buildLegacySettlementPagePath,
  remapLegacySettlementPath,
} from '../lib/plutus/legacy-settlement-routes';
import {
  buildPlutusLineDescription,
  buildPlutusTraceMemo,
  comparePostingFingerprints,
  fingerprintPostingLines,
} from '../lib/plutus/subledger/qbo-trace';
import {
  resolveCanonicalProductAlias,
} from '../lib/plutus/subledger/sku-alias';
import {
  consumeInventoryMovementsFifo,
} from '../lib/plutus/subledger/cost-flow';
import {
  mapLegacyBrandNameToProductGroupCode,
  normalizeAliasValue,
  planLegacySubledgerBackfill,
} from '../lib/plutus/subledger/backfill';
import {
  buildPlutusHomeRedirectPath,
  classifyQboRefreshFailure,
  classifyQboVerificationFailure,
} from '../lib/qbo/connection-feedback';
import {
  classifyAuditExceptions,
} from '../lib/qbo/full-history-audit/rules';
import {
  normalizeBillForAudit,
  normalizeJournalEntryForAudit,
  normalizePurchaseForAudit,
  normalizeTransferForAudit,
} from '../lib/qbo/full-history-audit/normalize';
import {
  fetchAuditSourceData,
  getActiveQboConnection,
  mergeAttachmentRefs,
  qboFullHistoryAuditDeps,
  qboQueryAll,
  summarizeCoverage,
} from '../lib/qbo/full-history-audit/fetch';
import { buildAuditCsv, buildAuditMarkdownSummary } from '../lib/qbo/full-history-audit/report';
import type { NormalizedAuditTransaction } from '../lib/qbo/full-history-audit/types';
import { resolveMuiThemeMode } from '../lib/theme-mode';
import type { ProcessingBlock } from '../lib/plutus/settlement-types';
import type { QboAccount, QboBill, QboConnection } from '../lib/qbo/api';

const tests: Array<{ name: string; fn: () => void | Promise<void> }> = [];

function test(name: string, fn: () => void | Promise<void>) {
  tests.push({ name, fn });
}

function ruleIds(findings: Array<{ ruleId: string }>): string[] {
  return findings.map((finding) => finding.ruleId).sort();
}

function withDatabaseUrl(databaseUrl: string | undefined, fn: () => void) {
  const previousDatabaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = databaseUrl;
  }

  try {
    fn();
  } finally {
    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }
  }
}

test('normalizeAuditMarketToMarketplaceId maps common values', () => {
  assert.equal(normalizeAuditMarketToMarketplaceId('Amazon.com'), 'amazon.com');
  assert.equal(normalizeAuditMarketToMarketplaceId('amazon.co.uk'), 'amazon.co.uk');
  assert.equal(normalizeAuditMarketToMarketplaceId('US'), 'amazon.com');
  assert.equal(normalizeAuditMarketToMarketplaceId('UK'), 'amazon.co.uk');
  assert.equal(normalizeAuditMarketToMarketplaceId('unknown'), null);
});

test('resolveMuiThemeMode waits for mount before applying dark mode', () => {
  assert.equal(resolveMuiThemeMode(false, 'dark'), 'light');
  assert.equal(resolveMuiThemeMode(true, 'dark'), 'dark');
  assert.equal(resolveMuiThemeMode(true, 'light'), 'light');
  assert.equal(resolveMuiThemeMode(true, undefined), 'light');
});

test('settlement mapping region mirrors concrete app marketplace filters', () => {
  assert.equal(settlementMappingRegionFromMarketplace('US'), 'US');
  assert.equal(settlementMappingRegionFromMarketplace('UK'), 'UK');
  assert.equal(settlementMappingRegionFromMarketplace('all'), null);
  assert.equal(marketplaceFromSettlementMappingRegion('US'), 'US');
  assert.equal(marketplaceFromSettlementMappingRegion('UK'), 'UK');
});

test('settlement mapping page is labeled as settlement mappings, not account taxes', () => {
  const source = readFileSync(new URL('../app/settlement-mapping/page.tsx', import.meta.url), 'utf8');
  assert.equal(source.includes('Settlement Mappings'), true);
  assert.equal(source.includes('Account Taxes'), false);
});

test('dbTableIdentifier uses the configured Prisma schema for raw query identifiers', () => {
  withDatabaseUrl('postgresql://user:pass@localhost:5432/portal_db?schema=plutus_dev', () => {
    assert.equal(getDatasourceSchema(), 'plutus_dev');
    assert.equal(dbTableIdentifier('AuditDataRow'), '"plutus_dev"."AuditDataRow"');
  });
});

test('dbTableIdentifier rejects missing schema and unsafe identifiers', () => {
  withDatabaseUrl(undefined, () => {
    assert.throws(() => getDatasourceSchema(), /DATABASE_URL is required/);
  });
  withDatabaseUrl('postgresql://user:pass@localhost:5432/portal_db', () => {
    assert.throws(() => getDatasourceSchema(), /must include a schema/);
  });
  withDatabaseUrl('postgresql://user:pass@localhost:5432/portal_db?schema=plutus-dev', () => {
    assert.throws(() => getDatasourceSchema(), /Invalid database schema identifier/);
  });
  withDatabaseUrl('postgresql://user:pass@localhost:5432/portal_db?schema=plutus_dev', () => {
    assert.throws(() => dbTableIdentifier('AuditDataRow;DROP'), /Invalid database table identifier/);
  });
});

test('classifyQboRefreshFailure maps invalid_client to oauth client mismatch', () => {
  assert.equal(classifyQboRefreshFailure(new Error('invalid_client')), 'oauth_client_mismatch');
});

test('classifyQboRefreshFailure maps ci-placeholder config errors to oauth client mismatch', () => {
  assert.equal(
    classifyQboRefreshFailure(new Error('QBO_CLIENT_ID cannot use ci-placeholder')),
    'oauth_client_mismatch',
  );
});

test('classifyQboRefreshFailure maps invalid refresh token messages to refresh token invalid', () => {
  assert.equal(
    classifyQboRefreshFailure(new Error('The Refresh token is invalid, please Authorize again.')),
    'refresh_token_invalid',
  );
});

test('classifyQboVerificationFailure maps 403 to forbidden company and 401 to session expired', () => {
  assert.equal(classifyQboVerificationFailure(403), 'qbo_company_forbidden');
  assert.equal(classifyQboVerificationFailure(401), 'session_expired');
});

test('buildPlutusHomeRedirectPath preserves qbo callback query params', () => {
  assert.equal(buildPlutusHomeRedirectPath({ connected: 'true' }), '/settlements?connected=true');
  assert.equal(
    buildPlutusHomeRedirectPath({ error: 'token_exchange_failed', ignored: 'x' }),
    '/settlements?error=token_exchange_failed',
  );
  assert.equal(
    buildPlutusHomeRedirectPath({ connected: ['true', 'false'], error: ['invalid_state'] }),
    '/settlements?connected=true&error=invalid_state',
  );
});

test('Plutus QBO trace fields are deterministic and minimal', () => {
  assert.equal(
    buildPlutusTraceMemo({
      plutusRef: 'posting_123',
      source: 'AMZ_SETTLEMENT',
      market: 'US',
      period: '2026-05',
    }),
    'PLUTUS_REF=posting_123; SOURCE=AMZ_SETTLEMENT; MARKET=US; PERIOD=2026-05',
  );

  assert.equal(
    buildPlutusLineDescription({
      category: 'Amazon Sales - Principal',
      plutusLineId: 'line_abc',
    }),
    'Amazon Sales - Principal; PLUTUS_LINE=line_abc',
  );

  assert.throws(
    () => buildPlutusTraceMemo({ plutusRef: '', source: 'AMZ_SETTLEMENT', market: 'US', period: '2026-05' }),
    /plutusRef is required/,
  );
});

test('posting fingerprint comparison detects QBO line drift', () => {
  const expected = fingerprintPostingLines([
    { lineId: 'line_1', accountId: '187', amountCents: 1200, description: 'Amazon Sales; PLUTUS_LINE=line_1' },
    { lineId: 'line_2', accountId: '193', amountCents: -300, description: 'Amazon Seller Fees; PLUTUS_LINE=line_2' },
  ]);

  const live = fingerprintPostingLines([
    { lineId: 'line_1', accountId: '187', amountCents: 1200, description: 'Amazon Sales; PLUTUS_LINE=line_1' },
    { lineId: 'line_2', accountId: '194', amountCents: -300, description: 'Amazon Seller Fees; PLUTUS_LINE=line_2' },
  ]);

  assert.deepEqual(comparePostingFingerprints(expected, live), {
    status: 'drifted',
    missingLineIds: [],
    extraLineIds: [],
    changedLineIds: ['line_2'],
  });
});

test('SKU alias resolver maps market aliases to canonical products', () => {
  const aliases = [
    { canonicalProductId: 'prod_pds_7', marketplace: 'amazon.com', aliasType: 'SKU', value: 'CS-007' },
    { canonicalProductId: 'prod_pds_7', marketplace: 'amazon.co.uk', aliasType: 'SKU', value: 'CS 007' },
    { canonicalProductId: 'prod_pds_7', marketplace: 'amazon.com', aliasType: 'ASIN', value: 'B09HXC3NL8' },
  ];

  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.com', 'sku', 'cs-007'), 'prod_pds_7');
  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.co.uk', 'SKU', 'CS 007'), 'prod_pds_7');
  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.com', 'ASIN', 'b09hxc3nl8'), 'prod_pds_7');
  assert.equal(resolveCanonicalProductAlias(aliases, 'amazon.co.uk', 'ASIN', 'B09HXC3NL8'), null);
});

test('FIFO inventory movement consumes PO cost layers deterministically', () => {
  const result = consumeInventoryMovementsFifo({
    layers: [
      {
        id: 'layer_old',
        canonicalProductId: 'prod_pds_7',
        receivedDate: '2026-01-01',
        quantity: 5,
        componentCostsCents: { manufacturing: 500, freight: 100, duty: 0, mfgAccessories: 50 },
      },
      {
        id: 'layer_new',
        canonicalProductId: 'prod_pds_7',
        receivedDate: '2026-02-01',
        quantity: 10,
        componentCostsCents: { manufacturing: 2000, freight: 300, duty: 100, mfgAccessories: 0 },
      },
    ],
    movements: [
      {
        id: 'sale_1',
        canonicalProductId: 'prod_pds_7',
        movementDate: '2026-03-01',
        movementType: 'SALE',
        quantity: -7,
      },
    ],
  });

  assert.equal(result.blocks.length, 0);
  assert.deepEqual(result.movementCosts[0], {
    movementId: 'sale_1',
    quantity: 7,
    manufacturingCents: 900,
    freightCents: 160,
    dutyCents: 20,
    mfgAccessoriesCents: 50,
  });
  assert.deepEqual(result.endingLayers.map((layer) => ({ id: layer.id, remainingQuantity: layer.remainingQuantity })), [
    { id: 'layer_old', remainingQuantity: 0 },
    { id: 'layer_new', remainingQuantity: 8 },
  ]);
});

test('legacy subledger backfill groups current Brand and Sku rows without false PO merges', () => {
  assert.equal(mapLegacyBrandNameToProductGroupCode('US-PDS'), 'PDS');
  assert.equal(mapLegacyBrandNameToProductGroupCode('UK-CDS'), 'CDS');
  assert.equal(normalizeAliasValue(' cs-007 '), 'CS007');
  assert.equal(normalizeAliasValue('CS 007'), normalizeAliasValue('CS-007'));

  const plan = planLegacySubledgerBackfill({
    brands: [
      { id: 'brand_us_pds', name: 'US-PDS', marketplace: 'amazon.com', currency: 'USD' },
      { id: 'brand_uk_pds', name: 'UK-PDS', marketplace: 'amazon.co.uk', currency: 'GBP' },
    ],
    skus: [
      { id: 'sku_us', sku: 'CS-007', asin: 'B09HXC3NL8', productName: 'PDS 7', brandId: 'brand_us_pds' },
      { id: 'sku_uk', sku: 'CS 007', asin: 'B09HXC3NL8', productName: 'PDS 7', brandId: 'brand_uk_pds' },
    ],
    billMappings: [],
    billLineMappings: [],
    orderSales: [
      {
        id: 'sale_uk',
        marketplace: 'amazon.co.uk',
        orderId: 'ORDER-1',
        sku: 'CS-007',
        saleDate: new Date('2026-04-01T00:00:00.000Z'),
        quantity: 2,
      },
    ],
    orderReturns: [
      {
        id: 'return_uk',
        marketplace: 'amazon.co.uk',
        orderId: 'ORDER-1',
        sku: 'CS-007',
        returnDate: new Date('2026-04-02T00:00:00.000Z'),
        quantity: 1,
      },
    ],
  });

  assert.deepEqual(plan.productGroups.map((group) => group.code), ['PDS']);
  assert.equal(plan.canonicalProducts.length, 1);
  assert.deepEqual(
    plan.skuAliases.map((alias) => [alias.marketplace, alias.aliasType, alias.value]).sort(),
    [
      ['amazon.co.uk', 'ASIN', 'B09HXC3NL8'],
      ['amazon.co.uk', 'SKU', 'CS 007'],
      ['amazon.com', 'ASIN', 'B09HXC3NL8'],
      ['amazon.com', 'SKU', 'CS-007'],
    ],
  );
  assert.deepEqual(
    plan.inventoryMovements.map((movement) => ({
      canonicalProductKey: movement.canonicalProductKey,
      marketplace: movement.marketplace,
      movementType: movement.movementType,
      quantity: movement.quantity,
      movementDate: movement.movementDate.toISOString(),
      sourceType: movement.sourceType,
      sourceId: movement.sourceId,
      sourceLineId: movement.sourceLineId,
    })),
    [
      {
        canonicalProductKey: 'ASIN:B09HXC3NL8',
        marketplace: 'amazon.co.uk',
        movementType: 'SALE',
        quantity: -2,
        movementDate: '2026-04-01T00:00:00.000Z',
        sourceType: 'ORDER_SALE',
        sourceId: 'ORDER-1',
        sourceLineId: 'sale_uk',
      },
      {
        canonicalProductKey: 'ASIN:B09HXC3NL8',
        marketplace: 'amazon.co.uk',
        movementType: 'RETURN',
        quantity: 1,
        movementDate: '2026-04-02T00:00:00.000Z',
        sourceType: 'ORDER_RETURN',
        sourceId: 'ORDER-1',
        sourceLineId: 'return_uk',
      },
    ],
  );
});

test('normalizeSettlementDocNumber extracts embedded settlement ids', () => {
  assert.equal(isSettlementDocNumber('UK-16-30JAN-26-1'), true);
  assert.equal(isSettlementDocNumber('LMB-UK-16-30JAN-26-1'), true);
  assert.equal(isSettlementDocNumber('PLT-UK-16-30JAN-26-1'), true);
  assert.equal(isSettlementDocNumber('UK-260116-260130-S1'), true);
  assert.equal(isSettlementDocNumber('LMB-UK-260116-260130-S1'), true);
  assert.equal(isSettlementDocNumber('PLT-UK-260116-260130-S1'), true);
  assert.equal(normalizeSettlementDocNumber('UK-16-30JAN-26-1'), 'UK-260116-260130-S1');
  assert.equal(normalizeSettlementDocNumber('LMB-UK-16-30JAN-26-1'), 'UK-260116-260130-S1');
  assert.equal(normalizeSettlementDocNumber('PLT-UK-16-30JAN-26-1'), 'UK-260116-260130-S1');
  assert.equal(normalizeSettlementDocNumber('UK-260116-260130-S1'), 'UK-260116-260130-S1');
  assert.equal(normalizeSettlementDocNumber('LMB-UK-260116-260130-S1'), 'UK-260116-260130-S1');
  assert.equal(normalizeSettlementDocNumber('PLT-UK-260116-260130-S1'), 'UK-260116-260130-S1');
  assert.equal(stripPlutusDocPrefix('PLT-UK-260116-260130-S1'), 'UK-260116-260130-S1');
  assert.equal(buildPlutusSettlementDocNumber('UK-16-30JAN-26-1'), 'UK-260116-260130-S1');
  assert.equal(buildPlutusSettlementDocNumber('UK-260116-260130-S1'), 'UK-260116-260130-S1');

  const meta = parseSettlementDocNumber('LMB-UK-16-30JAN-26-1');
  assert.equal(meta.normalizedDocNumber, 'UK-260116-260130-S1');
  assert.equal(meta.marketplace.id, 'amazon.co.uk');
  assert.equal(meta.periodStart, '2026-01-16');
  assert.equal(meta.periodEnd, '2026-01-30');
});

test('computeSettlementTotalFromJournalEntry reads Plutus settlement control lines', () => {
  const accounts = new Map([
    ['178', { Id: '178', Name: 'Plutus Settlement Control', AccountType: 'Other Current Asset' }],
    ['400', { Id: '400', Name: 'Amazon Sales', AccountType: 'Income' }],
  ]) as any;

  const total = computeSettlementTotalFromJournalEntry(
    {
      Id: 'je-1',
      SyncToken: '0',
      TxnDate: '2026-04-30',
      DocNumber: 'US-260416-260430-S1',
      Line: [
        {
          Amount: 119.34,
          Description: 'Amazon Sales - Principal - US-PDS',
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: { PostingType: 'Credit', AccountRef: { value: '400' } },
        },
        {
          Amount: 119.34,
          Description: 'Settlement Control (FundTransferStatus=Succeeded)',
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: { PostingType: 'Debit', AccountRef: { value: '178' } },
        },
      ],
    },
    accounts,
  );

  assert.equal(total, 119.34);
});

test('extractSourceSettlementIdFromPrivateNote reads opaque source ids', () => {
  assert.equal(
    extractSourceSettlementIdFromPrivateNote('Region: UK | Settlement: EG5abc-12_Z | Group: Group-01'),
    'EG5abc-12_Z',
  );
});

test('extractSourceSettlementIdFromPrivateNote falls back to audit rebuild source invoice metadata', () => {
  assert.equal(
    extractSourceSettlementIdFromPrivateNote(
      'Plutus (audit rebuild) | Region: UK | Source invoice: UK-251205-260102-S1 | Upload: cmmffymev0000t93rviqvaytb',
    ),
    'UK-251205-260102-S1',
  );
});

test('computeSettlementTotalFromJournalEntry reads Plutus settlement control lines', () => {
  const total = computeSettlementTotalFromJournalEntry(
    {
      Id: '1375',
      SyncToken: '0',
      TxnDate: '2026-04-30',
      DocNumber: 'US-260416-260430-S1',
      Line: [
        {
          Id: '1',
          Amount: 119.34,
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: {
            PostingType: 'Debit',
            AccountRef: { value: '178', name: 'Plutus Settlement Control' },
          },
        },
      ],
    },
    new Map([
      [
        '178',
        {
          Id: '178',
          Name: 'Plutus Settlement Control',
          AccountType: 'Other Current Asset',
          Active: true,
        },
      ],
    ]),
  );

  assert.equal(total, 119.34);
});

test('settlementJournalEntryMatchesSource recognizes legacy combined settlement postings', () => {
  const journalEntry = {
    Id: '1018',
    SyncToken: '0',
    TxnDate: '2026-03-05',
    DocNumber: 'US-260219-260305-S1',
    PrivateNote:
      'Plutus (SP-API Finances) | Settlement: 25485000231 | Group: XjR5c86s8ZQPnKdKtg18A7digtRZjRZ8xMV6Rpd_9pM | Upload: cmmnga5jj0000t98sf88tez6i',
    Line: [],
  };

  assert.equal(
    settlementJournalEntryMatchesSource({
      journalEntry,
      settlementId: '25485000231',
      eventGroupId: 'XjR5c86s8ZQPnKdKtg18A7digtRZjRZ8xMV6Rpd_9pM',
    }),
    true,
  );
});

test('settlementJournalEntryMatchesSource rejects processing docs and mismatched groups', () => {
  const base = {
    Id: '1018',
    SyncToken: '0',
    TxnDate: '2026-03-05',
    PrivateNote:
      'Plutus (SP-API Finances) | Settlement: 25485000231 | Group: XjR5c86s8ZQPnKdKtg18A7digtRZjRZ8xMV6Rpd_9pM | Upload: cmmnga5jj0000t98sf88tez6i',
    Line: [],
  };

  assert.equal(
    settlementJournalEntryMatchesSource({
      journalEntry: { ...base, DocNumber: 'PUS-260219-260305-S1' },
      settlementId: '25485000231',
      eventGroupId: 'XjR5c86s8ZQPnKdKtg18A7digtRZjRZ8xMV6Rpd_9pM',
    }),
    false,
  );
  assert.equal(
    settlementJournalEntryMatchesSource({
      journalEntry: { ...base, DocNumber: 'US-260219-260305-S1' },
      settlementId: '25485000231',
      eventGroupId: 'different-group',
    }),
    false,
  );
});

test('buildSyntheticUkSettlementId and extractEventGroupIdFromSyntheticUkSettlementId round-trip opaque group ids', () => {
  const settlementId = buildSyntheticUkSettlementId('qQC9cUJ2CXKttlN6XhO9yHqPd7Yz8LTTsB7biek6vM4');
  assert.equal(settlementId, 'EG-qQC9cUJ2CXKttlN6XhO9yHqPd7Yz8LTTsB7biek6vM4');
  assert.equal(
    extractEventGroupIdFromSyntheticUkSettlementId(settlementId),
    'qQC9cUJ2CXKttlN6XhO9yHqPd7Yz8LTTsB7biek6vM4',
  );
  assert.equal(extractEventGroupIdFromSyntheticUkSettlementId('26583430662'), null);
});

test('groupSettlementChildren collapses split postings into one parent settlement', () => {
  const parents = groupSettlementChildren([
    {
      qboJournalEntryId: '100',
      docNumber: 'UK-251205-251231-S1',
      postedDate: '2025-12-31',
      memo: 'Region: UK | Settlement: EG5abc-12_Z | Group: G1',
      marketplace: {
        id: 'amazon.co.uk',
        label: 'Amazon.co.uk',
        currency: 'GBP',
        region: 'UK',
      },
      periodStart: '2025-12-05',
      periodEnd: '2025-12-31',
      settlementTotal: 112,
      plutusStatus: 'Pending' as const,
    },
    {
      qboJournalEntryId: '101',
      docNumber: 'UK-260101-260102-S2',
      postedDate: '2026-01-02',
      memo: 'Region: UK | Settlement: EG5abc-12_Z | Group: G1',
      marketplace: {
        id: 'amazon.co.uk',
        label: 'Amazon.co.uk',
        currency: 'GBP',
        region: 'UK',
      },
      periodStart: '2026-01-01',
      periodEnd: '2026-01-02',
      settlementTotal: -491.83,
      plutusStatus: 'Pending' as const,
    },
  ]);

  assert.equal(parents.length, 1);
  assert.equal(parents[0]?.parentId, 'UK:EG5abc-12_Z');
  assert.equal(parents[0]?.sourceSettlementId, 'EG5abc-12_Z');
  assert.equal(parents[0]?.periodStart, '2025-12-05');
  assert.equal(parents[0]?.periodEnd, '2026-01-02');
  assert.equal(parents[0]?.postedDate, '2026-01-02');
  assert.equal(parents[0]?.splitCount, 2);
  assert.equal(parents[0]?.childCount, 2);
  assert.equal(parents[0]?.isSplit, true);
  assert.equal(parents[0]?.plutusStatus, 'Pending');
  assert.equal(parents[0]?.hasInconsistency, false);
  assert.deepEqual(parents[0]?.eventGroupIds, ['G1']);
  assert.equal(parents[0]?.children[0]?.docNumber, 'UK-251205-251231-S1');
  assert.equal(parents[0]?.children[1]?.docNumber, 'UK-260101-260102-S2');
});

test('groupSettlementChildren marks mixed child states as inconsistent parent settlement', () => {
  const parents = groupSettlementChildren([
    {
      qboJournalEntryId: '200',
      docNumber: 'UK-260130-260131-S1',
      postedDate: '2026-01-31',
      memo: 'Region: UK | Settlement: MIXED-SETTLEMENT | Group: G2',
      marketplace: {
        id: 'amazon.co.uk',
        label: 'Amazon.co.uk',
        currency: 'GBP',
        region: 'UK',
      },
      periodStart: '2026-01-30',
      periodEnd: '2026-01-31',
      settlementTotal: 0,
      plutusStatus: 'Processed' as const,
    },
    {
      qboJournalEntryId: '201',
      docNumber: 'UK-260201-260213-S2',
      postedDate: '2026-02-13',
      memo: 'Region: UK | Settlement: MIXED-SETTLEMENT | Group: G2',
      marketplace: {
        id: 'amazon.co.uk',
        label: 'Amazon.co.uk',
        currency: 'GBP',
        region: 'UK',
      },
      periodStart: '2026-02-01',
      periodEnd: '2026-02-13',
      settlementTotal: 6702.34,
      plutusStatus: 'RolledBack' as const,
    },
  ]);

  assert.equal(parents.length, 1);
  assert.equal(parents[0]?.plutusStatus, 'Pending');
  assert.equal(parents[0]?.hasInconsistency, true);
});

test('getSettlementDisplayId keeps human-readable source settlement ids unchanged', () => {
  assert.equal(
    getSettlementDisplayId({
      sourceSettlementId: 'UK-251205-260102-S1',
      childDocNumbers: ['UK-251205-251231-S1', 'UK-260101-260102-S2'],
    }),
    'UK-251205-260102-S1',
  );
});

test('getSettlementDisplayId prefers posting doc numbers over raw Amazon settlement ids', () => {
  assert.equal(
    getSettlementDisplayId({
      sourceSettlementId: '26189598301',
      childDocNumbers: ['US-260416-260430-S1'],
    }),
    'US-260416-260430-S1',
  );
});

test('getSettlementDisplayId hides EG-prefixed source settlement ids behind the first posting doc number', () => {
  assert.equal(
    getSettlementDisplayId({
      sourceSettlementId: 'EG-6QWxMpvzArNB_-_BvUqJY_vKMMCH8T-3X9i0SUeXnbM',
      childDocNumbers: ['UK-260130-260131-S1', 'UK-260201-260213-S2'],
    }),
    'UK-260130-260131-S1',
  );
});

test('buildSettlementListRowViewModel keeps split settlements on one row with one muted subline', () => {
  const row = {
    sourceSettlementId: 'EG-hidden-source-id',
    marketplace: { label: 'Amazon.co.uk', currency: 'GBP', region: 'UK' },
    periodStart: '2026-03-27',
    periodEnd: '2026-04-10',
    settlementTotal: 0,
    plutusStatus: 'Pending',
    splitCount: 2,
    isSplit: true,
    hasInconsistency: false,
    children: [
      { docNumber: 'UK-260327-260331-S1-A' },
      { docNumber: 'UK-260327-260331-S1-B' },
    ],
  } as const;

  const view = buildSettlementListRowViewModel(row);
  assert.equal(view.title, 'UK-260327-260331-S1-A');
  assert.equal(view.subtitle, 'Amazon.co.uk · split across month-end · 2 postings');
});

test('buildSettlementListRowViewModel keeps non-split settlements to one secondary label', () => {
  const row = {
    sourceSettlementId: 'UK-260213-260227-S1',
    marketplace: { label: 'Amazon.co.uk', currency: 'GBP', region: 'UK' },
    periodStart: '2026-02-13',
    periodEnd: '2026-02-27',
    settlementTotal: 4508.25,
    plutusStatus: 'Processed',
    splitCount: 1,
    isSplit: false,
    hasInconsistency: false,
    children: [{ docNumber: 'UK-260213-260227-S1' }],
  } as const;

  const view = buildSettlementListRowViewModel(row);
  assert.equal(view.subtitle, 'Amazon.co.uk');
});

test('buildSettlementListRowViewModel carries a warning when child posting states disagree', () => {
  const row = {
    sourceSettlementId: 'EG-hidden-source-id',
    marketplace: { label: 'Amazon.co.uk', currency: 'GBP', region: 'UK' },
    periodStart: '2026-03-27',
    periodEnd: '2026-04-10',
    settlementTotal: 0,
    plutusStatus: 'Pending',
    splitCount: 2,
    isSplit: true,
    hasInconsistency: true,
    children: [
      { docNumber: 'UK-260327-260331-S1-A' },
      { docNumber: 'UK-260327-260331-S1-B' },
    ],
  } as const;

  const view = buildSettlementListRowViewModel(row);
  assert.equal(view.warningText, 'Child posting states need review');
});

test('formatPlutusSettlementStatus describes pending settlement postings as needing processing', () => {
  assert.equal(formatPlutusSettlementStatus('Pending'), 'Needs Processing');
  assert.equal(formatPlutusSettlementStatus('Processed'), 'Processed');
  assert.equal(formatPlutusSettlementStatus('RolledBack'), 'Rolled Back');
});

test('buildSettlementPostingSectionViewModels orders child postings chronologically and carries inline blocking state', () => {
  const detail = {
    settlement: { sourceSettlementId: 'UK-260327-260331-S1', marketplace: { currency: 'GBP', region: 'UK', label: 'Amazon.co.uk' } },
    children: [
      {
        qboJournalEntryId: 'je-b',
        docNumber: 'UK-260327-260331-S1-B',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-10',
        postedDate: '2026-04-10',
        settlementTotal: 0,
        plutusStatus: 'Pending',
        lines: [],
        invoiceResolution: { status: 'unresolved', reason: 'none', candidateInvoiceIds: [] },
        invoiceResolutionMessage: 'No audit invoice matched',
        processing: null,
        rollback: null,
      },
      {
        qboJournalEntryId: 'je-a',
        docNumber: 'UK-260327-260331-S1-A',
        periodStart: '2026-03-27',
        periodEnd: '2026-03-31',
        postedDate: '2026-03-31',
        settlementTotal: 0,
        plutusStatus: 'Pending',
        lines: [],
        invoiceResolution: { status: 'resolved', invoiceId: 'INV-1', source: 'doc_number' },
        invoiceResolutionMessage: 'Matched by doc number',
        processing: null,
        rollback: null,
      },
    ],
    history: [],
  } as const;

  const sections = buildSettlementPostingSectionViewModels(detail, null);
  assert.equal(sections[0]?.docNumber, 'UK-260327-260331-S1-A');
  assert.equal(sections[0]?.invoiceId, 'INV-1');
  assert.equal(sections[0]?.blockState, 'ready');
  assert.equal(sections[1]?.blockMessage, 'No audit invoice matched');
});

test('buildSettlementPostingSectionViewModels preserves preview severity and shared section shape', () => {
  const detail = {
    settlement: { sourceSettlementId: 'UK-260401-260410-S1', marketplace: { currency: 'GBP', region: 'UK', label: 'Amazon.co.uk' } },
    children: [
      {
        qboJournalEntryId: 'je-warning',
        docNumber: 'UK-260401-260405-S1-A',
        periodStart: '2026-04-01',
        periodEnd: '2026-04-05',
        postedDate: '2026-04-05',
        settlementTotal: 0,
        plutusStatus: 'Pending',
        lines: [],
        invoiceResolution: { status: 'resolved', invoiceId: 'INV-KEEP', source: 'doc_number' },
        invoiceResolutionMessage: 'Matched by doc number',
        processing: null,
        rollback: null,
      },
      {
        qboJournalEntryId: 'je-blocked',
        docNumber: 'UK-260406-260410-S1-B',
        periodStart: '2026-04-06',
        periodEnd: '2026-04-10',
        postedDate: '2026-04-10',
        settlementTotal: 0,
        plutusStatus: 'Pending',
        lines: [],
        invoiceResolution: { status: 'resolved', invoiceId: 'INV-BLOCKED', source: 'doc_number' },
        invoiceResolutionMessage: 'Matched by doc number',
        processing: null,
        rollback: null,
      },
    ],
    history: [],
  } as const;

  const preview = {
    children: [
      {
        qboJournalEntryId: 'je-warning',
        docNumber: 'UK-260401-260405-S1-A',
        invoiceId: 'INV-PREVIEW-WARN',
        preview: {
          blocks: [{ code: 'MISSING_SKU_MAPPING', message: 'Preview warning' }],
          sales: [],
          returns: [],
          cogsJournalEntry: { lines: [] },
          pnlJournalEntry: { lines: [] },
        },
      },
      {
        qboJournalEntryId: 'je-blocked',
        docNumber: 'UK-260406-260410-S1-B',
        invoiceId: 'INV-PREVIEW-BLOCKED',
        preview: {
          blocks: [{ code: 'MISSING_ACCOUNT_MAPPING', message: 'Preview blocked' }],
          sales: [],
          returns: [],
          cogsJournalEntry: { lines: [] },
          pnlJournalEntry: { lines: [] },
        },
      },
    ],
  } as const;

  const sections = buildSettlementPostingSectionViewModels(detail, preview);
  assert.equal(sections[0]?.invoiceId, 'INV-KEEP');
  assert.equal(sections[0]?.blockState, 'blocked');
  assert.equal(sections[0]?.blocks[0]?.severity, 'blocked');
  assert.equal(sections[0]?.blocks[0]?.message, 'Preview warning');
  assert.equal(sections[1]?.blockState, 'blocked');
  assert.equal(sections[1]?.blocks[0]?.severity, 'blocked');
  assert.equal(sections[1]?.blockMessage, 'Preview blocked');
  assert.deepEqual(Object.keys(sections[0] ?? {}), Object.keys(sections[1] ?? {}));
});

test('buildSettlementHistoryViewModel returns compact timestamp-first rows', () => {
  const rows = buildSettlementHistoryViewModel([
    {
      id: '1',
      timestamp: '2026-04-10T06:04:22.000Z',
      title: 'Processed',
      description: 'Processed in Plutus',
      childDocNumber: 'UK-260327-260331-S1-A',
      kind: 'processed',
    },
  ]);

  assert.equal(rows[0]?.timestampText.includes('2026'), true);
  assert.equal(rows[0]?.message, 'Processed in Plutus · UK-260327-260331-S1-A');
});

test('buildSettlementHistoryViewModel orders compact rows newest-first', () => {
  const history = buildSettlementHistoryViewModel([
    {
      id: 'h-1',
      timestamp: '2026-04-05T12:30:00.000Z',
      title: 'Processed in Plutus',
      description: 'Matched to invoice INV-2.',
      childDocNumber: 'UK-260401-260405-S1-A',
      kind: 'processed',
    },
    {
      id: 'h-2',
      timestamp: '2026-04-06T12:30:00.000Z',
      title: 'Rolled back in Plutus',
      description: 'Previously processed with invoice INV-2.',
      childDocNumber: 'UK-260406-260410-S1-B',
      kind: 'rolled_back',
    },
    {
      id: 'h-0',
      timestamp: '2026-04-01T12:30:00.000Z',
      title: 'Posting created',
      description: 'Month-end posting UK-260401-260405-S1-A was posted to QBO.',
      childDocNumber: 'UK-260401-260405-S1-A',
      kind: 'posted',
    },
  ]);

  assert.equal(history[0]?.id, 'h-2');
  assert.equal(
    history[0]?.message,
    'Rolled back in Plutus · Previously processed with invoice INV-2. · UK-260406-260410-S1-B',
  );
  assert.equal(history[2]?.kind, 'posted');
});

test('settlement detail source does not expose the removed analysis tab', () => {
  const source = readFileSync('app/settlements/[region]/[settlementId]/page.tsx', 'utf8');

  assert.equal(source.includes('label="Analysis"'), false);
  assert.equal(source.includes('value="analysis"'), false);
  assert.equal(source.includes("tab', 'analysis'"), false);
});

test('settlements list no longer links to removed history tab alias', () => {
  const source = readFileSync('app/settlements/page.tsx', 'utf8');

  assert.equal(source.includes('?tab=history'), false);
});

test('settlements list does not expose manual sync or auto-process controls', () => {
  const source = readFileSync('app/settlements/page.tsx', 'utf8');

  assert.equal(source.includes('Sync from Amazon'), false);
  assert.equal(source.includes('Auto-process'), false);
  assert.equal(source.includes('/api/plutus/autopost/check'), false);
});

test('settlements list labels the status column as Plutus processing state', () => {
  const source = readFileSync('app/settlements/page.tsx', 'utf8');

  assert.equal(source.includes('Plutus Processing'), true);
  assert.equal(source.includes('Settlement Status'), false);
  assert.equal(source.includes('QBO ${status}'), true);
});

test('settlements API marks listed settlements as posted QBO entries', () => {
  const source = readFileSync('app/api/plutus/settlements/route.ts', 'utf8');

  assert.equal(source.includes("qboStatus: 'Posted'"), true);
  assert.equal(source.includes('fetchJournalEntries'), true);
});

test('settlement detail source does not expose processing or rollback controls', () => {
  const source = readFileSync('app/settlements/[region]/[settlementId]/page.tsx', 'utf8');

  assert.equal(source.includes('Process settlement'), false);
  assert.equal(source.includes('Reprocess settlement'), false);
  assert.equal(source.includes('Rollback'), false);
  assert.equal(source.includes('Repair'), false);
  assert.equal(source.includes('/process'), false);
  assert.equal(source.includes("action: 'rollback'"), false);
});

test('settlement mutation routes require explicit human approval', () => {
  const routes = [
    'app/api/plutus/settlements/[region]/[settlementId]/route.ts',
    'app/api/plutus/settlements/[region]/[settlementId]/process/route.ts',
    'app/api/plutus/settlements/journal-entry/[id]/route.ts',
    'app/api/plutus/settlements/journal-entry/[id]/process/route.ts',
    'app/api/plutus/settlements/spapi/us/sync/route.ts',
    'app/api/plutus/settlements/spapi/uk/sync/route.ts',
  ];

  for (const route of routes) {
    const source = readFileSync(route, 'utf8');
    assert.equal(source.includes('requireHumanApprovalHeader'), true, route);
  }
});

test('settlement sync worker has no hidden autopost processing branch', () => {
  const source = readFileSync('scripts/settlement-sync-worker.ts', 'utf8');

  assert.equal(source.includes('PLUTUS_SETTLEMENT_SYNC_AUTOPROCESS_ENABLED'), false);
  assert.equal(source.includes('runAutopostCheck'), false);
  assert.equal(source.includes('autopost-check'), false);
});

test('ecosystem config runs settlement sync workers in explicit read-only QBO mode', () => {
  const source = readFileSync('../../ecosystem.config.js', 'utf8');

  assert.match(
    source,
    /name: 'dev-plutus-settlement-sync'[\s\S]*PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE: 'read_only'/,
  );
  assert.match(
    source,
    /name: 'main-plutus-settlement-sync'[\s\S]*PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE: 'read_only'/,
  );
  assert.equal(source.includes('PLUTUS_SETTLEMENT_SYNC_AUTOPROCESS_ENABLED'), false);
});

test('posted settlement rematch scripts load env before Prisma-backed modules', () => {
  for (const script of ['scripts/us-settlement-rematch.ts', 'scripts/uk-settlement-rematch.ts']) {
    const source = readFileSync(script, 'utf8');
    assert.equal(source.includes("import { loadSharedPlutusEnv } from './shared-env';"), true, script);
    assert.equal(source.includes("from '@/lib/db'"), false, script);
    assert.match(source, /loadSharedPlutusEnv\(\);[\s\S]*await loadPlutusEnv\(\);/, script);
    assert.match(source, /await loadPlutusEnv\(\);[\s\S]*await import\('@\/lib\/db'\)/, script);
    assert.match(source, /await loadPlutusEnv\(\);[\s\S]*await import\('@\/lib\/plutus\/settlement-processing'\)/, script);
  }
});

test('posted settlement rematch scripts require explicit human approval before posting', () => {
  for (const script of ['scripts/us-settlement-rematch.ts', 'scripts/uk-settlement-rematch.ts']) {
    const source = readFileSync(script, 'utf8');
    assert.equal(source.includes("import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';"), true, script);
    assert.equal(source.includes("arg === '--human-approval'"), true, script);
    assert.match(source, /if \(post && humanApproval !== HUMAN_APPROVAL_PHRASE\)/, script);
  }
});

test('posted settlement rematch scripts process oldest settlements first', () => {
  for (const script of ['scripts/us-settlement-rematch.ts', 'scripts/uk-settlement-rematch.ts']) {
    const source = readFileSync(script, 'utf8');
    assert.equal(source.includes('.sort((a, b) => a.TxnDate.localeCompare(b.TxnDate))'), true, script);
    assert.equal(source.includes('.sort((a, b) => b.TxnDate.localeCompare(a.TxnDate))'), false, script);
  }
});

test('SP-API settlement sync CLI scripts require human approval before mutation', () => {
  for (const script of ['scripts/us-settlement-sync-spapi.ts', 'scripts/uk-settlement-sync-spapi.ts']) {
    const source = readFileSync(script, 'utf8');
    assert.equal(source.includes("import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';"), true, script);
    assert.equal(source.includes("arg === '--human-approval'"), true, script);
    assert.match(source, /if \(\(postToQbo \|\| process\) && humanApproval !== HUMAN_APPROVAL_PHRASE\)/, script);
  }
});

test('US SP-API settlement reset is approval-gated and can target settlement ids', () => {
  const source = readFileSync('scripts/us-settlement-reset-spapi.ts', 'utf8');

  assert.equal(source.includes("import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';"), true);
  assert.equal(source.includes('settlementIds: string[] | undefined;'), true);
  assert.equal(source.includes("arg === '--settlement-ids'"), true);
  assert.equal(source.includes("arg === '--human-approval'"), true);
  assert.match(source, /if \(apply && humanApproval !== HUMAN_APPROVAL_PHRASE\)/);
  assert.equal(source.includes('function buildApplyCommand'), true);
  assert.equal(source.includes("'--post-qbo'"), true);
  assert.equal(source.includes('targetSettlementIds'), true);
  assert.equal(source.includes('extractSettlementIdFromPrivateNote'), true);
  assert.equal(source.includes('settlementIds: options.settlementIds'), true);
});

test('package scripts expose posted settlement rematch checks for both marketplaces', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };

  assert.equal(pkg.scripts['settlements:us:rematch'], 'tsx scripts/us-settlement-rematch.ts');
  assert.equal(pkg.scripts['settlements:uk:rematch'], 'tsx scripts/uk-settlement-rematch.ts');
  assert.equal(pkg.scripts['settlements:reclass:repair'], 'tsx scripts/settlement-reclass-repair.ts');
});

test('repair and rematch scripts do not require P&L reclass lines', () => {
  const repairSource = readFileSync('scripts/repair-missing-processing-jes.ts', 'utf8');
  const usRematchSource = readFileSync('scripts/us-settlement-rematch.ts', 'utf8');
  const ukRematchSource = readFileSync('scripts/uk-settlement-rematch.ts', 'utf8');
  const reclassRepairSource = readFileSync('scripts/settlement-reclass-repair.ts', 'utf8');

  assert.equal(repairSource.includes('createJournalEntry(connection'), true);
  assert.equal(repairSource.includes('computed.preview.pnlJournalEntry.lines.length === 0'), true);
  assert.equal(repairSource.includes('processing.processingHash !== computeProcessingHash([])'), true);
  assert.equal(repairSource.includes("options.marketplace === 'amazon.com' &&"), true);
  assert.equal(usRematchSource.includes('previewResult.preview.pnlJournalEntry.lines.length === 0 ||'), false);
  assert.equal(ukRematchSource.includes('previewResult.preview.pnlJournalEntry.lines.length === 0'), false);
  assert.equal(
    reclassRepairSource.includes('assertNoBankLines({ invoiceId, accountsById, journal: previewResult.preview.pnlJournalEntry })'),
    false,
  );
});

test('UK posted settlement rematch does not require COGS or P&L lines', () => {
  const source = readFileSync('scripts/uk-settlement-rematch.ts', 'utf8');

  assert.equal(source.includes('previewResult.preview.cogsJournalEntry.lines.length === 0 ||'), false);
  assert.equal(source.includes('const hasEmptyJournals = false;'), true);
});

test('settlement reclass repair is approval-gated and protects source settlement JEs', () => {
  const source = readFileSync('scripts/settlement-reclass-repair.ts', 'utf8');

  assert.equal(source.includes('HUMAN_APPROVAL_PHRASE'), true);
  assert.match(source, /if \(apply && humanApproval !== HUMAN_APPROVAL_PHRASE\)/);
  assert.equal(source.includes('rollbackProcessedSettlementByJournalEntryId'), true);
  assert.equal(source.includes('assertSameFingerprint(sourceBefore'), true);
  assert.equal(source.includes("const BANK_ACCOUNT_TYPES = new Set(['Bank', 'Credit Card']);"), true);
});

test('settlement parent account repair is approval-gated and targets settlement JEs only by payload', () => {
  const source = readFileSync('scripts/repair-settlement-parent-pnl-accounts.ts', 'utf8');

  assert.equal(source.includes('HUMAN_APPROVAL_PHRASE'), true);
  assert.equal(source.includes('updateJournalEntryWithPayload'), true);
  assert.equal(source.includes('qboSettlementJournalEntryId'), true);
  assert.equal(source.includes('qboCogsJournalEntryId'), false);
  assert.equal(source.includes('qboPnlReclassJournalEntryId'), false);
});

test('plutus primary nav exposes settlement and subledger accounting scope', () => {
  const source = readFileSync('components/app-header.tsx', 'utf8');

  for (const expected of [
    "label: 'Settlements'",
    "label: 'Products'",
    "label: 'Purchase Orders'",
    "label: 'Inventory Ledger'",
    "label: 'Mappings'",
    "label: 'QBO Audit'",
    "label: 'Settings'",
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }

  for (const removed of [
    "label: 'Transactions'",
    "label: 'Exceptions'",
    "label: 'Sources'",
    "label: 'Cashflow'",
    "label: 'COGS Inputs'",
    "label: 'Accounts & Taxes'",
    "label: 'Setup Wizard'",
    "label: 'Account Taxes'",
    "label: 'Chart of Accounts'",
    "href: '/transactions'",
    "href: '/exceptions'",
    "href: '/data-sources'",
    "href: '/cashflow'",
    "href: '/cogs-inputs'",
    "href: '/chart-of-accounts'",
  ]) {
    assert.equal(source.includes(removed), false, removed);
  }
});

test('removed auxiliary Plutus surfaces are deleted', () => {
  for (const path of [
    'app/transactions/page.tsx',
    'app/bills/page.tsx',
    'app/chart-of-accounts/page.tsx',
    'app/setup/page.tsx',
    'app/cashflow/page.tsx',
    'app/exceptions/page.tsx',
    'app/data-sources/page.tsx',
    'app/api/plutus/analytics',
    'app/api/plutus/audit-data',
    'app/api/plutus/audit-log',
    'app/api/plutus/ads-data',
    'app/api/plutus/autopost',
    'app/api/plutus/cashflow',
    'app/api/plutus/notifications',
    'app/api/plutus/users',
    'app/api/plutus/awd-data',
    'lib/plutus/autopost-check.ts',
    'lib/plutus/cashflow',
    'lib/awd',
    'lib/amazon-ads',
    'lib/store/bills.ts',
    'lib/store/chart-of-accounts.ts',
    'scripts/autopost-check.ts',
    'scripts/cashflow-refresh-worker.ts',
    'scripts/import-awd-fee-reports.ts',
  ]) {
    assert.equal(existsSync(path), false, path);
  }
});

test('settings page only exposes QBO connection settings', () => {
  const source = readFileSync('app/settings/page.tsx', 'utf8');

  assert.equal(source.includes('QuickBooks Online'), true);
  for (const removed of [
    'Notification Preferences',
    'Autopost',
    'Audit Log',
    'Users with access',
    '/api/plutus/notifications',
    '/api/plutus/autopost',
    '/api/plutus/audit-log',
    '/api/plutus/users',
  ]) {
    assert.equal(source.includes(removed), false, removed);
  }
});

test('auxiliary settings schema is removed', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');

  assert.equal(schema.includes('model NotificationPreference'), false);
  assert.equal(schema.includes('autopostEnabled'), false);
  assert.equal(schema.includes('autopostStartDate'), false);
});

test('ads report allocation schema is removed', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');

  for (const removed of [
    'model AdsDataUpload',
    'model AdsDataRow',
    'model SettlementAdsAllocation',
    'model SettlementAdsAllocationLine',
    'adsAllocation SettlementAdsAllocation?',
  ]) {
    assert.equal(schema.includes(removed), false, removed);
  }
});

test('cogs inputs page is read-only QBO source intake', () => {
  const routeSource = readFileSync('app/cogs-inputs/page.tsx', 'utf8');
  const pageSource = readFileSync('components/cogs-inputs/cogs-inputs-page.tsx', 'utf8');
  const apiSource = readFileSync('app/api/plutus/transactions/route.ts', 'utf8');

  assert.equal(routeSource.includes('CogsInputsPage'), true);
  assert.equal(pageSource.includes('PageHeader title="COGS Inputs"'), true);
  assert.equal(pageSource.includes("const tab = 'bill' as 'journalEntry' | 'bill' | 'purchase';"), true);
  assert.equal(pageSource.includes("scope: 'cogsInput'"), true);
  assert.equal(apiSource.includes('filterCogsInputRows(mappedBills)'), true);
  assert.equal(apiSource.includes('bills.length >= totalCount'), false);
  assert.equal(pageSource.includes('setCreateBillOpen(true)'), false);
  assert.equal(pageSource.includes('setCreatePurchaseOpen(true)'), false);
  assert.equal(pageSource.includes('<CreateBillModal'), false);
  assert.equal(pageSource.includes('<CreatePurchaseModal'), false);
  assert.equal(pageSource.includes('<Tabs'), false);
});

test('cogs input scoping keeps tracked or mapped bills only', () => {
  const rows = [
    { id: 'tracked', isTrackedBill: true, mapping: null },
    { id: 'mapped', isTrackedBill: false, mapping: { id: 'mapping-1' } },
    { id: 'general', isTrackedBill: false, mapping: null },
  ];

  assert.deepEqual(filterCogsInputRows(rows).map((row) => row.id), ['tracked', 'mapped']);
});

test('subledger schema defines the structured Plutus-owned tables', () => {
  const schema = readFileSync(new URL('../prisma/schema.prisma', import.meta.url), 'utf8');

  for (const expected of [
    'model ProductGroup',
    'model CanonicalProduct',
    'model SkuAlias',
    'model PurchaseOrder',
    'model PoCostLayer',
    'model InventoryMovement',
    'model PostingIntent',
    'model PostingIntentLine',
    'model QboPosting',
    'model QboPostingLineFingerprint',
  ]) {
    assert.equal(schema.includes(expected), true, expected);
  }

  assert.equal(schema.includes('@@unique([marketplace, aliasType, value])'), true);
  assert.equal(schema.includes('@@unique([sourceType, sourceId])'), true);
  assert.equal(schema.includes('@@unique([qboTxnType, qboTxnId])'), true);
});

test('subledger navigation exposes LMB-style Plutus control surfaces', () => {
  const source = readFileSync(new URL('../components/app-header.tsx', import.meta.url), 'utf8');

  for (const expected of [
    "label: 'Settlements'",
    "label: 'Products'",
    "label: 'Purchase Orders'",
    "label: 'Inventory Ledger'",
    "label: 'Mappings'",
    "label: 'QBO Audit'",
    "label: 'Settings'",
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }
});

test('subledger pages are wired to route wrappers', () => {
  assert.equal(readFileSync(new URL('../app/products/page.tsx', import.meta.url), 'utf8').includes('ProductsPage'), true);
  assert.equal(readFileSync(new URL('../app/purchase-orders/page.tsx', import.meta.url), 'utf8').includes('PurchaseOrdersPage'), true);
  assert.equal(readFileSync(new URL('../app/inventory-ledger/page.tsx', import.meta.url), 'utf8').includes('InventoryLedgerPage'), true);
  assert.equal(readFileSync(new URL('../app/qbo-audit/page.tsx', import.meta.url), 'utf8').includes('QboAuditPage'), true);
});

test('QBO audit API exposes flattened posting source fields', () => {
  const source = readFileSync(new URL('../app/api/plutus/qbo-audit/route.ts', import.meta.url), 'utf8');

  for (const expected of [
    'sourceType: row.postingIntent.sourceType',
    'sourceId: row.postingIntent.sourceId',
    'market: row.postingIntent.market',
    'lineCount: row.lineFingerprints.length',
  ]) {
    assert.equal(source.includes(expected), true, expected);
  }
});

test('normalizeSettlementMarketplaceQuery maps settlement route params to marketplace filters', () => {
  assert.equal(normalizeSettlementMarketplaceQuery('UK'), 'UK');
  assert.equal(normalizeSettlementMarketplaceQuery('us'), 'US');
  assert.equal(normalizeSettlementMarketplaceQuery(' all '), 'all');
  assert.equal(normalizeSettlementMarketplaceQuery(''), null);
  assert.equal(normalizeSettlementMarketplaceQuery('eu'), null);
});

test('legacy settlement route helpers move JE-centric paths under a static namespace', () => {
  assert.equal(buildLegacySettlementPagePath('942'), '/settlements/journal-entry/942');
  assert.equal(buildLegacySettlementApiPath('942'), '/api/plutus/settlements/journal-entry/942');
  assert.equal(buildLegacySettlementApiPreviewPath('942'), '/api/plutus/settlements/journal-entry/942/preview');
  assert.equal(buildLegacySettlementApiProcessPath('942'), '/api/plutus/settlements/journal-entry/942/process');
});

test('remapLegacySettlementPath rewrites only the old JE-centric paths', () => {
  assert.equal(remapLegacySettlementPath('/settlements/942'), '/settlements/journal-entry/942');
  assert.equal(
    remapLegacySettlementPath('/api/plutus/settlements/942/process'),
    '/api/plutus/settlements/journal-entry/942/process',
  );
  assert.equal(remapLegacySettlementPath('/settlements/UK'), null);
  assert.equal(remapLegacySettlementPath('/settlements/EG-woKl-tLp497yRl0l9XoJFbQ0JvdTtCpgj_zxCUFb1nc'), null);
  assert.equal(remapLegacySettlementPath('/settlements/UK/EG5abc-12_Z'), null);
  assert.equal(remapLegacySettlementPath('/api/plutus/settlements/UK/EG5abc-12_Z/preview'), null);
  assert.equal(remapLegacySettlementPath('/settlements/journal-entry/942'), null);
  assert.equal(remapLegacySettlementPath('/api/plutus/settlements/journal-entry/942'), null);
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

test('selectAuditInvoiceForSettlement prefers invoiceId matching settlement DocNumber', () => {
  const invoices: AuditInvoiceSummary[] = [
    { invoiceId: 'MONTHLY', marketplace: 'amazon.com', markets: ['Amazon.com'], minDate: '2026-02-01', maxDate: '2026-02-28', rowCount: 100 },
    { invoiceId: 'US-260201-260214-S1', marketplace: 'amazon.com', markets: ['Amazon.com'], minDate: '2026-02-01', maxDate: '2026-02-14', rowCount: 10 },
  ];

  const match = selectAuditInvoiceForSettlement({
    settlementMarketplace: 'amazon.com',
    settlementPeriodStart: '2026-02-01',
    settlementPeriodEnd: '2026-02-14',
    settlementDocNumber: 'US-260201-260214-S1',
    invoices,
  });

  assert.deepEqual(match, { kind: 'match', matchType: 'doc_number', invoiceId: 'US-260201-260214-S1' });
});

test('resolveAuditInvoiceForSettlementChild reuses processed invoice before recomputing matches', () => {
  const invoices: AuditInvoiceSummary[] = [
    { invoiceId: 'UK-260213-260227-S1', marketplace: 'amazon.co.uk', markets: ['Amazon.co.uk'], minDate: '2026-02-13', maxDate: '2026-02-27', rowCount: 10 },
  ];

  const resolution = resolveAuditInvoiceForSettlementChild({
    marketplace: 'amazon.co.uk',
    periodStart: '2026-02-13',
    periodEnd: '2026-02-27',
    settlementDocNumber: 'UK-260213-260227-S1',
    processingInvoiceId: 'I7978898',
    invoices,
  });

  assert.deepEqual(resolution, {
    status: 'resolved',
    invoiceId: 'I7978898',
    source: 'processing',
  });
});

test('resolveAuditInvoiceForSettlementChild returns unresolved ambiguity instead of requiring a client selector', () => {
  const invoices: AuditInvoiceSummary[] = [
    { invoiceId: 'A', marketplace: 'amazon.co.uk', markets: ['Amazon.co.uk'], minDate: '2026-01-01', maxDate: '2026-01-07', rowCount: 5 },
    { invoiceId: 'B', marketplace: 'amazon.co.uk', markets: ['Amazon.co.uk'], minDate: '2026-01-08', maxDate: '2026-01-14', rowCount: 5 },
  ];

  const resolution = resolveAuditInvoiceForSettlementChild({
    marketplace: 'amazon.co.uk',
    periodStart: '2026-01-01',
    periodEnd: '2026-01-14',
    settlementDocNumber: 'UK-260101-260114-S1',
    invoices,
  });

  assert.deepEqual(resolution, {
    status: 'unresolved',
    reason: 'ambiguous',
    candidateInvoiceIds: ['A', 'B'],
  });
  assert.equal(
    formatAuditInvoiceResolutionMessage(resolution),
    'Multiple stored audit invoices match this posting period: A, B',
  );
});

test('parseAmazonTransactionCsv parses required totals', () => {
  const csv = ['Order Id,Total,Type', '123-123,10.50,Order'].join('\n');
  const parsed = parseAmazonTransactionCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.orderId, '123-123');
  assert.equal(parsed.rows[0]?.total, 10.5);
});

test('parseAmazonTransactionCsv skips preamble before header row', () => {
  const csv = ['"Includes Amazon Marketplace transactions"', 'Order Id,Total,Type', '123-123,10.50,Order'].join('\n');
  const parsed = parseAmazonTransactionCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.orderId, '123-123');
  assert.equal(parsed.rows[0]?.total, 10.5);
});

test('parseAmazonTransactionCsv throws on invalid totals', () => {
  const csv = ['Order Id,Total', '123-123,abc'].join('\n');
  assert.throws(() => parseAmazonTransactionCsv(csv));
});

test('parseAmazonUnifiedTransactionCsv parses Monthly Unified Transaction report rows (including non-order)', () => {
  const csv = [
    '"Includes Amazon Marketplace, Fulfillment by Amazon (FBA), and Amazon Webstore transactions"',
    '"All amounts in USD, unless specified"',
    '"date/time","settlement id","type","order id","sku","description","quantity","marketplace","product sales","product sales tax","shipping credits","shipping credits tax","gift wrap credits","giftwrap credits tax","Regulatory Fee","Tax On Regulatory Fee","promotional rebates","promotional rebates tax","marketplace withheld tax","selling fees","fba fees","other transaction fees","other","total"',
    '"Jan 5, 2026 11:03:05 AM PST","S1","Service Fee","","","Subscription","","Amazon.com","0","0","0","0","0","0","0","0","0","0","0","0","0","0","0","-21.73","-21.73"',
    '"Jan 6, 2026 7:21:49 PM PST","S1","Order","111-1","SKU-1","Test Product","1","amazon.com","10.00","0.80","0","0","0","0","0","0","0","0","-0.80","-1.50","-3.00","0","0","5.50"',
  ].join('\n');

  const parsed = parseAmazonUnifiedTransactionCsv(csv);
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]?.settlementId, 'S1');
  assert.equal(parsed.rows[0]?.type, 'Service Fee');
  assert.equal(parsed.rows[0]?.orderId, '');
  assert.equal(parsed.rows[0]?.total, -21.73);
  assert.equal(parsed.rows[1]?.orderId, '111-1');
  assert.equal(parsed.rows[1]?.productSales, 10);
  assert.equal(parsed.rows[1]?.sellingFees, -1.5);
  assert.equal(parsed.rows[1]?.fbaFees, -3);
  assert.equal(parsed.rows[1]?.total, 5.5);
});

test('buildSettlementAuditFilename prefixes settlement evidence files', () => {
  assert.equal(buildSettlementAuditFilename('UK-260116-260130-S1'), 'plutus-settlement-audit-UK-260116-260130-S1.csv');
});

test('buildSettlementFullAuditTrailFilename prefixes full audit trail files', () => {
  assert.equal(buildSettlementFullAuditTrailFilename('UK-260116-260130-S1'), 'plutus-full-audit-trail-UK-260116-260130-S1.csv');
});

test('buildSettlementMtdDailySummaryFilename prefixes mtd summary files', () => {
  assert.equal(buildSettlementMtdDailySummaryFilename('UK-260116-260130-S1'), 'plutus-mtd-daily-summary-UK-260116-260130-S1.csv');
});

test('buildSettlementAuditCsvBytes serializes escaped rows with cents', () => {
  const bytes = buildSettlementAuditCsvBytes([
    {
      invoiceId: 'UK-260116-260130-S1',
      market: 'uk',
      date: '2026-01-16',
      orderId: '123-123',
      sku: 'SKU-1',
      quantity: 2,
      description: 'Amazon fee, "test"',
      netCents: -1050,
    },
  ]);

  const csv = Buffer.from(bytes).toString('utf8');
  const expected = [
    'invoiceId,market,date,orderId,sku,quantity,description,net',
    'UK-260116-260130-S1,uk,2026-01-16,123-123,SKU-1,2,"Amazon fee, ""test""",-10.50',
  ].join('\n');

  assert.equal(csv, expected);
});

test('buildSettlementFullAuditTrailCsvBytes serializes settlement lines with account and tax columns', () => {
  const bytes = buildSettlementFullAuditTrailCsvBytes({
    invoiceId: 'UK-260116-260130-S1',
    countryCode: 'GB',
    accountIdByMemo: new Map([['Amazon fee, "test"', '184']]),
    taxCodeIdByMemo: new Map([['Amazon fee, "test"', null]]),
    rows: [
      {
        invoiceId: 'UK-260116-260130-S1',
        market: 'uk',
        date: '2026-01-16',
        orderId: '123-123',
        sku: 'SKU-1',
        quantity: 2,
        description: 'Amazon fee, "test"',
        netCents: -1050,
      },
    ],
  });

  const csv = Buffer.from(bytes).toString('utf8');
  const expected = [
    'date,Order Id,Sku,Sku Name,Quantity,LMB Line Description,Account Name,Tax Rate,Tax Name,Gross,Tax,Net,Country,Invoice',
    '2026-01-16,123-123,SKU-1,,2,"Amazon fee, ""test""",184,0,No Tax Rate Applicable,-10.50,0.00,-10.50,GB,UK-260116-260130-S1',
  ].join('\n');

  assert.equal(csv, expected);
});

test('buildSettlementMtdDailySummaryCsvBytes builds daily totals by memo', () => {
  const bytes = buildSettlementMtdDailySummaryCsvBytes({
    marketplaceName: 'Amazon.co.uk',
    currencyCode: 'GBP',
    startIsoDay: '2026-01-16',
    endIsoDay: '2026-01-17',
    accountIdByMemo: new Map([
      ['Amazon Sales - Principal', '188'],
      ['Amazon Seller Fees - Commission', '183'],
    ]),
    taxCodeIdByMemo: new Map([
      ['Amazon Sales - Principal', null],
      ['Amazon Seller Fees - Commission', null],
    ]),
    rows: [
      {
        invoiceId: 'UK-260116-260130-S1',
        market: 'uk',
        date: '2026-01-16',
        orderId: 'o-1',
        sku: 'SKU-1',
        quantity: 1,
        description: 'Amazon Sales - Principal',
        netCents: 1000,
      },
      {
        invoiceId: 'UK-260116-260130-S1',
        market: 'uk',
        date: '2026-01-17',
        orderId: 'o-2',
        sku: 'SKU-2',
        quantity: 1,
        description: 'Amazon Sales - Principal',
        netCents: 500,
      },
      {
        invoiceId: 'UK-260116-260130-S1',
        market: 'uk',
        date: '2026-01-17',
        orderId: 'o-3',
        sku: 'SKU-3',
        quantity: 1,
        description: 'Amazon Seller Fees - Commission',
        netCents: -250,
      },
    ],
  });

  const csv = Buffer.from(bytes).toString('utf8');
  const expected = [
    'Marketplace,Amazon.co.uk,Currency,GBP,Start Date,2026-01-16,End Date,2026-01-17',
    '',
    'Description,Tax Code,Account Code,Total,2026-01-16,2026-01-17',
    'Amazon Sales - Principal,No Tax Rate Applicable,188,15.00,10.00,5.00',
    'Amazon Seller Fees - Commission,No Tax Rate Applicable,183,-2.50,0.00,-2.50',
  ].join('\n');

  assert.equal(csv, expected);
});

test('normalizeSettlementOperatingMemo removes legacy brand suffixes from sales and refunds only', () => {
  assert.equal(normalizeSettlementOperatingMemo('Amazon Sales - Principal - US-PDS'), 'Amazon Sales - Principal');
  assert.equal(
    normalizeSettlementOperatingMemo('Amazon Sales - Principal (Marketplace VAT Responsible) - UK-PDS'),
    'Amazon Sales - Principal (Marketplace VAT Responsible)',
  );
  assert.equal(
    normalizeSettlementOperatingMemo('Amazon Refunds - Refunded Shipping Promotion - US-PDS'),
    'Amazon Refunds - Refunded Shipping Promotion',
  );
  assert.equal(normalizeSettlementOperatingMemo('Amazon Seller Fees - Commission'), 'Amazon Seller Fees - Commission');
});

test('isSettlementOperatingBrandAccountName flags branded settlement P&L accounts', () => {
  assert.equal(isSettlementOperatingBrandAccountName('Amazon Sales:Amazon Sales - US-PDS'), true);
  assert.equal(isSettlementOperatingBrandAccountName('Amazon Refunds:Amazon Refunds - UK-PDS'), true);
  assert.equal(isSettlementOperatingBrandAccountName('Amazon FBA Fees:Amazon FBA Fees - US-PDS'), true);
  assert.equal(isSettlementOperatingBrandAccountName('Amazon Sales'), false);
  assert.equal(isSettlementOperatingBrandAccountName('Inventory Asset:Manufacturing - US-PDS'), false);
});

test('buildUsSettlementDraftFromSpApiFinances emits parent sales and refund memos', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'US-SET-PARENT-1',
    eventGroupId: 'US-GROUP-PARENT-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-16T00:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-30T23:59:59.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: 8 },
    },
    events: {
      ShipmentEventList: [
        {
          PostedDate: '2026-04-20T12:00:00.000Z',
          AmazonOrderId: 'ORDER-US-1',
          ShipmentItemList: [
            {
              SellerSKU: 'SKU-US-1',
              QuantityShipped: 1,
              ItemChargeList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: 10 } },
                { ChargeType: 'ShippingCharge', ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: 2 } },
              ],
            },
          ],
        },
      ],
      RefundEventList: [
        {
          PostedDate: '2026-04-21T12:00:00.000Z',
          AmazonOrderId: 'ORDER-US-2',
          ShipmentItemAdjustmentList: [
            {
              SellerSKU: 'SKU-US-1',
              QuantityShipped: 1,
              ItemChargeAdjustmentList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: -3 } },
                { ChargeType: 'ShippingCharge', ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: -1 } },
              ],
            },
          ],
        },
      ],
    },
    skuToBrandName: new Map([['SKU-US-1', 'US-PDS']]),
    brandLabelByBrandName: new Map([['US-PDS', 'US-PDS']]),
  });

  const totals = draft.segments[0]!.memoTotalsCents;
  assert.equal(totals.get('Amazon Sales - Principal'), 1000);
  assert.equal(totals.get('Amazon Sales - Shipping'), 200);
  assert.equal(totals.get('Amazon Refunds - Refunded Principal'), -300);
  assert.equal(totals.get('Amazon Refunds - Refunded Shipping'), -100);
  assert.equal(totals.has('Amazon Sales - Principal - US-PDS'), false);
  assert.equal(totals.has('Amazon Refunds - Refunded Principal - US-PDS'), false);
});

test('buildUsSettlementDraftFromSpApiFinances splits cross-month settlement periods by default', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-1',
    eventGroupId: 'GROUP-1',
    eventGroup: {
      FinancialEventGroupStart: '2025-12-19T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-01-02T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: -1 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2026-01-02T08:00:00.000Z',
          AdjustmentType: 'ReserveDebit',
          AdjustmentAmount: { CurrencyCode: 'USD', CurrencyAmount: -1 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 2);
  assert.equal(draft.segments[0]?.docNumber, 'US-251219-251231-S1');
  assert.equal(draft.segments[1]?.docNumber, 'US-260101-260102-S2');

  const cents = draft.segments[1]?.memoTotalsCents.get('Amazon Reserved Balances - Current Reserve Amount');
  assert.equal(cents, -100);

  assert.equal(draft.segments[0]?.memoTotalsCents.has('Split month settlement - balance of this invoice rolled forward'), false);
  assert.equal(draft.segments[0]?.memoTotalsCents.has('Split month settlement - balance of previous invoice(s) rolled forward'), false);
  assert.equal(draft.segments[1]?.memoTotalsCents.has('Split month settlement - balance of this invoice rolled forward'), false);
  assert.equal(draft.segments[1]?.memoTotalsCents.has('Split month settlement - balance of previous invoice(s) rolled forward'), false);
});

test('buildUsSettlementDraftFromSpApiFinances splits multi-month settlements into monthly segments with rollovers', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-SPLIT-1',
    eventGroupId: 'GROUP-SPLIT-1',
    eventGroup: {
      FinancialEventGroupStart: '2025-12-19T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-02-02T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: -3 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2025-12-31T08:00:00.000Z',
          AdjustmentType: 'ReserveDebit',
          AdjustmentAmount: { CurrencyCode: 'USD', CurrencyAmount: -1 },
        },
        {
          PostedDate: '2026-02-02T08:00:00.000Z',
          AdjustmentType: 'ReserveDebit',
          AdjustmentAmount: { CurrencyCode: 'USD', CurrencyAmount: -2 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 3);
  assert.equal(draft.segments[0]?.docNumber, 'US-251219-251231-S1');
  assert.equal(draft.segments[1]?.docNumber, 'US-260101-260131-S2');
  assert.equal(draft.segments[2]?.docNumber, 'US-260201-260202-S3');

  const seg1 = draft.segments[0]!;
  const seg2 = draft.segments[1]!;
  const seg3 = draft.segments[2]!;

  const sum = (map: Map<string, number>): number => {
    let total = 0;
    for (const v of map.values()) total += v;
    return total;
  };

  assert.equal(seg1.memoTotalsCents.get('Amazon Reserved Balances - Current Reserve Amount'), -100);
  assert.equal(seg1.memoTotalsCents.has('Split month settlement - balance of previous invoice(s) rolled forward'), false);
  assert.equal(seg1.memoTotalsCents.get('Split month settlement - balance of this invoice rolled forward'), 100);
  assert.equal(sum(seg1.memoTotalsCents), 0);

  assert.equal(seg2.memoTotalsCents.get('Split month settlement - balance of previous invoice(s) rolled forward'), -100);
  assert.equal(seg2.memoTotalsCents.get('Split month settlement - balance of this invoice rolled forward'), 100);
  assert.equal(sum(seg2.memoTotalsCents), 0);

  assert.equal(seg3.memoTotalsCents.get('Amazon Reserved Balances - Current Reserve Amount'), -200);
  assert.equal(seg3.memoTotalsCents.get('Split month settlement - balance of previous invoice(s) rolled forward'), -100);
  assert.equal(seg3.memoTotalsCents.has('Split month settlement - balance of this invoice rolled forward'), false);
  assert.equal(sum(seg3.memoTotalsCents), -300);
});

test('US settlement SP-API paths do not gate month splitting on runtime env', () => {
  const sourcePaths = [
    '../lib/amazon-finances/us-settlement-sync.ts',
    '../scripts/us-settlement-ingest-spapi.ts',
    '../scripts/us-settlement-reconcile-spapi.ts',
  ];

  for (const sourcePath of sourcePaths) {
    const source = readFileSync(new URL(sourcePath, import.meta.url), 'utf8');
    assert.equal(source.includes('PLUTUS_SPLIT_SETTLEMENTS_BY_MONTH'), false);
  }
});

test('US settlement SP-API reconcile accepts missing QBO JE for empty expected segments', () => {
  const source = readFileSync(new URL('../scripts/us-settlement-reconcile-spapi.ts', import.meta.url), 'utf8');

  assert.equal(source.includes('if (!actualJe && !hasExpectedJournalLines)'), true);
  assert.equal(source.includes("reason: 'No QBO JE expected for empty segment'"), true);
});

test('US settlement SP-API reconcile no longer requires real bank transfer lines', () => {
  const source = readFileSync(new URL('../scripts/us-settlement-reconcile-spapi.ts', import.meta.url), 'utf8');

  assert.equal(source.includes("throw new Error(`Missing 'Transfer to Bank' line"), false);
  assert.equal(source.includes("throw new Error(`Missing 'Payment to Amazon' line"), false);
});

test('US settlement SP-API reconcile supports parent sales and refund memos', () => {
  const source = readFileSync(new URL('../scripts/us-settlement-reconcile-spapi.ts', import.meta.url), 'utf8');

  assert.equal(source.includes('normalizeSettlementOperatingMemo'), true);
  assert.equal(source.includes('extractBrandLabelFromMemo'), false);
  assert.equal(source.includes('brandLabelByBrandName'), false);
  assert.equal(source.includes('journal entry has no brand-labeled memos'), false);
});

test('buildUsSettlementDraftFromSpApiFinances maps low value goods withheld tax', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-LVG-1',
    eventGroupId: 'GROUP-LVG-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: 9 },
    },
    events: {
      ShipmentEventList: [
        {
          PostedDate: '2026-04-03T08:00:00.000Z',
          AmazonOrderId: 'ORDER-LVG-1',
          ShipmentItemList: [
            {
              SellerSKU: 'SKU-LVG-1',
              QuantityShipped: 1,
              ItemChargeList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: 10 } },
              ],
              ItemTaxWithheldList: [
                {
                  TaxesWithheld: [
                    {
                      ChargeType: 'LowValueGoodsTax-Principal',
                      ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: -1 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    skuToBrandName: new Map([['SKU-LVG-1', 'Brand A']]),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(
    draft.segments[0]?.memoTotalsCents.get('Amazon Sales Tax - Marketplace Facilitator Tax - (Principal)'),
    -100,
  );
});

test('buildUsSettlementDraftFromSpApiFinances maps refunded shipping tax', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-REFUND-SHIPPING-TAX-1',
    eventGroupId: 'GROUP-REFUND-SHIPPING-TAX-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: -11 },
    },
    events: {
      RefundEventList: [
        {
          PostedDate: '2026-04-04T08:00:00.000Z',
          AmazonOrderId: 'ORDER-REFUND-SHIPPING-TAX-1',
          ShipmentItemAdjustmentList: [
            {
              SellerSKU: 'SKU-REFUND-SHIPPING-TAX-1',
              QuantityShipped: 1,
              ItemChargeAdjustmentList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: -10 } },
                { ChargeType: 'ShippingTax', ChargeAmount: { CurrencyCode: 'USD', CurrencyAmount: -1 } },
              ],
            },
          ],
        },
      ],
    },
    skuToBrandName: new Map([['SKU-REFUND-SHIPPING-TAX-1', 'Brand A']]),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(
    draft.segments[0]?.memoTotalsCents.get('Amazon Sales Tax - Refund - Item Price - Tax'),
    -100,
  );
});

test('buildUsSettlementDraftFromSpApiFinances maps reversal reimbursement adjustments', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-REVERSAL-REIMBURSEMENT-1',
    eventGroupId: 'GROUP-REVERSAL-REIMBURSEMENT-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: -3 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2026-04-04T08:00:00.000Z',
          AdjustmentType: 'REVERSAL_REIMBURSEMENT',
          AdjustmentAmount: { CurrencyCode: 'USD', CurrencyAmount: -3 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(
    draft.segments[0]?.memoTotalsCents.get(
      'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Reversal Reimbursement',
    ),
    -300,
  );
});

test('buildUsSettlementDraftFromSpApiFinances maps free replacement refund item adjustments', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-FREE-REPLACEMENT-REFUND-1',
    eventGroupId: 'GROUP-FREE-REPLACEMENT-REFUND-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: -4 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2026-04-04T08:00:00.000Z',
          AdjustmentType: 'FREE_REPLACEMENT_REFUND_ITEMS',
          AdjustmentAmount: { CurrencyCode: 'USD', CurrencyAmount: -4 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(
    draft.segments[0]?.memoTotalsCents.get(
      'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Free Replacement Refund Items',
    ),
    -400,
  );
});

test('buildUsSettlementDraftFromSpApiFinances maps compensated clawback adjustments', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-COMPENSATED-CLAWBACK-1',
    eventGroupId: 'GROUP-COMPENSATED-CLAWBACK-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: -4.26 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2026-04-04T08:00:00.000Z',
          AdjustmentType: 'COMPENSATED_CLAWBACK',
          AdjustmentAmount: { CurrencyCode: 'USD', CurrencyAmount: -4.26 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(
    draft.segments[0]?.memoTotalsCents.get(
      'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Compensated Clawback',
    ),
    -426,
  );
});

test('buildUkSettlementDraftFromSpApiFinances maps compensated clawback adjustments', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-COMPENSATED-CLAWBACK-UK-1',
    eventGroupId: 'GROUP-COMPENSATED-CLAWBACK-UK-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: -4.26 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2026-04-04T08:00:00.000Z',
          AdjustmentType: 'COMPENSATED_CLAWBACK',
          AdjustmentAmount: { CurrencyCode: 'GBP', CurrencyAmount: -4.26 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(
    draft.segments[0]?.memoTotalsCents.get(
      'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Compensated Clawback',
    ),
    -426,
  );
});

test('buildUkSettlementDraftFromSpApiFinances maps warehouse lost adjustments', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-WAREHOUSE-LOST-UK-1',
    eventGroupId: 'GROUP-WAREHOUSE-LOST-UK-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: 3.05 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2026-04-04T08:00:00.000Z',
          AdjustmentType: 'WAREHOUSE_LOST',
          AdjustmentAmount: { CurrencyCode: 'GBP', CurrencyAmount: 3.05 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(
    draft.segments[0]?.memoTotalsCents.get(
      'Amazon FBA Inventory Reimbursement - FBA Inventory Reimbursement - Warehouse Lost',
    ),
    305,
  );
});

test('buildUkSettlementDraftFromSpApiFinances maps failed disbursement adjustments', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-FAILED-DISBURSEMENT-UK-1',
    eventGroupId: 'GROUP-FAILED-DISBURSEMENT-UK-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-02-27T16:48:59.000Z',
      FinancialEventGroupEnd: '2026-03-13T16:48:58.000Z',
      FundTransferStatus: 'Failed',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: 0 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2026-02-28T10:29:01.000Z',
          AdjustmentType: 'FailedDisbursement',
          AdjustmentAmount: { CurrencyCode: 'GBP', CurrencyAmount: 4508.25 },
        },
        {
          PostedDate: '2026-03-13T16:49:07.000Z',
          AdjustmentType: 'ReserveDebit',
          AdjustmentAmount: { CurrencyCode: 'GBP', CurrencyAmount: -4508.25 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(
    draft.segments[0]?.memoTotalsCents.get('Amazon Reserved Balances - Failed Disbursement'),
    450825,
  );
});

test('buildUkSettlementDraftFromSpApiFinances maps deal service fees', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-DEAL-FEES-UK-1',
    eventGroupId: 'GROUP-DEAL-FEES-UK-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-03-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-03-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: -101.22 },
    },
    events: {
      ServiceFeeEventList: [
        {
          FeeList: [
            { FeeType: 'DealParticipationFee', FeeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -12.5 } },
            { FeeType: 'DealPerformanceFee', FeeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -88.72 } },
          ],
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments[0]?.memoTotalsCents.get('Amazon Seller Fees - Deal Participation Fee'), -1250);
  assert.equal(draft.segments[0]?.memoTotalsCents.get('Amazon Seller Fees - Deal Performance Fee'), -8872);
});

test('buildUkSettlementDraftFromSpApiFinances maps digital service fees', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-DIGITAL-SERVICE-FEES-UK-1',
    eventGroupId: 'GROUP-DIGITAL-SERVICE-FEES-UK-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-03-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-03-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: -3.21 },
    },
    events: {
      ServiceFeeEventList: [
        {
          FeeList: [
            { FeeType: 'DigitalServicesFee', FeeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -3.21 } },
          ],
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments[0]?.memoTotalsCents.get('Amazon Seller Fees - Digital Services Fee'), -321);
});

test('buildUsSettlementDraftFromSpApiFinances maps FBA disposal service fees', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-FBA-DISPOSAL-1',
    eventGroupId: 'GROUP-FBA-DISPOSAL-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: -2.27 },
    },
    events: {
      ServiceFeeEventList: [
        {
          FeeList: [
            {
              FeeType: 'FBADisposalFee',
              FeeAmount: { CurrencyCode: 'USD', CurrencyAmount: -2.27 },
            },
          ],
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(draft.segments[0]?.memoTotalsCents.get('Amazon FBA Fees - FBA Pick & Pack Fee Adjustment'), -227);
});

test('buildUsSettlementDraftFromSpApiFinances maps removal shipment liquidation revenue and fees', () => {
  const draft = buildUsSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-REMOVAL-LIQUIDATION-1',
    eventGroupId: 'GROUP-REMOVAL-LIQUIDATION-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-04-01T08:00:00.000Z',
      FinancialEventGroupEnd: '2026-04-10T08:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'USD', CurrencyAmount: 0.24 },
    },
    events: {
      RemovalShipmentEventList: [
        {
          OrderId: 'ORDER-REMOVAL-LIQUIDATION-1',
          PostedDate: '2026-04-04T08:00:00.000Z',
          TransactionType: 'CUSTOMER_RETURN_BASED_WHOLESALE_LIQUIDATION',
          RemovalShipmentItemList: [
            {
              FulfillmentNetworkSKU: 'FNSKU-REMOVAL-1',
              Quantity: 1,
              FeeAmount: { CurrencyCode: 'USD', CurrencyAmount: -0.46 },
              Revenue: { CurrencyCode: 'USD', CurrencyAmount: 0.7 },
              TaxAmount: { CurrencyCode: 'USD', CurrencyAmount: 0 },
              TaxWithheld: { CurrencyCode: 'USD', CurrencyAmount: 0 },
            },
          ],
        },
      ],
    } as any,
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 1);
  assert.equal(draft.segments[0]?.memoTotalsCents.get('Amazon Sales - Removal Shipment Revenue'), 70);
  assert.equal(draft.segments[0]?.memoTotalsCents.get('Amazon FBA Fees - Removal Shipment Fee'), -46);
});

test('buildUkSettlementDraftFromSpApiFinances always splits multi-month settlements into monthly segments with rollovers', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'SETTLEMENT-SPLIT-UK-1',
    eventGroupId: 'GROUP-SPLIT-UK-1',
    eventGroup: {
      FinancialEventGroupStart: '2025-12-19T00:00:00.000Z',
      FinancialEventGroupEnd: '2026-02-02T00:00:00.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: -3 },
    },
    events: {
      AdjustmentEventList: [
        {
          PostedDate: '2025-12-31T00:00:00.000Z',
          AdjustmentType: 'ReserveDebit',
          AdjustmentAmount: { CurrencyCode: 'GBP', CurrencyAmount: -1 },
        },
        {
          PostedDate: '2026-02-02T00:00:00.000Z',
          AdjustmentType: 'ReserveDebit',
          AdjustmentAmount: { CurrencyCode: 'GBP', CurrencyAmount: -2 },
        },
      ],
    },
    skuToBrandName: new Map(),
  });

  assert.equal(draft.segments.length, 3);
  assert.equal(draft.segments[0]?.docNumber, 'UK-251219-251231-S1');
  assert.equal(draft.segments[1]?.docNumber, 'UK-260101-260131-S2');
  assert.equal(draft.segments[2]?.docNumber, 'UK-260201-260202-S3');

  const seg1 = draft.segments[0]!;
  const seg2 = draft.segments[1]!;
  const seg3 = draft.segments[2]!;

  const sum = (map: Map<string, number>): number => {
    let total = 0;
    for (const v of map.values()) total += v;
    return total;
  };

  assert.equal(seg1.memoTotalsCents.get('Amazon Reserved Balances - Current Reserve Amount'), -100);
  assert.equal(seg1.memoTotalsCents.has('Split month settlement - balance of previous invoice(s) rolled forward'), false);
  assert.equal(seg1.memoTotalsCents.get('Split month settlement - balance of this invoice rolled forward'), 100);
  assert.equal(sum(seg1.memoTotalsCents), 0);

  assert.equal(seg2.memoTotalsCents.get('Split month settlement - balance of previous invoice(s) rolled forward'), -100);
  assert.equal(seg2.memoTotalsCents.get('Split month settlement - balance of this invoice rolled forward'), 100);
  assert.equal(sum(seg2.memoTotalsCents), 0);

  assert.equal(seg3.memoTotalsCents.get('Amazon Reserved Balances - Current Reserve Amount'), -200);
  assert.equal(seg3.memoTotalsCents.get('Split month settlement - balance of previous invoice(s) rolled forward'), -100);
  assert.equal(seg3.memoTotalsCents.has('Split month settlement - balance of this invoice rolled forward'), false);
  assert.equal(sum(seg3.memoTotalsCents), -300);
});

test('buildUkSettlementDraftFromSpApiFinances validates marketplace VAT at order level for shipments', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'UK-SET-1',
    eventGroupId: 'UK-GROUP-1',
    eventGroup: {
      FinancialEventGroupStart: '2026-01-16T00:00:00.000Z',
      FinancialEventGroupEnd: '2026-01-16T23:59:59.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: 30 },
    },
    events: {
      ShipmentEventList: [
        {
          PostedDate: '2026-01-16T12:00:00.000Z',
          AmazonOrderId: 'ORDER-1',
          MarketplaceName: 'Amazon.co.uk',
          ShipmentItemList: [
            {
              SellerSKU: 'SKU-1',
              QuantityShipped: 1,
              ItemChargeList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 10 } },
                { ChargeType: 'Tax', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 1.17 } },
              ],
            },
            {
              SellerSKU: 'SKU-1',
              QuantityShipped: 1,
              ItemChargeList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 20 } },
                { ChargeType: 'Tax', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 2.34 } },
              ],
              ItemTaxWithheldList: [
                {
                  TaxCollectionModel: 'MarketplaceFacilitator',
                  TaxesWithheld: [
                    {
                      ChargeType: 'MarketplaceFacilitatorVAT-Principal',
                      ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -3.51 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    skuToBrandName: new Map([['SKU-1', 'UK-BRAND']]),
  });

  const principalMemo = 'Amazon Sales - Principal (Marketplace VAT Responsible)';
  const principalCents = draft.segments[0]?.memoTotalsCents.get(principalMemo);
  assert.equal(principalCents, 3000);
});

test('buildUkSettlementDraftFromSpApiFinances validates marketplace VAT at order level for refunds', () => {
  const draft = buildUkSettlementDraftFromSpApiFinances({
    settlementId: 'UK-SET-2',
    eventGroupId: 'UK-GROUP-2',
    eventGroup: {
      FinancialEventGroupStart: '2026-01-16T00:00:00.000Z',
      FinancialEventGroupEnd: '2026-01-16T23:59:59.000Z',
      FundTransferStatus: 'Unknown',
      OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: -30 },
    },
    events: {
      RefundEventList: [
        {
          PostedDate: '2026-01-16T12:00:00.000Z',
          AmazonOrderId: 'ORDER-2',
          MarketplaceName: 'Amazon.co.uk',
          ShipmentItemAdjustmentList: [
            {
              SellerSKU: 'SKU-2',
              QuantityShipped: 1,
              ItemChargeAdjustmentList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -10 } },
                { ChargeType: 'Tax', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -1.17 } },
              ],
            },
            {
              SellerSKU: 'SKU-2',
              QuantityShipped: 1,
              ItemChargeAdjustmentList: [
                { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -20 } },
                { ChargeType: 'Tax', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -2.34 } },
              ],
              ItemTaxWithheldList: [
                {
                  TaxCollectionModel: 'MarketplaceFacilitator',
                  TaxesWithheld: [
                    {
                      ChargeType: 'MarketplaceFacilitatorVAT-Principal',
                      ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 3.51 },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    skuToBrandName: new Map([['SKU-2', 'UK-BRAND']]),
  });

  const principalMemo = 'Amazon Refunds - Refunded Principal (Marketplace VAT Responsible)';
  const principalCents = draft.segments[0]?.memoTotalsCents.get(principalMemo);
  assert.equal(principalCents, -3000);
});

test('buildUkSettlementDraftFromSpApiFinances still fails aggregate VAT mismatch', () => {
  assert.throws(() =>
    buildUkSettlementDraftFromSpApiFinances({
      settlementId: 'UK-SET-3',
      eventGroupId: 'UK-GROUP-3',
      eventGroup: {
        FinancialEventGroupStart: '2026-01-16T00:00:00.000Z',
        FinancialEventGroupEnd: '2026-01-16T23:59:59.000Z',
        FundTransferStatus: 'Unknown',
        OriginalTotal: { CurrencyCode: 'GBP', CurrencyAmount: 20 },
      },
      events: {
        ShipmentEventList: [
          {
            PostedDate: '2026-01-16T12:00:00.000Z',
            AmazonOrderId: 'ORDER-3',
            MarketplaceName: 'Amazon.co.uk',
            ShipmentItemList: [
              {
                SellerSKU: 'SKU-3',
                QuantityShipped: 1,
                ItemChargeList: [
                  { ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 10 } },
                  { ChargeType: 'Tax', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 1 } },
                ],
              },
              {
                SellerSKU: 'SKU-3',
                QuantityShipped: 1,
                ItemChargeList: [{ ChargeType: 'Principal', ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: 10 } }],
                ItemTaxWithheldList: [
                  {
                    TaxCollectionModel: 'MarketplaceFacilitator',
                    TaxesWithheld: [
                      {
                        ChargeType: 'MarketplaceFacilitatorVAT-Principal',
                        ChargeAmount: { CurrencyCode: 'GBP', CurrencyAmount: -0.5 },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      skuToBrandName: new Map([['SKU-3', 'UK-BRAND']]),
    }),
  );
});

test('buildCogsJournalLines includes SKU breakdown in descriptions', () => {
  const blocks: ProcessingBlock[] = [];
  const accounts: QboAccount[] = [
    {
      Id: '203',
      SyncToken: '0',
      Name: 'Manufacturing',
      AccountType: 'Other Current Asset',
      AccountSubType: 'Inventory',
    },
    {
      Id: '211',
      SyncToken: '0',
      Name: 'Manufacturing',
      AccountType: 'Cost of Goods Sold',
      AccountSubType: 'SuppliesMaterialsCogs',
    },
    {
      Id: '209',
      SyncToken: '0',
      Name: 'Manufacturing - US-PDS',
      AccountType: 'Other Current Asset',
      AccountSubType: 'Inventory',
      ParentRef: { value: '203', name: 'Manufacturing' },
    },
    {
      Id: '217',
      SyncToken: '0',
      Name: 'Manufacturing - US-PDS',
      AccountType: 'Cost of Goods Sold',
      AccountSubType: 'SuppliesMaterialsCogs',
      ParentRef: { value: '211', name: 'Manufacturing' },
    },
  ];

  const lines = buildCogsJournalLines(
    {
      'US-PDS': {
        manufacturing: 12345,
        freight: 0,
        duty: 0,
        mfgAccessories: 0,
      },
    },
    ['US-PDS'],
    {
      invManufacturing: '203',
      cogsManufacturing: '211',
    },
    accounts,
    'INV-COGS-1',
    blocks,
    {
      'US-PDS': {
        manufacturing: {
          'CS-007': 8230,
          'CS-010': 4115,
        },
        freight: {},
        duty: {},
        mfgAccessories: {},
      },
    },
  );

  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.description, 'Manufacturing COGS | SKUs CS-007:$82.30, CS-010:$41.15');
  assert.equal(lines[1]?.description, 'Manufacturing inventory | SKUs CS-007:$82.30, CS-010:$41.15');
  assert.equal(blocks.length, 0);
});

test('settlement processing no longer builds brand or SKU P&L reclass lines', () => {
  const source = readFileSync('lib/plutus/settlement-processing.ts', 'utf8');

  for (const forbidden of [
    'compute' + 'PnlAllocation',
    'buildDeterministic' + 'SkuAllocations',
    'deterministicSource' + 'GuidanceForBucket',
    'build' + 'PnlJournalLines',
    'PNL' + '_ALLOCATION_SOURCE_GAP',
    'PNL' + '_ALLOCATION_ERROR',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }

  assert.equal(source.includes("docNumber: buildProcessingDocNumber('P', invoiceId)"), true);
  assert.equal(source.includes('privateNote: `Plutus P&L Reclass | Invoice: ${invoiceId} | Hash: ${hashPrefix}`'), true);
  assert.equal(source.includes('lines: [],'), true);
});

test('journal builder exposes only inventory COGS lines, not P&L brand reclass lines', () => {
  const source = readFileSync('lib/plutus/journal-builder.ts', 'utf8');

  assert.equal(source.includes('export function buildCogsJournalLines'), true);
  assert.equal(source.includes('export function build' + 'PnlJournalLines'), false);
  assert.equal(source.includes('MISSING_BRAND_SUBACCOUNT'), true);
  assert.equal(source.includes('Amazon Seller Fees - ${brand}'), false);
  assert.equal(source.includes('Amazon FBA Fees - ${brand}'), false);
});

test('settlement audit expects P&L reclass to be NOOP', () => {
  const source = readFileSync('scripts/settlement-processing-audit.ts', 'utf8');

  assert.equal(source.includes('const pnlExpectedLines: LineSummary[] = [];'), true);
  assert.equal(source.includes('compute' + 'PnlAllocation'), false);
  assert.equal(source.includes('build' + 'PnlJournalLines'), false);
  assert.equal(source.includes('buildDeterministic' + 'SkuAllocations'), false);
});

test('legacy settlement fee allocation files are removed', () => {
  for (const removed of [
    'lib/pnl-allocation.ts',
    'lib/plutus/fee-allocation.ts',
    'lib/plutus/shipment-fee-allocation.ts',
    'scripts/us-settlement-allocation-check.ts',
  ]) {
    assert.equal(existsSync(removed), false, removed);
  }
});

test('legacy P&L retirement script is dry-run by default and requires apply', () => {
  const source = readFileSync('scripts/retire-legacy-pnl-reclass.ts', 'utf8');

  assert.equal(source.includes("const apply = args.includes('--apply');"), true);
  assert.equal(source.includes('deleteJournalEntry(activeConnection, row.qboPnlReclassJournalEntryId)'), true);
  assert.equal(source.includes("buildNoopJournalEntryId('PNL', row.invoiceId)"), true);
  assert.equal(source.includes('if (!apply)'), true);
});

test('isBlockingProcessingCode only treats inventory and setup issues as processing blockers', () => {
  assert.equal(isBlockingProcessingCode('MISSING_SKU_MAPPING'), true);
  assert.equal(isBlockingProcessingCode('BILLS_PARSE_ERROR'), true);
  assert.equal(isBlockingProcessingCode('LATE_COST_ON_HAND_ZERO'), false);
  assert.equal(isBlockingProcessingCode('REFUND_ADJUSTMENT'), false);
});

test('settlement processing skips refund matching when COGS is disabled', () => {
  const source = readFileSync('lib/plutus/settlement-processing.ts', 'utf8');

  assert.match(source, /const refundPairs = cogsEnabled \?/);
  assert.match(source, /if \(cogsEnabled\) \{\s*for \(const \[refundKey, refund\] of refundGroups\.entries\(\)\)/);
  assert.match(source, /!cogsEnabled \|\| currentSettlementRefundGroups\.size === 0/);
});

test('settlement processing treats empty split settlement segments as no-op processing', () => {
  const source = readFileSync('lib/plutus/settlement-processing.ts', 'utf8');

  assert.equal(source.includes('const hasAuditRows = scopedInvoiceRows.length > 0;'), true);
  assert.equal(source.includes('if (hasAuditRows) {'), true);
  assert.equal(source.includes('const pnlLines: JournalEntryLinePreview[] = [];'), true);
  assert.equal(source.includes('meta.periodStart'), true);
});

test('inventory audit treats empty split COGS no-op rows as valid', () => {
  const source = readFileSync('scripts/inventory-audit.ts', 'utf8');

  assert.equal(source.includes("import { computeProcessingHash } from '@/lib/plutus/settlement-validation';"), true);
  assert.equal(source.includes('const emptyProcessingHash = computeProcessingHash([]);'), true);
  assert.equal(source.includes("status: 'noop'"), true);
  assert.equal(source.includes('input.processing.processingHash === emptyProcessingHash'), true);
});

test('settlement SKU brand maps include ASIN aliases', () => {
  const processingSource = readFileSync('lib/plutus/settlement-processing.ts', 'utf8');
  const auditSource = readFileSync('scripts/settlement-processing-audit.ts', 'utf8');
  const usSyncSource = readFileSync('lib/amazon-finances/us-settlement-sync.ts', 'utf8');

  for (const source of [processingSource, auditSource, usSyncSource]) {
    assert.equal(source.includes('row.asin'), true);
    assert.equal(source.includes('aliases.push(row.asin)'), true);
  }
});

test('inventory bills audit can scope by marketplace and SOP internal ref', () => {
  const source = readFileSync('scripts/inventory-bills-audit.ts', 'utf8');

  assert.equal(source.includes("--marketplace <all|amazon.com|amazon.co.uk>"), true);
  assert.equal(source.includes('classifyInventoryMarketplaceFromAccount'), true);
  assert.equal(source.includes('function requiresPlutusCogsMapping(line: InventoryLine): boolean'), true);
  assert.equal(source.includes("return line.marketplace === 'amazon.com';"), true);
  assert.equal(source.includes('extractPoNumberFromBill(bill)'), true);
  assert.equal(source.includes('RECON\\s*=\\s*AWAITING_GOODS'), true);
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

test('bill mappings prefer line PO over bill header PO', () => {
  const parsed = buildInventoryEventsFromMappings([
    {
      qboBillId: 'B-MIXED',
      poNumber: '',
      brandId: 'brand',
      billDate: '2026-02-01',
      lines: [
        { qboLineId: '1', component: 'manufacturing', amountCents: 1000, sku: 'SKU-A', poNumber: 'PO-A', quantity: 1 },
        { qboLineId: '2', component: 'manufacturing', amountCents: 2000, sku: 'SKU-B', poNumber: 'PO-B', quantity: 2 },
        { qboLineId: '3', component: 'freight', amountCents: 300, sku: null, poNumber: 'PO-A', quantity: null },
      ],
    },
  ]);

  assert.deepEqual(
    parsed.events.map((event) => ('poNumber' in event ? event.poNumber : null)),
    ['PO-A', 'PO-A', 'PO-B'],
  );
  assert.equal(parsed.poUnitsBySku.get('PO-A')?.get('SKU-A'), 1);
  assert.equal(parsed.poUnitsBySku.get('PO-B')?.get('SKU-B'), 2);
});

test('bill mappings keep blank-PO sku-less costs at brand level', () => {
  const parsed = buildInventoryEventsFromMappings([
    {
      qboBillId: 'B-BRAND',
      poNumber: '',
      brandId: 'brand-us-pds',
      billDate: '2026-02-01',
      lines: [
        { qboLineId: '1', component: 'mfgAccessories', amountCents: 56000, sku: null, quantity: null },
      ],
    },
  ]);

  assert.equal(parsed.events.length, 1);
  const event = parsed.events[0];
  assert.equal(event?.kind, 'brand_cost');
  if (event?.kind !== 'brand_cost') throw new Error('expected brand-level cost event');
  assert.equal(event.brandId, 'brand-us-pds');
  assert.equal(event.component, 'mfgAccessories');
  assert.equal(event.costCents, 56000);

  const replay = replayInventoryLedger({
    parsedBills: parsed,
    knownSales: [],
    knownReturns: [],
    computeSales: [],
  });

  assert.equal(replay.blocks.length, 0);
  assert.equal(replay.snapshot.bySku.size, 0);
});

test('bill mappings require PO on manufacturing lines', () => {
  assert.throws(
    () =>
      buildInventoryEventsFromMappings([
        {
          qboBillId: 'B-MFG',
          poNumber: '',
          brandId: 'brand-us-pds',
          billDate: '2026-02-01',
          lines: [
            { qboLineId: '1', component: 'manufacturing', amountCents: 56000, sku: 'SKU-A', quantity: 10 },
          ],
        },
      ]),
    /Manufacturing bill mapping line requires poNumber/,
  );
});

test('split manufacturing bill mappings persist line-level PO numbers', () => {
  const source = readFileSync('app/api/plutus/bills/route.ts', 'utf8');

  assert.equal(source.includes('poNumber: splitPoNumber,'), true);
  assert.equal(
    source.includes("poNumber: descriptor.poNumber !== '' ? descriptor.poNumber : null"),
    true,
  );
  assert.equal(
    source.includes("poNumber: normalizedPoNumber !== '' ? normalizedPoNumber : null"),
    false,
  );
});

test('bill mapping route marks only QBO-mutated split saves as synced', () => {
  const source = readFileSync('app/api/plutus/bills/route.ts', 'utf8');

  assert.equal(source.includes('let syncedAt: Date | null = null;'), true);
  assert.equal(source.includes('PrivateNote: buildPrivateNoteWithPo(currentBill.PrivateNote, normalizedPoNumber)'), true);
  assert.equal(source.includes('PrivateNote: currentBill.PrivateNote'), false);
  assert.equal(source.includes('} else {\n      syncedAt = new Date();\n    }'), false);
});

test('parseQboBillsToInventoryEvents scopes explicit inventory accounts by marketplace', () => {
  const bill: QboBill = {
    Id: 'B-1',
    SyncToken: '0',
    TxnDate: '2026-02-01',
    TotalAmt: 200,
    PrivateNote: 'PO: PO-1',
    Line: [
      {
        Id: '1',
        Amount: 100,
        Description: 'SKU-US x 1 units',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-mfg', name: 'Manufacturing - US-PDS' },
        },
      },
      {
        Id: '2',
        Amount: 100,
        Description: 'SKU-UK x 1 units',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'uk-mfg', name: 'Manufacturing - UK-PDS' },
        },
      },
    ],
  };

  const accountsById = new Map<string, QboAccount>([
    [
      'us-mfg',
      {
        Id: 'us-mfg',
        SyncToken: '0',
        Name: 'Manufacturing - US-PDS',
        AccountType: 'Other Current Asset',
        AccountSubType: 'Inventory',
        FullyQualifiedName: 'Inventory Asset:Manufacturing - US-PDS',
      },
    ],
    [
      'uk-mfg',
      {
        Id: 'uk-mfg',
        SyncToken: '0',
        Name: 'Manufacturing - UK-PDS',
        AccountType: 'Other Current Asset',
        AccountSubType: 'Inventory',
        FullyQualifiedName: 'Inventory Asset:Manufacturing - UK-PDS',
      },
    ],
  ]);

  const mappings = {
    invManufacturing: 'inventory-root',
    invFreight: 'inventory-root',
    invDuty: 'inventory-root',
    invMfgAccessories: 'inventory-root',
  };

  const parsedUs = parseQboBillsToInventoryEvents([bill], accountsById, mappings, 'amazon.com');
  assert.equal(parsedUs.events.length, 1);
  assert.equal(parsedUs.events[0]?.kind, 'manufacturing');
  if (parsedUs.events[0]?.kind !== 'manufacturing') {
    throw new Error('expected manufacturing event');
  }
  assert.equal(parsedUs.events[0].sku, 'SKU-US');

  const parsedUk = parseQboBillsToInventoryEvents([bill], accountsById, mappings, 'amazon.co.uk');
  assert.equal(parsedUk.events.length, 1);
  assert.equal(parsedUk.events[0]?.kind, 'manufacturing');
  if (parsedUk.events[0]?.kind !== 'manufacturing') {
    throw new Error('expected manufacturing event');
  }
  assert.equal(parsedUk.events[0].sku, 'SKU-UK');
});

test('parseQboBillsToInventoryEvents reads PO number from bill custom fields', () => {
  const bill: QboBill = {
    Id: 'B-PO-CF',
    SyncToken: '0',
    TxnDate: '2026-02-01',
    TotalAmt: 100,
    CustomField: [{ Name: 'PO Number', StringValue: 'PO-CF-1' }],
    Line: [
      {
        Id: '1',
        Amount: 100,
        Description: 'SKU-US x 1 units',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-mfg', name: 'Manufacturing - US-PDS' },
        },
      },
    ],
  };

  const accountsById = new Map<string, QboAccount>([
    [
      'us-mfg',
      {
        Id: 'us-mfg',
        SyncToken: '0',
        Name: 'Manufacturing - US-PDS',
        AccountType: 'Other Current Asset',
        AccountSubType: 'Inventory',
        FullyQualifiedName: 'Inventory Asset:Manufacturing - US-PDS',
      },
    ],
  ]);

  const mappings = {
    invManufacturing: 'inventory-root',
    invFreight: 'inventory-root',
    invDuty: 'inventory-root',
    invMfgAccessories: 'inventory-root',
  };

  const parsed = parseQboBillsToInventoryEvents([bill], accountsById, mappings, 'amazon.com');
  assert.equal(parsed.events.length, 1);
  assert.equal(parsed.events[0]?.kind, 'manufacturing');
  if (parsed.events[0]?.kind !== 'manufacturing') {
    throw new Error('expected manufacturing event');
  }
  assert.equal(parsed.events[0].poNumber, 'PO-CF-1');
});

test('parseSkuQuantityFromDescription reads deterministic manufacturing line fields', () => {
  const parsed = parseSkuQuantityFromDescription(
    'MFG; OWNER=US-PDS; PO=PO-20-PDS; SKU=CS-12LD-7M; QTY=6720; UNIT_COST=1.250; SOURCE=PI-2601082',
  );

  assert.equal(parsed.sku, 'CS-12LD-7M');
  assert.equal(parsed.quantity, 6720);
});

test('parseSkuFromDescription reads deterministic cost line fields without quantity', () => {
  const parsedSku = parseSkuFromDescription(
    'FREIGHT; OWNER=US-PDS; PO=PO-19-PDS; SKU=CS-007; SERVICE=FOREST SHIPPING; SOURCE=FSHY2509087198',
  );

  assert.equal(parsedSku, 'CS-007');
});

test('parseSkuFromDescription reads package cost FOR_SKU fields', () => {
  const parsedSku = parseSkuFromDescription(
    'PKG; OWNER=PO-19-PDS; ITEM=CS-007-BOX; QTY=29440; FOR_SKU=CS-007; PO=PO-19-PDS; SOURCE=PI-250804BOXB',
  );

  assert.equal(parsedSku, 'CS-007');
});

test('structured SKU parsers ignore placeholder SKU values', () => {
  assert.equal(
    parseSkuFromDescription(
      'PKG; OWNER=PO-19-PDS; SKU=N/A; FOR_SKU=CS-007; QTY=29440; PO=PO-19-PDS; SOURCE=PI-250804BOXB',
    ),
    'CS-007',
  );

  assert.deepEqual(
    parseSkuQuantityFromDescription(
      'MFG; OWNER=US-PDS; PO=PO-19-PDS; SKU=N/A; FOR_SKU=CS-007; QTY=29440; SOURCE=PI-250804BOXB',
    ),
    { sku: 'CS-007', quantity: 29440 },
  );

  assert.throws(
    () => parseSkuQuantityFromDescription('MFG; OWNER=US-PDS; SKU=N/A; QTY=29440; SOURCE=PI-250804BOXB'),
    /Missing SKU/,
  );
});

test('parseQboBillsToInventoryEvents reads SOP internal ref and deterministic line fields', () => {
  const bill: QboBill = {
    Id: 'B-PO20',
    SyncToken: '0',
    TxnDate: '2026-02-07',
    TotalAmt: 9559.54,
    PrivateNote: 'INTERNAL REF: PO=PO-20-PDS; OWNER=US-PDS\nPI: PI-2601082',
    Line: [
      {
        Id: '1',
        Amount: 8400,
        Description: 'MFG; OWNER=US-PDS; PO=PO-20-PDS; SKU=CS-12LD-7M; QTY=6720; UNIT_COST=1.250; SOURCE=PI-2601082',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-mfg', name: 'Manufacturing - US-PDS' },
        },
      },
      {
        Id: '2',
        Amount: 1159.54,
        Description: 'MFG; OWNER=US-PDS; PO=PO-20-PDS; SKU=CS-1SD-32M; QTY=2856; UNIT_COST=0.406; SOURCE=PI-2601082',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-mfg', name: 'Manufacturing - US-PDS' },
        },
      },
      {
        Id: '3',
        Amount: 100,
        Description: 'FREIGHT; OWNER=US-PDS; PO=PO-20-PDS; SKU=CS-12LD-7M; SERVICE=FOREST SHIPPING; SOURCE=FSHY-1',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-freight', name: 'Freight - US-PDS' },
        },
      },
    ],
  };

  const accountsById = new Map<string, QboAccount>([
    [
      'us-mfg',
      {
        Id: 'us-mfg',
        SyncToken: '0',
        Name: 'Manufacturing - US-PDS',
        AccountType: 'Other Current Asset',
        AccountSubType: 'Inventory',
        FullyQualifiedName: 'Inventory Asset:Manufacturing - US-PDS',
      },
    ],
    [
      'us-freight',
      {
        Id: 'us-freight',
        SyncToken: '0',
        Name: 'Freight - US-PDS',
        AccountType: 'Other Current Asset',
        AccountSubType: 'Inventory',
        FullyQualifiedName: 'Inventory Asset:Freight - US-PDS',
      },
    ],
  ]);

  const mappings = {
    invManufacturing: 'inventory-root',
    invFreight: 'inventory-root',
    invDuty: 'inventory-root',
    invMfgAccessories: 'inventory-root',
  };

  const parsed = parseQboBillsToInventoryEvents([bill], accountsById, mappings, 'amazon.com');
  assert.equal(parsed.events.length, 3);
  const mfgEvents = parsed.events.filter((event) => event.kind === 'manufacturing');
  assert.equal(mfgEvents.length, 2);
  assert.equal(mfgEvents[0]?.poNumber, 'PO-20-PDS');
  assert.equal(mfgEvents[0]?.sku, 'CS-12LD-7M');
  assert.equal(mfgEvents[0]?.units, 6720);
  assert.equal(mfgEvents[1]?.sku, 'CS-1SD-32M');
  assert.equal(mfgEvents[1]?.units, 2856);

  const freightEvent = parsed.events.find((event) => event.kind === 'cost' && event.component === 'freight');
  assert.equal(freightEvent?.kind, 'cost');
  if (freightEvent?.kind !== 'cost') throw new Error('expected freight cost event');
  assert.equal(freightEvent.poNumber, 'PO-20-PDS');
  assert.equal(freightEvent.sku, 'CS-12LD-7M');
});

test('parseQboBillsToInventoryEvents uses line PO for multi-PO package bills', () => {
  const bill: QboBill = {
    Id: 'B-MULTI-PO',
    SyncToken: '0',
    TxnDate: '2025-08-04',
    TotalAmt: 1484.85,
    PrivateNote: 'INTERNAL REF: PO=PO-18-PDS; PO=PO-19-PDS; OWNER=RESIDUAL\nSUPPLIER REF: PI=PI-250804BOXB',
    Line: [
      {
        Id: '19',
        Amount: 409.6,
        Description: 'PKG; OWNER=PO-18-PDS; ITEM=CS-12LD-7M-BOX; QTY=4096; FOR_SKU=CS-12LD-7M; PO=PO-18-PDS; SOURCE=PI-250804BOXB',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-accessories', name: 'Mfg Accessories - US-PDS' },
        },
      },
      {
        Id: '20',
        Amount: 969.6,
        Description: 'PKG; OWNER=PO-19-PDS; ITEM=CS-12LD-7M-BOX; QTY=9696; FOR_SKU=CS-12LD-7M; PO=PO-19-PDS; SOURCE=PI-250804BOXB',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-accessories', name: 'Mfg Accessories - US-PDS' },
        },
      },
      {
        Id: '21',
        Amount: 2,
        Description: 'PKG; OWNER=RESIDUAL; ITEM=CS-12LD-7M-BOX; QTY=20; FOR_SKU=CS-12LD-7M; SOURCE=PI-250804BOXB',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'us-accessories', name: 'Mfg Accessories - US-PDS' },
        },
      },
    ],
  };

  const accountsById = new Map<string, QboAccount>([
    [
      'us-accessories',
      {
        Id: 'us-accessories',
        SyncToken: '0',
        Name: 'Mfg Accessories - US-PDS',
        AccountType: 'Other Current Asset',
        AccountSubType: 'Inventory',
        FullyQualifiedName: 'Inventory Asset:Mfg Accessories - US-PDS',
      },
    ],
  ]);

  const mappings = {
    invManufacturing: 'inventory-root',
    invFreight: 'inventory-root',
    invDuty: 'inventory-root',
    invMfgAccessories: 'inventory-root',
  };

  const parsed = parseQboBillsToInventoryEvents([bill], accountsById, mappings, 'amazon.com');
  const costEvents = parsed.events.filter((event) => event.kind === 'cost');
  assert.equal(costEvents.length, 2);
  assert.equal(costEvents[0]?.poNumber, 'PO-18-PDS');
  assert.equal(costEvents[0]?.sku, 'CS-12LD-7M');
  assert.equal(costEvents[1]?.poNumber, 'PO-19-PDS');
  assert.equal(costEvents[1]?.sku, 'CS-12LD-7M');
});

test('pull-sync does not collapse non-PO or multi-PO internal refs into one PO', () => {
  assert.equal(
    extractPoNumberFromBill({
      PrivateNote: 'INTERNAL REF: OWNER=US-PDS; PRODUCT=NITRILE_GLOVES',
    }),
    '',
  );
  assert.equal(
    extractPoNumberFromBill({
      PrivateNote: 'INTERNAL REF: PO=PO-18-PDS; PO=PO-19-PDS; OWNER=RESIDUAL',
    }),
    '',
  );
});

test('parseQboBillsToInventoryEvents rejects inventory accounts without marketplace markers', () => {
  const bill: QboBill = {
    Id: 'B-NO-MARKET',
    SyncToken: '0',
    TxnDate: '2026-02-01',
    TotalAmt: 100,
    PrivateNote: 'PO: PO-1',
    Line: [
      {
        Id: '1',
        Amount: 100,
        Description: 'SKU-US x 1 units',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: 'mfg-generic', name: 'Manufacturing' },
        },
      },
    ],
  };

  const accountsById = new Map<string, QboAccount>([
    [
      'mfg-generic',
      {
        Id: 'mfg-generic',
        SyncToken: '0',
        Name: 'Manufacturing',
        AccountType: 'Other Current Asset',
        AccountSubType: 'Inventory',
        FullyQualifiedName: 'Inventory Asset:Manufacturing',
      },
    ],
  ]);

  const mappings = {
    invManufacturing: 'inventory-root',
    invFreight: 'inventory-root',
    invDuty: 'inventory-root',
    invMfgAccessories: 'inventory-root',
  };

  assert.throws(
    () => parseQboBillsToInventoryEvents([bill], accountsById, mappings, 'amazon.com'),
    /missing marketplace marker/i,
  );
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

test('extractPoNumberFromBill prefers PO custom field over memo', () => {
  const po = extractPoNumberFromBill({
    PrivateNote: 'PO: OLD-PO',
    CustomField: [
      { Name: 'PO Number', StringValue: 'NEW-PO' },
      { Name: 'Ignored', StringValue: 'X' },
    ],
  });

  assert.equal(po, 'NEW-PO');
});

test('extractPoNumberFromBill reads PO from memo when no custom field exists', () => {
  const po = extractPoNumberFromBill({
    PrivateNote: 'Some note\nPO: US-PO-123\nMore text',
  });

  assert.equal(po, 'US-PO-123');
});

test('extractPoNumberFromBill reads internal ref from SOP memo', () => {
  const po = extractPoNumberFromBill({
    PrivateNote: 'INTERNAL REF: PO-20-PDS\nOWNER: US-PDS\nPI: PI-2601082',
  });

  assert.equal(po, 'PO-20-PDS');
});

test('extractPoNumberFromBill reads structured PO from SOP memo', () => {
  const po = extractPoNumberFromBill({
    PrivateNote: 'INTERNAL REF: PO=PO-19-PDS; SHIPMENT=FBA19523CMQ9; OWNER=US-PDS\nNOTES: Actuals',
  });

  assert.equal(po, 'PO-19-PDS');
});

test('extractPoNumberFromBill preserves direct PO code in memo', () => {
  const po = extractPoNumberFromBill({
    PrivateNote: 'PO-19-PDS',
  });

  assert.equal(po, 'PO-19-PDS');
});

test('buildBillMappingPullSyncUpdates skips unsynced mappings', () => {
  const updates = buildBillMappingPullSyncUpdates(
    [
      {
        id: 'mapping-1',
        qboBillId: 'bill-1',
        poNumber: 'PO-OLD',
        billDate: '2026-01-01',
        vendorName: 'Vendor A',
        totalAmount: 100,
        syncedAt: null,
      },
    ],
    new Map([
      ['bill-1', { Id: 'bill-1', TxnDate: '2026-01-02', TotalAmt: 100, SyncToken: '0', CustomField: [{ Name: 'PO Number', StringValue: 'PO-NEW' }] }],
    ] as const),
  );

  assert.equal(updates.length, 0);
});

test('buildBillMappingPullSyncUpdates detects PO and metadata drift', () => {
  const updates = buildBillMappingPullSyncUpdates(
    [
      {
        id: 'mapping-1',
        qboBillId: 'bill-1',
        poNumber: 'PO-OLD',
        billDate: '2026-01-01',
        vendorName: 'Vendor A',
        totalAmount: 100,
        syncedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ],
    new Map([
      [
        'bill-1',
        {
          Id: 'bill-1',
          TxnDate: '2026-01-02',
          TotalAmt: 101,
          SyncToken: '0',
          VendorRef: { value: 'v-1', name: 'Vendor B' },
          PrivateNote: 'PO: PO-NEW',
        },
      ],
    ] as const),
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.poNumber, 'PO-NEW');
  assert.equal(updates[0]?.billDate, '2026-01-02');
  assert.equal(updates[0]?.vendorName, 'Vendor B');
  assert.equal(updates[0]?.totalAmount, 101);
});

test('matchRefundsToSales ignores future sale layers when refunding historical orders', () => {
  const blocks: ProcessingBlock[] = [];
  const matchedReturns = matchRefundsToSales(
    new Map([
      [
        'ORDER-1::SKU-1',
        {
          orderId: 'ORDER-1',
          sku: 'SKU-1',
          date: '2026-01-15',
          quantity: -1,
          principalCents: -1_000,
        },
      ],
    ]),
    [
      {
        orderId: 'ORDER-1',
        sku: 'SKU-1',
        date: '2026-01-01',
        quantity: 1,
        principalCents: 1_000,
        costByComponentCents: { manufacturing: 100, freight: 10, duty: 5, mfgAccessories: 0 },
      },
      {
        orderId: 'ORDER-1',
        sku: 'SKU-1',
        date: '2026-02-01',
        quantity: 1,
        principalCents: 3_000,
        costByComponentCents: { manufacturing: 300, freight: 30, duty: 15, mfgAccessories: 0 },
      },
    ],
    [],
    blocks,
  );

  assert.equal(blocks.length, 0);
  assert.equal(matchedReturns.length, 1);
  assert.deepEqual(matchedReturns[0]?.costByComponentCents, {
    manufacturing: 100,
    freight: 10,
    duty: 5,
    mfgAccessories: 0,
  });
});

test('matchRefundsToSales uses remaining sale layers after prior returns', () => {
  const blocks: ProcessingBlock[] = [];
  const matchedReturns = matchRefundsToSales(
    new Map([
      [
        'ORDER-2::SKU-2',
        {
          orderId: 'ORDER-2',
          sku: 'SKU-2',
          date: '2026-02-15',
          quantity: -1,
          principalCents: -3_000,
        },
      ],
    ]),
    [
      {
        orderId: 'ORDER-2',
        sku: 'SKU-2',
        date: '2026-01-01',
        quantity: 1,
        principalCents: 1_000,
        costByComponentCents: { manufacturing: 100, freight: 0, duty: 0, mfgAccessories: 0 },
      },
      {
        orderId: 'ORDER-2',
        sku: 'SKU-2',
        date: '2026-02-01',
        quantity: 1,
        principalCents: 3_000,
        costByComponentCents: { manufacturing: 300, freight: 0, duty: 0, mfgAccessories: 0 },
      },
    ],
    [
      {
        orderId: 'ORDER-2',
        sku: 'SKU-2',
        date: '2026-01-10',
        quantity: 1,
      },
    ],
    blocks,
  );

  assert.equal(blocks.length, 0);
  assert.equal(matchedReturns.length, 1);
  assert.deepEqual(matchedReturns[0]?.costByComponentCents, {
    manufacturing: 300,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  });
});

test('matchRefundsToSales can use later sale layers within the current settlement when enabled', () => {
  const blocks: ProcessingBlock[] = [];
  const matchedReturns = matchRefundsToSales(
    new Map([
      [
        'ORDER-3::SKU-3',
        {
          orderId: 'ORDER-3',
          sku: 'SKU-3',
          date: '2026-02-24',
          quantity: -1,
          principalCents: -1_000,
        },
      ],
    ]),
    [
      {
        orderId: 'ORDER-3',
        sku: 'SKU-3',
        date: '2026-02-25',
        quantity: 1,
        principalCents: 1_000,
        costByComponentCents: { manufacturing: 100, freight: 10, duty: 5, mfgAccessories: 0 },
      },
    ],
    [],
    blocks,
    { allowFutureSales: true },
  );

  assert.equal(blocks.length, 0);
  assert.equal(matchedReturns.length, 1);
  assert.deepEqual(matchedReturns[0]?.costByComponentCents, {
    manufacturing: 100,
    freight: 10,
    duty: 5,
    mfgAccessories: 0,
  });
});

test('buildPrincipalGroupsByDate keeps refunds from different days separate', () => {
  const groups = buildPrincipalGroupsByDate(
    [
      {
        invoiceId: 'INV-1',
        market: 'us',
        date: '2026-01-10',
        orderId: 'ORDER-3',
        sku: 'sku-3',
        quantity: -1,
        description: 'Amazon Refunds - Refunded Principal',
        net: -10,
      },
      {
        invoiceId: 'INV-1',
        market: 'us',
        date: '2026-01-11',
        orderId: 'ORDER-3',
        sku: 'sku-3',
        quantity: -1,
        description: 'Amazon Refunds - Refunded Principal',
        net: -10,
      },
    ],
    (description) => description === 'Amazon Refunds - Refunded Principal',
  );

  assert.equal(groups.size, 2);
});

test('historical refund routing keeps multiple dated refunds for the same order and sku', () => {
  const refundGroups = buildPrincipalGroupsByDate(
    [
      {
        invoiceId: 'INV-2',
        market: 'us',
        date: '2026-01-10',
        orderId: 'ORDER-4',
        sku: 'sku-4',
        quantity: -1,
        description: 'Amazon Refunds - Refunded Principal',
        net: -10,
      },
      {
        invoiceId: 'INV-2',
        market: 'us',
        date: '2026-01-11',
        orderId: 'ORDER-4',
        sku: 'sku-4',
        quantity: -1,
        description: 'Amazon Refunds - Refunded Principal',
        net: -10,
      },
    ],
    (description) => description === 'Amazon Refunds - Refunded Principal',
  );

  const historicalSaleKeys = new Set(['ORDER-4::SKU-4']);
  const historicalRefundGroups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();
  const currentSettlementRefundGroups = new Map<string, { orderId: string; sku: string; date: string; quantity: number; principalCents: number }>();

  for (const [refundKey, refund] of refundGroups.entries()) {
    const saleKey = `${refund.orderId}::${refund.sku}`;
    if (historicalSaleKeys.has(saleKey)) {
      historicalRefundGroups.set(refundKey, refund);
      continue;
    }
    currentSettlementRefundGroups.set(refundKey, refund);
  }

  assert.equal(historicalRefundGroups.size, 2);
  assert.equal(currentSettlementRefundGroups.size, 0);
});

test('audit flags missing doc number and missing attachment on bills', () => {
  const tx: NormalizedAuditTransaction = {
    transactionType: 'Bill',
    transactionId: 'B1',
    txnDate: '2026-04-01',
    amount: 1250,
    currency: 'USD',
    counterparty: 'Vendor A',
    docNumber: null,
    privateNote: 'April inventory invoice',
    dueDate: null,
    postingAccounts: ['Inventory'],
    lineDescriptions: [''],
    attachmentFileNames: [],
    isInReconciledPeriod: null,
    lastUpdatedTime: '2026-04-10T10:00:00Z',
    sourceTag: null,
  };

  const findings = classifyAuditExceptions([tx]);
  assert.deepEqual(
    findings.map((finding) => finding.reconciledPeriodRisk),
    ['unknown', 'unknown'],
  );
  assert.deepEqual(
    findings.map((finding) => ({
      ruleId: finding.ruleId,
      severity: finding.severity,
      ruleGroup: finding.ruleGroup,
      supportStatus: finding.supportStatus,
    })).sort((left, right) => left.ruleId.localeCompare(right.ruleId)),
    [
      {
        ruleId: 'ATTACHMENT_REQUIRED_MISSING',
        severity: 'High',
        ruleGroup: 'attachment_controls',
        supportStatus: 'missing',
      },
      {
        ruleId: 'DOCNUMBER_MISSING',
        severity: 'High',
        ruleGroup: 'field_completeness',
        supportStatus: 'not_required',
      },
    ].sort((left, right) => left.ruleId.localeCompare(right.ruleId)),
  );
});

test('audit flags transfer-like expenses posted to p-and-l accounts', () => {
  const tx: NormalizedAuditTransaction = {
    transactionType: 'Purchase',
    transactionId: 'P1',
    txnDate: '2026-04-01',
    amount: 1000,
    currency: 'USD',
    counterparty: 'Internal funding move',
    docNumber: 'INT-001',
    privateNote: 'Transfer to Wise',
    dueDate: null,
    postingAccounts: ['General Business Expenses:Software & Apps'],
    lineDescriptions: ['Transfer to Wise USD'],
    attachmentFileNames: ['support.txt'],
    isInReconciledPeriod: false,
    lastUpdatedTime: '2026-04-10T10:00:00Z',
    sourceTag: null,
  };

  const findings = classifyAuditExceptions([tx]);
  assert.deepEqual(findings.map((finding) => ({
    ruleId: finding.ruleId,
    severity: finding.severity,
    ruleGroup: finding.ruleGroup,
    supportStatus: finding.supportStatus,
  })), [
    {
      ruleId: 'TRANSFER_LIKE_ACTIVITY_MISPOSTED',
      severity: 'Critical',
      ruleGroup: 'chart_of_accounts_sanity',
      supportStatus: 'not_required',
    },
  ]);
});

test('audit does not require doc number for transfer transactions', () => {
  const tx: NormalizedAuditTransaction = {
    transactionType: 'Transfer',
    transactionId: 'T1',
    txnDate: '2026-04-01',
    amount: 250,
    currency: 'USD',
    counterparty: 'Operating account',
    docNumber: null,
    privateNote: 'Owner funding move',
    dueDate: null,
    postingAccounts: ['Assets:Bank'],
    lineDescriptions: ['Transfer between cash accounts'],
    attachmentFileNames: [],
    isInReconciledPeriod: false,
    lastUpdatedTime: '2026-04-10T10:00:00Z',
    sourceTag: null,
  };

  const findings = classifyAuditExceptions([tx]);
  assert.equal(findings.some((finding) => finding.ruleId === 'DOCNUMBER_MISSING'), false);
});

test('audit keeps the original transfer mispost guard purchase-only and expense-based', () => {
  const purchaseTx: NormalizedAuditTransaction = {
    transactionType: 'Purchase',
    transactionId: 'P-transfer',
    txnDate: '2026-04-01',
    amount: 250,
    currency: 'USD',
    counterparty: 'Operating account',
    docNumber: 'T-1',
    privateNote: 'Transfer to Wise',
    dueDate: null,
    postingAccounts: ['Office expense:Software'],
    lineDescriptions: ['Transfer between cash accounts'],
    attachmentFileNames: ['support.txt'],
    isInReconciledPeriod: false,
    lastUpdatedTime: '2026-04-10T10:00:00Z',
    sourceTag: null,
  };

  const transferTx: NormalizedAuditTransaction = {
    ...purchaseTx,
    transactionType: 'Transfer',
    transactionId: 'T-transfer',
  };

  const purchaseFindings = classifyAuditExceptions([purchaseTx]);
  const transferFindings = classifyAuditExceptions([transferTx]);
  assert.deepEqual(ruleIds(purchaseFindings), ['TRANSFER_LIKE_ACTIVITY_MISPOSTED']);
  assert.deepEqual(ruleIds(transferFindings), []);
});

test('audit flags likely duplicates by date amount and counterparty', () => {
  const input: NormalizedAuditTransaction[] = [
    {
      transactionType: 'Purchase',
      transactionId: 'P100',
      txnDate: '2026-03-03',
      amount: 1015.85,
      currency: 'USD',
      counterparty: 'Internal funding move',
      docNumber: 'X1',
      privateNote: 'Transfer to Wise',
      dueDate: null,
      postingAccounts: ['Owner draws'],
      lineDescriptions: ['Transfer to Wise USD'],
      attachmentFileNames: ['x.txt'],
      isInReconciledPeriod: true,
      lastUpdatedTime: '2026-04-13T12:00:00Z',
      sourceTag: null,
    },
    {
      transactionType: 'Purchase',
      transactionId: 'P101',
      txnDate: '2026-03-03',
      amount: 1015.85,
      currency: 'USD',
      counterparty: 'Internal funding move',
      docNumber: 'X1',
      privateNote: 'Transfer to Wise',
      dueDate: null,
      postingAccounts: ['Owner draws'],
      lineDescriptions: ['Transfer to Wise USD'],
      attachmentFileNames: ['y.txt'],
      isInReconciledPeriod: true,
      lastUpdatedTime: '2026-04-13T12:00:00Z',
      sourceTag: null,
    },
  ];

  const findings = classifyAuditExceptions(input);
  assert.deepEqual(ruleIds(findings), ['LIKELY_DUPLICATE', 'LIKELY_DUPLICATE']);
});

test('audit does not flag duplicates when the doc numbers differ', () => {
  const input: NormalizedAuditTransaction[] = [
    {
      transactionType: 'Purchase',
      transactionId: 'P200',
      txnDate: '2026-03-03',
      amount: 1015.85,
      currency: 'USD',
      counterparty: 'Internal funding move',
      docNumber: 'X1',
      privateNote: 'Transfer to Wise',
      dueDate: null,
      postingAccounts: ['Owner draws'],
      lineDescriptions: ['Transfer to Wise USD'],
      attachmentFileNames: ['x.txt'],
      isInReconciledPeriod: true,
      lastUpdatedTime: '2026-04-13T12:00:00Z',
      sourceTag: null,
    },
    {
      transactionType: 'Purchase',
      transactionId: 'P201',
      txnDate: '2026-03-03',
      amount: 1015.85,
      currency: 'USD',
      counterparty: 'Internal funding move',
      docNumber: 'X2',
      privateNote: 'Transfer to Wise',
      dueDate: null,
      postingAccounts: ['Owner draws'],
      lineDescriptions: ['Transfer to Wise USD'],
      attachmentFileNames: ['y.txt'],
      isInReconciledPeriod: true,
      lastUpdatedTime: '2026-04-13T12:00:00Z',
      sourceTag: null,
    },
  ];

  const findings = classifyAuditExceptions(input);
  assert.deepEqual(ruleIds(findings), []);
});

test('audit flags unresolved settlement-control usage', () => {
  const tx: NormalizedAuditTransaction = {
    transactionType: 'JournalEntry',
    transactionId: 'J1',
    txnDate: '2025-01-10',
    amount: 11.64,
    currency: 'USD',
    counterparty: null,
    docNumber: 'AMZN-1',
    privateNote: 'Temporary suspense entry',
    dueDate: null,
    postingAccounts: ['plutus settlement control'],
    lineDescriptions: ['Temporary suspense entry'],
    attachmentFileNames: ['support.txt'],
    isInReconciledPeriod: true,
    lastUpdatedTime: '2025-01-10T10:00:00Z',
    sourceTag: null,
  };

  const findings = classifyAuditExceptions([tx], { asOfDate: '2026-04-10', staleControlAccountDays: 365 });
  assert.deepEqual(ruleIds(findings), ['UNRESOLVED_CONTROL_ACCOUNT_ACTIVITY']);
});

test('audit flags bank fee activity from note and line description cues', () => {
  const tx: NormalizedAuditTransaction = {
    transactionType: 'Purchase',
    transactionId: 'F1',
    txnDate: '2026-04-02',
    amount: 17.5,
    currency: 'USD',
    counterparty: 'Capital One',
    docNumber: 'FEE-1',
    privateNote: 'Monthly card fee for account maintenance',
    dueDate: null,
    postingAccounts: ['Other expenses:Misc'],
    lineDescriptions: ['Card service fee'],
    attachmentFileNames: ['support.txt'],
    isInReconciledPeriod: false,
    lastUpdatedTime: '2026-04-10T10:00:00Z',
    sourceTag: null,
  };

  const findings = classifyAuditExceptions([tx]);
  assert.deepEqual(ruleIds(findings), ['BANK_FEE_MISCLASSIFIED']);
});

test('audit accepts merchant processing fee accounts', () => {
  const tx: NormalizedAuditTransaction = {
    transactionType: 'Purchase',
    transactionId: 'F2',
    txnDate: '2026-04-03',
    amount: 21.75,
    currency: 'USD',
    counterparty: 'Stripe',
    docNumber: 'FEE-2',
    privateNote: 'Monthly card fee for account maintenance',
    dueDate: null,
    postingAccounts: ['Merchant processing fees'],
    lineDescriptions: ['Card service fee'],
    attachmentFileNames: ['support.txt'],
    isInReconciledPeriod: false,
    lastUpdatedTime: '2026-04-10T10:00:00Z',
    sourceTag: null,
  };

  const findings = classifyAuditExceptions([tx]);
  assert.deepEqual(ruleIds(findings), []);
});

test('audit flags owner activity misclassified away from owner equity', () => {
  const tx: NormalizedAuditTransaction = {
    transactionType: 'Purchase',
    transactionId: 'O1',
    txnDate: '2026-04-04',
    amount: 300,
    currency: 'USD',
    counterparty: 'Owner distribution',
    docNumber: 'OWN-1',
    privateNote: 'Owner reimbursement',
    dueDate: null,
    postingAccounts: ['Other expenses:Misc'],
    lineDescriptions: ['Owner reimbursement'],
    attachmentFileNames: ['support.txt'],
    isInReconciledPeriod: false,
    lastUpdatedTime: '2026-04-10T10:00:00Z',
    sourceTag: null,
  };

  const findings = classifyAuditExceptions([tx]);
  assert.deepEqual(ruleIds(findings), ['OWNER_ACTIVITY_MISCLASSIFIED']);
});

test('audit flags currency counterparty mismatch on purchases when currency is preserved', () => {
  const purchase = normalizePurchaseForAudit(
    {
      Id: 'C1',
      SyncToken: '1',
      TxnDate: '2026-04-05',
      TotalAmt: 42.5,
      PaymentType: 'CreditCard',
      DocNumber: 'CUR-1',
      PrivateNote: 'GBP charge from overseas vendor',
      CurrencyRef: { value: 'USD' },
      EntityRef: { value: '91', name: 'Overseas Vendor' },
      Line: [
        {
          Id: '1',
          Amount: 42.5,
          Description: 'GBP card charge',
          AccountBasedExpenseLineDetail: { AccountRef: { value: '500', name: 'Office expenses:Travel' } },
        },
      ],
      MetaData: { CreateTime: '2026-04-05T10:00:00Z', LastUpdatedTime: '2026-04-10T10:00:00Z' },
    },
    ['support.txt'],
  );

  assert.equal(purchase.currency, 'USD');

  const findings = classifyAuditExceptions([purchase]);
  assert.deepEqual(ruleIds(findings), ['CURRENCY_COUNTERPARTY_MISMATCH']);
});

test('normalizePurchaseForAudit preserves descriptions, accounts, payee, and attachments', () => {
  const normalized = normalizePurchaseForAudit(
    {
      Id: '1093',
      TxnDate: '2026-04-06',
      TotalAmt: 19.8,
      PaymentType: 'CreditCard',
      DocNumber: 'BITWARDEN-20260406',
      PrivateNote: 'Bitwarden software subscription matched from Chase Ink card feed.',
      EntityRef: { value: '76', name: 'Bitwarden' },
      Line: [
        {
          Id: '1',
          Amount: 19.8,
          Description: 'BITWARDEN',
          AccountBasedExpenseLineDetail: { AccountRef: { value: '500', name: 'Office expenses:Software & apps' } },
        },
      ],
      SyncToken: '1',
    },
    ['bitwarden-1093.txt'],
  );

  assert.equal(normalized.counterparty, 'Bitwarden');
  assert.deepEqual(normalized.postingAccounts, ['Office expenses:Software & apps']);
  assert.deepEqual(normalized.lineDescriptions, ['BITWARDEN']);
  assert.deepEqual(normalized.attachmentFileNames, ['bitwarden-1093.txt']);
});

test('normalizePurchaseForAudit preserves item-based accounts and omits missing descriptions', () => {
  const normalized = normalizePurchaseForAudit(
    {
      Id: '1094',
      TxnDate: '2026-04-07',
      TotalAmt: 42,
      PaymentType: 'CreditCard',
      DocNumber: 'BITWARDEN-20260407',
      PrivateNote: 'Bitwarden follow-up purchase.',
      EntityRef: { value: '76', name: 'Bitwarden' },
      Line: [
        {
          Id: '1',
          Amount: 42,
          ItemBasedExpenseLineDetail: { AccountRef: { value: '500', name: 'Office expenses:Software & apps' } },
        },
      ],
      SyncToken: '1',
    },
    ['bitwarden-1094.txt'],
  );

  assert.deepEqual(normalized.postingAccounts, ['Office expenses:Software & apps']);
  assert.deepEqual(normalized.lineDescriptions, []);
});

test('normalizeJournalEntryForAudit captures line descriptions and control-account usage', () => {
  const normalized = normalizeJournalEntryForAudit(
    {
      Id: '1098',
      SyncToken: '1',
      TxnDate: '2026-04-03',
      DocNumber: 'AMZN-260403-1164',
      PrivateNote: 'Temporary Amazon bank-receipt suspense entry.',
      Line: [
        {
          Amount: 11.64,
          Description: 'Temporary suspense for Amazon-originated Chase USD receipt pending settlement sync',
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: { PostingType: 'Debit', AccountRef: { value: '136', name: 'Targon US Chase USD (9899)' } },
        },
        {
          Amount: 11.64,
          Description: 'Offset to Plutus Settlement Control until final Amazon settlement journal is regenerated',
          DetailType: 'JournalEntryLineDetail',
          JournalEntryLineDetail: { PostingType: 'Credit', AccountRef: { value: '178', name: 'Plutus Settlement Control' } },
        },
      ],
    },
    ['support.txt'],
  );

  assert.equal(normalized.transactionType, 'JournalEntry');
  assert.equal(normalized.postingAccounts.includes('Plutus Settlement Control'), true);
  assert.deepEqual(normalized.lineDescriptions, [
    'Temporary suspense for Amazon-originated Chase USD receipt pending settlement sync',
    'Offset to Plutus Settlement Control until final Amazon settlement journal is regenerated',
  ]);
});

test('normalizeBillForAudit preserves vendor due date accounts and attachments', () => {
  const normalized = normalizeBillForAudit(
    {
      Id: '10',
      SyncToken: '0',
      TxnDate: '2026-04-01',
      TotalAmt: 1250,
      DocNumber: 'B-10',
      DueDate: '2026-04-30',
      PrivateNote: 'Inventory replenishment',
      CurrencyRef: { value: 'USD' },
      VendorRef: { value: '20', name: 'Vendor A' },
      Line: [
        {
          Id: '1',
          Amount: 1000,
          Description: 'Widgets',
          AccountBasedExpenseLineDetail: {
            AccountRef: { value: '300', name: 'Inventory Asset' },
          },
        },
        {
          Id: '2',
          Amount: 250,
          ItemBasedExpenseLineDetail: {
            AccountRef: { value: '301', name: 'Freight Clearing' },
          },
        },
      ],
      MetaData: {
        CreateTime: '2026-04-01T00:00:00Z',
        LastUpdatedTime: '2026-04-02T00:00:00Z',
      },
    },
    ['invoice.pdf'],
  );

  assert.equal(normalized.transactionType, 'Bill');
  assert.equal(normalized.counterparty, 'Vendor A');
  assert.equal(normalized.dueDate, '2026-04-30');
  assert.deepEqual(normalized.postingAccounts, ['Inventory Asset', 'Freight Clearing']);
  assert.deepEqual(normalized.lineDescriptions, ['Widgets']);
  assert.deepEqual(normalized.attachmentFileNames, ['invoice.pdf']);
});

test('normalizeTransferForAudit preserves both transfer accounts', () => {
  const normalized = normalizeTransferForAudit(
    {
      Id: '55',
      TxnDate: '2026-04-03',
      Amount: 500,
      DocNumber: 'TR-55',
      PrivateNote: 'Sweep',
      CurrencyRef: { value: 'USD' },
      FromAccountRef: { value: '10', name: 'Chase Checking' },
      ToAccountRef: { value: '20', name: 'Reserve Account' },
      MetaData: {
        LastUpdatedTime: '2026-04-03T10:00:00Z',
      },
    },
    ['support.pdf'],
  );

  assert.equal(normalized.transactionType, 'Transfer');
  assert.deepEqual(normalized.postingAccounts, ['Chase Checking', 'Reserve Account']);
  assert.equal(normalized.counterparty, null);
  assert.deepEqual(normalized.attachmentFileNames, ['support.pdf']);
});

test('mergeAttachmentRefs maps attachables back to transaction ids', () => {
  const result = mergeAttachmentRefs(
    [
      { Id: 'A1', FileName: 'bill.pdf', AttachableRef: [{ EntityRef: { type: 'Bill', value: '10' } }] },
      { Id: 'A2', FileName: 'support.txt', AttachableRef: [{ EntityRef: { type: 'JournalEntry', value: '20' } }] },
    ],
  );
  assert.deepEqual(result.get('Bill:10'), ['bill.pdf']);
  assert.deepEqual(result.get('JournalEntry:20'), ['support.txt']);
});

test('summarizeCoverage preserves partial coverage failures', () => {
  const summary = summarizeCoverage([
    { transactionType: 'Purchase', scannedCount: 100, complete: true },
    { transactionType: 'Transfer', scannedCount: 80, complete: false },
  ]);
  assert.equal(summary.completeCoverage, false);
  assert.equal(summary.failedTypes[0], 'Transfer');
});

test('audit coverage summary reports failed transaction-type coverage', () => {
  const coverage = summarizeCoverage([
    { transactionType: 'Purchase', scannedCount: 10, complete: true },
    { transactionType: 'Bill', scannedCount: 5, complete: true },
    { transactionType: 'Transfer', scannedCount: 3, complete: false },
    { transactionType: 'Attachable', scannedCount: 2, complete: false },
  ]);
  assert.equal(coverage.completeCoverage, false);
  assert.deepEqual(coverage.failedTypes, ['Transfer', 'Attachable']);
});

test('audit report builders render severity totals and csv rows', () => {
  const rows = [
    {
      transactionType: 'Bill',
      transactionId: '10',
      txnDate: '2026-04-01',
      amount: 1250,
      currency: 'USD',
      counterparty: 'Vendor A',
      postingAccountSummary: 'Inventory',
      ruleId: 'ATTACHMENT_REQUIRED_MISSING',
      ruleGroup: 'attachment_controls',
      severity: 'High',
      exceptionMessage: 'Bill has no attachment, review "support" docs.',
      suggestedFix: 'Attach the supporting invoice,\nthen mark "received".',
      supportStatus: 'missing',
      reconciledPeriodRisk: 'no',
    },
  ] as const;

  const csv = buildAuditCsv(rows);
  const summary = buildAuditMarkdownSummary(rows, { Purchase: 10, Bill: 1 });
  assert.equal(csv.includes('ATTACHMENT_REQUIRED_MISSING'), true);
  assert.equal(
    csv.includes('"Bill has no attachment, review ""support"" docs."'),
    true,
  );
  assert.equal(
    csv.includes('"Attach the supporting invoice,\nthen mark ""received""."'),
    true,
  );
  assert.equal(csv.includes('\\"support\\"'), false);
  assert.equal(summary.includes('High'), true);
  assert.equal(summary.includes('Bill: 1'), true);
});

function makeQboResponse(body: Record<string, unknown>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

test('getActiveQboConnection refreshes and persists updated connection state', async () => {
  const originalDeps = {
    getQboConnection: qboFullHistoryAuditDeps.getQboConnection,
    getValidToken: qboFullHistoryAuditDeps.getValidToken,
    saveServerQboConnection: qboFullHistoryAuditDeps.saveServerQboConnection,
    fetch: qboFullHistoryAuditDeps.fetch,
    sleep: qboFullHistoryAuditDeps.sleep,
  };

  const storedConnection: QboConnection = {
    realmId: '123',
    accessToken: 'stale-token',
    refreshToken: 'refresh-token',
    expiresAt: '2026-04-14T00:00:00.000Z',
  };
  const refreshedConnection: QboConnection = {
    ...storedConnection,
    accessToken: 'fresh-token',
    expiresAt: '2026-04-14T02:00:00.000Z',
  };

  let savedConnection: QboConnection | null = null;

  qboFullHistoryAuditDeps.getQboConnection = async () => storedConnection;
  qboFullHistoryAuditDeps.getValidToken = async () => ({
    accessToken: refreshedConnection.accessToken,
    updatedConnection: refreshedConnection,
  });
  qboFullHistoryAuditDeps.saveServerQboConnection = async (connection) => {
    savedConnection = connection;
  };

  try {
    const active = await getActiveQboConnection();
    assert.equal(active.accessToken, 'fresh-token');
    assert.equal(active.connection.accessToken, 'fresh-token');
    assert.deepEqual(savedConnection, refreshedConnection);

    let observedAuthorization = '';
    qboFullHistoryAuditDeps.fetch = async (_url, init) => {
      observedAuthorization = new Headers(init?.headers).get('Authorization') ?? '';
      return makeQboResponse({ QueryResponse: { Bill: [] } });
    };
    qboFullHistoryAuditDeps.sleep = async () => {};

    const queryResult = await qboQueryAll(active, 'SELECT * FROM Bill');
    assert.equal(queryResult.complete, true);
    assert.equal(observedAuthorization, 'Bearer fresh-token');
  } finally {
    qboFullHistoryAuditDeps.getQboConnection = originalDeps.getQboConnection;
    qboFullHistoryAuditDeps.getValidToken = originalDeps.getValidToken;
    qboFullHistoryAuditDeps.saveServerQboConnection = originalDeps.saveServerQboConnection;
    qboFullHistoryAuditDeps.fetch = originalDeps.fetch;
    qboFullHistoryAuditDeps.sleep = originalDeps.sleep;
  }
});

test('qboQueryAll paginates until the final short page', async () => {
  const originalFetch = qboFullHistoryAuditDeps.fetch;
  const originalSleep = qboFullHistoryAuditDeps.sleep;
  const requests: string[] = [];

  qboFullHistoryAuditDeps.sleep = async () => {};
  qboFullHistoryAuditDeps.fetch = async (url) => {
    requests.push(url);
    if (requests.length === 1) {
      return makeQboResponse({
        QueryResponse: {
          Bill: Array.from({ length: 1000 }, (_, index) => ({ Id: `B${index + 1}` })),
        },
      });
    }

    if (requests.length === 2) {
      return makeQboResponse({
        QueryResponse: {
          Bill: [{ Id: 'B1001' }],
        },
      });
    }

    throw new Error('unexpected fetch');
  };

  try {
    const result = await qboQueryAll(
      {
        connection: {
          realmId: '123',
          accessToken: 'fresh-token',
        },
        accessToken: 'fresh-token',
      },
      'SELECT * FROM Bill',
    );

    assert.equal(result.complete, true);
    assert.equal(result.rows.length, 1001);
    assert.equal(requests.length, 2);
    assert.match(requests[0] ?? '', /STARTPOSITION%201%20MAXRESULTS%201000/);
    assert.match(requests[1] ?? '', /STARTPOSITION%201001%20MAXRESULTS%201000/);
  } finally {
    qboFullHistoryAuditDeps.fetch = originalFetch;
    qboFullHistoryAuditDeps.sleep = originalSleep;
  }
});

test('qboQueryAll retries retryable qbo responses before succeeding', async () => {
  const originalFetch = qboFullHistoryAuditDeps.fetch;
  const originalSleep = qboFullHistoryAuditDeps.sleep;
  const requests: number[] = [];

  qboFullHistoryAuditDeps.sleep = async () => {};
  qboFullHistoryAuditDeps.fetch = async () => {
    requests.push(requests.length + 1);
    if (requests.length < 3) {
      return makeQboResponse({ QueryResponse: { Bill: [] } }, 503);
    }

    return makeQboResponse({
      QueryResponse: {
        Bill: [{ Id: 'B1' }],
      },
    });
  };

  try {
    const result = await qboQueryAll(
      {
        connection: {
          realmId: '123',
          accessToken: 'fresh-token',
        },
        accessToken: 'fresh-token',
      },
      'SELECT * FROM Bill',
    );

    assert.equal(result.complete, true);
    assert.equal(result.rows.length, 1);
    assert.equal(requests.length, 3);
  } finally {
    qboFullHistoryAuditDeps.fetch = originalFetch;
    qboFullHistoryAuditDeps.sleep = originalSleep;
  }
});

test('qboQueryAll throws after bounded network retries', async () => {
  const originalFetch = qboFullHistoryAuditDeps.fetch;
  const originalSleep = qboFullHistoryAuditDeps.sleep;
  let attempts = 0;

  qboFullHistoryAuditDeps.sleep = async () => {};
  qboFullHistoryAuditDeps.fetch = async () => {
    attempts++;
    throw new Error('socket hang up');
  };

  try {
    await assert.rejects(
      qboQueryAll(
        {
          connection: {
            realmId: '123',
            accessToken: 'fresh-token',
          },
          accessToken: 'fresh-token',
        },
        'SELECT * FROM Bill',
      ),
      /socket hang up/,
    );
    assert.equal(attempts, 4);
  } finally {
    qboFullHistoryAuditDeps.fetch = originalFetch;
    qboFullHistoryAuditDeps.sleep = originalSleep;
  }
});

test('fetchAuditSourceData queries purchases bills journal entries transfers and attachables', async () => {
  const originalFetch = qboFullHistoryAuditDeps.fetch;
  const originalSleep = qboFullHistoryAuditDeps.sleep;
  const requestedQueries: string[] = [];

  qboFullHistoryAuditDeps.sleep = async () => {};
  qboFullHistoryAuditDeps.fetch = async (url) => {
    const requestUrl = new URL(url);
    const query = requestUrl.searchParams.get('query') ?? '';
    requestedQueries.push(query);

    if (query.includes('FROM Purchase')) {
      return makeQboResponse({ QueryResponse: { Purchase: [{ Id: 'P1' }] } });
    }
    if (query.includes('FROM Bill')) {
      return makeQboResponse({ QueryResponse: { Bill: [{ Id: 'B1' }] } });
    }
    if (query.includes('FROM JournalEntry')) {
      return makeQboResponse({ QueryResponse: { JournalEntry: [{ Id: 'J1' }] } });
    }
    if (query.includes('FROM Transfer')) {
      return makeQboResponse({ QueryResponse: { Transfer: [{ Id: 'T1' }] } });
    }
    if (query.includes('FROM Attachable')) {
      return makeQboResponse({ QueryResponse: { Attachable: [{ Id: 'A1' }] } });
    }

    throw new Error(`unexpected query: ${query}`);
  };

  try {
    const result = await fetchAuditSourceData('fresh-token', '123', 'https://example.com');
    assert.equal(result.purchases.rows.length, 1);
    assert.equal(result.bills.rows.length, 1);
    assert.equal(result.journalEntries.rows.length, 1);
    assert.equal(result.transfers.rows.length, 1);
    assert.equal(result.attachables.rows.length, 1);
    assert.equal(requestedQueries.length, 5);
  } finally {
    qboFullHistoryAuditDeps.fetch = originalFetch;
    qboFullHistoryAuditDeps.sleep = originalSleep;
  }
});

test('settlement sync worker post mode fails closed', () => {
  assert.throws(() => parseSettlementSyncWorkerPostMode(undefined), /PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE/);
  assert.throws(() => parseSettlementSyncWorkerPostMode(''), /PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE/);
  assert.throws(() => parseSettlementSyncWorkerPostMode('true'), /PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE/);
  assert.equal(parseSettlementSyncWorkerPostMode('read_only').postToQbo, false);
  assert.equal(parseSettlementSyncWorkerPostMode('post_qbo').postToQbo, true);
});

test('settlement sync CLI post flag is explicit', () => {
  assert.throws(() => parseSettlementSyncCliPostFlag([], 'US SP-API settlement sync'), /--post-qbo or --no-post/);
  assert.throws(
    () => parseSettlementSyncCliPostFlag(['--post-qbo', '--no-post'], 'US SP-API settlement sync'),
    /Only one QBO posting flag/,
  );
  assert.deepEqual(parseSettlementSyncCliPostFlag(['--post-qbo', '--start-date', '2026-05-01'], 'US SP-API settlement sync'), {
    postToQbo: true,
    argv: ['--start-date', '2026-05-01'],
  });
  assert.deepEqual(parseSettlementSyncCliPostFlag(['--no-post', '--start-date', '2026-05-01'], 'US SP-API settlement sync'), {
    postToQbo: false,
    argv: ['--start-date', '2026-05-01'],
  });
});

test('SP-API settlement sync routes require explicit postToQbo', async () => {
  const request = new Request('https://plutus.test/api/plutus/settlements/spapi/us/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ startDate: '2026-05-01' }),
  });
  const response = await postUsSpApiSettlementSync(request);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.match(String(payload.details ?? payload.error), /postToQbo/);

  const ukRequest = new Request('https://plutus.test/api/plutus/settlements/spapi/uk/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ startDate: '2026-05-01' }),
  });
  const ukResponse = await postUkSpApiSettlementSync(ukRequest);
  const ukPayload = await ukResponse.json();

  assert.equal(ukResponse.status, 400);
  assert.match(String(ukPayload.details ?? ukPayload.error), /postToQbo/);
});

test('settlement cash mapping guardrail rejects real bank and credit card accounts', () => {
  assert.throws(
    () =>
      assertSettlementCashMappingDoesNotUseRealBankMovement(
        { Id: '136', Name: 'Targon US Chase USD (9899)', AccountType: 'Bank' } as QboAccount,
        'Transfer to Bank',
      ),
    /cannot use real bank or card account/,
  );

  assert.throws(
    () =>
      assertSettlementCashMappingDoesNotUseRealBankMovement(
        { Id: '148', Name: 'Chase Ink CC (0922)', AccountType: 'Credit Card' } as QboAccount,
        'Payment to Amazon',
      ),
    /cannot use real bank or card account/,
  );

  assert.doesNotThrow(() =>
    assertSettlementCashMappingDoesNotUseRealBankMovement(
      { Id: '178', Name: 'Plutus Settlement Control', AccountType: 'Other Current Asset' } as QboAccount,
      'Payment to Amazon',
    ),
  );
});

test('audit settlement JE rebuild script posts cash legs to settlement control only', () => {
  const source = readFileSync('scripts/create-settlement-je-from-audit.ts', 'utf8');

  assert.equal(source.includes('accountId: bankAccountId,'), false);
  assert.equal(source.includes('accountId: paymentAccountId,'), false);
  assert.equal(source.includes('accountId: settlementControlAccountId,'), true);
});

test('successful US settlement payouts post to settlement control instead of bank account', () => {
  const entries = buildQboJournalEntriesFromUsSettlementDraft({
    draft: {
      settlementId: '26189598301',
      eventGroupId: 'group-us',
      timeZone: 'America/Los_Angeles',
      originalTotalCents: 11934,
      fundTransferStatus: 'Succeeded',
      segments: [
        {
          seq: 1,
          yearMonth: '2026-05',
          startIsoDay: '2026-04-16',
          endIsoDay: '2026-04-30',
          txnDate: '2026-04-30',
          docNumber: 'US-260416-260430-S1',
          memoTotalsCents: new Map([['Amazon Sales - Principal', 11934]]),
          auditRows: [],
        },
      ],
    } as any,
    privateNote: 'test',
    settlementControlAccountId: 'control',
    bankAccountId: 'bank',
    paymentAccountId: 'payment',
    accountIdByMemo: new Map([['Amazon Sales - Principal', 'sales']]),
  });

  assert.equal(entries[0]!.lines.some((line) => line.accountId === 'bank'), false);
  assert.equal(
    entries[0]!.lines.some(
      (line) =>
        line.accountId === 'control' &&
        line.postingType === 'Debit' &&
        line.amount === 119.34 &&
        line.description === 'Settlement Control (FundTransferStatus=Succeeded)',
    ),
    true,
  );
});

test('successful UK settlement payouts post to settlement control instead of bank account', () => {
  const entries = buildQboJournalEntriesFromUkSettlementDraft({
    draft: {
      settlementId: 'EG-group-uk',
      eventGroupId: 'group-uk',
      timeZone: 'Europe/London',
      originalTotalCents: 1394696,
      fundTransferStatus: 'Succeeded',
      segments: [
        {
          seq: 1,
          yearMonth: '2026-04',
          startIsoDay: '2026-04-01',
          endIsoDay: '2026-04-21',
          txnDate: '2026-04-21',
          docNumber: 'UK-260401-260421-S1',
          memoTotalsCents: new Map([['Amazon Sales - Principal', 1394696]]),
          auditRows: [],
        },
      ],
    } as any,
    privateNote: 'test',
    settlementControlAccountId: 'control',
    bankAccountId: 'bank',
    paymentAccountId: 'payment',
    accountIdByMemo: new Map([['Amazon Sales - Principal', 'sales']]),
  });

  assert.equal(entries[0]!.lines.some((line) => line.accountId === 'bank'), false);
  assert.equal(
    entries[0]!.lines.some(
      (line) =>
        line.accountId === 'control' &&
        line.postingType === 'Debit' &&
        line.amount === 13946.96 &&
        line.description === 'Settlement Control (FundTransferStatus=Succeeded)',
    ),
    true,
  );
});

test('negative US settlement payments post to settlement control instead of payment account', () => {
  const entries = buildQboJournalEntriesFromUsSettlementDraft({
    draft: {
      settlementId: '26189598302',
      eventGroupId: 'group-us-negative',
      timeZone: 'America/Los_Angeles',
      originalTotalCents: -545378,
      fundTransferStatus: 'Succeeded',
      segments: [
        {
          seq: 1,
          yearMonth: '2026-05',
          startIsoDay: '2026-05-01',
          endIsoDay: '2026-05-01',
          txnDate: '2026-05-01',
          docNumber: 'US-260501-260501-S1',
          memoTotalsCents: new Map([['Amazon FBA Fees - Domestic Orders', -545378]]),
          auditRows: [],
        },
      ],
    } as any,
    privateNote: 'test',
    settlementControlAccountId: 'control',
    bankAccountId: 'bank',
    paymentAccountId: 'payment',
    accountIdByMemo: new Map([['Amazon FBA Fees - Domestic Orders', 'fees']]),
  });

  assert.equal(entries[0]!.lines.some((line) => line.accountId === 'payment'), false);
  assert.equal(
    entries[0]!.lines.some(
      (line) =>
        line.accountId === 'control' &&
        line.postingType === 'Credit' &&
        line.amount === 5453.78 &&
        line.description === 'Payment to Amazon',
    ),
    true,
  );
});

test('negative UK settlement payments post to settlement control instead of payment account', () => {
  const entries = buildQboJournalEntriesFromUkSettlementDraft({
    draft: {
      settlementId: 'EG-group-uk-negative',
      eventGroupId: 'group-uk-negative',
      timeZone: 'Europe/London',
      originalTotalCents: -401753,
      fundTransferStatus: 'Succeeded',
      segments: [
        {
          seq: 1,
          yearMonth: '2026-05',
          startIsoDay: '2026-05-01',
          endIsoDay: '2026-05-01',
          txnDate: '2026-05-01',
          docNumber: 'UK-260501-260501-S1',
          memoTotalsCents: new Map([['Amazon FBA Fees - Domestic Orders', -401753]]),
          auditRows: [],
        },
      ],
    } as any,
    privateNote: 'test',
    settlementControlAccountId: 'control',
    bankAccountId: 'bank',
    paymentAccountId: 'payment',
    accountIdByMemo: new Map([['Amazon FBA Fees - Domestic Orders', 'fees']]),
  });

  assert.equal(entries[0]!.lines.some((line) => line.accountId === 'payment'), false);
  assert.equal(
    entries[0]!.lines.some(
      (line) =>
        line.accountId === 'control' &&
        line.postingType === 'Credit' &&
        line.amount === 4017.53 &&
        line.description === 'Payment to Amazon',
    ),
    true,
  );
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
