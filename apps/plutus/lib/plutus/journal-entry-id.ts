const NOOP_JOURNAL_ENTRY_PREFIX = 'NOOP-';

export function buildNoopJournalEntryId(kind: 'COGS' | 'PNL', invoiceId: string): string {
  return `${NOOP_JOURNAL_ENTRY_PREFIX}${kind}-${invoiceId}`;
}

export function isNoopJournalEntryId(journalEntryId: string): boolean {
  return journalEntryId.startsWith(NOOP_JOURNAL_ENTRY_PREFIX);
}

export function isQboJournalEntryId(journalEntryId: string): boolean {
  return /^\d+$/.test(journalEntryId);
}
