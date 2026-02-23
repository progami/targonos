import { createLogger } from '@targon/logger';
import { createAccount, fetchAccounts, updateAccountActive, type QboAccount, type QboConnection } from './api';
import { PLUTUS_BRAND_ACCOUNT_PREFIXES } from '@/lib/plutus/default-accounts';

const logger = createLogger({ name: 'plutus-qbo-plan' });

type EnsureResult = {
  created: QboAccount[];
  renamed: Array<{ accountId: string; fromName: string; toName: string; parentName: string }>;
  skipped: Array<{ name: string; parentName?: string }>;
  updatedConnection?: QboConnection;
};

function requireAccountById(accounts: QboAccount[], id: string, label: string): QboAccount {
  const found = accounts.find((a) => a.Id === id);
  if (!found) {
    throw new Error(`Missing required QBO account for ${label} (id=${id}).`);
  }
  return found;
}

function isBrandLeafAccountName(name: string, brandNames: string[]): boolean {
  for (const prefix of PLUTUS_BRAND_ACCOUNT_PREFIXES) {
    if (name.startsWith(prefix)) return true;
  }

  for (const brandName of brandNames) {
    if (name === brandName) return true;
  }

  return false;
}

function requireParentAccountById(accounts: QboAccount[], id: string, label: string, brandNames: string[]): QboAccount {
  const account = requireAccountById(accounts, id, label);

  if (isBrandLeafAccountName(account.Name, brandNames)) {
    const fullyQualifiedName = account.FullyQualifiedName ? account.FullyQualifiedName : account.Name;
    throw new Error(
      `Invalid QBO mapping for ${label}: "${fullyQualifiedName}" looks like a brand sub-account. Select the parent account instead.`,
    );
  }

  return account;
}

function findSubAccountByParentId(
  accounts: QboAccount[],
  parentAccountId: string,
  name: string,
): QboAccount | undefined {
  return accounts.find((a) => a.ParentRef?.value === parentAccountId && a.Name === name);
}

async function ensureSubAccount(
  connection: QboConnection,
  accounts: QboAccount[],
  parent: QboAccount,
  subAccountName: string,
  options?: { legacyNames?: string[] },
): Promise<{ account?: QboAccount; created: boolean; renamedFrom?: string; updatedConnection?: QboConnection }> {
  const existing = findSubAccountByParentId(accounts, parent.Id, subAccountName);
  if (existing) {
    return { account: existing, created: false };
  }

  if (options?.legacyNames) {
    for (const legacyName of options.legacyNames) {
      const legacy = findSubAccountByParentId(accounts, parent.Id, legacyName);
      if (!legacy) continue;

      if (legacy.Active !== true && legacy.Active !== false) {
        throw new Error(`Missing Active flag for QBO account (id=${legacy.Id} name="${legacy.Name}").`);
      }

      logger.info('Renaming QBO sub-account', {
        parentName: parent.Name,
        from: legacy.Name,
        to: subAccountName,
        accountId: legacy.Id,
      });

      const { account: updatedAccount, updatedConnection } = await updateAccountActive(
        connection,
        legacy.Id,
        legacy.SyncToken,
        subAccountName,
        legacy.Active,
      );

      const idx = accounts.findIndex((a) => a.Id === updatedAccount.Id);
      if (idx >= 0) {
        accounts[idx] = updatedAccount;
      } else {
        accounts.push(updatedAccount);
      }

      return { account: updatedAccount, created: false, renamedFrom: legacy.Name, updatedConnection };
    }
  }

  logger.info('Creating sub-account in QBO', {
    parentName: parent.Name,
    name: subAccountName,
    accountType: parent.AccountType,
    accountSubType: parent.AccountSubType,
  });

  const { account, updatedConnection } = await createAccount(connection, {
    name: subAccountName,
    accountType: parent.AccountType,
    accountSubType: parent.AccountSubType,
    parentId: parent.Id,
  });

  accounts.push(account);
  return { account, created: true, updatedConnection };
}

