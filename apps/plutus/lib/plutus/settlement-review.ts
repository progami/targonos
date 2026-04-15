import { getSettlementDisplayId } from './settlement-display';

export type SettlementListRowViewModel = {
  title: string;
  subtitle: string;
};

export type SettlementListRowInput = {
  sourceSettlementId: string;
  marketplace: {
    label: string;
  };
  splitCount: number;
  isSplit: boolean;
  children: readonly {
    docNumber: string;
  }[];
};

export function buildSettlementListRowViewModel(row: SettlementListRowInput): SettlementListRowViewModel {
  const title = getSettlementDisplayId({
    sourceSettlementId: row.sourceSettlementId,
    childDocNumbers: row.children.map((child) => child.docNumber),
  });

  const subtitle = row.isSplit ? `${row.marketplace.label} · ${row.splitCount} month-end postings` : row.marketplace.label;

  return {
    title,
    subtitle,
  };
}
