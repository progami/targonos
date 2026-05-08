import type { QboAccount } from '@/lib/qbo/api';

export type SettlementCashMappingRole = 'Transfer to Bank' | 'Payment to Amazon';

const REAL_BANK_MOVEMENT_ACCOUNT_TYPES = new Set(['bank', 'credit card']);

export function assertSettlementCashMappingDoesNotUseRealBankMovement(
  account: QboAccount,
  role: SettlementCashMappingRole,
): void {
  const accountType = account.AccountType.trim().toLowerCase();
  if (!REAL_BANK_MOVEMENT_ACCOUNT_TYPES.has(accountType)) return;

  throw new Error(
    `Settlement mapping for ${role} cannot use real bank or card account: ${account.Name} / ${account.Id} (${account.AccountType})`,
  );
}
