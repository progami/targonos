export const LANDED_COST_TYPES = [
  'FREIGHT',
  'DUTY',
  'BOXES',
  'BROKER',
  'PACKAGING',
  'ACCESSORIES',
  'INSURANCE',
] as const;
export type LandedCostType = (typeof LANDED_COST_TYPES)[number];

export const LANDED_COST_CURRENCIES = ['USD', 'GBP'] as const;
export type LandedCostCurrency = (typeof LANDED_COST_CURRENCIES)[number];

export function requireLandedCostType(value: string): LandedCostType {
  const normalized = value.trim().toUpperCase();
  const match = LANDED_COST_TYPES.find((candidate) => candidate === normalized);
  if (match === undefined) {
    throw new Error(`Unsupported landed cost type: ${value}`);
  }
  return match;
}

export function requireLandedCostCurrency(value: string): LandedCostCurrency {
  const normalized = value.trim().toUpperCase();
  const match = LANDED_COST_CURRENCIES.find((candidate) => candidate === normalized);
  if (match === undefined) {
    throw new Error(`Unsupported landed cost currency: ${value}`);
  }
  return match;
}
