export type QboInventoryAssetComponent = 'manufacturing' | 'freight' | 'duty' | 'mfgAccessories';

export type QboInventoryAssetPurchaseOrderSourceType = 'QBO_PURCHASE_ORDER' | 'LEGACY_INTERNAL_PO';

export type QboInventoryAssetLineNativePurchaseOrderRef = {
  qboPurchaseOrderId: string;
  qboPurchaseOrderLineId: string | null;
  qboPurchaseOrderDocNumber: string;
  qboItemId: string | null;
  qboItemName: string | null;
  quantity: number | null;
};

export type QboInventoryAssetLineAllocation = {
  qboPurchaseOrderId: string;
  qboPurchaseOrderLineId: string;
  qboPurchaseOrderDocNumber: string;
  sellerSku: string;
  component: QboInventoryAssetComponent;
  amount: number;
  quantity: number | null;
  allocationMethod: string;
  sourceRef: string | null;
};

export type QboInventoryAssetLineInput = {
  billId: string;
  billDocNumber?: string;
  billDate: string;
  vendorName?: string;
  qboLineId: string;
  accountName: string;
  amount: number;
  description?: string;
  qboItemId?: string;
  qboItemName?: string;
  qboQuantity?: number;
  nativePurchaseOrderRef?: QboInventoryAssetLineNativePurchaseOrderRef;
  landedCostAllocation?: QboInventoryAssetLineAllocation;
};

export type ParsedQboInventoryAssetLine = {
  billId: string;
  billDocNumber?: string;
  billDate: string;
  vendorName?: string;
  qboLineId: string;
  accountName: string;
  amount: number;
  purchaseOrderSourceType: QboInventoryAssetPurchaseOrderSourceType;
  purchaseOrderSourceId: string;
  qboPurchaseOrderId: string | null;
  qboPurchaseOrderLineId: string | null;
  qboItemId: string | null;
  qboItemName: string | null;
  component: QboInventoryAssetComponent;
  marketCode: string | null;
  descriptionKind: string;
  owner: string | null;
  internalPo: string | null;
  sellerSku: string | null;
  quantity: number | null;
  sourceRef: string | null;
};

export type QboInventoryLandedCostLayer = {
  internalPo: string;
  purchaseOrderSourceType: QboInventoryAssetPurchaseOrderSourceType;
  purchaseOrderSourceId: string;
  qboPurchaseOrderId: string | null;
  qboPurchaseOrderLineIds: string[];
  sellerSku: string;
  quantity: number;
  componentAmounts: Record<QboInventoryAssetComponent, number>;
  totalAmount: number;
  unitCost: number;
  sourceRefs: string[];
  qboSourceLineKeys: string[];
  qboBillLineRefs: string[];
};

export type QboInventoryAssetBlock =
  | {
      code: 'NON_SKU_ASSET_LINE';
      billId: string;
      qboLineId: string;
      owner: string | null;
    }
  | {
      code: 'RESIDUAL_ASSET_LINE';
      billId: string;
      qboLineId: string;
      owner: string;
      sellerSku: string;
    }
  | {
      code: 'MISSING_INTERNAL_PO';
      billId: string;
      qboLineId: string;
      owner: string | null;
      sellerSku: string;
    }
  | {
      code: 'MISSING_MANUFACTURING_QUANTITY';
      internalPo: string;
      sellerSku: string;
    };

export type QboInventoryLandedCostPlan = {
  marketplace: string;
  marketCode: string;
  parsedLines: ParsedQboInventoryAssetLine[];
  layers: QboInventoryLandedCostLayer[];
  blocks: QboInventoryAssetBlock[];
};

export type QboInventoryAssetReclassReason =
  | 'NON_TARGET_MARKET_ASSET_LINE'
  | 'NON_SKU_ASSET_LINE'
  | 'RESIDUAL_ASSET_LINE'
  | 'MISSING_INTERNAL_PO'
  | 'UNPARSEABLE_ASSET_LINE';

export type QboInventoryAssetReclassLine = QboInventoryAssetLineInput & {
  reason: QboInventoryAssetReclassReason;
};

