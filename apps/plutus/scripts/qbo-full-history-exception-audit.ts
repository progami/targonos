import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { QboJournalEntry, QboPurchase } from '@/lib/qbo/api';
import {
  type CoverageRow,
  type RawAttachable,
  getActiveQboConnection,
  mergeAttachmentRefs,
  qboQueryAll,
  summarizeCoverage,
} from '@/lib/qbo/full-history-audit/fetch';
import { normalizeJournalEntryForAudit, normalizePurchaseForAudit } from '@/lib/qbo/full-history-audit/normalize';
import { buildAuditCsv, buildAuditMarkdownSummary } from '@/lib/qbo/full-history-audit/report';
import { classifyAuditExceptions } from '@/lib/qbo/full-history-audit/rules';

function parseArgs(argv: string[]) {
  const outDir = argv[0];
  if (outDir === undefined) {
    throw new Error('Usage: pnpm -s exec tsx scripts/qbo-full-history-exception-audit.ts <out-dir>');
  }

  return { outDir };
}

async function main() {
  const { outDir } = parseArgs(process.argv.slice(2));
  const activeConnection = await getActiveQboConnection();

  const purchasesResult = await qboQueryAll(activeConnection, 'SELECT * FROM Purchase ORDERBY TxnDate');
  const journalEntriesResult = await qboQueryAll(activeConnection, 'SELECT * FROM JournalEntry ORDERBY TxnDate');
  const attachablesResult = await qboQueryAll(activeConnection, 'SELECT * FROM Attachable');

  const purchases = purchasesResult.rows as unknown as QboPurchase[];
  const journalEntries = journalEntriesResult.rows as unknown as QboJournalEntry[];
  const attachables = attachablesResult.rows as unknown as RawAttachable[];

  const attachmentMap = mergeAttachmentRefs(attachables);
  const normalized = [
    ...purchases.map((purchase) => {
      const attachmentRefs = attachmentMap.get(`Purchase:${purchase.Id}`);
      const attachmentFileNames = attachmentRefs === undefined ? [] : attachmentRefs;
      return normalizePurchaseForAudit(purchase, attachmentFileNames);
    }),
    ...journalEntries.map((journalEntry) => {
      const attachmentRefs = attachmentMap.get(`JournalEntry:${journalEntry.Id}`);
      const attachmentFileNames = attachmentRefs === undefined ? [] : attachmentRefs;
      return normalizeJournalEntryForAudit(journalEntry, attachmentFileNames);
    }),
  ];

  const findings = classifyAuditExceptions(normalized);
  const coverageRows: CoverageRow[] = [
    {
      transactionType: 'Purchase',
      scannedCount: purchases.length,
      complete: purchasesResult.complete,
    },
    {
      transactionType: 'JournalEntry',
      scannedCount: journalEntries.length,
      complete: journalEntriesResult.complete,
    },
  ];
  const coverage = summarizeCoverage(coverageRows);

  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, 'qbo-full-history-exception-audit.csv'), buildAuditCsv(findings));
  await fs.writeFile(
    path.join(outDir, 'qbo-full-history-exception-audit.md'),
    buildAuditMarkdownSummary(findings, {
      Purchase: purchases.length,
      JournalEntry: journalEntries.length,
      Attachable: attachables.length,
    }) +
      `\n\n## Coverage\n- completeCoverage: ${coverage.completeCoverage}\n- failedTypes: ${
        coverage.failedTypes.length === 0 ? 'none' : coverage.failedTypes.join(', ')
      }\n- attachablesComplete: ${attachablesResult.complete}\n`,
  );

  console.log(
    JSON.stringify(
      {
        outDir,
        findings: findings.length,
        coverage: {
          ...coverage,
          attachablesComplete: attachablesResult.complete,
          attachablesScannedCount: attachables.length,
        },
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
