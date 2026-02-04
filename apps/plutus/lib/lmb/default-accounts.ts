/**
 * LMB (Link My Books) and Plutus Default Accounts Configuration
 *
 * This file defines the account names and patterns that are created by:
 * 1. LMB (Link My Books) - Amazon accounting integration
 * 2. Plutus - Brand-specific sub-accounts under LMB parents
 *
 * Accounts NOT in this list are considered "QBO Created" (user's custom accounts)
 */

/**
 * Exact account names created by LMB or Plutus (without brand suffix)
 */
export const LMB_PARENT_ACCOUNTS = [
  // LMB Balance Sheet Accounts
  'Amazon Deferred Balances (LMB)',
  'Amazon Reserved Balances (LMB)',
  'Amazon Split Month Rollovers (LMB)',
  'Amazon Loans (LMB)',
  'Amazon Sales Tax (LMB)',
  'Plutus Settlement Control',

  // LMB Income Accounts
  'Amazon Sales',
  'Amazon Refunds',

  // LMB COGS Accounts
  'Amazon Advertising Costs',
  'Amazon FBA Fees',
  'Amazon Promotions',
  'Amazon Seller Fees',
  'Amazon Storage Fees',

  // Plutus COGS Parent Accounts
  'Freight & Custom Duty',
  'Manufacturing',
  'Mfg Accessories',
  'Inventory Shrinkage',
  'Inventory Variance',
  'Warehousing',

  // Warehousing Sub-accounts (Plutus)
  '3PL',
  'Amazon FC',
  'AWD',

  // LMB Other Income
  'Amazon FBA Inventory Reimbursement',

  // LMB Other Expense
  'Rounding Drift Account',
  'Unrealised Currency Gains',

  // Inventory Asset (Plutus parent)
  'Inventory Asset',
] as const;

/**
 * Prefixes that indicate an LMB/Plutus brand sub-account
 * These accounts follow the pattern: "{Prefix} - {BrandName}"
 */
export const LMB_BRAND_ACCOUNT_PREFIXES = [
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

  // Other Income sub-accounts
  'Amazon FBA Inventory Reimbursement -',

  // Inventory Asset sub-accounts (Plutus)
  'Manufacturing -',
  'Freight -',
  'Duty -',
  'Mfg Accessories -',
] as const;

/**
 * Prefixes that indicate an LMB/Plutus account (without brand suffix)
 */
export const LMB_ACCOUNT_PREFIXES = [
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
 * Check if an account name is an LMB/Plutus default account
 */
export function isLmbDefaultAccount(accountPath: string): boolean {
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
  if (LMB_PARENT_ACCOUNTS.includes(leaf as typeof LMB_PARENT_ACCOUNTS[number])) {
    return true;
  }

  // Check brand sub-account prefixes (e.g., "Amazon Sales - UK-Dust Sheets")
  for (const prefix of LMB_BRAND_ACCOUNT_PREFIXES) {
    if (leaf.startsWith(prefix)) {
      return true;
    }
  }

  // Check general LMB prefixes
  for (const prefix of LMB_ACCOUNT_PREFIXES) {
    if (leaf.startsWith(prefix)) {
      return true;
    }
  }

  return false;
}

/**
 * Categorize account as 'lmb' (LMB/Plutus created) or 'qbo' (QBO/user created)
 */
export function getAccountSource(accountPath: string): 'lmb' | 'qbo' {
  return isLmbDefaultAccount(accountPath) ? 'lmb' : 'qbo';
}
