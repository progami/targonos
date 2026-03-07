import type { SettlementMarketplace } from '@/lib/plutus/settlement-doc-number';

export type PlutusSettlementStatus = 'Pending' | 'Processed' | 'RolledBack';

export type SettlementChildSummary = {
  qboJournalEntryId: string;
  docNumber: string;
  postedDate: string;
  memo: string;
  marketplace: SettlementMarketplace;
  periodStart: string | null;
  periodEnd: string | null;
  settlementTotal: number | null;
  plutusStatus: PlutusSettlementStatus;
};

export type SettlementParentSummary<TChild extends SettlementChildSummary = SettlementChildSummary> = {
  parentId: string;
  sourceSettlementId: string;
  marketplace: SettlementMarketplace;
  periodStart: string | null;
  periodEnd: string | null;
  postedDate: string;
  settlementTotal: number | null;
  plutusStatus: PlutusSettlementStatus;
  splitCount: number;
  isSplit: boolean;
  childCount: number;
  hasInconsistency: boolean;
  eventGroupIds: string[];
  children: TChild[];
};

function extractPrivateNoteField(privateNote: string, label: string): string | null {
  const match = privateNote.match(new RegExp(`(?:^|\\|)\\s*${label}:\\s*([^|]+?)\\s*(?=\\||$)`, 'i'));
  if (!match) return null;
  const value = match[1]!.trim();
  if (value === '') return null;
  return value;
}

export function extractSourceSettlementIdFromPrivateNote(privateNote: string): string | null {
  return extractPrivateNoteField(privateNote, 'Settlement');
}

export function extractEventGroupIdFromPrivateNote(privateNote: string): string | null {
  return extractPrivateNoteField(privateNote, 'Group');
}

export function requireSourceSettlementIdFromPrivateNote(privateNote: string, context: string): string {
  const settlementId = extractSourceSettlementIdFromPrivateNote(privateNote);
  if (!settlementId) {
    throw new Error(`Missing source settlement id in ${context}`);
  }
  return settlementId;
}

export function buildSettlementParentId(region: 'US' | 'UK', sourceSettlementId: string): string {
  const trimmed = sourceSettlementId.trim();
  if (trimmed === '') {
    throw new Error('Missing source settlement id');
  }
  return `${region}:${trimmed}`;
}

function compareNullableIsoDay(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function summarizeParentStatus(children: readonly SettlementChildSummary[]): {
  plutusStatus: PlutusSettlementStatus;
  hasInconsistency: boolean;
} {
  const statuses = new Set(children.map((child) => child.plutusStatus));
  if (statuses.size === 1) {
    const [only] = Array.from(statuses);
    return { plutusStatus: only!, hasInconsistency: false };
  }

  return { plutusStatus: 'Pending', hasInconsistency: true };
}

function pickParentPeriod(children: readonly SettlementChildSummary[]): {
  periodStart: string | null;
  periodEnd: string | null;
} {
  const starts = children
    .map((child) => child.periodStart)
    .filter((value): value is string => value !== null)
    .sort((a, b) => a.localeCompare(b));
  const ends = children
    .map((child) => child.periodEnd)
    .filter((value): value is string => value !== null)
    .sort((a, b) => a.localeCompare(b));

  return {
    periodStart: starts[0] ?? null,
    periodEnd: ends.at(-1) ?? null,
  };
}

function pickParentPostedDate(children: readonly SettlementChildSummary[]): string {
  const postedDates = children.map((child) => child.postedDate).sort((a, b) => b.localeCompare(a));
  const postedDate = postedDates[0];
  if (!postedDate) {
    throw new Error('Cannot summarize parent settlement without postedDate');
  }
  return postedDate;
}

function sumSettlementTotals(children: readonly SettlementChildSummary[]): number | null {
  if (children.some((child) => child.settlementTotal === null)) {
    return null;
  }

  return children.reduce((sum, child) => sum + (child.settlementTotal ?? 0), 0);
}

function sortChildren<TChild extends SettlementChildSummary>(children: readonly TChild[]): TChild[] {
  return [...children].sort((a, b) => {
    const startCmp = compareNullableIsoDay(a.periodStart, b.periodStart);
    if (startCmp !== 0) return startCmp;

    const endCmp = compareNullableIsoDay(a.periodEnd, b.periodEnd);
    if (endCmp !== 0) return endCmp;

    const postedCmp = a.postedDate.localeCompare(b.postedDate);
    if (postedCmp !== 0) return postedCmp;

    return a.docNumber.localeCompare(b.docNumber);
  });
}

export function groupSettlementChildren<TChild extends SettlementChildSummary>(
  children: readonly TChild[],
): Array<SettlementParentSummary<TChild>> {
  const groups = new Map<
    string,
    {
      sourceSettlementId: string;
      marketplace: SettlementMarketplace;
      eventGroupIds: Set<string>;
      children: TChild[];
    }
  >();

  for (const child of children) {
    const sourceSettlementId = requireSourceSettlementIdFromPrivateNote(
      child.memo,
      `journal entry ${child.qboJournalEntryId}`,
    );
    const parentId = buildSettlementParentId(child.marketplace.region, sourceSettlementId);
    const existing = groups.get(parentId);
    const eventGroupId = extractEventGroupIdFromPrivateNote(child.memo);

    if (!existing) {
      groups.set(parentId, {
        sourceSettlementId,
        marketplace: child.marketplace,
        eventGroupIds: new Set(eventGroupId ? [eventGroupId] : []),
        children: [child],
      });
      continue;
    }

    if (existing.marketplace.region !== child.marketplace.region) {
      throw new Error(`Parent settlement ${parentId} mixes marketplaces`);
    }

    if (eventGroupId) {
      existing.eventGroupIds.add(eventGroupId);
    }
    existing.children.push(child);
  }

  return Array.from(groups.entries())
    .map(([parentId, group]) => {
      const sortedChildren = sortChildren(group.children);
      const period = pickParentPeriod(sortedChildren);
      const status = summarizeParentStatus(sortedChildren);

      return {
        parentId,
        sourceSettlementId: group.sourceSettlementId,
        marketplace: group.marketplace,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        postedDate: pickParentPostedDate(sortedChildren),
        settlementTotal: sumSettlementTotals(sortedChildren),
        plutusStatus: status.plutusStatus,
        splitCount: sortedChildren.length,
        isSplit: sortedChildren.length > 1,
        childCount: sortedChildren.length,
        hasInconsistency: status.hasInconsistency,
        eventGroupIds: Array.from(group.eventGroupIds).sort(),
        children: sortedChildren,
      };
    })
    .sort((a, b) => {
      if (a.postedDate !== b.postedDate) return b.postedDate.localeCompare(a.postedDate);
      if (a.marketplace.region !== b.marketplace.region) return a.marketplace.region.localeCompare(b.marketplace.region);
      return a.sourceSettlementId.localeCompare(b.sourceSettlementId);
    });
}
