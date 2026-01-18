import { createLogger } from '@targon/logger';
import { createAccount, fetchAccounts, type QboAccount, type QboConnection } from './api';

const logger = createLogger({ name: 'plutus-qbo-lmb-plan' });

type CreateAccountInput = {
  name: string;
  accountType: string;
  accountSubType?: string;
  parentId?: string;
};

type EnsureResult = {
  created: QboAccount[];
  skipped: Array<{ name: string; parentName?: string }>;
  updatedConnection?: QboConnection;
};

type AccountTemplate = {
  accountType: string;
  accountSubType?: string;
};

function findAccountByName(accounts: QboAccount[], name: string): QboAccount | undefined {
  return accounts.find((a) => a.Name === name);
}

function requireAccountByName(accounts: QboAccount[], name: string): QboAccount {
  const found = findAccountByName(accounts, name);
  if (!found) {
    throw new Error(`Missing required QBO account "${name}" (create it first, then re-run).`);
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

async function ensureParentAccount(
  connection: QboConnection,
  accounts: QboAccount[],
  input: CreateAccountInput,
): Promise<{ account: QboAccount; created: boolean; updatedConnection?: QboConnection }> {
  const existing = findAccountByName(accounts, input.name);
  if (existing) {
    return { account: existing, created: false };
  }

  const { account, updatedConnection } = await createAccount(connection, input);
  accounts.push(account);
  return { account, created: true, updatedConnection };
}

async function ensureSubAccount(
  connection: QboConnection,
  accounts: QboAccount[],
  input: CreateAccountInput,
  parentName: string,
): Promise<{ account?: QboAccount; created: boolean; updatedConnection?: QboConnection }> {
  if (!input.parentId) {
    throw new Error('ensureSubAccount requires parentId');
  }

  const existing = findSubAccountByParentId(accounts, input.parentId, input.name);
  if (existing) {
    return { account: existing, created: false };
  }

  logger.info('Creating sub-account in QBO', {
    parentName,
    name: input.name,
    accountType: input.accountType,
    accountSubType: input.accountSubType,
  });

  const { account, updatedConnection } = await createAccount(connection, input);
  accounts.push(account);
  return { account, created: true, updatedConnection };
}

function getTemplateFromAccount(account: QboAccount): AccountTemplate {
  return {
    accountType: account.AccountType,
    accountSubType: account.AccountSubType,
  };
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

export async function ensurePlutusQboLmbPlanAccounts(
  connection: QboConnection,
  input: {
    brandNames: string[];
  },
): Promise<EnsureResult> {
  const brandNames = requireValidBrandNames(input.brandNames);
  let currentConnection = connection;

  const { accounts, updatedConnection: refreshedOnFetch } = await fetchAccounts(currentConnection);
  if (refreshedOnFetch) {
    currentConnection = refreshedOnFetch;
  }

  const created: QboAccount[] = [];
  const skipped: Array<{ name: string; parentName?: string }> = [];

  // Plutus parent accounts
  const inventoryAssetParent = requireAccountByName(accounts, 'Inventory Asset');
  const manufacturingParent = requireAccountByName(accounts, 'Manufacturing');
  const freightAndDutyParent = requireAccountByName(accounts, 'Freight & Custom Duty');
  const landFreightParent = requireAccountByName(accounts, 'Land Freight');
  const storage3plParent = requireAccountByName(accounts, 'Storage 3PL');

  // LMB parent accounts (created by LMB wizard, Plutus creates sub-accounts under these)
  const amazonSalesParent = requireAccountByName(accounts, 'Amazon Sales');
  const amazonRefundsParent = requireAccountByName(accounts, 'Amazon Refunds');
  const amazonFbaInventoryReimbursementParent = requireAccountByName(
    accounts,
    'Amazon FBA Inventory Reimbursement',
  );
  const amazonSellerFeesParent = requireAccountByName(accounts, 'Amazon Seller Fees');
  const amazonFbaFeesParent = requireAccountByName(accounts, 'Amazon FBA Fees');
  const amazonStorageFeesParent = requireAccountByName(accounts, 'Amazon Storage Fees');
  const amazonAdvertisingCostsParent = requireAccountByName(accounts, 'Amazon Advertising Costs');
  const amazonPromotionsParent = requireAccountByName(accounts, 'Amazon Promotions');

  const inventoryTemplate = getTemplateFromAccount(inventoryAssetParent);
  const manufacturingTemplate = getTemplateFromAccount(manufacturingParent);
  const freightAndDutyTemplate = getTemplateFromAccount(freightAndDutyParent);
  const landFreightTemplate = getTemplateFromAccount(landFreightParent);
  const storage3plTemplate = getTemplateFromAccount(storage3plParent);

  const lmbSalesTemplate = getTemplateFromAccount(amazonSalesParent);
  const lmbRefundsTemplate = getTemplateFromAccount(amazonRefundsParent);
  const lmbReimbursementTemplate = getTemplateFromAccount(amazonFbaInventoryReimbursementParent);
  const lmbSellerFeesTemplate = getTemplateFromAccount(amazonSellerFeesParent);
  const lmbFbaFeesTemplate = getTemplateFromAccount(amazonFbaFeesParent);
  const lmbStorageFeesTemplate = getTemplateFromAccount(amazonStorageFeesParent);
  const lmbAdvertisingTemplate = getTemplateFromAccount(amazonAdvertisingCostsParent);
  const lmbPromotionsTemplate = getTemplateFromAccount(amazonPromotionsParent);

  // Ensure Plutus-created parents exist
  const {
    account: mfgAccessoriesParent,
    created: createdMfgAccessoriesParent,
    updatedConnection: updatedOnMfgAccessories,
  } = await ensureParentAccount(currentConnection, accounts, {
    name: 'Mfg Accessories',
    accountType: manufacturingTemplate.accountType,
    accountSubType: manufacturingTemplate.accountSubType,
  });

  if (updatedOnMfgAccessories) {
    currentConnection = updatedOnMfgAccessories;
  }

  if (createdMfgAccessoriesParent) {
    created.push(mfgAccessoriesParent);
  } else {
    skipped.push({ name: mfgAccessoriesParent.Name });
  }

  const {
    account: inventoryShrinkageParent,
    created: createdInventoryShrinkageParent,
    updatedConnection: updatedOnShrinkage,
  } = await ensureParentAccount(currentConnection, accounts, {
    name: 'Inventory Shrinkage',
    accountType: manufacturingTemplate.accountType,
    accountSubType: 'OtherCostsOfServiceCos',
  });

  if (updatedOnShrinkage) {
    currentConnection = updatedOnShrinkage;
  }

  if (createdInventoryShrinkageParent) {
    created.push(inventoryShrinkageParent);
  } else {
    skipped.push({ name: inventoryShrinkageParent.Name });
  }

  const mfgAccessoriesTemplate = getTemplateFromAccount(mfgAccessoriesParent);
  const inventoryShrinkageTemplate = getTemplateFromAccount(inventoryShrinkageParent);

  for (const brandName of brandNames) {
    const inventoryAssetSubAccounts = [
      `Inv Manufacturing - ${brandName}`,
      `Inv Freight - ${brandName}`,
      `Inv Duty - ${brandName}`,
      `Inv Mfg Accessories - ${brandName}`,
    ];

    for (const name of inventoryAssetSubAccounts) {
      const result = await ensureSubAccount(
        currentConnection,
        accounts,
        {
          name,
          accountType: inventoryTemplate.accountType,
          accountSubType: inventoryTemplate.accountSubType,
          parentId: inventoryAssetParent.Id,
        },
        inventoryAssetParent.Name,
      );

      if (result.created && result.account) {
        created.push(result.account);
      }

      if (!result.created) {
        skipped.push({ name, parentName: inventoryAssetParent.Name });
      }

      if (result.updatedConnection) {
        currentConnection = result.updatedConnection;
      }
    }

    const cogsSubAccounts: Array<{
      parent: QboAccount;
      template: AccountTemplate;
      names: string[];
    }> = [
      {
        parent: manufacturingParent,
        template: manufacturingTemplate,
        names: [`Manufacturing - ${brandName}`],
      },
      {
        parent: freightAndDutyParent,
        template: freightAndDutyTemplate,
        names: [`Freight - ${brandName}`, `Duty - ${brandName}`],
      },
      {
        parent: landFreightParent,
        template: landFreightTemplate,
        names: [`Land Freight - ${brandName}`],
      },
      {
        parent: storage3plParent,
        template: storage3plTemplate,
        names: [`Storage 3PL - ${brandName}`],
      },
      {
        parent: mfgAccessoriesParent,
        template: mfgAccessoriesTemplate,
        names: [`Mfg Accessories - ${brandName}`],
      },
      {
        parent: inventoryShrinkageParent,
        template: inventoryShrinkageTemplate,
        names: [`Inventory Shrinkage - ${brandName}`],
      },
    ];

    for (const group of cogsSubAccounts) {
      for (const name of group.names) {
        const result = await ensureSubAccount(
          currentConnection,
          accounts,
          {
            name,
            accountType: group.template.accountType,
            accountSubType: group.template.accountSubType,
            parentId: group.parent.Id,
          },
          group.parent.Name,
        );

        if (result.created && result.account) {
          created.push(result.account);
        }

        if (!result.created) {
          skipped.push({ name, parentName: group.parent.Name });
        }

        if (result.updatedConnection) {
          currentConnection = result.updatedConnection;
        }
      }
    }

    const lmbSubAccounts: Array<{
      parent: QboAccount;
      template: AccountTemplate;
      names: string[];
    }> = [
      {
        parent: amazonSalesParent,
        template: lmbSalesTemplate,
        names: [`Amazon Sales - ${brandName}`],
      },
      {
        parent: amazonRefundsParent,
        template: lmbRefundsTemplate,
        names: [`Amazon Refunds - ${brandName}`],
      },
      {
        parent: amazonFbaInventoryReimbursementParent,
        template: lmbReimbursementTemplate,
        names: [`Amazon FBA Inventory Reimbursement - ${brandName}`],
      },
      {
        parent: amazonSellerFeesParent,
        template: lmbSellerFeesTemplate,
        names: [`Amazon Seller Fees - ${brandName}`],
      },
      {
        parent: amazonFbaFeesParent,
        template: lmbFbaFeesTemplate,
        names: [`Amazon FBA Fees - ${brandName}`],
      },
      {
        parent: amazonStorageFeesParent,
        template: lmbStorageFeesTemplate,
        names: [`Amazon Storage Fees - ${brandName}`],
      },
      {
        parent: amazonAdvertisingCostsParent,
        template: lmbAdvertisingTemplate,
        names: [`Amazon Advertising Costs - ${brandName}`],
      },
      {
        parent: amazonPromotionsParent,
        template: lmbPromotionsTemplate,
        names: [`Amazon Promotions - ${brandName}`],
      },
    ];

    for (const group of lmbSubAccounts) {
      for (const name of group.names) {
        const result = await ensureSubAccount(
          currentConnection,
          accounts,
          {
            name,
            accountType: group.template.accountType,
            accountSubType: group.template.accountSubType,
            parentId: group.parent.Id,
          },
          group.parent.Name,
        );

        if (result.created && result.account) {
          created.push(result.account);
        }

        if (!result.created) {
          skipped.push({ name, parentName: group.parent.Name });
        }

        if (result.updatedConnection) {
          currentConnection = result.updatedConnection;
        }
      }
    }
  }

  return {
    created,
    skipped,
    updatedConnection: currentConnection === connection ? undefined : currentConnection,
  };
}
