const SETTLEMENT_OPERATING_ACCOUNT_PREFIXES = [
  'Amazon Sales',
  'Amazon Refunds',
  'Amazon FBA Fees',
  'Amazon Seller Fees',
  'Amazon Storage Fees',
  'Amazon Advertising Costs',
  'Amazon Promotions',
  'Amazon FBA Inventory Reimbursement',
] as const;

const MEMOS_WITH_LEGACY_BRAND_SUFFIX = new Set(['Amazon Sales', 'Amazon Refunds']);

export type SettlementParentAccountKey = 'amazonSales' | 'amazonRefunds';

export function normalizeSettlementOperatingMemo(memo: string): string {
  const trimmed = memo.trim();
  const parts = trimmed.split(' - ');
  if (parts.length < 3) return trimmed;

  const parent = parts[0];
  if (!MEMOS_WITH_LEGACY_BRAND_SUFFIX.has(parent)) return trimmed;

  return parts.slice(0, -1).join(' - ');
}

export function settlementParentAccountKeyForMemo(memo: string): SettlementParentAccountKey | null {
  const normalized = normalizeSettlementOperatingMemo(memo);
  if (normalized.startsWith('Amazon Sales - ')) return 'amazonSales';
  if (normalized.startsWith('Amazon Refunds - ')) return 'amazonRefunds';
  return null;
}

export function isSettlementOperatingBrandAccountName(accountName: string): boolean {
  const trimmed = accountName.trim();
  if (trimmed === '') return false;

  const leaf = trimmed.split(':').at(-1)?.trim();
  if (!leaf) return false;

  return SETTLEMENT_OPERATING_ACCOUNT_PREFIXES.some((prefix) => leaf.startsWith(`${prefix} - `));
}
