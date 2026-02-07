import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';
import { QboAuthError, fetchJournalEntries } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { processSettlement } from '@/lib/plutus/settlement-processing';
import { fromCents } from '@/lib/inventory/money';
import { db } from '@/lib/db';
import type { LmbAuditRow } from '@/lib/lmb/audit-csv';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-autopost-check' });

type AutopostResult = {
  processed: Array<{ settlementId: string; docNumber: string; invoiceId: string }>;
  skipped: Array<{ settlementId: string; docNumber: string; reason: string }>;
  errors: Array<{ settlementId: string; docNumber: string; error: string }>;
};

export async function POST() {
  try {
    const config = await db.setupConfig.findFirst();
    if (!config || !config.autopostEnabled) {
      return NextResponse.json({ error: 'Autopost is not enabled' }, { status: 400 });
    }

    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    // Fetch all LMB journal entries from QBO (paginate through all pages)
    let allJournalEntries: Array<{ Id: string; DocNumber?: string; TxnDate: string }> = [];
    let activeConnection = connection;
    let startPosition = 1;
    const pageSize = 100;

    while (true) {
      const result = await fetchJournalEntries(activeConnection, {
        docNumberContains: 'LMB-',
        maxResults: pageSize,
        startPosition,
        startDate: config.autopostStartDate
          ? config.autopostStartDate.toISOString().split('T')[0]
          : undefined,
      });

      if (result.updatedConnection) {
        activeConnection = result.updatedConnection;
      }

      allJournalEntries = allJournalEntries.concat(result.journalEntries);

      if (allJournalEntries.length >= result.totalCount) break;
      if (result.journalEntries.length === 0) break;

      startPosition += result.journalEntries.length;
    }

    // Find which settlements are already processed
    const allJeIds = allJournalEntries.map((je) => je.Id);
    const processed = await db.settlementProcessing.findMany({
      where: { qboSettlementJournalEntryId: { in: allJeIds } },
      select: { qboSettlementJournalEntryId: true },
    });
    const processedSet = new Set(processed.map((p) => p.qboSettlementJournalEntryId));

    // Filter to unprocessed settlements only
    const unprocessed = allJournalEntries.filter((je) => !processedSet.has(je.Id));

    // Get all distinct invoice IDs from stored audit data
    const storedInvoices = await db.auditDataRow.findMany({
      select: { invoiceId: true },
      distinct: ['invoiceId'],
    });
    const storedInvoiceSet = new Set(storedInvoices.map((r) => r.invoiceId));

    const result: AutopostResult = { processed: [], skipped: [], errors: [] };

    for (const je of unprocessed) {
      const docNumber = je.DocNumber ?? je.Id;

      // Check if settlement date >= autopostStartDate
      if (config.autopostStartDate) {
        const settlementDate = new Date(`${je.TxnDate}T00:00:00Z`);
        if (settlementDate < config.autopostStartDate) {
          result.skipped.push({ settlementId: je.Id, docNumber, reason: 'Before autopost start date' });
          continue;
        }
      }

      // Check if any stored audit data matches this settlement's invoice IDs
      // The invoice ID matching is done by looking at the doc number pattern
      // We need to find audit data rows whose invoiceId could match this settlement
      // The processSettlement function handles the invoice matching internally,
      // but we need to identify a candidate invoiceId first.

      // Look for audit data rows that have an invoiceId present in our stored data
      // We check all stored invoices to see if any haven't been processed yet for this marketplace
      let matchedInvoiceId: string | null = null;

      for (const invoiceId of storedInvoiceSet) {
        // Check if this invoiceId has already been processed
        const existingProcessing = await db.settlementProcessing.findFirst({
          where: { invoiceId },
        });
        if (existingProcessing) continue;

        // We found an unprocessed invoice in stored audit data
        // Try to use it with this settlement
        matchedInvoiceId = invoiceId;
        break;
      }

      if (!matchedInvoiceId) {
        result.skipped.push({ settlementId: je.Id, docNumber, reason: 'No matching audit data found' });
        continue;
      }

      // Load audit rows from DB
      const dbRows = await db.auditDataRow.findMany({
        where: { invoiceId: matchedInvoiceId },
        include: { upload: { select: { filename: true } } },
      });

      if (dbRows.length === 0) {
        result.skipped.push({ settlementId: je.Id, docNumber, reason: 'No audit data rows found' });
        continue;
      }

      const auditRows: LmbAuditRow[] = dbRows.map((r) => ({
        invoice: r.invoiceId,
        market: r.market,
        date: r.date,
        orderId: r.orderId,
        sku: r.sku,
        quantity: r.quantity,
        description: r.description,
        net: fromCents(r.net),
      }));

      const sourceFilename = dbRows[0]!.upload.filename;

      try {
        const processResult = await processSettlement({
          connection: activeConnection,
          settlementJournalEntryId: je.Id,
          auditRows,
          sourceFilename,
          invoiceId: matchedInvoiceId,
        });

        if (processResult.updatedConnection) {
          activeConnection = processResult.updatedConnection;
        }

        if (processResult.result.ok) {
          result.processed.push({ settlementId: je.Id, docNumber, invoiceId: matchedInvoiceId });
          // Remove from storedInvoiceSet so we don't try to match it again
          storedInvoiceSet.delete(matchedInvoiceId);
        } else {
          const blockMessages = processResult.result.preview.blocks.map((b) => b.message).join('; ');
          result.skipped.push({ settlementId: je.Id, docNumber, reason: blockMessages });
        }
      } catch (error) {
        result.errors.push({
          settlementId: je.Id,
          docNumber,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (activeConnection !== connection) {
      await saveServerQboConnection(activeConnection);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Autopost check failed', { error });
    return NextResponse.json(
      { error: 'Autopost check failed', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
