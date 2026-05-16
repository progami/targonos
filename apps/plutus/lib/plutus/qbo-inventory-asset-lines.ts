export type QboInventoryAssetComponent = 'manufacturing' | 'freight' | 'duty' | 'mfgAccessories';

export type QboInventoryAssetLineInput = {
  billId: string;
  billDocNumber?: string;
  billDate: string;
  vendorName?: string;
  qboLineId: string;
  accountName: string;
  amount: number;
  description?: string;
};

export type ParsedQboInventoryAssetLine = {
  billId: string;
  billDocNumber?: string;
  billDate: string;
  vendorName?: string;
  qboLineId: string;
  accountName: string;
  amount: number;
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
  sellerSku: string;
  quantity: number;
  componentAmounts: Record<QboInventoryAssetComponent, number>;
  totalAmount: number;
  unitCost: number;
  sourceRefs: string[];
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

function isInventoryAssetAccountName(accountName: string): boolean {
  return accountName === 'Inventory Asset' || accountName.startsWith('Inventory Asset:');
}

export function parseQboInventoryAssetLine(input: QboInventoryAssetLineInput): ParsedQboInventoryAssetLine {
  const description = input.description;
  if (description === undefined || description.trim() === '') {
    throw new Error(`QBO inventory asset line ${input.billId}:${input.qboLineId} is missing description`);
  }

  const parsedDescription = parseDescription(description);
  const account = parseComponentAccount(input.accountName);
  const component = account.component ?? componentForDescriptionKind(parsedDescription.kind);
  if (account.descriptionKind !== null && parsedDescription.kind !== account.descriptionKind) {
    throw new Error(
      `QBO inventory asset line ${input.billId}:${input.qboLineId} kind ${parsedDescription.kind} does not match account ${input.accountName}`,
    );
  }

  const owner = nullableToken(parsedDescription.values.get('OWNER'));
  const explicitPo = nullableToken(parsedDescription.values.get('PO'));
  const internalPo =
    explicitPo !== null
      ? explicitPo
      : owner !== null && owner.toUpperCase().startsWith('PO-')
        ? owner
        : null;
  const skuToken = component === 'mfgAccessories'
    ? nullableToken(parsedDescription.values.get('FOR_SKU'))
    : nullableToken(parsedDescription.values.get('SKU'));

  return {
    billId: input.billId,
    ...(input.billDocNumber !== undefined ? { billDocNumber: input.billDocNumber } : {}),
    billDate: input.billDate,
    ...(input.vendorName !== undefined ? { vendorName: input.vendorName } : {}),
    qboLineId: input.qboLineId,
    accountName: input.accountName,
    amount: input.amount,
    component,
    marketCode: account.marketCode ?? marketCodeFromOwner(owner),
    descriptionKind: parsedDescription.kind,
    owner,
    internalPo,
    sellerSku: normalizeSku(skuToken),
    quantity: parseQuantity(parsedDescription.values.get('QTY')),
    sourceRef: nullableToken(parsedDescription.values.get('SOURCE')),
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
    if (account.marketCode === null && !COMPONENT_ACCOUNT_CONTRACTS.some((contract) => description?.startsWith(`${contract.descriptionKind};`))) {
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
    if (line.internalPo === null) return false;
    return marketByPo.get(line.internalPo) === targetMarketCode;
  });

  const blocks: QboInventoryAssetBlock[] = [];
  const groupByPoSku = new Map<
    string,
    {
      internalPo: string;
      sellerSku: string;
      manufacturingQuantity: number;
      componentAmounts: Record<QboInventoryAssetComponent, number>;
      sourceRefs: string[];
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

    const key = `${line.internalPo}\u0000${line.sellerSku}`;
    let group = groupByPoSku.get(key);
    if (group === undefined) {
      group = {
        internalPo: line.internalPo,
        sellerSku: line.sellerSku,
        manufacturingQuantity: 0,
        componentAmounts: createComponentAmounts(),
        sourceRefs: [],
        qboBillLineRefs: [],
      };
      groupByPoSku.set(key, group);
    }

    group.componentAmounts[line.component] = roundMoney(group.componentAmounts[line.component] + line.amount);
    if (line.component === 'manufacturing') {
      if (line.quantity === null) {
        blocks.push({ code: 'MISSING_MANUFACTURING_QUANTITY', internalPo: line.internalPo, sellerSku: line.sellerSku });
      } else {
        group.manufacturingQuantity += line.quantity;
      }
    }
    pushUnique(group.sourceRefs, line.sourceRef);
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
      sellerSku: group.sellerSku,
      quantity: group.manufacturingQuantity,
      componentAmounts: group.componentAmounts,
      totalAmount,
      unitCost: roundUnitCost(totalAmount / group.manufacturingQuantity),
      sourceRefs: group.sourceRefs.sort(),
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
