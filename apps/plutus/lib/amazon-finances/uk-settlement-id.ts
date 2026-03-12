export function buildSyntheticUkSettlementId(eventGroupId: string): string {
  const trimmed = eventGroupId.trim();
  if (trimmed === '') {
    throw new Error('Missing UK eventGroupId');
  }

  return `EG-${trimmed}`;
}

export function extractEventGroupIdFromSyntheticUkSettlementId(settlementId: string): string | null {
  const trimmed = settlementId.trim();
  if (!trimmed.startsWith('EG-')) {
    return null;
  }

  const eventGroupId = trimmed.slice(3).trim();
  if (eventGroupId === '') {
    throw new Error('Missing UK eventGroupId in synthetic settlement id');
  }

  return eventGroupId;
}
