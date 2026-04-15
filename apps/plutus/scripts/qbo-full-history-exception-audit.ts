import { promises as fs } from 'node:fs';
import path from 'node:path';

import { getApiBaseUrl } from '@/lib/qbo/client';
import {
  type CoverageRow,
  fetchAuditSourceData,
  getActiveQboConnection,
  mergeAttachmentRefs,
  summarizeCoverage,
} from '@/lib/qbo/full-history-audit/fetch';
import {
  normalizeBillForAudit,
  normalizeJournalEntryForAudit,
  normalizePurchaseForAudit,
  normalizeTransferForAudit,
} from '@/lib/qbo/full-history-audit/normalize';
import { buildAuditCsv, buildAuditMarkdownSummary } from '@/lib/qbo/full-history-audit/report';
import { classifyAuditExceptions } from '@/lib/qbo/full-history-audit/rules';

function parseArgs(argv: string[]) {
  const outDir = argv[0];
  if (outDir === undefined) {
    throw new Error('Usage: pnpm -s exec tsx scripts/qbo-full-history-exception-audit.ts <out-dir>');
  }

  return { outDir };
}

function getAttachmentFileNames(attachmentMap: Map<string, string[]>, transactionType: string, transactionId: string): string[] {
  const attachmentFileNames = attachmentMap.get(`${transactionType}:${transactionId}`);
  if (attachmentFileNames === undefined) {
    return [];
  }

  return attachmentFileNames;
}

async function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  const activeConnection = await getActiveQboConnection();
  const baseUrl = getApiBaseUrl();
  const sourceData = await fetchAuditSourceData(
    activeConnection.accessToken,
    activeConnection.connection.realmId,
    baseUrl,
  );
  const attachmentMap = mergeAttachmentRefs(sourceData.attachables.rows);
  const normalized = [
    ...sourceData.purchases.rows.map((purchase) =>
      normalizePurchaseForAudit(purchase, getAttachmentFileNames(attachmentMap, 'Purchase', purchase.Id)),
    ),
    ...sourceData.bills.rows.map((bill) =>
      normalizeBillForAudit(bill, getAttachmentFileNames(attachmentMap, 'Bill', bill.Id)),
    ),
    ...sourceData.journalEntries.rows.map((journalEntry) =>
      normalizeJournalEntryForAudit(
        journalEntry,
        getAttachmentFileNames(attachmentMap, 'JournalEntry', journalEntry.Id),
      ),
    ),
    ...sourceData.transfers.rows.map((transfer) =>
      normalizeTransferForAudit(transfer, getAttachmentFileNames(attachmentMap, 'Transfer', transfer.Id)),
    ),
  ];

  const findings = classifyAuditExceptions(normalized);
  const coverageRows: CoverageRow[] = [
    {
      transactionType: 'Purchase',
      scannedCount: sourceData.purchases.rows.length,
      complete: sourceData.purchases.complete,
    },
    {
      transactionType: 'Bill',
      scannedCount: sourceData.bills.rows.length,
      complete: sourceData.bills.complete,
    },
    {
      transactionType: 'JournalEntry',
      scannedCount: sourceData.journalEntries.rows.length,
      complete: sourceData.journalEntries.complete,
    },
    {
      transactionType: 'Transfer',
      scannedCount: sourceData.transfers.rows.length,
      complete: sourceData.transfers.complete,
    },
    {
      transactionType: 'Attachable',
      scannedCount: sourceData.attachables.rows.length,
      complete: sourceData.attachables.complete,
    },
  ];
  const coverage = summarizeCoverage(coverageRows);

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'qbo-full-history-exception-audit.csv'), buildAuditCsv(findings));
  await fs.writeFile(
    path.join(outDir, 'qbo-full-history-exception-audit.md'),
    buildAuditMarkdownSummary(findings, {
      Purchase: sourceData.purchases.rows.length,
      Bill: sourceData.bills.rows.length,
      JournalEntry: sourceData.journalEntries.rows.length,
      Transfer: sourceData.transfers.rows.length,
      Attachable: sourceData.attachables.rows.length,
    }) +
      `\n\n## Coverage\n- completeCoverage: ${coverage.completeCoverage}\n- failedTypes: ${
        coverage.failedTypes.length === 0 ? 'none' : coverage.failedTypes.join(', ')
      }\n`,
  );

  console.log(
    JSON.stringify(
      {
        outDir,
        findings: findings.length,
        coverage,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
