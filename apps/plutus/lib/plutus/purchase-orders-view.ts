export type PurchaseOrderProductAlias = {
  marketplace: string;
  aliasType: string;
  value: string;
  active: boolean;
};

export type PurchaseOrderProductLayer = {
  id: string;
  component: string;
  quantity: number | null;
  amountCents: number;
  currency: string;
  product: {
    id: string;
    name: string;
    productGroup: {
      code: string;
      name: string;
    };
    aliases: PurchaseOrderProductAlias[];
  };
};

export type PurchaseOrderProductSummary = {
  key: string;
  groupCode: string;
  productName: string;
  sku: string;
  quantity: number | null;
  currency: string;
  totalAmountCents: number;
  componentAmounts: Array<{
    component: string;
    amountCents: number;
  }>;
};

export type PurchaseOrderCurrencyTotal = {
  currency: string;
  amountCents: number;
};

const COMPONENT_ORDER = ['manufacturing', 'freight', 'duty', 'mfgAccessories'] as const;

function compareComponent(left: string, right: string): number {
  const leftIndex = COMPONENT_ORDER.findIndex((component) => component === left);
  const rightIndex = COMPONENT_ORDER.findIndex((component) => component === right);
  if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
  if (leftIndex !== -1) return -1;
  if (rightIndex !== -1) return 1;
  return left.localeCompare(right);
}

function resolveDisplaySku(marketplace: string | null, layer: PurchaseOrderProductLayer): string {
  const activeSkuAliases = layer.product.aliases
    .filter((alias) => alias.active)
    .filter((alias) => alias.aliasType.toUpperCase() === 'SKU');
  const marketplaceAliases =
    marketplace === null
      ? []
      : activeSkuAliases.filter((alias) => alias.marketplace === marketplace);
  const candidateAliases = marketplaceAliases.length > 0 ? marketplaceAliases : activeSkuAliases;
  const sortedAliases = [...candidateAliases].sort((left, right) => left.value.localeCompare(right.value));
  const firstAlias = sortedAliases[0];
  if (firstAlias !== undefined) return firstAlias.value;
  return layer.product.name;
}

export function buildPurchaseOrderProductSummaries(
  marketplace: string | null,
  layers: PurchaseOrderProductLayer[],
): PurchaseOrderProductSummary[] {
  const byProduct = new Map<string, PurchaseOrderProductSummary>();

  for (const layer of layers) {
    const key = `${layer.product.id}|${layer.currency}`;
    const existing = byProduct.get(key);
    if (existing === undefined) {
      byProduct.set(key, {
        key,
        groupCode: layer.product.productGroup.code,
        productName: layer.product.name,
        sku: resolveDisplaySku(marketplace, layer),
        quantity: layer.quantity,
        currency: layer.currency,
        totalAmountCents: layer.amountCents,
        componentAmounts: [{ component: layer.component, amountCents: layer.amountCents }],
      });
      continue;
    }

    if (layer.quantity !== null) {
      existing.quantity = (existing.quantity === null ? 0 : existing.quantity) + layer.quantity;
    }
    existing.totalAmountCents += layer.amountCents;
    const component = existing.componentAmounts.find((entry) => entry.component === layer.component);
    if (component === undefined) {
      existing.componentAmounts.push({ component: layer.component, amountCents: layer.amountCents });
    } else {
      component.amountCents += layer.amountCents;
    }
  }

  return Array.from(byProduct.values())
    .map((summary) => ({
      ...summary,
      componentAmounts: [...summary.componentAmounts].sort((left, right) =>
        compareComponent(left.component, right.component),
      ),
    }))
    .sort((left, right) => {
      const groupComparison = left.groupCode.localeCompare(right.groupCode);
      if (groupComparison !== 0) return groupComparison;
      const skuComparison = left.sku.localeCompare(right.sku);
      if (skuComparison !== 0) return skuComparison;
      return left.currency.localeCompare(right.currency);
    });
}

export function buildPurchaseOrderCurrencyTotals(
  layers: PurchaseOrderProductLayer[],
): PurchaseOrderCurrencyTotal[] {
  const totals = new Map<string, number>();

  for (const layer of layers) {
    const current = totals.get(layer.currency);
    totals.set(layer.currency, (current === undefined ? 0 : current) + layer.amountCents);
  }

  return Array.from(totals.entries())
    .map(([currency, amountCents]) => ({ currency, amountCents }))
    .sort((left, right) => left.currency.localeCompare(right.currency));
}
