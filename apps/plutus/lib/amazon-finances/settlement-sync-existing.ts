import { isSettlementDocNumber, normalizeSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';
import {
  fetchJournalEntries,
  type QboConnection,
  type QboJournalEntry,
} from '@/lib/qbo/api';

export type ExistingSettlementJournalEntryLookup = {
  journalEntryId: string | null;
  docNumber: string | null;
  updatedConnection?: QboConnection;
};

function isCanonicalSettlementDocNumber(docNumber: string): boolean {
  const trimmedUpper = docNumber.trim().toUpperCase();
  if (!isSettlementDocNumber(trimmedUpper)) return false;
  return trimmedUpper === normalizeSettlementDocNumber(trimmedUpper);
}

function pickPreferredSettlementEntry(a: QboJournalEntry, b: QboJournalEntry): QboJournalEntry {
  const aDocNumber = a.DocNumber ? a.DocNumber : '';
  const bDocNumber = b.DocNumber ? b.DocNumber : '';

  const aCanonical = isCanonicalSettlementDocNumber(aDocNumber);
  const bCanonical = isCanonicalSettlementDocNumber(bDocNumber);

  if (aCanonical && !bCanonical) return a;
  if (bCanonical && !aCanonical) return b;

  const aTxnDate = a.TxnDate ? a.TxnDate : '';
  const bTxnDate = b.TxnDate ? b.TxnDate : '';

  if (aTxnDate !== bTxnDate) {
    return aTxnDate > bTxnDate ? a : b;
  }

  return a.Id > b.Id ? a : b;
}

function buildLookupResult(
  input: {
    entry: QboJournalEntry | null;
    activeConnection: QboConnection;
    originalConnection: QboConnection;
  },
): ExistingSettlementJournalEntryLookup {
  const updatedConnection = input.activeConnection === input.originalConnection ? undefined : input.activeConnection;
  if (input.entry === null) {
    return { journalEntryId: null, docNumber: null, updatedConnection };
  }

  const docNumber = typeof input.entry.DocNumber === 'string' ? input.entry.DocNumber : null;
  return { journalEntryId: input.entry.Id, docNumber, updatedConnection };
}

function selectPreferredSettlementEntry(matches: QboJournalEntry[]): QboJournalEntry | null {
  if (matches.length === 0) return null;

  let selected = matches[0]!;
  for (const candidate of matches.slice(1)) {
    selected = pickPreferredSettlementEntry(selected, candidate);
  }
  return selected;
}

export async function findExistingSettlementJournalEntryByDocNumber(
  connection: QboConnection,
  docNumber: string,
): Promise<ExistingSettlementJournalEntryLookup> {
  let activeConnection = connection;
  const existing = await fetchJournalEntries(activeConnection, {
    docNumberContains: docNumber,
    maxResults: 10,
    startPosition: 1,
  });
  if (existing.updatedConnection) {
    activeConnection = existing.updatedConnection;
  }

  const normalizedTarget = normalizeSettlementDocNumber(docNumber);
  const matches = existing.journalEntries.filter((je) => {
    const candidateDocNumber = je.DocNumber;
    if (typeof candidateDocNumber !== 'string') return false;
    if (!isSettlementDocNumber(candidateDocNumber)) return false;
    return normalizeSettlementDocNumber(candidateDocNumber) === normalizedTarget;
  });

  return buildLookupResult({
    entry: selectPreferredSettlementEntry(matches),
    activeConnection,
    originalConnection: connection,
  });
}

export function settlementJournalEntryMatchesSource(
  input: {
    journalEntry: QboJournalEntry;
    settlementId: string;
    eventGroupId: string;
  },
): boolean {
  const docNumber = input.journalEntry.DocNumber;
  if (typeof docNumber !== 'string') return false;
  if (!isSettlementDocNumber(docNumber)) return false;

  const note = input.journalEntry.PrivateNote;
  if (typeof note !== 'string') return false;

  return note.includes(`Settlement: ${input.settlementId}`) && note.includes(`Group: ${input.eventGroupId}`);
}

export async function findExistingSettlementJournalEntryBySource(
  connection: QboConnection,
  input: {
    docNumberContains: string;
    settlementId: string;
    eventGroupId: string;
    startDate: string;
  },
): Promise<ExistingSettlementJournalEntryLookup> {
  let activeConnection = connection;
  const matches: QboJournalEntry[] = [];
  let startPosition = 1;

  while (true) {
    const existing = await fetchJournalEntries(activeConnection, {
      docNumberContains: input.docNumberContains,
      startDate: input.startDate,
      maxResults: 100,
      startPosition,
      includeTotalCount: false,
    });
    if (existing.updatedConnection) {
      activeConnection = existing.updatedConnection;
    }

    for (const journalEntry of existing.journalEntries) {
      if (!settlementJournalEntryMatchesSource({
        journalEntry,
        settlementId: input.settlementId,
        eventGroupId: input.eventGroupId,
      })) continue;

      matches.push(journalEntry);
    }

    if (existing.journalEntries.length < 100) break;
    startPosition += existing.journalEntries.length;
  }

  return buildLookupResult({
    entry: selectPreferredSettlementEntry(matches),
    activeConnection,
    originalConnection: connection,
  });
}
