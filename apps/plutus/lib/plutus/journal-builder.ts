import type { QboAccount } from '@/lib/qbo/api';
import type { InventoryComponent } from '@/lib/inventory/ledger';
import type { ProcessingBlock, JournalEntryLinePreview } from './settlement-types';
import { findRequiredSubAccountId } from './settlement-validation';

export function buildCogsJournalLines(
  netCogsByBrand: Record<string, Record<InventoryComponent, number>>,
  brandNames: string[],
  mapping: Record<string, string | undefined>,
  accounts: QboAccount[],
  invoiceId: string,
  blocks: ProcessingBlock[],
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
      if (cents > 0) {
        // Sale: Debit COGS, Credit Inventory
        cogsLines.push({
          accountId: cogsAccount.id,
          accountName: cogsAccount.name,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${component} COGS`,
        });
        cogsLines.push({
          accountId: invAccount.id,
          accountName: invAccount.name,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${component} inventory`,
        });
      } else {
        // Return: Debit Inventory, Credit COGS
        cogsLines.push({
          accountId: invAccount.id,
          accountName: invAccount.name,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${component} inventory (return)`,
        });
        cogsLines.push({
          accountId: cogsAccount.id,
          accountName: cogsAccount.name,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${component} COGS (return)`,
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
  invoiceId: string,
  blocks: ProcessingBlock[],
): JournalEntryLinePreview[] {
  const pnlLines: JournalEntryLinePreview[] = [];

  const bucketLabelByKey: Record<string, string> = {
    amazonSellerFees: 'Amazon Seller Fees',
    amazonFbaFees: 'Amazon FBA Fees',
    amazonStorageFees: 'Amazon Storage Fees',
    amazonAdvertisingCosts: 'Amazon Advertising Costs',
    amazonPromotions: 'Amazon Promotions',
    amazonFbaInventoryReimbursement: 'Amazon FBA Inventory Reimbursement',
  };

  for (const [bucketKey, perBrand] of Object.entries(pnlAllocationsByBucket)) {
    const parentAccountId = mapping[bucketKey];
    const label = bucketLabelByKey[bucketKey];
    if (!parentAccountId || !label) continue;

    for (const [brand, cents] of Object.entries(perBrand)) {
      if (cents === 0) continue;

      const subName = `${label} - ${brand}`;
      let brandAccount;
      try {
        brandAccount = findRequiredSubAccountId(accounts, parentAccountId, subName);
      } catch {
        blocks.push({ code: 'MISSING_BRAND_SUBACCOUNT', message: 'Missing P&L brand sub-account', details: { name: subName } });
        continue;
      }

      const absCents = Math.abs(cents);

      if (cents > 0) {
        // Move positive amount from parent -> brand (debit parent, credit brand)
        pnlLines.push({
          accountId: parentAccountId,
          accountName: label,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${label}`,
        });
        pnlLines.push({
          accountId: brandAccount.id,
          accountName: brandAccount.name,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${label} (${brand})`,
        });
      } else {
        // Move negative amount from parent -> brand (debit brand, credit parent)
        pnlLines.push({
          accountId: brandAccount.id,
          accountName: brandAccount.name,
          postingType: 'Debit',
          amountCents: absCents,
          description: `${invoiceId} ${label} (${brand})`,
        });
        pnlLines.push({
          accountId: parentAccountId,
          accountName: label,
          postingType: 'Credit',
          amountCents: absCents,
          description: `${invoiceId} ${label}`,
        });
      }
    }
  }

  return pnlLines;
}
