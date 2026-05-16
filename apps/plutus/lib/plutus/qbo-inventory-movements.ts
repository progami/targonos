import { buildQboInventoryAdjustmentPayload, type QboInventoryAdjustmentPayload } from '@/lib/qbo/inventory-adjustments';
import { normalizeSettlementOperatingMemo } from '@/lib/amazon-finances/settlement-memo-normalization';

type AuditRow = {
  invoiceId: string;
  market: string;
  date: string;
  orderId: string;
  sku: string;
  quantity: number;
  description: string;
};

export type QboInventoryItemMapping = {
  marketplace: string;
  sellerSku: string;
  qboItemId: string;
};

export type InventoryMovementBlock = {
  code: 'MISSING_QBO_ITEM_MAPPING';
  sellerSku: string;
};

export type InventoryAdjustmentLinePlan = {
  sellerSku: string;
  qboItemId: string;
  qtyDiff: number;
};

export type SettlementInventoryMovementPlan = {
  ok: boolean;
  blocks: InventoryMovementBlock[];
  adjustmentLines: InventoryAdjustmentLinePlan[];
  qboInventoryAdjustmentPayload: QboInventoryAdjustmentPayload | null;
};

function normalizeSellerSku(value: string): string {
  return value.trim().toUpperCase();
}

function isSoldPrincipalRow(row: AuditRow): boolean {
  return row.quantity > 0 && normalizeSettlementOperatingMemo(row.description) === 'Amazon Sales - Principal';
}

function qboInventoryAdjustmentDocNumber(settlementDocNumber: string): string {
  const match = settlementDocNumber.match(/^(US|UK)-(\d{6})-(\d{6})-(S\d+(?:-[A-Z])?)$/);
  if (match === null) {
    throw new Error(`Unsupported settlement doc number for QBO inventory adjustment: ${settlementDocNumber}`);
  }
  const marketPrefix = match[1] === 'US' ? '' : `${match[1]!}-`;
  return `IA-${marketPrefix}${match[2]!}-${match[3]!.slice(4)}-${match[4]!}`;
}

export function buildSettlementInventoryMovementPlan(input: {
  marketplace: string;
  settlementDocNumber: string;
  txnDate: string;
  adjustmentAccountId: string;
  auditRows: AuditRow[];
  itemMappings: QboInventoryItemMapping[];
}): SettlementInventoryMovementPlan {
  const mappingBySku = new Map<string, QboInventoryItemMapping>();
  for (const mapping of input.itemMappings) {
    if (mapping.marketplace !== input.marketplace) continue;
    mappingBySku.set(normalizeSellerSku(mapping.sellerSku), mapping);
  }

  const soldQtyBySku = new Map<string, number>();
  for (const row of input.auditRows) {
    if (!isSoldPrincipalRow(row)) continue;
    const sellerSku = normalizeSellerSku(row.sku);
    if (sellerSku === '') continue;
    soldQtyBySku.set(sellerSku, (soldQtyBySku.get(sellerSku) ?? 0) + row.quantity);
  }

  const blocks: InventoryMovementBlock[] = [];
  const adjustmentLines: InventoryAdjustmentLinePlan[] = [];
  for (const [sellerSku, soldQty] of soldQtyBySku.entries()) {
    const mapping = mappingBySku.get(sellerSku);
    if (mapping === undefined) {
      blocks.push({ code: 'MISSING_QBO_ITEM_MAPPING', sellerSku });
      continue;
    }
    adjustmentLines.push({
      sellerSku,
      qboItemId: mapping.qboItemId,
      qtyDiff: -soldQty,
    });
  }

  const qboInventoryAdjustmentPayload =
    blocks.length === 0 && adjustmentLines.length > 0
      ? buildQboInventoryAdjustmentPayload({
          adjustmentAccountId: input.adjustmentAccountId,
          txnDate: input.txnDate,
          docNumber: qboInventoryAdjustmentDocNumber(input.settlementDocNumber),
          privateNote: `Plutus inventory movement | Settlement: ${input.settlementDocNumber} | Marketplace: ${input.marketplace}`,
          lines: adjustmentLines.map((line) => ({
            qboItemId: line.qboItemId,
            qtyDiff: line.qtyDiff,
          })),
        })
      : null;

  return {
    ok: blocks.length === 0,
    blocks,
    adjustmentLines,
    qboInventoryAdjustmentPayload,
  };
}