export type QboInventoryAssetReclassPlan = {
  marketplace: string;
  marketCode: string;
  lines: QboInventoryAssetReclassLine[];
  totalAmount: number;
};

type ComponentAccountContract = {
  component: QboInventoryAssetComponent;
  leafPrefix: string;
  descriptionKind: string;
};

const COMPONENT_ACCOUNT_CONTRACTS: ComponentAccountContract[] = [
  { component: 'manufacturing', leafPrefix: 'Manufacturing - ', descriptionKind: 'MFG' },
  { component: 'freight', leafPrefix: 'Freight - ', descriptionKind: 'FREIGHT' },
  { component: 'duty', leafPrefix: 'Duty - ', descriptionKind: 'DUTY' },
  { component: 'mfgAccessories', leafPrefix: 'Mfg Accessories - ', descriptionKind: 'PKG' },
];

const COMPONENTS: QboInventoryAssetComponent[] = ['manufacturing', 'freight', 'duty', 'mfgAccessories'];

function marketCodeForMarketplace(marketplace: string): string {
  if (marketplace === 'amazon.com') return 'US-PDS';
  if (marketplace === 'amazon.co.uk') return 'UK-PDS';
  throw new Error(`Unsupported QBO inventory marketplace: ${marketplace}`);
}

function accountLeaf(accountName: string): string {
  const parts = accountName.split(':');
  const leaf = parts[parts.length - 1];
  if (leaf === undefined) throw new Error(`Cannot parse QBO account leaf: ${accountName}`);
  return leaf.trim();
}

function parseComponentAccount(accountName: string): {
  component: QboInventoryAssetComponent | null;
  marketCode: string | null;
  descriptionKind: string | null;
} {
  const leaf = accountLeaf(accountName);
  if (leaf === 'Inventory Asset') {
    return {
      component: null,
      marketCode: null,
      descriptionKind: null,
    };
  }

  for (const contract of COMPONENT_ACCOUNT_CONTRACTS) {
    if (!leaf.startsWith(contract.leafPrefix)) continue;
    const marketCode = leaf.slice(contract.leafPrefix.length).trim();
    if (marketCode === '') throw new Error(`QBO inventory asset account is missing market code: ${accountName}`);
    return {
      component: contract.component,
      marketCode,
      descriptionKind: contract.descriptionKind,
    };
  }

  throw new Error(`Unsupported QBO inventory asset account: ${accountName}`);
}

function componentForDescriptionKind(kind: string): QboInventoryAssetComponent {
  for (const contract of COMPONENT_ACCOUNT_CONTRACTS) {
    if (contract.descriptionKind === kind) return contract.component;
  }
  throw new Error(`Unsupported QBO inventory asset line kind: ${kind}`);
}

function descriptionKindForComponent(component: QboInventoryAssetComponent): string {
  for (const contract of COMPONENT_ACCOUNT_CONTRACTS) {
    if (contract.component === component) return contract.descriptionKind;
  }
  throw new Error(`Unsupported QBO inventory asset component: ${component}`);
}

function marketCodeFromOwner(owner: string | null): string | null {
  if (owner === null) return null;
  const normalized = owner.trim().toUpperCase();
  if (normalized === 'US' || normalized === 'US-PDS') return 'US-PDS';
  if (normalized === 'UK' || normalized === 'UK-PDS') return 'UK-PDS';
  return null;
}

function normalizeTokenValue(value: string): string {
  return value.trim();
}

function parseDescription(description: string): { kind: string; values: Map<string, string> } {
  const segments = description
    .split(';')
    .map((segment) => segment.trim())
    .filter((segment) => segment !== '');

  const firstSegment = segments[0];
  if (firstSegment === undefined) throw new Error('QBO inventory asset line description is empty');
  if (firstSegment.includes('=')) throw new Error(`QBO inventory asset line kind is missing: ${description}`);

  const values = new Map<string, string>();
  for (const segment of segments.slice(1)) {
    const equalsIndex = segment.indexOf('=');
    if (equalsIndex === -1) {
      throw new Error(`QBO inventory asset line segment is not KEY=VALUE: ${segment}`);
    }
    const key = segment.slice(0, equalsIndex).trim().toUpperCase();
    const value = normalizeTokenValue(segment.slice(equalsIndex + 1));
    if (key === '') throw new Error(`QBO inventory asset line segment has empty key: ${segment}`);
    values.set(key, value);
  }

  return {
    kind: firstSegment.trim().toUpperCase(),
    values,
  };
}

