import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';
import { fetchJournalEntries, fetchJournalEntryById, QboAuthError, type QboConnection } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';

export const runtime = 'nodejs';

const logger = createLogger({ name: 'plutus-settlement-mapping-import-uk' });

type ImportResult = {
  bankAccountId: string | null;
  paymentAccountId: string | null;
  memoMappings: Record<string, string>;
  taxCodeMappings: Record<string, string | null>;
};

async function importFromQbo(connection: QboConnection): Promise<{ result: ImportResult; updatedConnection?: QboConnection }> {
  let activeConnection = connection;

  const memoMappings = new Map<string, string>();
  const taxCodeMappings = new Map<string, string | null>();
  let bankAccountId: string | null = null;
  let paymentAccountId: string | null = null;

  const pageSize = 100;
  let startPosition = 1;

  while (true) {
    const page = await fetchJournalEntries(activeConnection, {
      docNumberContains: 'UK-',
      maxResults: pageSize,
      startPosition,
    });
    if (page.updatedConnection) {
      activeConnection = page.updatedConnection;
    }

    for (const je of page.journalEntries) {
      const docNumber = je.DocNumber ? je.DocNumber.trim() : '';
      const first = docNumber[0] ? docNumber[0].toUpperCase() : '';
      if (first === 'C' || first === 'P') {
        continue;
      }

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

        const taxCodeIdRaw = detail.TaxCodeRef?.value;
        const taxCodeId = typeof taxCodeIdRaw === 'string' && taxCodeIdRaw.trim() !== '' ? taxCodeIdRaw.trim() : null;

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

        if (taxCodeMappings.has(description)) {
          const existingTax = taxCodeMappings.get(description) ?? null;
          if (existingTax !== taxCodeId) {
            throw new Error(
              `Memo '${description}' maps to multiple tax codes: ${existingTax ?? 'null'}, ${taxCodeId ?? 'null'}`,
            );
          }
        } else {
          taxCodeMappings.set(description, taxCodeId);
        }
      }
    }

    if (page.journalEntries.length === 0) break;
    startPosition += page.journalEntries.length;
    if (startPosition > page.totalCount) break;
  }

  if (memoMappings.size === 0) {
    throw new Error("No settlements found in QBO history (DocNumber contains 'UK-')");
  }

  const memoEntries = Array.from(memoMappings.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const memoMappingsObject = Object.fromEntries(memoEntries);

  const taxEntries = Array.from(taxCodeMappings.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const taxMappingsObject = Object.fromEntries(taxEntries);

  return {
    result: {
      bankAccountId,
      paymentAccountId,
      memoMappings: memoMappingsObject,
      taxCodeMappings: taxMappingsObject,
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

    const existing = await db.settlementPostingConfig.findUnique({ where: { marketplace: 'amazon.co.uk' } });
    const nextBankAccountId = imported.result.bankAccountId ?? existing?.bankAccountId ?? null;
    const nextPaymentAccountId = imported.result.paymentAccountId ?? existing?.paymentAccountId ?? null;

    await db.settlementPostingConfig.upsert({
      where: { marketplace: 'amazon.co.uk' },
      update: {
        bankAccountId: nextBankAccountId,
        paymentAccountId: nextPaymentAccountId,
        accountIdByMemo: imported.result.memoMappings,
        taxCodeIdByMemo: imported.result.taxCodeMappings,
      },
      create: {
        marketplace: 'amazon.co.uk',
        bankAccountId: nextBankAccountId,
        paymentAccountId: nextPaymentAccountId,
        accountIdByMemo: imported.result.memoMappings,
        taxCodeIdByMemo: imported.result.taxCodeMappings,
      },
    });

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'CONFIG_UPDATED',
      entityType: 'SettlementPostingConfig',
      details: {
        ukSettlementMemoMappings: Object.keys(imported.result.memoMappings).length,
        ukSettlementTaxMemoMappings: Object.keys(imported.result.taxCodeMappings).length,
        ukSettlementBankAccountId: nextBankAccountId,
        ukSettlementPaymentAccountId: nextPaymentAccountId,
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

    logger.error('Failed to import UK settlement memo mapping from QBO', { error });
    return NextResponse.json(
      {
        error: 'Failed to import UK settlement memo mapping from QBO',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
