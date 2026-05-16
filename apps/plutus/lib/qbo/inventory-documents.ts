type ItemLineInput = {
  qboItemId: string;
  description?: string;
  quantity: number;
  unitCost: number;
};

type QboItemBasedLinePayload = {
  DetailType: 'ItemBasedExpenseLineDetail';
  Amount: number;
  Description?: string;
  ItemBasedExpenseLineDetail: {
    ItemRef: { value: string };
    Qty: number;
    UnitPrice: number;
  };
};

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildItemBasedLines(lines: ItemLineInput[]): QboItemBasedLinePayload[] {
  if (lines.length === 0) {
    throw new Error('QBO item document requires at least one item line');
  }

  return lines.map((line) => {
    if (line.qboItemId.trim() === '') {
      throw new Error('QBO item document line requires qboItemId');
    }
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`QBO item document line requires positive integer quantity for item ${line.qboItemId}`);
    }
    if (!Number.isFinite(line.unitCost) || line.unitCost < 0) {
      throw new Error(`QBO item document line requires non-negative unitCost for item ${line.qboItemId}`);
    }

    return {
      DetailType: 'ItemBasedExpenseLineDetail',
      Amount: roundMoney(line.quantity * line.unitCost),
      ...(line.description !== undefined && line.description.trim() !== '' ? { Description: line.description } : {}),
      ItemBasedExpenseLineDetail: {
        ItemRef: { value: line.qboItemId },
        Qty: line.quantity,
        UnitPrice: line.unitCost,
      },
    };
  });
}

export function buildQboInventoryItemPayload(input: {
  name: string;
  sku: string;
  inventoryStartDate: string;
  initialQuantityOnHand: number;
  assetAccountId: string;
  incomeAccountId: string;
  expenseAccountId: string;
  purchaseCost?: number;
  unitPrice?: number;
}) {
  if (input.name.trim() === '') throw new Error('QBO inventory item requires name');
  if (input.sku.trim() === '') throw new Error('QBO inventory item requires sku');
  if (input.inventoryStartDate.trim() === '') throw new Error('QBO inventory item requires inventoryStartDate');
  if (!Number.isInteger(input.initialQuantityOnHand) || input.initialQuantityOnHand < 0) {
    throw new Error('QBO inventory item requires non-negative integer initialQuantityOnHand');
  }
  if (input.assetAccountId.trim() === '') throw new Error('QBO inventory item requires assetAccountId');
  if (input.incomeAccountId.trim() === '') throw new Error('QBO inventory item requires incomeAccountId');
  if (input.expenseAccountId.trim() === '') throw new Error('QBO inventory item requires expenseAccountId');

  return {
    Name: input.name,
    Sku: input.sku,
    Type: 'Inventory',
    TrackQtyOnHand: true,
    QtyOnHand: input.initialQuantityOnHand,
    InvStartDate: input.inventoryStartDate,
    AssetAccountRef: { value: input.assetAccountId },
    IncomeAccountRef: { value: input.incomeAccountId },
    ExpenseAccountRef: { value: input.expenseAccountId },
    ...(input.purchaseCost !== undefined ? { PurchaseCost: input.purchaseCost } : {}),
    ...(input.unitPrice !== undefined ? { UnitPrice: input.unitPrice } : {}),
  };
}

export function buildQboPurchaseOrderPayload(input: {
  vendorId: string;
  txnDate: string;
  docNumber?: string;
  privateNote?: string;
  lines: ItemLineInput[];
}) {
  if (input.vendorId.trim() === '') throw new Error('QBO purchase order requires vendorId');
  if (input.txnDate.trim() === '') throw new Error('QBO purchase order requires txnDate');

  return {
    VendorRef: { value: input.vendorId },
    TxnDate: input.txnDate,
    ...(input.docNumber !== undefined && input.docNumber.trim() !== '' ? { DocNumber: input.docNumber } : {}),
    ...(input.privateNote !== undefined && input.privateNote.trim() !== '' ? { PrivateNote: input.privateNote } : {}),
    Line: buildItemBasedLines(input.lines),
  };
}

export function buildQboItemBasedBillPayload(input: {
  vendorId: string;
  txnDate: string;
  docNumber?: string;
  privateNote?: string;
  lines: ItemLineInput[];
}) {
  if (input.vendorId.trim() === '') throw new Error('QBO item-based bill requires vendorId');
  if (input.txnDate.trim() === '') throw new Error('QBO item-based bill requires txnDate');

  return {
    VendorRef: { value: input.vendorId },
    TxnDate: input.txnDate,
    ...(input.docNumber !== undefined && input.docNumber.trim() !== '' ? { DocNumber: input.docNumber } : {}),
    ...(input.privateNote !== undefined && input.privateNote.trim() !== '' ? { PrivateNote: input.privateNote } : {}),
    Line: buildItemBasedLines(input.lines),
  };
}
