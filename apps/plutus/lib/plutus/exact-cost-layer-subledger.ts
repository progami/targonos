import type { QboInventoryAssetComponent } from './qbo-inventory-asset-lines';

const COMPONENTS: QboInventoryAssetComponent[] = ['manufacturing', 'freight', 'duty', 'mfgAccessories'];

const COMPONENT_LABELS: Record<QboInventoryAssetComponent, string> = {
  manufacturing: 'Manufacturing',
  freight: 'Freight',
  duty: 'Duty',
  mfgAccessories: 'Mfg Accessories',
};

export type ComponentAmounts = Record<QboInventoryAssetComponent, number>;

export type ExactCostLayerInput = {
  layerId: string;
  marketplace: string;
  internalPo: string;
  sellerSku: string;
  receiptDate: string;
  quantity: number;
  componentAmounts: ComponentAmounts;
  sourceRefs: string[];
  qboBillLineRefs: string[];
};

export type ExactCostLayerConsumptionInput = {
  layerId: string;
  settlementDocNumber: string;
  sellerSku: string;
  quantity: number;
  componentAmounts: ComponentAmounts;
  totalAmount: number;
};

export type ExactInventoryValuationLayer = {
  layerId: string;
  marketplace: string;
  internalPo: string;
  sellerSku: string;
  receiptDate: string;
  quantityReceived: number;
  quantityConsumed: number;
  quantityRemaining: number;
  totalAmount: number;
  consumedAmount: number;
  remainingAmount: number;
  unitCost: number;
  componentRemainingAmounts: ComponentAmounts;
};

export type ExactInventoryValuation = {
  layers: ExactInventoryValuationLayer[];
  totalRemainingAmount: number;
};

export type ExactSoldUnitInput = {
  sellerSku: string;
  quantity: number;
};

export type ExactCogsConsumption = {
  layerId: string;
  settlementDocNumber: string;
  marketplace: string;
  internalPo: string;
  sellerSku: string;
  receiptDate: string;
  quantity: number;
  unitCost: number;
  componentUnitCosts: ComponentAmounts;
  componentAmounts: ComponentAmounts;
  totalAmount: number;
  sourceRefs: string[];
  qboBillLineRefs: string[];
};

export type ExactCogsBlock = {
  code: 'INSUFFICIENT_INVENTORY_LAYER';
  sellerSku: string;
  requestedQuantity: number;
  availableQuantity: number;
  missingQuantity: number;
};

export type ExactCogsJournalLineDraft = {
  accountId: string;
  postingType: 'Debit' | 'Credit';
  amount: number;
  description: string;
};

export type ExactCogsJournalEntryDraft = {
  txnDate: string;
  docNumber: string;
  privateNote: string;
  lines: ExactCogsJournalLineDraft[];
};

