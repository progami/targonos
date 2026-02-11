import { allocateByWeight } from '@/lib/inventory/money';

export type ManufacturingSplitInput = {
  sku: string;
  quantity: number;
};

export type NormalizedManufacturingSplit = {
  sku: string;
  quantity: number;
};

export type AllocatedManufacturingSplit = {
  sku: string;
  quantity: number;
  amountCents: number;
  description: string;
};

export function normalizeSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

export function buildManufacturingDescription(sku: string, quantity: number): string {
  return `${normalizeSku(sku)} x ${quantity} units`;
}

export function isPositiveInteger(value: number): boolean {
  return Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

export function normalizeManufacturingSplits(
  splits: ManufacturingSplitInput[],
): NormalizedManufacturingSplit[] {
  if (splits.length < 2) {
    throw new Error('Manufacturing split requires at least 2 rows');
  }

  const normalized: NormalizedManufacturingSplit[] = [];
  const seenSkus = new Set<string>();

  for (const split of splits) {
    if (typeof split.sku !== 'string') {
      throw new Error('Manufacturing split sku must be a string');
    }
    if (!isPositiveInteger(split.quantity)) {
      throw new Error('Manufacturing split quantity must be a positive integer');
    }

    const normalizedSku = normalizeSku(split.sku);
    if (normalizedSku === '') {
      throw new Error('Manufacturing split sku is required');
    }
    if (seenSkus.has(normalizedSku)) {
      throw new Error(`Manufacturing split contains duplicate sku: ${normalizedSku}`);
    }

    seenSkus.add(normalizedSku);
    normalized.push({ sku: normalizedSku, quantity: split.quantity });
  }

  return normalized;
}

export function allocateManufacturingSplitAmounts(
  totalAmountCents: number,
  splits: NormalizedManufacturingSplit[],
): AllocatedManufacturingSplit[] {
  if (!Number.isInteger(totalAmountCents) || totalAmountCents <= 0) {
    throw new Error('Manufacturing split amount must be a positive integer in cents');
  }

  const allocation = allocateByWeight(
    totalAmountCents,
    splits.map((split, index) => ({
      key: String(index),
      weight: split.quantity,
    })),
  );

  return splits.map((split, index) => {
    const key = String(index);
    const cents = allocation[key];
    if (cents === undefined) {
      throw new Error(`Missing split allocation for index ${index}`);
    }
    return {
      sku: split.sku,
      quantity: split.quantity,
      amountCents: cents,
      description: buildManufacturingDescription(split.sku, split.quantity),
    };
  });
}
