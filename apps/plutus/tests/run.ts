import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
import { buildInventoryEventsFromMappings, parseQboBillsToInventoryEvents } from '../lib/inventory/qbo-bills';
import {
  buildAccountComponentMap,
  extractTrackedLinesFromBill,
} from '../lib/plutus/bills/classification';
import {
  buildBillMappingPullSyncUpdates,
  extractPoNumberFromBill,
} from '../lib/plutus/bills/pull-sync';
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
import { buildCogsJournalLines, buildPnlJournalLines } from '../lib/plutus/journal-builder';
import { computePnlAllocation } from '../lib/pnl-allocation';
import {
  allocateShipmentFeeChargesBySkuQuantity,
  extractInboundTransportationServiceFeeCharges,
  isInboundTransportationMemoDescription,
} from '../lib/plutus/shipment-fee-allocation';
import { parseAmazonTransactionCsv } from '../lib/reconciliation/amazon-csv';
import { parseAmazonUnifiedTransactionCsv } from '../lib/amazon-payments/unified-transaction-csv';
import { buildUsSettlementDraftFromSpApiFinances } from '../lib/amazon-finances/us-settlement-builder';
import { buildUkSettlementDraftFromSpApiFinances } from '../lib/amazon-finances/uk-settlement-builder';
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
import { parseSpAdvertisedProductCsv } from '../lib/amazon-ads/sp-advertised-product-csv';
import { parseAwdFeeCsv } from '../lib/awd/fee-report-csv';
import { buildSettlementSkuProfitability } from '../lib/plutus/settlement-ads-profitability';
import { isBlockingProcessingCode } from '../lib/plutus/settlement-types';
import { buildPrincipalGroupsByDate, matchRefundsToSales } from '../lib/plutus/settlement-validation';
import {
  buildPlutusSettlementDocNumber,
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
} from '../lib/plutus/settlement-review';
import { normalizeSettlementMarketplaceQuery } from '../lib/plutus/settlement-marketplace-query';
import {
  buildLegacySettlementApiPath,
  buildLegacySettlementApiPreviewPath,
  buildLegacySettlementApiProcessPath,
  buildLegacySettlementPagePath,
  remapLegacySettlementPath,
} from '../lib/plutus/legacy-settlement-routes';
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
import type { QboAccount, QboBill, QboConnection, QboRecurringTransaction } from '../lib/qbo/api';

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

test('cashflow snapshot module remains safe for the Node refresh worker', () => {
  const snapshotSource = readFileSync(new URL('../lib/plutus/cashflow/snapshot.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(snapshotSource, /^import ['"]server-only['"];?$/m);
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

test('cashflow snapshot server-only guard stays out of standalone worker path', () => {
  const snapshotModule = readFileSync(new URL('../lib/plutus/cashflow/snapshot.ts', import.meta.url), 'utf8');
  const snapshotServerModule = readFileSync(new URL('../lib/plutus/cashflow/snapshot.server.ts', import.meta.url), 'utf8');
  const workerModule = readFileSync(new URL('../scripts/cashflow-refresh-worker.ts', import.meta.url), 'utf8');
  const snapshotRoute = readFileSync(new URL('../app/api/plutus/cashflow/snapshot/route.ts', import.meta.url), 'utf8');
  const exportRoute = readFileSync(new URL('../app/api/plutus/cashflow/export/route.ts', import.meta.url), 'utf8');
  const configRoute = readFileSync(new URL('../app/api/plutus/cashflow/config/route.ts', import.meta.url), 'utf8');

  assert.equal(snapshotModule.includes("import 'server-only';"), false);
  assert.equal(snapshotServerModule.includes("import 'server-only';"), true);
  assert.equal(workerModule.includes("@/lib/plutus/cashflow/snapshot';"), true);
  assert.equal(snapshotRoute.includes("@/lib/plutus/cashflow/snapshot.server';"), true);
  assert.equal(exportRoute.includes("@/lib/plutus/cashflow/snapshot.server';"), true);
  assert.equal(configRoute.includes("@/lib/plutus/cashflow/snapshot.server';"), true);
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
          blocks: [{ code: 'PNL_ALLOCATION_WARNING', message: 'Preview warning' }],
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
  assert.equal(sections[0]?.blockState, 'warning');
  assert.equal(sections[0]?.blocks[0]?.severity, 'warning');
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
      ['Amazon Sales - Principal - UK-PDS', '188'],
      ['Amazon Seller Fees - Commission', '183'],
    ]),
    taxCodeIdByMemo: new Map([
      ['Amazon Sales - Principal - UK-PDS', null],
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
        description: 'Amazon Sales - Principal - UK-PDS',
        netCents: 1000,
      },
      {
        invoiceId: 'UK-260116-260130-S1',
        market: 'uk',
        date: '2026-01-17',
        orderId: 'o-2',
        sku: 'SKU-2',
        quantity: 1,
        description: 'Amazon Sales - Principal - UK-PDS',
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
    'Amazon Sales - Principal - UK-PDS,No Tax Rate Applicable,188,15.00,10.00,5.00',
    'Amazon Seller Fees - Commission,No Tax Rate Applicable,183,-2.50,0.00,-2.50',
  ].join('\n');

  assert.equal(csv, expected);
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

  const principalMemo = 'Amazon Sales - Principal (Marketplace VAT Responsible) - UK-BRAND';
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

  const principalMemo = 'Amazon Refunds - Refunded Principal (Marketplace VAT Responsible) - UK-BRAND';
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

test('parseAwdFeeCsv parses monthly SKU fee rows', () => {
  const csv = [
    'month_of_,year_of_ch,msku,country_c,fee_type,fee_amoun,currency',
    'January,2026,cs-007,US,STORAGE_F,11.78,USD',
    'January,2026,cs-010,US,STORAGE_F,7.17,USD',
  ].join('\n');

  const parsed = parseAwdFeeCsv(csv, { allowedCountries: ['US'] });
  assert.equal(parsed.rawRowCount, 2);
  assert.equal(parsed.skuCount, 2);
  assert.equal(parsed.minDate, '2026-01-01');
  assert.equal(parsed.maxDate, '2026-01-31');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]?.sku, 'CS-007');
  assert.equal(parsed.rows[0]?.feeCents, 1178);
});

test('parseAwdFeeCsv prefers total_charged_amount over fee_amount', () => {
  const csv = [
    'month_of_charge,year_of_charge,msku,country_c,fee_type,fee_amount,total_charged_amount,currency',
    'January,2026,cs-007,US,STORAGE_FEE,11.78,7.50,USD',
  ].join('\n');

  const parsed = parseAwdFeeCsv(csv, { allowedCountries: ['US'] });
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]?.feeCents, 750);
});

