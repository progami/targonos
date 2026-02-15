import type { QboAccount } from '@/lib/qbo/api';
import type { InventoryComponent } from '@/lib/inventory/ledger';
import type { ProcessingBlock, JournalEntryLinePreview } from './settlement-types';
import { findRequiredSubAccountId } from './settlement-validation';

function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

function buildSkuBreakdownSuffix(skuBreakdown: Record<string, number> | undefined): string {
  if (!skuBreakdown) {
    return '';
  }

  const entries = Object.entries(skuBreakdown).filter((entry) => entry[1] !== 0);
  if (entries.length === 0) {
    return '';
  }

  entries.sort((a, b) => {
    const delta = Math.abs(b[1]) - Math.abs(a[1]);
    if (delta !== 0) return delta;
    return a[0].localeCompare(b[0]);
  });

  const maxShown = 4;
  const shown = entries.slice(0, maxShown).map((entry) => `${entry[0]}:${formatCents(entry[1])}`);
  const hiddenCount = entries.length - shown.length;
  if (hiddenCount > 0) {
    shown.push(`+${hiddenCount} more`);
  }

  return ` | SKUs ${shown.join(', ')}`;
}

export function buildCogsJournalLines(
  netCogsByBrand: Record<string, Record<InventoryComponent, number>>,
  brandNames: string[],
  mapping: Record<string, string | undefined>,
  accounts: QboAccount[],
  _invoiceId: string,
  blocks: ProcessingBlock[],
  skuBreakdownByBrandComponent?: Record<string, Record<InventoryComponent, Record<string, number>>>,
): JournalEntryLinePreview[] {
  const cogsLines: JournalEntryLinePreview[] = [];

  for (const brand of brandNames) {
    const componentTotals = netCogsByBrand[brand];
    if (!componentTotals) continue;

    for (const component of Object.keys(componentTotals) as InventoryComponent[]) {
      const cents = componentTotals[component];
      if (cents === 0) continue;

      const invParentKey =
        component === 'manufacturing'
          ? 'invManufacturing'
          : component === 'freight'
            ? 'invFreight'
            : component === 'duty'
              ? 'invDuty'
              : 'invMfgAccessories';

      const cogsParentKey =
        component === 'manufacturing'
          ? 'cogsManufacturing'
          : component === 'freight'
            ? 'cogsFreight'
            : component === 'duty'
              ? 'cogsDuty'
              : 'cogsMfgAccessories';

      const invLabel =
        component === 'manufacturing'
          ? 'Manufacturing'
          : component === 'freight'
            ? 'Freight'
            : component === 'duty'
              ? 'Duty'
              : 'Mfg Accessories';

      const cogsLabel =
        component === 'manufacturing'
          ? 'Manufacturing'
          : component === 'freight'
            ? 'Freight'
            : component === 'duty'
              ? 'Duty'
              : 'Mfg Accessories';

      const invSubName = `${invLabel} - ${brand}`;
      const cogsSubName = `${cogsLabel} - ${brand}`;

      let invAccount;
      let cogsAccount;
      try {
        const parentId = mapping[invParentKey];
        if (!parentId) throw new Error('Missing inventory parent mapping');
        invAccount = findRequiredSubAccountId(accounts, parentId, invSubName);
      } catch {
        blocks.push({ code: 'MISSING_BRAND_SUBACCOUNT', message: 'Missing inventory brand sub-account', details: { name: invSubName } });
        continue;
      }
      try {
        const parentId = mapping[cogsParentKey];
        if (!parentId) throw new Error('Missing COGS parent mapping');
        cogsAccount = findRequiredSubAccountId(accounts, parentId, cogsSubName);
      } catch {
        blocks.push({ code: 'MISSING_BRAND_SUBACCOUNT', message: 'Missing COGS brand sub-account', details: { name: cogsSubName } });
        continue;
      }

      const absCents = Math.abs(cents);
      const componentBreakdown = skuBreakdownByBrandComponent ? skuBreakdownByBrandComponent[brand] : undefined;
      const skuBreakdown = componentBreakdown ? componentBreakdown[component] : undefined;
      const skuSuffix = buildSkuBreakdownSuffix(skuBreakdown);
      if (cents > 0) {
        // Sale: Debit COGS, Credit Inventory
        cogsLines.push({
          accountId: cogsAccount.id,
          accountName: cogsAccount.name,
          accountFullyQualifiedName: cogsAccount.fullyQualifiedName,
          accountNumber: cogsAccount.acctNum,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${cogsLabel} COGS${skuSuffix}`,
        });
        cogsLines.push({
          accountId: invAccount.id,
          accountName: invAccount.name,
          accountFullyQualifiedName: invAccount.fullyQualifiedName,
          accountNumber: invAccount.acctNum,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invLabel} inventory${skuSuffix}`,
        });
      } else {
        // Return: Debit Inventory, Credit COGS
        cogsLines.push({
          accountId: invAccount.id,
          accountName: invAccount.name,
          accountFullyQualifiedName: invAccount.fullyQualifiedName,
          accountNumber: invAccount.acctNum,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invLabel} inventory (return)${skuSuffix}`,
        });
        cogsLines.push({
          accountId: cogsAccount.id,
          accountName: cogsAccount.name,
          accountFullyQualifiedName: cogsAccount.fullyQualifiedName,
          accountNumber: cogsAccount.acctNum,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${cogsLabel} COGS (return)${skuSuffix}`,
        });
      }
    }
  }

  return cogsLines;
}

