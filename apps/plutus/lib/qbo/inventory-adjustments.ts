export type QboInventoryAdjustmentPayload = {
  AdjustAccountRef: { value: string };
  domain: 'QBO';
  sparse: false;
  TxnDate: string;
  DocNumber?: string;
  PrivateNote?: string;
  Line: Array<{
    Id: string;
    DetailType: 'ItemAdjustmentLineDetail';
    ItemAdjustmentLineDetail: {
      ItemRef: { value: string };
      QtyDiff: number;
    };
  }>;
};

export function buildQboInventoryAdjustmentPayload(input: {
  adjustmentAccountId: string;
  txnDate: string;
  docNumber?: string;
  privateNote?: string;
  lines: Array<{
    qboItemId: string;
    qtyDiff: number;
  }>;
}): QboInventoryAdjustmentPayload {
  if (input.adjustmentAccountId.trim() === '') {
    throw new Error('QBO inventory adjustment requires adjustmentAccountId');
  }
  if (input.txnDate.trim() === '') {
    throw new Error('QBO inventory adjustment requires txnDate');
  }
  if (input.lines.length === 0) {
    throw new Error('QBO inventory adjustment requires at least one line');
  }

  return {
    AdjustAccountRef: { value: input.adjustmentAccountId },
    domain: 'QBO',
    sparse: false,
    TxnDate: input.txnDate,
    ...(input.docNumber !== undefined && input.docNumber.trim() !== '' ? { DocNumber: input.docNumber } : {}),
    ...(input.privateNote !== undefined && input.privateNote.trim() !== '' ? { PrivateNote: input.privateNote } : {}),
    Line: input.lines.map((line, index) => {
      if (line.qboItemId.trim() === '') {
        throw new Error('QBO inventory adjustment line requires qboItemId');
      }
      if (!Number.isInteger(line.qtyDiff) || line.qtyDiff === 0) {
        throw new Error(`QBO inventory adjustment line requires non-zero integer qtyDiff for item ${line.qboItemId}`);
      }

      return {
        Id: String(index + 1),
        DetailType: 'ItemAdjustmentLineDetail',
        ItemAdjustmentLineDetail: {
          ItemRef: { value: line.qboItemId },
          QtyDiff: line.qtyDiff,
        },
      };
    }),
  };
}