test('parseAwdFeeCsv parses charged_amount and charge_type', () => {
  const csv = [
    'month_of_charge,year_of_charge,msku,country_c,fee_type,charge_type,charged_amount,currency',
    'December,2025,cs-007,US,PROCESSING_FEE,inbound,1.23,USD',
    'December,2025,cs-007,US,PROCESSING_FEE,Inbound,2.00,USD',
    'December,2025,cs-007,US,PROCESSING_FEE,Outbound,4.56,USD',
  ].join('\n');

  const parsed = parseAwdFeeCsv(csv, { allowedCountries: ['US'] });
  assert.equal(parsed.rawRowCount, 3);
  assert.equal(parsed.skuCount, 1);
  assert.equal(parsed.minDate, '2025-12-01');
  assert.equal(parsed.maxDate, '2025-12-31');
  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0]?.chargeType, 'Inbound');
  assert.equal(parsed.rows[0]?.feeCents, 323);
  assert.equal(parsed.rows[1]?.chargeType, 'Outbound');
  assert.equal(parsed.rows[1]?.feeCents, 456);
});

test('computePnlAllocation leaves SKU-less fees unallocated without deterministic source', () => {
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
      description: 'Amazon FBA Fees - FBA Inbound Transportation Fee',
      net: -9,
    },
  ];

  const allocation = computePnlAllocation(rows, {
    getBrandForSku: (sku) => (sku === 'SKU-A' ? 'BrandA' : sku === 'SKU-B' ? 'BrandB' : 'Unknown'),
  });

  assert.equal(allocation.allocationsByBucket.amazonFbaFees.BrandA, undefined);
  assert.equal(allocation.allocationsByBucket.amazonFbaFees.BrandB, undefined);
  assert.equal(allocation.unallocatedSkuLessBuckets.length, 1);
  assert.equal(allocation.unallocatedSkuLessBuckets[0]?.bucket, 'amazonFbaFees');
  assert.equal(allocation.unallocatedSkuLessBuckets[0]?.totalCents, -900);
});

test('computePnlAllocation allocates amazon seller fees when SKU is present', () => {
  const rows = [
    {
      invoice: 'INV-1',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'ORD-1',
      sku: 'SKU-A',
      quantity: 0,
      description: 'Amazon Seller Fees - Commission',
      net: -2.5,
    },
    {
      invoice: 'INV-1',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'n/a',
      sku: '',
      quantity: 0,
      description: 'Amazon Seller Fees - Subscription Fee',
      net: -1.25,
    },
  ];

  const allocation = computePnlAllocation(rows, {
    getBrandForSku: () => 'BrandA',
  });

  assert.equal(allocation.allocationsByBucket.amazonSellerFees.BrandA, -250);
  assert.equal(allocation.skuBreakdownByBucketBrand.amazonSellerFees.BrandA?.['SKU-A'], -250);
  assert.equal(allocation.unallocatedSkuLessBuckets.length, 0);
});