function nullableToken(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim();
  if (normalized === '') return null;
  if (normalized.toUpperCase() === 'N/A') return null;
  return normalized;
}

function normalizeSku(value: string | null): string | null {
  if (value === null) return null;
  return value.toUpperCase();
}

function nativeSku(input: QboInventoryAssetLineInput): string | null {
  const nativeItemName = input.nativePurchaseOrderRef?.qboItemName ?? input.qboItemName;
  return normalizeSku(nullableToken(nativeItemName));
}

function nativeItemId(input: QboInventoryAssetLineInput): string | null {
  return nullableToken(input.nativePurchaseOrderRef?.qboItemId ?? input.qboItemId);
}

function nativeQuantity(input: QboInventoryAssetLineInput): number | null {
  const quantity = input.nativePurchaseOrderRef?.quantity ?? input.qboQuantity;
  if (quantity === undefined || quantity === null) return null;
  if (!Number.isFinite(quantity)) throw new Error(`QBO inventory asset quantity is not finite: ${quantity}`);
  return Math.trunc(quantity);
}

function parseQuantity(value: string | undefined): number | null {
  if (value === undefined) return null;
  const match = value.trim().match(/^([0-9]+)(?:\.[0-9]+)?/);
  if (match === null) throw new Error(`QBO inventory asset quantity is not numeric: ${value}`);
  const numericValue = Number(match[1]);
  if (!Number.isFinite(numericValue)) throw new Error(`QBO inventory asset quantity is not finite: ${value}`);
  return numericValue;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundUnitCost(value: number): number {
  return Math.round(value * 1000000) / 1000000;
}

function createComponentAmounts(): Record<QboInventoryAssetComponent, number> {
  return {
    manufacturing: 0,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  };
}

function pushUnique(values: string[], value: string | null): void {
  if (value === null) return;
  if (values.includes(value)) return;
  values.push(value);
}

function qboSourceLineKey(line: ParsedQboInventoryAssetLine): string {
  return [
    line.billId,
    line.qboLineId,
    line.purchaseOrderSourceType,
    line.purchaseOrderSourceId,
    line.sellerSku ?? 'NO_SKU',
    line.component,
  ].join(':');
}

function isInventoryAssetAccountName(accountName: string): boolean {
  return accountName === 'Inventory Asset' || accountName.startsWith('Inventory Asset:');
}

export function parseQboInventoryAssetLine(input: QboInventoryAssetLineInput): ParsedQboInventoryAssetLine {
  const hasNativePo = input.nativePurchaseOrderRef !== undefined;
  const allocation = input.landedCostAllocation;
  if (hasNativePo && allocation !== undefined) {
    throw new Error(`QBO inventory asset line ${input.billId}:${input.qboLineId} has both native PO and Plutus allocation`);
  }

  const description = input.description?.trim();
  const needsDescription = !hasNativePo && allocation === undefined;
  if (needsDescription && (description === undefined || description === '')) {
    throw new Error(`QBO inventory asset line ${input.billId}:${input.qboLineId} is missing description`);
  }

  const parsedDescription = description !== undefined && description !== '' ? parseDescription(description) : null;
  const account = parseComponentAccount(input.accountName);
  const component =
    allocation?.component ??
    account.component ??
    (parsedDescription !== null
      ? componentForDescriptionKind(parsedDescription.kind)
      : hasNativePo
        ? 'manufacturing'
        : null);
  if (component === null) {
    throw new Error(`QBO inventory asset line ${input.billId}:${input.qboLineId} cannot resolve component`);
  }
  if (account.descriptionKind !== null && parsedDescription !== null && parsedDescription.kind !== account.descriptionKind) {
    throw new Error(
      `QBO inventory asset line ${input.billId}:${input.qboLineId} kind ${parsedDescription.kind} does not match account ${input.accountName}`,
    );
  }
  if (account.component !== null && allocation !== undefined && account.component !== allocation.component) {
    throw new Error(
      `QBO inventory asset allocation ${input.billId}:${input.qboLineId} component ${allocation.component} does not match account ${input.accountName}`,
    );
  }

  const owner = nullableToken(parsedDescription?.values.get('OWNER'));
  const explicitPo = nullableToken(parsedDescription?.values.get('PO'));
  const internalPo =
    input.nativePurchaseOrderRef?.qboPurchaseOrderDocNumber ??
    allocation?.qboPurchaseOrderDocNumber ??
    (explicitPo !== null
      ? explicitPo
      : owner !== null && owner.toUpperCase().startsWith('PO-')
        ? owner
        : null);
  const skuToken = component === 'mfgAccessories'
    ? nullableToken(parsedDescription?.values.get('FOR_SKU'))
    : nullableToken(parsedDescription?.values.get('SKU'));
  const sellerSku = normalizeSku(allocation?.sellerSku ?? nativeSku(input) ?? skuToken);
  const quantity = allocation?.quantity ?? nativeQuantity(input) ?? parseQuantity(parsedDescription?.values.get('QTY'));
  const sourceRef = allocation?.sourceRef ?? nullableToken(parsedDescription?.values.get('SOURCE')) ?? input.billDocNumber ?? null;
  const amount = allocation?.amount ?? input.amount;
  const qboPurchaseOrderId = input.nativePurchaseOrderRef?.qboPurchaseOrderId ?? allocation?.qboPurchaseOrderId ?? null;
  const qboPurchaseOrderLineId = input.nativePurchaseOrderRef?.qboPurchaseOrderLineId ?? allocation?.qboPurchaseOrderLineId ?? null;
  const purchaseOrderSourceType: QboInventoryAssetPurchaseOrderSourceType =
    qboPurchaseOrderId !== null ? 'QBO_PURCHASE_ORDER' : 'LEGACY_INTERNAL_PO';
  const purchaseOrderSourceId = qboPurchaseOrderId ?? internalPo ?? `UNASSIGNED:${input.billId}:${input.qboLineId}`;

  return {
    billId: input.billId,
    ...(input.billDocNumber !== undefined ? { billDocNumber: input.billDocNumber } : {}),
    billDate: input.billDate,
    ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
    qboLineId: input.qboLineId,
    accountName: input.accountName,
    amount,
    purchaseOrderSourceType,
    purchaseOrderSourceId,
    qboPurchaseOrderId,
    qboPurchaseOrderLineId,
    qboItemId: nativeItemId(input),
    qboItemName: input.nativePurchaseOrderRef?.qboItemName ?? input.qboItemName ?? null,
    component,
    marketCode: account.marketCode ?? marketCodeFromOwner(owner),
    descriptionKind: parsedDescription?.kind ?? descriptionKindForComponent(component),
    owner,
    internalPo,
    sellerSku,
    quantity,
    sourceRef,
  };
}

export function buildQboInventoryLandedCostPlan(input: {
  marketplace: string;
  lines: QboInventoryAssetLineInput[];
}): QboInventoryLandedCostPlan {
  const targetMarketCode = marketCodeForMarketplace(input.marketplace);
  const parsedLines: ParsedQboInventoryAssetLine[] = [];
  for (const line of input.lines) {
    const account = parseComponentAccount(line.accountName);
    if (account.marketCode !== null && account.marketCode !== targetMarketCode) continue;
    const description = line.description?.trim().toUpperCase();
    const hasStructuredDescription = COMPONENT_ACCOUNT_CONTRACTS.some((contract) => description?.startsWith(`${contract.descriptionKind};`));
    const hasNativePurchaseEvidence = line.nativePurchaseOrderRef !== undefined || line.landedCostAllocation !== undefined;
    if (account.marketCode === null && !hasStructuredDescription && !hasNativePurchaseEvidence) {
      continue;
    }
    parsedLines.push(parseQboInventoryAssetLine(line));
  }
  const marketByPo = new Map<string, string>();
  for (const line of parsedLines) {
    if (line.internalPo === null || line.marketCode === null) continue;
    marketByPo.set(line.internalPo, line.marketCode);
  }
  const marketLines = parsedLines.filter((line) => {
    if (line.marketCode !== null) return line.marketCode === targetMarketCode;
    if (line.owner === 'RESIDUAL') return true;
    if (line.qboPurchaseOrderId !== null) return true;
    if (line.internalPo === null) return false;
    return marketByPo.get(line.internalPo) === targetMarketCode;
  });

  const blocks: QboInventoryAssetBlock[] = [];
  const groupByPoSku = new Map<
    string,
    {
      internalPo: string;
      purchaseOrderSourceType: QboInventoryAssetPurchaseOrderSourceType;
      purchaseOrderSourceId: string;
      qboPurchaseOrderId: string | null;
      qboPurchaseOrderLineIds: string[];
      sellerSku: string;
      manufacturingQuantity: number;
      componentAmounts: Record<QboInventoryAssetComponent, number>;
      sourceRefs: string[];
      qboSourceLineKeys: string[];
      qboBillLineRefs: string[];
    }
  >();

  for (const line of marketLines) {
    if (line.sellerSku === null) {
      blocks.push({ code: 'NON_SKU_ASSET_LINE', billId: line.billId, qboLineId: line.qboLineId, owner: line.owner });
      continue;
    }

    if (line.owner === 'RESIDUAL') {
      blocks.push({
        code: 'RESIDUAL_ASSET_LINE',
        billId: line.billId,
        qboLineId: line.qboLineId,
        owner: line.owner,
        sellerSku: line.sellerSku,
      });
      continue;
    }

    if (line.internalPo === null) {
      blocks.push({
        code: 'MISSING_INTERNAL_PO',
        billId: line.billId,
        qboLineId: line.qboLineId,
        owner: line.owner,
        sellerSku: line.sellerSku,
      });
      continue;
    }

    const key = `${line.purchaseOrderSourceType}\u0000${line.purchaseOrderSourceId}\u0000${line.sellerSku}`;
    let group = groupByPoSku.get(key);
    if (group === undefined) {
      group = {
        internalPo: line.internalPo,
        purchaseOrderSourceType: line.purchaseOrderSourceType,
        purchaseOrderSourceId: line.purchaseOrderSourceId,
        qboPurchaseOrderId: line.qboPurchaseOrderId,
        qboPurchaseOrderLineIds: [],
        sellerSku: line.sellerSku,
        manufacturingQuantity: 0,
        componentAmounts: createComponentAmounts(),
        sourceRefs: [],
        qboSourceLineKeys: [],
        qboBillLineRefs: [],
      };
      groupByPoSku.set(key, group);
    }

    group.componentAmounts[line.component] = roundMoney(group.componentAmounts[line.component] + line.amount);
    pushUnique(group.qboPurchaseOrderLineIds, line.qboPurchaseOrderLineId);
    if (line.component === 'manufacturing') {
      if (line.quantity === null) {
        blocks.push({ code: 'MISSING_MANUFACTURING_QUANTITY', internalPo: line.internalPo, sellerSku: line.sellerSku });
      } else {
        group.manufacturingQuantity += line.quantity;
      }
    }
    pushUnique(group.sourceRefs, line.sourceRef);
    pushUnique(group.qboSourceLineKeys, qboSourceLineKey(line));
    pushUnique(group.qboBillLineRefs, `${line.billId}:${line.qboLineId}`);
  }

  const layers: QboInventoryLandedCostLayer[] = [];
  const groups = Array.from(groupByPoSku.values()).sort((left, right) => {
    const poCompare = left.internalPo.localeCompare(right.internalPo);
    if (poCompare !== 0) return poCompare;
    return left.sellerSku.localeCompare(right.sellerSku);
  });

  for (const group of groups) {
    if (group.manufacturingQuantity <= 0) {
      blocks.push({
        code: 'MISSING_MANUFACTURING_QUANTITY',
        internalPo: group.internalPo,
        sellerSku: group.sellerSku,
      });
      continue;
    }

    const totalAmount = roundMoney(
      COMPONENTS.reduce((sum, component) => sum + group.componentAmounts[component], 0),
    );
    layers.push({
      internalPo: group.internalPo,
      purchaseOrderSourceType: group.purchaseOrderSourceType,
      purchaseOrderSourceId: group.purchaseOrderSourceId,
      qboPurchaseOrderId: group.qboPurchaseOrderId,
      qboPurchaseOrderLineIds: group.qboPurchaseOrderLineIds.sort(),
      sellerSku: group.sellerSku,
      quantity: group.manufacturingQuantity,
      componentAmounts: group.componentAmounts,
      totalAmount,
      unitCost: roundUnitCost(totalAmount / group.manufacturingQuantity),
      sourceRefs: group.sourceRefs.sort(),
      qboSourceLineKeys: group.qboSourceLineKeys.sort(),
      qboBillLineRefs: group.qboBillLineRefs.sort(),
    });
  }

  return {
    marketplace: input.marketplace,
    marketCode: targetMarketCode,
    parsedLines,
    layers,
    blocks,
  };
}

export function buildQboInventoryAssetReclassPlan(input: {
  marketplace: string;
  lines: QboInventoryAssetLineInput[];
}): QboInventoryAssetReclassPlan {
  const targetMarketCode = marketCodeForMarketplace(input.marketplace);
  const parsedLines: Array<{ source: QboInventoryAssetLineInput; parsed: ParsedQboInventoryAssetLine }> = [];
  const linesToMove: QboInventoryAssetReclassLine[] = [];

  for (const line of input.lines) {
    if (!isInventoryAssetAccountName(line.accountName)) continue;

    try {
      parsedLines.push({ source: line, parsed: parseQboInventoryAssetLine(line) });
    } catch {
      linesToMove.push({ ...line, reason: 'UNPARSEABLE_ASSET_LINE' });
    }
  }

  const marketByPo = new Map<string, string>();
  for (const { parsed } of parsedLines) {
    if (parsed.internalPo === null || parsed.marketCode === null) continue;
    marketByPo.set(parsed.internalPo, parsed.marketCode);
  }

  for (const { source, parsed } of parsedLines) {
    if (parsed.marketCode !== null && parsed.marketCode !== targetMarketCode) {
      linesToMove.push({ ...source, reason: 'NON_TARGET_MARKET_ASSET_LINE' });
      continue;
    }

    if (parsed.owner === 'RESIDUAL') {
      linesToMove.push({ ...source, reason: 'RESIDUAL_ASSET_LINE' });
      continue;
    }

    if (parsed.sellerSku === null) {
      linesToMove.push({ ...source, reason: 'NON_SKU_ASSET_LINE' });
      continue;
    }

    if (parsed.internalPo === null) {
      linesToMove.push({ ...source, reason: 'MISSING_INTERNAL_PO' });
      continue;
    }

    if (parsed.marketCode === null && marketByPo.get(parsed.internalPo) !== targetMarketCode) {
      linesToMove.push({ ...source, reason: 'NON_TARGET_MARKET_ASSET_LINE' });
    }
  }

  linesToMove.sort((left, right) => {
    const billCompare = Number(left.billId) - Number(right.billId);
    if (Number.isFinite(billCompare) && billCompare !== 0) return billCompare;
    const lexicalBillCompare = left.billId.localeCompare(right.billId);
    if (lexicalBillCompare !== 0) return lexicalBillCompare;
    const lineCompare = Number(left.qboLineId) - Number(right.qboLineId);
    if (Number.isFinite(lineCompare) && lineCompare !== 0) return lineCompare;
    return left.qboLineId.localeCompare(right.qboLineId);
  });

  return {
    marketplace: input.marketplace,
    marketCode: targetMarketCode,
    lines: linesToMove,
    totalAmount: roundMoney(linesToMove.reduce((sum, line) => sum + line.amount, 0)),
  };
}
