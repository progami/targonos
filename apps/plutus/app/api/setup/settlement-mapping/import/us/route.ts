import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';
import { fetchJournalEntries, fetchJournalEntryById, QboAuthError, type QboConnection } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlement-mapping-import-us' });

type ImportResult = {
  bankAccountId: string | null;
  paymentAccountId: string | null;
  memoMappings: Record<string, string>;
};

async function importFromQbo(connection: QboConnection): Promise<{ result: ImportResult; updatedConnection?: QboConnection }> {
  let activeConnection = connection;

  const memoMappings = new Map<string, string>();
  let bankAccountId: string | null = null;
  let paymentAccountId: string | null = null;

  const pageSize = 100;
  let startPosition = 1;

  while (true) {
    const page = await fetchJournalEntries(activeConnection, {
      docNumberContains: 'LMB-US-',
      maxResults: pageSize,
      startPosition,
    });
    if (page.updatedConnection) {
      activeConnection = page.updatedConnection;
    }

    for (const je of page.journalEntries) {
      const full = await fetchJournalEntryById(activeConnection, je.Id);
      if (full.updatedConnection) {
        activeConnection = full.updatedConnection;
      }

      const lines = Array.isArray(full.journalEntry.Line) ? full.journalEntry.Line : [];
      for (const line of lines) {
        const detail = line.JournalEntryLineDetail;
        if (!detail) continue;

        const accountId = detail.AccountRef?.value;
        if (typeof accountId !== 'string' || accountId.trim() === '') continue;

        const description = typeof line.Description === 'string' ? line.Description.trim() : '';
        if (description === '') continue;

        if (description === 'Transfer to Bank') {
          if (bankAccountId !== null && bankAccountId !== accountId) {
            throw new Error(`Multiple bank accounts detected for 'Transfer to Bank': ${bankAccountId}, ${accountId}`);
          }
          bankAccountId = accountId;
          continue;
        }

        if (description === 'Payment to Amazon') {
          if (paymentAccountId !== null && paymentAccountId !== accountId) {
            throw new Error(`Multiple payment accounts detected for 'Payment to Amazon': ${paymentAccountId}, ${accountId}`);
          }
          paymentAccountId = accountId;
          continue;
        }

        const existing = memoMappings.get(description);
        if (existing !== undefined && existing !== accountId) {
          throw new Error(`Memo '${description}' maps to multiple accounts: ${existing}, ${accountId}`);
        }

        memoMappings.set(description, accountId);
      }
    }

    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
    if (startPosition > page.totalCount) break;
  }

  if (memoMappings.size === 0) {
    throw new Error("No settlements found in QBO history (DocNumber contains 'LMB-US-')");
  }

  const memoEntries = Array.from(memoMappings.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const memoMappingsObject = Object.fromEntries(memoEntries);

  return {
    result: {
      bankAccountId,
      paymentAccountId,
      memoMappings: memoMappingsObject,
    },
    updatedConnection: activeConnection === connection ? undefined : activeConnection,
  };
}

export async function POST() {
  try {
    const connection = await getQboConnection();
    if (!connection) {
      return NextResponse.json({ error: 'Not connected to QBO' }, { status: 401 });
    }

    const imported = await importFromQbo(connection);
    if (imported.updatedConnection) {
      await saveServerQboConnection(imported.updatedConnection);
    }

    const existing = await db.setupConfig.findFirst();
    const nextBankAccountId = imported.result.bankAccountId ?? existing?.usSettlementBankAccountId ?? null;
    const nextPaymentAccountId = imported.result.paymentAccountId ?? existing?.usSettlementPaymentAccountId ?? null;

    if (existing) {
      await db.setupConfig.update({
        where: { id: existing.id },
        data: {
          usSettlementBankAccountId: nextBankAccountId,
          usSettlementPaymentAccountId: nextPaymentAccountId,
          usSettlementAccountIdByMemo: imported.result.memoMappings,
        },
      });
    } else {
      await db.setupConfig.create({
        data: {
          usSettlementBankAccountId: nextBankAccountId,
          usSettlementPaymentAccountId: nextPaymentAccountId,
          usSettlementAccountIdByMemo: imported.result.memoMappings,
        },
      });
    }

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'CONFIG_UPDATED',
      entityType: 'SetupConfig',
      details: {
        usSettlementMemoMappings: Object.keys(imported.result.memoMappings).length,
        usSettlementBankAccountId: nextBankAccountId,
        usSettlementPaymentAccountId: nextPaymentAccountId,
      },
    });

    return NextResponse.json({
      success: true,
      ...imported.result,
    });
  } catch (error) {
    if (error instanceof QboAuthError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    logger.error('Failed to import US settlement memo mapping from QBO', { error });
    return NextResponse.json(
      {
        error: 'Failed to import US settlement memo mapping from QBO',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

