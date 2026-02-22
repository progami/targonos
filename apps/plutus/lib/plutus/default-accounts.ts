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

  // Plutus COGS Parent Accounts
  'Freight & Custom Duty',
  'Manufacturing',
  'Mfg Accessories',
  'Inventory Shrinkage',
  'Inventory Variance',
  'Product Expenses',
  'Warehousing',

  // Warehousing Sub-accounts (Plutus)
  '3PL',
  'Amazon FC',
  'AWD',

  // Inventory Asset (Plutus parent)
  'Inventory Asset',
] as const;

/**
 * Prefixes that indicate a Plutus brand sub-account.
 * These accounts follow the pattern: "{Prefix} - {BrandName}"
 */
export const PLUTUS_BRAND_ACCOUNT_PREFIXES = [
  // Income sub-accounts
  'Amazon Sales -',
  'Amazon Refunds -',

  // COGS sub-accounts
  'Amazon Advertising Costs -',
  'Amazon FBA Fees -',
  'Amazon Promotions -',
  'Amazon Seller Fees -',
  'Amazon Storage Fees -',
  'Manufacturing -',
  'Freight -',
  'Duty -',
  'Mfg Accessories -',
  'Inventory Shrinkage -',
  'Product Expenses -',

  // Other Income sub-accounts
  'Amazon FBA Inventory Reimbursement -',
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

  // Special-case: Warehousing buckets use brand leaf names (e.g. "Warehousing:3PL:US-Dust Sheets")
  if (
    full.startsWith('Warehousing:3PL:') ||
    full.startsWith('Warehousing:Amazon FC:') ||
    full.startsWith('Warehousing:AWD:')
  ) {
    return true;
  }

  // Check exact matches first
  if (PLUTUS_PARENT_ACCOUNTS.includes(leaf as typeof PLUTUS_PARENT_ACCOUNTS[number])) {
    return true;
  }

  // Check brand sub-account prefixes (e.g., "Amazon Sales - UK-Dust Sheets")
  for (const prefix of PLUTUS_BRAND_ACCOUNT_PREFIXES) {
    if (leaf.startsWith(prefix)) {
      return true;
    }
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