function requireValidBrandNames(brandNames: string[]): string[] {
  const trimmed = brandNames.map((name) => name.trim()).filter((name) => name !== '');

  if (trimmed.length === 0) {
    throw new Error('At least one brand is required to create accounts.');
  }

  if (trimmed.some((name) => name.includes(':'))) {
    throw new Error('Brand names cannot contain ":" (QBO uses ":" to display account paths).');
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const name of trimmed) {
    if (seen.has(name)) {
      duplicates.push(name);
    }
    seen.add(name);
  }

  if (duplicates.length > 0) {
    throw new Error(`Duplicate brand names are not allowed: ${duplicates.join(', ')}`);
  }

  return trimmed;
}

// Account mapping structure - user maps each category to their existing QBO account
export type AccountMappings = {
  // Inventory Asset accounts
  invManufacturing: string;
  invFreight: string;
  invDuty: string;
  invMfgAccessories: string;

  // COGS accounts
  cogsManufacturing: string;
  cogsFreight: string;
  cogsDuty: string;
  cogsMfgAccessories: string;
  cogsShrinkage: string;

  // Warehousing buckets (COGS)
  warehousing3pl: string;
  warehousingAmazonFc: string;
  warehousingAwd: string;

  // Product Expenses
  productExpenses: string;

  // Amazon revenue/fee accounts
  amazonSales: string;
  amazonRefunds: string;
  amazonFbaInventoryReimbursement: string;
  amazonSellerFees: string;
  amazonFbaFees: string;
  amazonStorageFees: string;
  amazonAdvertisingCosts: string;
  amazonPromotions: string;
};

