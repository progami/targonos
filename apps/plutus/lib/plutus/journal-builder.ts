import type { QboAccount } from '@/lib/qbo/api';
import type { InventoryComponent } from '@/lib/inventory/ledger';
import type { ProcessingBlock, JournalEntryLinePreview } from './settlement-types';
import { findRequiredSubAccountId } from './settlement-validation';

export type CogsTraceLine = {
  sku: string;
  internalPo: string;
  externalPi: string;
  amountCents: number;
};

export type CogsTraceLinesByBrandComponent = Partial<Record<string, Partial<Record<InventoryComponent, CogsTraceLine[]>>>>;

function componentLabels(component: InventoryComponent): {
  invParentKey: string;
  cogsParentKey: string;
  invLabel: string;
  cogsLabel: string;
} {
  if (component === 'manufacturing') {
    return {
      invParentKey: 'invManufacturing',
      cogsParentKey: 'cogsManufacturing',
      invLabel: 'Manufacturing',
      cogsLabel: 'Manufacturing',
    };
  }
  if (component === 'freight') {
    return {
      invParentKey: 'invFreight',
      cogsParentKey: 'cogsFreight',
      invLabel: 'Freight',
      cogsLabel: 'Freight',
    };
  }
  if (component === 'duty') {
    return {
      invParentKey: 'invDuty',
      cogsParentKey: 'cogsDuty',
      invLabel: 'Duty',
      cogsLabel: 'Duty',
    };
  }

  return {
    invParentKey: 'invMfgAccessories',
    cogsParentKey: 'cogsMfgAccessories',
    invLabel: 'Mfg Accessories',
    cogsLabel: 'Mfg Accessories',
  };
}

function hasRequiredTraceValue(value: string): boolean {
  const trimmed = value.trim();
  return trimmed !== '' && trimmed.toUpperCase() !== 'N/A';
}

function traceDescription(label: string, suffix: string, trace: CogsTraceLine): string {
  return `${label}${suffix}; SKU: ${trace.sku.trim()}; Internal PO: ${trace.internalPo.trim()}; External PI: ${trace.externalPi.trim()}`;
}

function addTraceBlock(
  blocks: ProcessingBlock[],
  brand: string,
  component: InventoryComponent,
  details: Record<string, string | number>,
): void {
  blocks.push({
    code: 'COGS_TRACE_METADATA_MISSING',
    message: 'COGS line missing SKU PO PI trace metadata',
    details: { brand, component, ...details },
  });
}

export function buildCogsJournalLines(
  netCogsByBrand: Record<string, Record<InventoryComponent, number>>,
  brandNames: string[],
  mapping: Record<string, string | undefined>,
  accounts: QboAccount[],
  _invoiceId: string,
  blocks: ProcessingBlock[],
  _skuBreakdownByBrandComponent?: Record<string, Record<InventoryComponent, Record<string, number>>>,
  traceLinesByBrandComponent?: CogsTraceLinesByBrandComponent,
): JournalEntryLinePreview[] {
  const cogsLines: JournalEntryLinePreview[] = [];

  for (const brand of brandNames) {
    const componentTotals = netCogsByBrand[brand];
    if (!componentTotals) continue;

    for (const component of Object.keys(componentTotals) as InventoryComponent[]) {
      const cents = componentTotals[component];
      if (cents === 0) continue;

      const { invParentKey, cogsParentKey, invLabel, cogsLabel } = componentLabels(component);

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

      const traceByComponent = traceLinesByBrandComponent ? traceLinesByBrandComponent[brand] : undefined;
      const traceLines = traceByComponent ? traceByComponent[component] : undefined;
      if (!traceLines || traceLines.length === 0) {
        addTraceBlock(blocks, brand, component, { expectedCents: cents });
        continue;
      }

      let traceCents = 0;
      let hasInvalidTrace = false;
      traceLines.forEach((trace, index) => {
        if (
          !hasRequiredTraceValue(trace.sku) ||
          !hasRequiredTraceValue(trace.internalPo) ||
          !hasRequiredTraceValue(trace.externalPi) ||
          !Number.isFinite(trace.amountCents) ||
          !Number.isInteger(trace.amountCents) ||
          trace.amountCents === 0
        ) {
          hasInvalidTrace = true;
          addTraceBlock(blocks, brand, component, { traceIndex: index });
        }
        traceCents += trace.amountCents;
      });
      if (hasInvalidTrace) {
        continue;
      }
      if (traceCents !== cents) {
        addTraceBlock(blocks, brand, component, { expectedCents: cents, traceCents });
        continue;
      }

      for (const trace of traceLines) {
        const absCents = Math.abs(trace.amountCents);
        if (trace.amountCents > 0) {
          // Sale: Debit COGS, Credit Inventory.
          cogsLines.push({
            accountId: cogsAccount.id,
            accountName: cogsAccount.name,
            accountFullyQualifiedName: cogsAccount.fullyQualifiedName,
            accountNumber: cogsAccount.acctNum,
            postingType: 'Debit',
            amountCents: absCents,
            description: traceDescription(`${cogsLabel} COGS`, '', trace),
          });
          cogsLines.push({
            accountId: invAccount.id,
            accountName: invAccount.name,
            accountFullyQualifiedName: invAccount.fullyQualifiedName,
            accountNumber: invAccount.acctNum,
            postingType: 'Credit',
            amountCents: absCents,
            description: traceDescription(`${invLabel} inventory`, '', trace),
          });
          continue;
        }

        // Return: Debit Inventory, Credit COGS.
        cogsLines.push({
          accountId: invAccount.id,
          accountName: invAccount.name,
          accountFullyQualifiedName: invAccount.fullyQualifiedName,
          accountNumber: invAccount.acctNum,
          postingType: 'Debit',
          amountCents: absCents,
          description: traceDescription(`${invLabel} inventory`, ' (return)', trace),
        });
        cogsLines.push({
          accountId: cogsAccount.id,
          accountName: cogsAccount.name,
          accountFullyQualifiedName: cogsAccount.fullyQualifiedName,
          accountNumber: cogsAccount.acctNum,
          postingType: 'Credit',
          amountCents: absCents,
          description: traceDescription(`${cogsLabel} COGS`, ' (return)', trace),
        });
      }
    }
  }

  return cogsLines;
}
