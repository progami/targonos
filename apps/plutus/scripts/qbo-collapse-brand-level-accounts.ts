import { getApiBaseUrl } from '@/lib/qbo/client';
import { getActiveQboConnection, fetchAuditSourceData } from '@/lib/qbo/full-history-audit/fetch';
import {
  fetchAccounts,
  fetchBillById,
  fetchJournalEntryById,
  fetchPurchaseById,
  updateAccountActive,
  updateBillWithPayload,
  updateJournalEntryWithPayload,
  updatePurchaseWithPayload,
  type QboAccount,
  type QboBill,
  type QboJournalEntry,
  type QboPurchase,
} from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { HUMAN_APPROVAL_PHRASE } from '@/lib/plutus/human-approval';
import { loadSharedPlutusEnv } from './shared-env';

type CliOptions = {
  apply: boolean;
  humanApproval: string | null;
};

type AccountMove = {
  fromAccountId: string;
  fromAccountName: string;
  fromAccountFqn: string;
  toAccountId: string;
  toAccountName: string;
  toAccountFqn: string;
};

type LineChange = {
  transactionType: 'Bill' | 'JournalEntry' | 'Purchase';
  transactionId: string;
  docNumber: string | null;
  txnDate: string | null;
  lineId: string;
  amount: number;
  description: string | null;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
};

type UnsupportedReference = {
  transactionType: string;
  transactionId: string;
  accountId: string;
  accountName: string;
};

type RawSourceData = Awaited<ReturnType<typeof fetchAuditSourceData>>;

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let humanApproval: string | null = null;

  for (let i = 0; i < argv.length; ) {
    const arg = argv[i]!;
    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }
    if (arg === '--human-approval') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --human-approval');
      humanApproval = next;
      i += 2;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (apply && humanApproval !== HUMAN_APPROVAL_PHRASE) {
    throw new Error(`Brand-level QBO account collapse requires --human-approval "${HUMAN_APPROVAL_PHRASE}"`);
  }

  return { apply, humanApproval };
}

function accountDisplayName(account: QboAccount): string {
  return account.FullyQualifiedName ?? account.Name;
}

function isBrandLevelLeafAccount(account: QboAccount): boolean {
  if (account.Active === false) return false;
  return / - (US|UK)-(PDS|CDS)$/.test(account.Name.trim());
}

