export type ParsedPurchaseAllocationDescription = {
  sku: string;
  region: string;
  quantity: number;
};

export function normalizePurchaseSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

export function normalizePurchaseRegion(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

export function buildPurchaseAllocationDescription(
  sku: string,
  region: string,
  quantity: number,
): string {
  return `SKU: ${normalizePurchaseSku(sku)} | REGION: ${normalizePurchaseRegion(region)} | QTY: ${quantity}`;
}

export function parsePurchaseAllocationDescription(raw: string): ParsedPurchaseAllocationDescription | null {
  const match = /^SKU:\s*(.+?)\s*\|\s*REGION:\s*(.+?)\s*\|\s*QTY:\s*(\d+)\s*$/i.exec(raw.trim());
  if (!match) {
    return null;
  }

  const sku = normalizePurchaseSku(match[1]);
  const region = normalizePurchaseRegion(match[2]);
  const quantity = Number.parseInt(match[3], 10);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return null;
  }

  return {
    sku,
    region,
    quantity,
  };
}