export function buildPnlJournalLines(
  pnlAllocationsByBucket: Record<string, Record<string, number>>,
  mapping: Record<string, string | undefined>,
  accounts: QboAccount[],
  _invoiceId: string,
  blocks: ProcessingBlock[],
  skuBreakdownByBucketBrand?: Record<string, Record<string, Record<string, number>>>,
): JournalEntryLinePreview[] {
  const pnlLines: JournalEntryLinePreview[] = [];
  const accountsById = new Map(accounts.map((account) => [account.Id, account]));

  const bucketMetaByKey: Record<
    string,
    {
      label: string;
      buildSubAccountName: (brand: string) => string;
    }
  > = {
    amazonSellerFees: {
      label: 'Amazon Seller Fees',
      buildSubAccountName: (brand) => `Amazon Seller Fees - ${brand}`,
    },
    amazonFbaFees: {
      label: 'Amazon FBA Fees',
      buildSubAccountName: (brand) => `Amazon FBA Fees - ${brand}`,
    },
    amazonStorageFees: {
      label: 'Amazon Storage Fees',
      buildSubAccountName: (brand) => `Amazon Storage Fees - ${brand}`,
    },
    amazonAdvertisingCosts: {
      label: 'Amazon Advertising Costs',
      buildSubAccountName: (brand) => `Amazon Advertising Costs - ${brand}`,
    },
    amazonPromotions: {
      label: 'Amazon Promotions',
      buildSubAccountName: (brand) => `Amazon Promotions - ${brand}`,
    },
    amazonFbaInventoryReimbursement: {
      label: 'Amazon FBA Inventory Reimbursement',
      buildSubAccountName: (brand) => `Amazon FBA Inventory Reimbursement - ${brand}`,
    },
    warehousingAwd: {
      label: 'AWD',
      buildSubAccountName: (brand) => brand,
    },
  };

  for (const [bucketKey, perBrand] of Object.entries(pnlAllocationsByBucket)) {
    const parentAccountId = mapping[bucketKey];
    const bucketMeta = bucketMetaByKey[bucketKey];
    if (!parentAccountId || !bucketMeta) continue;
    const label = bucketMeta.label;

    for (const [brand, cents] of Object.entries(perBrand)) {
      if (cents === 0) continue;

      const subName = bucketMeta.buildSubAccountName(brand);
      let brandAccount;
      try {
        brandAccount = findRequiredSubAccountId(accounts, parentAccountId, subName);
      } catch {
        blocks.push({ code: 'MISSING_BRAND_SUBACCOUNT', message: 'Missing P&L brand sub-account', details: { name: subName } });
        continue;
      }

      const absCents = Math.abs(cents);
      const bucketBreakdown = skuBreakdownByBucketBrand ? skuBreakdownByBucketBrand[bucketKey] : undefined;
      const brandSkuBreakdown = bucketBreakdown ? bucketBreakdown[brand] : undefined;
      const skuSuffix = buildSkuBreakdownSuffix(brandSkuBreakdown);
      const lineDescription = `${label} (${brand})${skuSuffix}`;
      const parentAccount = accountsById.get(parentAccountId);
      const parentAccountName = parentAccount ? parentAccount.Name : label;

      if (cents > 0) {
        // Move positive amount from parent -> brand (debit parent, credit brand)
        pnlLines.push({
          accountId: parentAccountId,
          accountName: parentAccountName,
          accountFullyQualifiedName: parentAccount?.FullyQualifiedName,
          accountNumber: parentAccount?.AcctNum,
          postingType: 'Debit',
          amountCents: absCents,
          description: lineDescription,
        });
        pnlLines.push({
          accountId: brandAccount.id,
          accountName: brandAccount.name,
          accountFullyQualifiedName: brandAccount.fullyQualifiedName,
          accountNumber: brandAccount.acctNum,
          postingType: 'Credit',
          amountCents: absCents,
          description: lineDescription,
        });
      } else {
        // Move negative amount from parent -> brand (debit brand, credit parent)
        pnlLines.push({
          accountId: brandAccount.id,
          accountName: brandAccount.name,
          accountFullyQualifiedName: brandAccount.fullyQualifiedName,
          accountNumber: brandAccount.acctNum,
          postingType: 'Debit',
          amountCents: absCents,
          description: lineDescription,
        });
        pnlLines.push({
          accountId: parentAccountId,
          accountName: parentAccountName,
          accountFullyQualifiedName: parentAccount?.FullyQualifiedName,
          accountNumber: parentAccount?.AcctNum,
          postingType: 'Credit',
          amountCents: absCents,
          description: lineDescription,
        });
      }
    }
  }

  return pnlLines;
}