function buildAccountMoves(accounts: QboAccount[]): AccountMove[] {
  const accountById = new Map(accounts.map((account) => [account.Id, account]));
  const moves: AccountMove[] = [];

  for (const account of accounts) {
    if (!isBrandLevelLeafAccount(account)) continue;
    const parentId = account.ParentRef?.value;
    if (parentId === undefined || parentId.trim() === '') {
      throw new Error(`Brand-level account has no parent: ${accountDisplayName(account)} (${account.Id})`);
    }
    const parent = accountById.get(parentId);
    if (parent === undefined) {
      throw new Error(`Missing parent account ${parentId} for ${accountDisplayName(account)} (${account.Id})`);
    }
    if (parent.Active === false) {
      throw new Error(`Parent account is inactive for ${accountDisplayName(account)} (${account.Id})`);
    }

    moves.push({
      fromAccountId: account.Id,
      fromAccountName: account.Name,
      fromAccountFqn: accountDisplayName(account),
      toAccountId: parent.Id,
      toAccountName: parent.Name,
      toAccountFqn: accountDisplayName(parent),
    });
  }

  return moves.sort((left, right) => left.fromAccountFqn.localeCompare(right.fromAccountFqn));
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function nullableNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function findLineChanges(input: {
  sourceData: RawSourceData;
  movesByAccountId: Map<string, AccountMove>;
}): { lineChanges: LineChange[]; unsupportedReferences: UnsupportedReference[] } {
  const lineChanges: LineChange[] = [];
  const unsupportedReferences: UnsupportedReference[] = [];

  for (const bill of input.sourceData.bills.rows) {
    for (const line of bill.Line ?? []) {
      const accountId = line.AccountBasedExpenseLineDetail?.AccountRef?.value ?? line.ItemBasedExpenseLineDetail?.AccountRef?.value;
      if (typeof accountId !== 'string') continue;
      const move = input.movesByAccountId.get(accountId);
      if (move === undefined) continue;
      lineChanges.push({
        transactionType: 'Bill',
        transactionId: String(bill.Id),
        docNumber: nullableString(bill.DocNumber),
        txnDate: nullableString(bill.TxnDate),
        lineId: String(line.Id),
        amount: nullableNumber(line.Amount),
        description: nullableString(line.Description),
        fromAccountId: move.fromAccountId,
        fromAccountName: move.fromAccountFqn,
        toAccountId: move.toAccountId,
        toAccountName: move.toAccountFqn,
      });
    }
  }

  for (const journalEntry of input.sourceData.journalEntries.rows) {
    for (const line of journalEntry.Line ?? []) {
      const accountId = line.JournalEntryLineDetail?.AccountRef?.value;
      if (typeof accountId !== 'string') continue;
      const move = input.movesByAccountId.get(accountId);
      if (move === undefined) continue;
      lineChanges.push({
        transactionType: 'JournalEntry',
        transactionId: String(journalEntry.Id),
        docNumber: nullableString(journalEntry.DocNumber),
        txnDate: nullableString(journalEntry.TxnDate),
        lineId: String(line.Id),
        amount: nullableNumber(line.Amount),
        description: nullableString(line.Description),
        fromAccountId: move.fromAccountId,
        fromAccountName: move.fromAccountFqn,
        toAccountId: move.toAccountId,
        toAccountName: move.toAccountFqn,
      });
    }
  }

  for (const purchase of input.sourceData.purchases.rows) {
    const purchaseAccountId = purchase.AccountRef?.value;
    if (typeof purchaseAccountId === 'string') {
      const move = input.movesByAccountId.get(purchaseAccountId);
      if (move !== undefined) {
        unsupportedReferences.push({
          transactionType: 'PurchaseAccount',
          transactionId: String(purchase.Id),
          accountId: move.fromAccountId,
          accountName: move.fromAccountFqn,
        });
      }
    }

    for (const line of purchase.Line ?? []) {
      const accountId = line.AccountBasedExpenseLineDetail?.AccountRef?.value ?? line.ItemBasedExpenseLineDetail?.AccountRef?.value;
      if (typeof accountId !== 'string') continue;
      const move = input.movesByAccountId.get(accountId);
      if (move === undefined) continue;
      lineChanges.push({
        transactionType: 'Purchase',
        transactionId: String(purchase.Id),
        docNumber: nullableString(purchase.DocNumber),
        txnDate: nullableString(purchase.TxnDate),
        lineId: String(line.Id),
        amount: nullableNumber(line.Amount),
        description: nullableString(line.Description),
        fromAccountId: move.fromAccountId,
        fromAccountName: move.fromAccountFqn,
        toAccountId: move.toAccountId,
        toAccountName: move.toAccountFqn,
      });
    }
  }

  for (const transfer of input.sourceData.transfers.rows) {
    const fromAccountId = transfer.FromAccountRef?.value;
    if (typeof fromAccountId === 'string') {
      const move = input.movesByAccountId.get(fromAccountId);
      if (move !== undefined) {
        unsupportedReferences.push({
          transactionType: 'TransferFrom',
          transactionId: String(transfer.Id),
          accountId: move.fromAccountId,
          accountName: move.fromAccountFqn,
        });
      }
    }

    const toAccountId = transfer.ToAccountRef?.value;
    if (typeof toAccountId === 'string') {
      const move = input.movesByAccountId.get(toAccountId);
      if (move !== undefined) {
        unsupportedReferences.push({
          transactionType: 'TransferTo',
          transactionId: String(transfer.Id),
          accountId: move.fromAccountId,
          accountName: move.fromAccountFqn,
        });
      }
    }
  }

  return { lineChanges, unsupportedReferences };
}

function groupLineChangesByTransaction(changes: LineChange[]): Map<string, LineChange[]> {
  const grouped = new Map<string, LineChange[]>();
  for (const change of changes) {
    const key = `${change.transactionType}:${change.transactionId}`;
    const existing = grouped.get(key);
    if (existing === undefined) {
      grouped.set(key, [change]);
      continue;
    }
    existing.push(change);
  }
  return grouped;
}

function updateBillPayload(input: { bill: QboBill; changes: LineChange[] }): QboBill {
  const changesByLineId = new Map(input.changes.map((change) => [change.lineId, change]));
  return {
    ...input.bill,
    Line: (input.bill.Line ?? []).map((line) => {
      const change = changesByLineId.get(line.Id);
      if (change === undefined) return line;

      if (line.AccountBasedExpenseLineDetail !== undefined) {
        return {
          ...line,
          AccountBasedExpenseLineDetail: {
            ...line.AccountBasedExpenseLineDetail,
            AccountRef: {
              value: change.toAccountId,
              name: change.toAccountName,
            },
          },
        };
      }

      if (line.ItemBasedExpenseLineDetail !== undefined) {
        return {
          ...line,
          ItemBasedExpenseLineDetail: {
            ...line.ItemBasedExpenseLineDetail,
            AccountRef: {
              value: change.toAccountId,
              name: change.toAccountName,
            },
          },
        };
      }

      throw new Error(`Bill ${input.bill.Id} line ${line.Id} has no updatable account detail`);
    }),
  };
}

function updateJournalEntryPayload(input: { journalEntry: QboJournalEntry; changes: LineChange[] }): QboJournalEntry {
  const changesByLineId = new Map(input.changes.map((change) => [change.lineId, change]));
  return {
    ...input.journalEntry,
    Line: input.journalEntry.Line.map((line) => {
      const lineId = line.Id;
      if (lineId === undefined) return line;
      const change = changesByLineId.get(lineId);
      if (change === undefined) return line;
      return {
        ...line,
        JournalEntryLineDetail: {
          ...line.JournalEntryLineDetail,
          AccountRef: {
            value: change.toAccountId,
            name: change.toAccountName,
          },
        },
      };
    }),
  };
}

function updatePurchasePayload(input: { purchase: QboPurchase; changes: LineChange[] }): QboPurchase {
  const changesByLineId = new Map(input.changes.map((change) => [change.lineId, change]));
  return {
    ...input.purchase,
    Line: (input.purchase.Line ?? []).map((line) => {
      const change = changesByLineId.get(line.Id);
      if (change === undefined) return line;

      if (line.AccountBasedExpenseLineDetail !== undefined) {
        return {
          ...line,
          AccountBasedExpenseLineDetail: {
            ...line.AccountBasedExpenseLineDetail,
            AccountRef: {
              value: change.toAccountId,
              name: change.toAccountName,
            },
          },
        };
      }

      if (line.ItemBasedExpenseLineDetail !== undefined) {
        return {
          ...line,
          ItemBasedExpenseLineDetail: {
            ...line.ItemBasedExpenseLineDetail,
            AccountRef: {
              value: change.toAccountId,
              name: change.toAccountName,
            },
          },
        };
      }

      throw new Error(`Purchase ${input.purchase.Id} line ${line.Id} has no updatable account detail`);
    }),
  };
}

function summarizeChangesByAccount(changes: LineChange[]): Array<{
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  lineCount: number;
  amount: number;
}> {
  const summaryByAccount = new Map<string, ReturnType<typeof summarizeChangesByAccount>[number]>();
  for (const change of changes) {
    const key = change.fromAccountId;
    const summary =
      summaryByAccount.get(key) ??
      {
        fromAccountId: change.fromAccountId,
        fromAccountName: change.fromAccountName,
        toAccountId: change.toAccountId,
        toAccountName: change.toAccountName,
        lineCount: 0,
        amount: 0,
      };
    summary.lineCount += 1;
    summary.amount = Math.round((summary.amount + change.amount) * 100) / 100;
    summaryByAccount.set(key, summary);
  }
  return Array.from(summaryByAccount.values()).sort((left, right) =>
    left.fromAccountName.localeCompare(right.fromAccountName),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  loadSharedPlutusEnv();

  const activeConnection = await getActiveQboConnection();
  let qboConnection = activeConnection.connection;
  const accountsResult = await fetchAccounts(qboConnection, { includeInactive: true });
  if (accountsResult.updatedConnection !== undefined) {
    qboConnection = accountsResult.updatedConnection;
    await saveServerQboConnection(qboConnection);
  }

  const accountMoves = buildAccountMoves(accountsResult.accounts);
  const movesByAccountId = new Map(accountMoves.map((move) => [move.fromAccountId, move]));
  const sourceData = await fetchAuditSourceData(activeConnection.accessToken, qboConnection.realmId, getApiBaseUrl());
  const { lineChanges, unsupportedReferences } = findLineChanges({ sourceData, movesByAccountId });
  const groupedChanges = groupLineChangesByTransaction(lineChanges);

  const dryRunPayload = {
    mode: options.apply ? 'apply' : 'dry-run',
    activeBrandLevelAccounts: accountMoves.length,
    transactionLineChanges: lineChanges.length,
    transactionsToUpdate: groupedChanges.size,
    changesByAccount: summarizeChangesByAccount(lineChanges),
    accountsToDeactivate: accountMoves.map((move) => ({
      accountId: move.fromAccountId,
      accountName: move.fromAccountFqn,
      targetAccountId: move.toAccountId,
      targetAccountName: move.toAccountFqn,
    })),
    unsupportedReferences,
  };

  console.log(JSON.stringify(dryRunPayload, null, 2));

  if (unsupportedReferences.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (!options.apply) {
    return;
  }

  for (const [key, changes] of groupedChanges.entries()) {
    const [transactionType, transactionId] = key.split(':') as ['Bill' | 'JournalEntry' | 'Purchase', string];
    if (transactionType === 'Bill') {
      const fetched = await fetchBillById(qboConnection, transactionId);
      if (fetched.updatedConnection !== undefined) qboConnection = fetched.updatedConnection;
      const updatedPayload = updateBillPayload({ bill: fetched.bill, changes });
      const updated = await updateBillWithPayload(qboConnection, updatedPayload as unknown as Record<string, unknown>);
      if (updated.updatedConnection !== undefined) qboConnection = updated.updatedConnection;
      continue;
    }

    if (transactionType === 'JournalEntry') {
      const fetched = await fetchJournalEntryById(qboConnection, transactionId);
      if (fetched.updatedConnection !== undefined) qboConnection = fetched.updatedConnection;
      const updatedPayload = updateJournalEntryPayload({ journalEntry: fetched.journalEntry, changes });
      const updated = await updateJournalEntryWithPayload(qboConnection, updatedPayload);
      if (updated.updatedConnection !== undefined) qboConnection = updated.updatedConnection;
      continue;
    }

    if (transactionType === 'Purchase') {
      const fetched = await fetchPurchaseById(qboConnection, transactionId);
      if (fetched.updatedConnection !== undefined) qboConnection = fetched.updatedConnection;
      const updatedPayload = updatePurchasePayload({ purchase: fetched.purchase, changes });
      const updated = await updatePurchaseWithPayload(qboConnection, updatedPayload as unknown as Record<string, unknown>);
      if (updated.updatedConnection !== undefined) qboConnection = updated.updatedConnection;
      continue;
    }

    throw new Error(`Unsupported transaction type: ${transactionType}`);
  }

  const refreshedActiveConnection = await getQboConnection();
  if (refreshedActiveConnection === null) throw new Error('QBO connection disappeared after transaction updates');
  qboConnection = refreshedActiveConnection;
  const refreshedAccounts = await fetchAccounts(qboConnection, { includeInactive: true });
  if (refreshedAccounts.updatedConnection !== undefined) qboConnection = refreshedAccounts.updatedConnection;
  const refreshedById = new Map(refreshedAccounts.accounts.map((account) => [account.Id, account]));

  for (const move of accountMoves) {
    const account = refreshedById.get(move.fromAccountId);
    if (account === undefined) throw new Error(`Cannot deactivate missing account ${move.fromAccountId}`);
    if (account.Active === false) continue;
    const updated = await updateAccountActive(qboConnection, account.Id, account.SyncToken, account.Name, false);
    if (updated.updatedConnection !== undefined) qboConnection = updated.updatedConnection;
  }

  await saveServerQboConnection(qboConnection);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