test('extractInboundTransportationServiceFeeCharges parses transaction and context entries', () => {
  const parsed = extractInboundTransportationServiceFeeCharges([
    {
      transactionType: 'ServiceFee',
      transactionId: 'TX-1',
      description: 'FBA Inbound Transportation Fee',
      totalAmount: { currencyAmount: -100 },
      relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: 'FBA-SHIP-1' }],
    },
    {
      transactionType: 'ServiceFee',
      transactionId: 'TX-2',
      description: 'Service fee',
      relatedIdentifiers: [{ relatedIdentifierName: 'SETTLEMENT_ID', relatedIdentifierValue: 'S-1' }],
      contexts: [
        {
          description: 'FBA Inbound Transportation Fee',
          amount: { currencyAmount: -50 },
          relatedIdentifiers: [{ relatedIdentifierName: 'ORDER_ID', relatedIdentifierValue: 'FBA-SHIP-2' }],
        },
      ],
    },
    {
      transactionType: 'DebtRecovery',
      transactionId: 'TX-3',
    },
  ]);

  assert.equal(parsed.issues.length, 0);
  assert.equal(parsed.charges.length, 2);
  assert.equal(parsed.charges[0]?.shipmentId, 'FBA-SHIP-1');
  assert.equal(parsed.charges[0]?.cents, -10000);
  assert.equal(parsed.charges[1]?.shipmentId, 'FBA-SHIP-2');
  assert.equal(parsed.charges[1]?.cents, -5000);
  assert.equal(isInboundTransportationMemoDescription('Amazon FBA Fees - FBA Inbound Transportation Fee'), true);
  assert.equal(isInboundTransportationMemoDescription('Amazon FBA Fees - FBA Inbound Transportation Program Fee - Domestic Orders'), true);
  assert.equal(isInboundTransportationMemoDescription('Amazon Seller Fees - Subscription Fee'), false);
});

test('allocateShipmentFeeChargesBySkuQuantity allocates by shipped quantity', () => {
  const allocation = allocateShipmentFeeChargesBySkuQuantity({
    charges: [
      {
        shipmentId: 'FBA-SHIP-1',
        cents: -10000,
        transactionId: 'TX-1',
        description: 'FBA Inbound Transportation Fee',
      },
      {
        shipmentId: 'FBA-SHIP-2',
        cents: -5000,
        transactionId: 'TX-2',
        description: 'FBA Inbound Transportation Fee',
      },
    ],
    shipmentItemsByShipmentId: new Map([
      [
        'FBA-SHIP-1',
        [
          { sku: 'SKU-A', quantity: 3 },
          { sku: 'SKU-B', quantity: 1 },
        ],
      ],
      [
        'FBA-SHIP-2',
        [
          { sku: 'SKU-B', quantity: 2 },
        ],
      ],
    ]),
  });

  assert.equal(allocation.issues.length, 0);
  assert.equal(allocation.allocationBySku['SKU-A'], -7500);
  assert.equal(allocation.allocationBySku['SKU-B'], -7500);
});

test('computePnlAllocation routes AWD rows using deterministic SKU map', () => {
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
      description: 'Amazon FBA Fees - AWD Processing Fee',
      net: -9,
    },
    {
      invoice: 'INV-1',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'n/a',
      sku: 'SKU-A',
      quantity: 0,
      description: 'Amazon Storage Fees - AWD Storage Fee',
      net: -3,
    },
  ];

  const allocation = computePnlAllocation(
    rows,
    {
      getBrandForSku: (sku) => (sku === 'SKU-A' ? 'BrandA' : sku === 'SKU-B' ? 'BrandB' : 'Unknown'),
    },
    {
      skuAllocationsByBucket: {
        warehousingAwd: {
          'SKU-A': -600,
          'SKU-B': -300,
        },
      },
    },
  );

  assert.equal(allocation.allocationsByBucket.warehousingAwd.BrandA, -900);
  assert.equal(allocation.allocationsByBucket.warehousingAwd.BrandB, -300);
  assert.equal(allocation.allocationsByBucket.amazonFbaFees.BrandA, undefined);
  assert.equal(allocation.allocationsByBucket.amazonStorageFees.BrandA, undefined);
  assert.equal(allocation.unallocatedSkuLessBuckets.length, 0);
});