export async function ensurePlutusQboPlanAccounts(
  connection: QboConnection,
  input: {
    brandNames: string[];
    accountMappings: AccountMappings;
  },
): Promise<EnsureResult> {
  const brandNames = requireValidBrandNames(input.brandNames);
  const mappings = input.accountMappings;
  let currentConnection = connection;

  const { accounts, updatedConnection: refreshedOnFetch } = await fetchAccounts(currentConnection, {
    includeInactive: true,
  });
  if (refreshedOnFetch) {
    currentConnection = refreshedOnFetch;
  }

  const created: QboAccount[] = [];
  const renamed: EnsureResult['renamed'] = [];
  const skipped: Array<{ name: string; parentName?: string }> = [];

  // Resolve all parent accounts from mappings
  const parents = {
    // Inventory
    invManufacturing: requireParentAccountById(accounts, mappings.invManufacturing, 'Inventory Manufacturing', brandNames),
    invFreight: requireParentAccountById(accounts, mappings.invFreight, 'Inventory Freight', brandNames),
    invDuty: requireParentAccountById(accounts, mappings.invDuty, 'Inventory Duty', brandNames),
    invMfgAccessories: requireParentAccountById(accounts, mappings.invMfgAccessories, 'Inventory Mfg Accessories', brandNames),

    // COGS
    cogsManufacturing: requireParentAccountById(accounts, mappings.cogsManufacturing, 'COGS Manufacturing', brandNames),
    cogsFreight: requireParentAccountById(accounts, mappings.cogsFreight, 'COGS Freight', brandNames),
    cogsDuty: requireParentAccountById(accounts, mappings.cogsDuty, 'COGS Duty', brandNames),
    cogsMfgAccessories: requireParentAccountById(accounts, mappings.cogsMfgAccessories, 'COGS Mfg Accessories', brandNames),
    cogsShrinkage: requireParentAccountById(accounts, mappings.cogsShrinkage, 'COGS Shrinkage', brandNames),

    // Warehousing buckets
    warehousing3pl: requireParentAccountById(accounts, mappings.warehousing3pl, 'Warehousing 3PL', brandNames),
    warehousingAmazonFc: requireParentAccountById(accounts, mappings.warehousingAmazonFc, 'Warehousing Amazon FC', brandNames),
    warehousingAwd: requireParentAccountById(accounts, mappings.warehousingAwd, 'Warehousing AWD', brandNames),

    // Product Expenses
    productExpenses: requireParentAccountById(accounts, mappings.productExpenses, 'Product Expenses', brandNames),

    // Amazon
    amazonSales: requireParentAccountById(accounts, mappings.amazonSales, 'Amazon Sales', brandNames),
    amazonRefunds: requireParentAccountById(accounts, mappings.amazonRefunds, 'Amazon Refunds', brandNames),
    amazonFbaInventoryReimbursement: requireParentAccountById(
      accounts,
      mappings.amazonFbaInventoryReimbursement,
      'Amazon FBA Inventory Reimbursement',
      brandNames,
    ),
    amazonSellerFees: requireParentAccountById(accounts, mappings.amazonSellerFees, 'Amazon Seller Fees', brandNames),
    amazonFbaFees: requireParentAccountById(accounts, mappings.amazonFbaFees, 'Amazon FBA Fees', brandNames),
    amazonStorageFees: requireParentAccountById(accounts, mappings.amazonStorageFees, 'Amazon Storage Fees', brandNames),
    amazonAdvertisingCosts: requireParentAccountById(accounts, mappings.amazonAdvertisingCosts, 'Amazon Advertising Costs', brandNames),
    amazonPromotions: requireParentAccountById(accounts, mappings.amazonPromotions, 'Amazon Promotions', brandNames),
  };

  const accountSpecs: Array<{ label: string; parent: QboAccount }> = [
    // Inventory (asset)
    { label: 'Manufacturing', parent: parents.invManufacturing },
    { label: 'Freight', parent: parents.invFreight },
    { label: 'Duty', parent: parents.invDuty },
    { label: 'Mfg Accessories', parent: parents.invMfgAccessories },

    // COGS
    { label: 'Manufacturing', parent: parents.cogsManufacturing },
    { label: 'Freight', parent: parents.cogsFreight },
    { label: 'Duty', parent: parents.cogsDuty },
    { label: 'Mfg Accessories', parent: parents.cogsMfgAccessories },
    { label: 'Inventory Shrinkage', parent: parents.cogsShrinkage },

    // Warehousing buckets
    { label: 'Warehousing:3PL', parent: parents.warehousing3pl },
    { label: 'Warehousing:Amazon FC', parent: parents.warehousingAmazonFc },
    { label: 'Warehousing:AWD', parent: parents.warehousingAwd },

    // Product Expenses
    { label: 'Product Expenses', parent: parents.productExpenses },

    // Amazon P&L
    { label: 'Amazon Sales', parent: parents.amazonSales },
    { label: 'Amazon Refunds', parent: parents.amazonRefunds },
    { label: 'Amazon FBA Inventory Reimbursement', parent: parents.amazonFbaInventoryReimbursement },
    { label: 'Amazon Seller Fees', parent: parents.amazonSellerFees },
    { label: 'Amazon FBA Fees', parent: parents.amazonFbaFees },
    { label: 'Amazon Storage Fees', parent: parents.amazonStorageFees },
    { label: 'Amazon Advertising Costs', parent: parents.amazonAdvertisingCosts },
    { label: 'Amazon Promotions', parent: parents.amazonPromotions },
  ];

  // For each brand, create sub-accounts under each mapped parent
  for (const brandName of brandNames) {
    for (const spec of accountSpecs) {
      const isWarehousing = spec.label.startsWith('Warehousing:');
      const prefixLabel = isWarehousing ? spec.label.split(':').at(-1) : spec.label;
      if (!prefixLabel) {
        throw new Error(`Invalid account spec label: "${spec.label}".`);
      }

      const subAccountName = `${prefixLabel} - ${brandName}`;
      const legacyNames = isWarehousing ? [brandName] : undefined;
      const result = await ensureSubAccount(currentConnection, accounts, spec.parent, subAccountName, {
        legacyNames,
      });

      if (result.created && result.account) {
        created.push(result.account);
      }

      if (result.renamedFrom && result.account) {
        renamed.push({
          accountId: result.account.Id,
          fromName: result.renamedFrom,
          toName: subAccountName,
          parentName: spec.parent.Name,
        });
      } else if (!result.created) {
        skipped.push({ name: subAccountName, parentName: spec.parent.Name });
      }

      if (result.updatedConnection) {
        currentConnection = result.updatedConnection;
      }
    }
  }

  return {
    created,
    renamed,
    skipped,
    updatedConnection: currentConnection === connection ? undefined : currentConnection,
  };
}
