const LEGACY_SETTLEMENT_PAGE_PREFIX = '/settlements/journal-entry';
const LEGACY_SETTLEMENT_API_PREFIX = '/api/plutus/settlements/journal-entry';

function isLegacySettlementJournalEntryId(value: string): boolean {
  return /^\d+$/.test(value);
}

function requireSettlementJournalEntryId(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error('Settlement journal entry id is required');
  }
  return trimmed;
}

export function buildLegacySettlementPagePath(settlementJournalEntryId: string): string {
  const id = requireSettlementJournalEntryId(settlementJournalEntryId);
  return `${LEGACY_SETTLEMENT_PAGE_PREFIX}/${encodeURIComponent(id)}`;
}

export function buildLegacySettlementApiPath(settlementJournalEntryId: string): string {
  const id = requireSettlementJournalEntryId(settlementJournalEntryId);
  return `${LEGACY_SETTLEMENT_API_PREFIX}/${encodeURIComponent(id)}`;
}

export function buildLegacySettlementApiPreviewPath(settlementJournalEntryId: string): string {
  return `${buildLegacySettlementApiPath(settlementJournalEntryId)}/preview`;
}

export function buildLegacySettlementApiProcessPath(settlementJournalEntryId: string): string {
  return `${buildLegacySettlementApiPath(settlementJournalEntryId)}/process`;
}

export function remapLegacySettlementPath(pathname: string): string | null {
  const settlementMatch = pathname.match(/^\/settlements\/([^/]+)$/);
  if (settlementMatch) {
    const segment = settlementMatch[1];
    if (segment === undefined) {
      throw new Error(`Invalid legacy settlement pathname: ${pathname}`);
    }
    if (!isLegacySettlementJournalEntryId(segment)) {
      return null;
    }
    return buildLegacySettlementPagePath(decodeURIComponent(segment));
  }

  const apiMatch = pathname.match(/^\/api\/plutus\/settlements\/([^/]+)(?:\/(preview|process))?$/);
  if (!apiMatch) {
    return null;
  }

  const segment = apiMatch[1];
  if (segment === undefined) {
    throw new Error(`Invalid legacy settlement API pathname: ${pathname}`);
  }
  if (!isLegacySettlementJournalEntryId(segment)) {
    return null;
  }

  const settlementJournalEntryId = decodeURIComponent(segment);
  const action = apiMatch[2];
  if (action === 'preview') {
    return buildLegacySettlementApiPreviewPath(settlementJournalEntryId);
  }
  if (action === 'process') {
    return buildLegacySettlementApiProcessPath(settlementJournalEntryId);
  }
  return buildLegacySettlementApiPath(settlementJournalEntryId);
}