test('buildPnlJournalLines uses prefixed leaf accounts under AWD parent', () => {
  const blocks: ProcessingBlock[] = [];
  const accounts: QboAccount[] = [
    {
      Id: '238',
      SyncToken: '0',
      Name: 'AWD',
      AccountType: 'Cost of Goods Sold',
      AccountSubType: 'ShippingFreightDeliveryCos',
    },
    {
      Id: '245',
      SyncToken: '0',
      Name: 'AWD - US-PDS',
      AccountType: 'Cost of Goods Sold',
      AccountSubType: 'ShippingFreightDeliveryCos',
      ParentRef: { value: '238', name: 'AWD' },
    },
  ];

  const lines = buildPnlJournalLines(
    { warehousingAwd: { 'US-PDS': -12345 } },
    { warehousingAwd: '238' },
    accounts,
    'INV-1',
    blocks,
  );

  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.accountId, '245');
  assert.equal(lines[0]?.postingType, 'Debit');
  assert.equal(lines[0]?.amountCents, 12345);
  assert.equal(lines[1]?.accountId, '238');
  assert.equal(lines[1]?.postingType, 'Credit');
  assert.equal(lines[1]?.amountCents, 12345);
  assert.equal(blocks.length, 0);
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

test('computePnlAllocation tracks SKU breakdown for deterministic SKU-less fee rows', () => {
  const rows = [
    {
      invoice: 'INV-2',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'ORD-1',
      sku: 'SKU-A',
      quantity: -2,
      description: 'Amazon Sales - Principal - Brand A',
      net: 20,
    },
    {
      invoice: 'INV-2',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'ORD-2',
      sku: 'SKU-B',
      quantity: -1,
      description: 'Amazon Sales - Principal - Brand A',
      net: 10,
    },
    {
      invoice: 'INV-2',
      market: 'Amazon.com',
      date: '2025-12-01',
      orderId: 'n/a',
      sku: '',
      quantity: 0,
      description: 'Amazon FBA Fees - FBA Inbound Transportation Fee',
      net: -3,
    },
  ];

  const allocation = computePnlAllocation(
    rows,
    {
      getBrandForSku: () => 'BrandA',
    },
    {
      skuAllocationsByBucket: {
        amazonFbaFees: {
          'SKU-A': -200,
          'SKU-B': -100,
        },
      },
    },
  );

  assert.equal(allocation.allocationsByBucket.amazonFbaFees.BrandA, -300);
  assert.equal(allocation.skuBreakdownByBucketBrand.amazonFbaFees.BrandA?.['SKU-A'], -200);
  assert.equal(allocation.skuBreakdownByBucketBrand.amazonFbaFees.BrandA?.['SKU-B'], -100);
  assert.equal(allocation.unallocatedSkuLessBuckets.length, 0);
});

test('buildPnlJournalLines includes SKU breakdown in descriptions', () => {
  const blocks: ProcessingBlock[] = [];
  const accounts: QboAccount[] = [
    {
      Id: '186',
      SyncToken: '0',
      Name: 'Amazon Seller Fees',
      AccountType: 'Expense',
      AccountSubType: 'AdvertisingPromotional',
    },
    {
      Id: '199',
      SyncToken: '0',
      Name: 'Amazon Seller Fees - US-PDS',
      AccountType: 'Expense',
      AccountSubType: 'AdvertisingPromotional',
      ParentRef: { value: '186', name: 'Amazon Seller Fees' },
    },
  ];

  const lines = buildPnlJournalLines(
    { amazonSellerFees: { 'US-PDS': -12345 } },
    { amazonSellerFees: '186' },
    accounts,
    'INV-3',
    blocks,
    {
      amazonSellerFees: {
        'US-PDS': {
          'SKU-A': -8230,
          'SKU-B': -4115,
        },
      },
    },
  );

  assert.equal(lines.length, 2);
  assert.equal(lines[0]?.description.includes('SKUs'), true);
  assert.equal(lines[0]?.description.includes('SKU-A'), true);
  assert.equal(lines[0]?.description.includes('SKU-B'), true);
});

test('isBlockingProcessingCode treats PNL allocation warnings as non-blocking', () => {
  assert.equal(isBlockingProcessingCode('PNL_ALLOCATION_ERROR'), true);
  assert.equal(isBlockingProcessingCode('PNL_ALLOCATION_WARNING'), false);
  assert.equal(isBlockingProcessingCode('LATE_COST_ON_HAND_ZERO'), false);
  assert.equal(isBlockingProcessingCode('MISSING_COST_BASIS'), true);
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
        docNumber: 'US-01JAN-14JAN-26-001',
        txnDate: '2026-01-16',
        periodEnd: '2026-01-14',
        cashImpactCents: 100_000,
      },
      {
        journalEntryId: 'je-2',
        channel: 'US',
        docNumber: 'US-15JAN-28JAN-26-002',
        txnDate: '2026-01-30',
        periodEnd: '2026-01-28',
        cashImpactCents: 120_000,
      },
      {
        journalEntryId: 'je-3',
        channel: 'US',
        docNumber: 'US-29JAN-11FEB-26-003',
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