export type ExactCogsPlan = {
  ok: boolean;
  blocks: ExactCogsBlock[];
  consumptions: ExactCogsConsumption[];
  componentTotals: ComponentAmounts;
  qboJournalEntryDraft: ExactCogsJournalEntryDraft | null;
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundUnitCost(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

function emptyComponentAmounts(): ComponentAmounts {
  return {
    manufacturing: 0,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  };
}

function normalizeSku(value: string): string {
  return value.trim().toUpperCase();
}

function layerTotal(layer: Pick<ExactCostLayerInput, 'componentAmounts'>): number {
  return roundMoney(COMPONENTS.reduce((sum, component) => sum + layer.componentAmounts[component], 0));
}

function validateLayer(layer: ExactCostLayerInput): void {
  if (layer.layerId.trim() === '') throw new Error('Exact cost layer requires layerId');
  if (layer.marketplace.trim() === '') throw new Error(`Exact cost layer ${layer.layerId} requires marketplace`);
  if (layer.internalPo.trim() === '') throw new Error(`Exact cost layer ${layer.layerId} requires internalPo`);
  if (layer.sellerSku.trim() === '') throw new Error(`Exact cost layer ${layer.layerId} requires sellerSku`);
  if (layer.receiptDate.trim() === '') throw new Error(`Exact cost layer ${layer.layerId} requires receiptDate`);
  if (!Number.isInteger(layer.quantity) || layer.quantity <= 0) {
    throw new Error(`Exact cost layer ${layer.layerId} requires positive integer quantity`);
  }
  for (const component of COMPONENTS) {
    const amount = layer.componentAmounts[component];
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error(`Exact cost layer ${layer.layerId} has invalid ${component} amount`);
    }
  }
}

function totalUnitCost(layer: ExactCostLayerInput): number {
  return roundUnitCost(layerTotal(layer) / layer.quantity);
}

function prorateComponents(layer: ExactCostLayerInput, quantity: number): ComponentAmounts {
  const amounts = emptyComponentAmounts();
  for (const component of COMPONENTS) {
    amounts[component] = roundMoney((layer.componentAmounts[component] / layer.quantity) * quantity);
  }
  return amounts;
}

function componentUnitCosts(layer: ExactCostLayerInput): ComponentAmounts {
  const unitCosts = emptyComponentAmounts();
  for (const component of COMPONENTS) {
    unitCosts[component] = roundUnitCost(layer.componentAmounts[component] / layer.quantity);
  }
  return unitCosts;
}

function addComponentAmounts(left: ComponentAmounts, right: ComponentAmounts): ComponentAmounts {
  const next = emptyComponentAmounts();
  for (const component of COMPONENTS) {
    next[component] = roundMoney(left[component] + right[component]);
  }
  return next;
}

function subtractComponentAmounts(left: ComponentAmounts, right: ComponentAmounts): ComponentAmounts {
  const next = emptyComponentAmounts();
  for (const component of COMPONENTS) {
    next[component] = roundMoney(left[component] - right[component]);
  }
  return next;
}

function sumComponents(amounts: ComponentAmounts): number {
  return roundMoney(COMPONENTS.reduce((sum, component) => sum + amounts[component], 0));
}

function consumedByLayer(
  consumptions: ExactCostLayerConsumptionInput[],
): Map<string, { quantity: number; componentAmounts: ComponentAmounts; totalAmount: number }> {
  const consumed = new Map<string, { quantity: number; componentAmounts: ComponentAmounts; totalAmount: number }>();
  for (const consumption of consumptions) {
    const existing = consumed.get(consumption.layerId) ?? {
      quantity: 0,
      componentAmounts: emptyComponentAmounts(),
      totalAmount: 0,
    };
    consumed.set(consumption.layerId, {
      quantity: existing.quantity + consumption.quantity,
      componentAmounts: addComponentAmounts(existing.componentAmounts, consumption.componentAmounts),
      totalAmount: roundMoney(existing.totalAmount + consumption.totalAmount),
    });
  }
  return consumed;
}

function sortLayersForFifo(layers: ExactCostLayerInput[]): ExactCostLayerInput[] {
  return layers.slice().sort((left, right) => {
    const dateCompare = left.receiptDate.localeCompare(right.receiptDate);
    if (dateCompare !== 0) return dateCompare;
    const poCompare = left.internalPo.localeCompare(right.internalPo);
    if (poCompare !== 0) return poCompare;
    return left.layerId.localeCompare(right.layerId);
  });
}

export function buildPlutusInventoryValuation(input: {
  layers: ExactCostLayerInput[];
  consumptions: ExactCostLayerConsumptionInput[];
}): ExactInventoryValuation {
  const priorConsumedByLayer = consumedByLayer(input.consumptions);

  const layers = sortLayersForFifo(input.layers).map((layer) => {
    validateLayer(layer);
    const consumed = priorConsumedByLayer.get(layer.layerId) ?? {
      quantity: 0,
      componentAmounts: emptyComponentAmounts(),
      totalAmount: 0,
    };
    const totalAmount = layerTotal(layer);
    const quantityRemaining = layer.quantity - consumed.quantity;
    if (quantityRemaining < 0) {
      throw new Error(`Exact cost layer ${layer.layerId} is over-consumed by ${Math.abs(quantityRemaining)} units`);
    }

    return {
      layerId: layer.layerId,
      marketplace: layer.marketplace,
      internalPo: layer.internalPo,
      sellerSku: normalizeSku(layer.sellerSku),
      receiptDate: layer.receiptDate,
      quantityReceived: layer.quantity,
      quantityConsumed: consumed.quantity,
      quantityRemaining,
      totalAmount,
      consumedAmount: consumed.totalAmount,
      remainingAmount: roundMoney(totalAmount - consumed.totalAmount),
      unitCost: totalUnitCost(layer),
      componentRemainingAmounts: subtractComponentAmounts(layer.componentAmounts, consumed.componentAmounts),
    };
  });

  return {
    layers,
    totalRemainingAmount: roundMoney(layers.reduce((sum, layer) => sum + layer.remainingAmount, 0)),
  };
}

function buildJournalEntry(input: {
  settlementDocNumber: string;
  marketplace: string;
  txnDate: string;
  consumptions: ExactCogsConsumption[];
  componentAccountIds: ComponentAmountsAsAccountIds;
  inventoryAssetAccountId: string;
}): ExactCogsJournalEntryDraft {
  const lines: ExactCogsJournalLineDraft[] = [];
  for (const consumption of input.consumptions) {
    for (const component of COMPONENTS) {
      const amount = consumption.componentAmounts[component];
      if (amount === 0) continue;
      lines.push({
        accountId: input.componentAccountIds[component],
        postingType: 'Debit',
        amount,
        description: `${COMPONENT_LABELS[component]} COGS; SKU=${consumption.sellerSku}; PO=${consumption.internalPo}; QTY=${consumption.quantity}; UNIT=${componentUnitCostForConsumption(consumption, component)}`,
      });
    }
    lines.push({
      accountId: input.inventoryAssetAccountId,
      postingType: 'Credit',
      amount: consumption.totalAmount,
      description: `Inventory Asset release; SKU=${consumption.sellerSku}; PO=${consumption.internalPo}; QTY=${consumption.quantity}; UNIT=${consumption.unitCost.toFixed(6)}`,
    });
  }

  return {
    txnDate: input.txnDate,
    docNumber: `COGS-${input.settlementDocNumber}`,
    privateNote: `Plutus exact COGS | Settlement: ${input.settlementDocNumber} | Marketplace: ${input.marketplace}`,
    lines,
  };
}

function componentUnitCostForConsumption(
  consumption: ExactCogsConsumption,
  component: QboInventoryAssetComponent,
): string {
  return consumption.componentUnitCosts[component].toFixed(6);
}

type ComponentAmountsAsAccountIds = Record<QboInventoryAssetComponent, string>;

export function buildExactCogsPlan(input: {
  marketplace: string;
  settlementDocNumber: string;
  txnDate: string;
  soldUnits: ExactSoldUnitInput[];
  layers: ExactCostLayerInput[];
  priorConsumptions?: ExactCostLayerConsumptionInput[];
  componentAccountIds: ComponentAmountsAsAccountIds;
  inventoryAssetAccountId: string;
}): ExactCogsPlan {
  const normalizedLayers = input.layers.map((layer) => {
    validateLayer(layer);
    return { ...layer, sellerSku: normalizeSku(layer.sellerSku) };
  });
  const soldUnits = input.soldUnits
    .map((unit) => ({ sellerSku: normalizeSku(unit.sellerSku), quantity: unit.quantity }))
    .filter((unit) => unit.quantity > 0);

  const priorConsumedByLayer = consumedByLayer(input.priorConsumptions ?? []);

  const availableBySku = new Map<string, number>();
  for (const layer of normalizedLayers) {
    if (layer.marketplace !== input.marketplace) continue;
    const priorConsumedQuantity = priorConsumedByLayer.get(layer.layerId)?.quantity ?? 0;
    const availableQuantity = layer.quantity - priorConsumedQuantity;
    if (availableQuantity < 0) {
      throw new Error(`Exact cost layer ${layer.layerId} is over-consumed by ${Math.abs(availableQuantity)} units`);
    }
    availableBySku.set(layer.sellerSku, (availableBySku.get(layer.sellerSku) ?? 0) + availableQuantity);
  }

  const requestedBySku = new Map<string, number>();
  for (const unit of soldUnits) {
    requestedBySku.set(unit.sellerSku, (requestedBySku.get(unit.sellerSku) ?? 0) + unit.quantity);
  }

  const blocks: ExactCogsBlock[] = [];
  for (const [sellerSku, requestedQuantity] of requestedBySku.entries()) {
    const availableQuantity = availableBySku.get(sellerSku) ?? 0;
    if (availableQuantity < requestedQuantity) {
      blocks.push({
        code: 'INSUFFICIENT_INVENTORY_LAYER',
        sellerSku,
        requestedQuantity,
        availableQuantity,
        missingQuantity: requestedQuantity - availableQuantity,
      });
    }
  }

  if (blocks.length > 0) {
    return {
      ok: false,
      blocks,
      consumptions: [],
      componentTotals: emptyComponentAmounts(),
      qboJournalEntryDraft: null,
    };
  }

  const layersBySku = new Map<string, Array<ExactCostLayerInput & { remainingQuantity: number }>>();
  for (const layer of sortLayersForFifo(normalizedLayers.filter((layer) => layer.marketplace === input.marketplace))) {
    const priorConsumedQuantity = priorConsumedByLayer.get(layer.layerId)?.quantity ?? 0;
    const existing = layersBySku.get(layer.sellerSku) ?? [];
    existing.push({ ...layer, remainingQuantity: layer.quantity - priorConsumedQuantity });
    layersBySku.set(layer.sellerSku, existing);
  }

  const consumptions: ExactCogsConsumption[] = [];
  for (const [sellerSku, requestedQuantity] of requestedBySku.entries()) {
    let remainingToConsume = requestedQuantity;
    const skuLayers = layersBySku.get(sellerSku) ?? [];
    for (const layer of skuLayers) {
      if (remainingToConsume === 0) break;
      if (layer.remainingQuantity === 0) continue;
      const quantity = Math.min(layer.remainingQuantity, remainingToConsume);
      const componentAmounts = prorateComponents(layer, quantity);
      consumptions.push({
        layerId: layer.layerId,
        settlementDocNumber: input.settlementDocNumber,
        marketplace: input.marketplace,
        internalPo: layer.internalPo,
        sellerSku,
        receiptDate: layer.receiptDate,
        quantity,
        unitCost: totalUnitCost(layer),
        componentUnitCosts: componentUnitCosts(layer),
        componentAmounts,
        totalAmount: sumComponents(componentAmounts),
        sourceRefs: layer.sourceRefs.slice(),
        qboBillLineRefs: layer.qboBillLineRefs.slice(),
      });
      layer.remainingQuantity -= quantity;
      remainingToConsume -= quantity;
    }
  }

  const componentTotals = consumptions.reduce(
    (totals, consumption) => addComponentAmounts(totals, consumption.componentAmounts),
    emptyComponentAmounts(),
  );

  return {
    ok: true,
    blocks: [],
    consumptions,
    componentTotals,
    qboJournalEntryDraft: buildJournalEntry({
      settlementDocNumber: input.settlementDocNumber,
      marketplace: input.marketplace,
      txnDate: input.txnDate,
      consumptions,
      componentAccountIds: input.componentAccountIds,
      inventoryAssetAccountId: input.inventoryAssetAccountId,
    }),
  };
}
