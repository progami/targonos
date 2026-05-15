/**
 * Plutus default account classification
 *
 * Used to tag accounts that are part of the Plutus/Amazon settlement workflow vs user-created accounts.
 *
 * Note: Some QBO account names may still include legacy suffixes in parentheses, but this module does not
 * depend on those names.
 */

export const PLUTUS_PARENT_ACCOUNTS = [
  'Plutus Settlement Control',

  'Amazon Sales',
  'Amazon Refunds',
  'Amazon FBA Inventory Reimbursement',
  'Amazon Seller Fees',
  'Amazon FBA Fees',
  'Amazon Storage Fees',
  'Amazon Advertising Costs',
  'Amazon Promotions',
  'Amazon Reserved Balances',
  'Amazon Split Month Rollovers',
  'Amazon Sales Tax',
] as const;

/**
 * Prefixes that indicate a Plutus/Amazon workflow account (without brand suffix).
 */
export const PLUTUS_ACCOUNT_PREFIXES = [
  'Amazon ',
  'Plutus ',
] as const;

function splitAccountPath(accountPath: string): { full: string; leaf: string } {
  const full = accountPath.trim();
  const parts = full.split(':');
  const leaf = (parts[parts.length - 1] ?? '').trim();
  return { full, leaf };
}

/**
 * Check if an account name is a Plutus default account.
 */
export function isPlutusDefaultAccount(accountPath: string): boolean {
  const { full, leaf } = splitAccountPath(accountPath);
  if (full === '') return false;

  // Check exact matches first
  if (PLUTUS_PARENT_ACCOUNTS.includes(leaf as typeof PLUTUS_PARENT_ACCOUNTS[number])) {
    return true;
  }

  // Check general prefixes
  for (const prefix of PLUTUS_ACCOUNT_PREFIXES) {
    if (leaf.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Categorize account as 'plutus' (workflow default) or 'qbo' (user-created/custom).
 */
export function getAccountSource(accountPath: string): 'plutus' | 'qbo' {
  return isPlutusDefaultAccount(accountPath) ? 'plutus' : 'qbo';
}
