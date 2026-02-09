import { createLogger } from '@targon/logger';
import { createAccount, fetchAccounts, type QboAccount, type QboConnection } from './api';

const logger = createLogger({ name: 'plutus-qbo-lmb-plan' });

type EnsureResult = {
  created: QboAccount[];
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
): Promise<{ account?: QboAccount; created: boolean; updatedConnection?: QboConnection }> {
  const existing = findSubAccountByParentId(accounts, parent.Id, subAccountName);
  if (existing) {
    return { account: existing, created: false };
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

  // LMB Revenue/Fee accounts
  amazonSales: string;
  amazonRefunds: string;
  amazonFbaInventoryReimbursement: string;
  amazonSellerFees: string;
  amazonFbaFees: string;
  amazonStorageFees: string;
  amazonAdvertisingCosts: string;
  amazonPromotions: string;
};

export async function ensurePlutusQboLmbPlanAccounts(
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
  const skipped: Array<{ name: string; parentName?: string }> = [];

  // Resolve all parent accounts from mappings
  const parents = {
    // Inventory
    invManufacturing: requireAccountById(accounts, mappings.invManufacturing, 'Inventory Manufacturing'),
    invFreight: requireAccountById(accounts, mappings.invFreight, 'Inventory Freight'),
    invDuty: requireAccountById(accounts, mappings.invDuty, 'Inventory Duty'),
    invMfgAccessories: requireAccountById(accounts, mappings.invMfgAccessories, 'Inventory Mfg Accessories'),

    // COGS
    cogsManufacturing: requireAccountById(accounts, mappings.cogsManufacturing, 'COGS Manufacturing'),
    cogsFreight: requireAccountById(accounts, mappings.cogsFreight, 'COGS Freight'),
    cogsDuty: requireAccountById(accounts, mappings.cogsDuty, 'COGS Duty'),
    cogsMfgAccessories: requireAccountById(accounts, mappings.cogsMfgAccessories, 'COGS Mfg Accessories'),
    cogsShrinkage: requireAccountById(accounts, mappings.cogsShrinkage, 'COGS Shrinkage'),

    // Warehousing buckets
    warehousing3pl: requireAccountById(accounts, mappings.warehousing3pl, 'Warehousing 3PL'),
    warehousingAmazonFc: requireAccountById(accounts, mappings.warehousingAmazonFc, 'Warehousing Amazon FC'),
    warehousingAwd: requireAccountById(accounts, mappings.warehousingAwd, 'Warehousing AWD'),

    // Product Expenses
    productExpenses: requireAccountById(accounts, mappings.productExpenses, 'Product Expenses'),

    // LMB
    amazonSales: requireAccountById(accounts, mappings.amazonSales, 'Amazon Sales'),
    amazonRefunds: requireAccountById(accounts, mappings.amazonRefunds, 'Amazon Refunds'),
    amazonFbaInventoryReimbursement: requireAccountById(
      accounts,
      mappings.amazonFbaInventoryReimbursement,
      'Amazon FBA Inventory Reimbursement',
    ),
    amazonSellerFees: requireAccountById(accounts, mappings.amazonSellerFees, 'Amazon Seller Fees'),
    amazonFbaFees: requireAccountById(accounts, mappings.amazonFbaFees, 'Amazon FBA Fees'),
    amazonStorageFees: requireAccountById(accounts, mappings.amazonStorageFees, 'Amazon Storage Fees'),
    amazonAdvertisingCosts: requireAccountById(accounts, mappings.amazonAdvertisingCosts, 'Amazon Advertising Costs'),
    amazonPromotions: requireAccountById(accounts, mappings.amazonPromotions, 'Amazon Promotions'),
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
    { label: 'Product Expenses', parent: parents.productExpenses },

    // Warehousing buckets (brand leaf accounts are just the brand name)
    { label: 'Warehousing:3PL', parent: parents.warehousing3pl },
    { label: 'Warehousing:Amazon FC', parent: parents.warehousingAmazonFc },
    { label: 'Warehousing:AWD', parent: parents.warehousingAwd },

    // Product Expenses
    { label: 'Product Expenses', parent: parents.productExpenses },

    // LMB P&L
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
      const subAccountName = spec.label.startsWith('Warehousing:') ? brandName : `${spec.label} - ${brandName}`;
      const result = await ensureSubAccount(currentConnection, accounts, spec.parent, subAccountName);

      if (result.created && result.account) {
        created.push(result.account);
      }

      if (!result.created) {
        skipped.push({ name: subAccountName, parentName: spec.parent.Name });
      }

      if (result.updatedConnection) {
        currentConnection = result.updatedConnection;
      }
    }
  }

  return {
    created,
    skipped,
    updatedConnection: currentConnection === connection ? undefined : currentConnection,
  };
}
