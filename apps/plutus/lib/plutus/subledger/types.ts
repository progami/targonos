import { z } from 'zod';

export const PLUTUS_TRACE_SOURCES = [
  'AMZ_SETTLEMENT',
  'QBO_BILL',
  'QBO_PURCHASE',
  'MANUAL_ADJUSTMENT',
] as const;
export const PLUTUS_TRACE_MARKETS = ['US', 'UK', 'MULTI'] as const;
export const PO_COST_COMPONENTS = ['manufacturing', 'freight', 'duty', 'mfgAccessories'] as const;
export const INVENTORY_MOVEMENT_TYPES = [
  'RECEIPT',
  'SALE',
  'RETURN',
  'REMOVAL',
  'DISPOSAL',
  'ADJUSTMENT',
] as const;
export const QBO_DRIFT_STATUSES = [
  'unchecked',
  'in_sync',
  'drifted',
  'missing_in_qbo',
  'duplicate_qbo_posting',
  'stale_mapping',
] as const;

export type PlutusTraceSource = (typeof PLUTUS_TRACE_SOURCES)[number];
export type PlutusTraceMarket = (typeof PLUTUS_TRACE_MARKETS)[number];
export type PoCostComponent = (typeof PO_COST_COMPONENTS)[number];
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];
export type QboDriftStatus = (typeof QBO_DRIFT_STATUSES)[number];

export const plutusTraceInputSchema = z.object({
  plutusRef: z.string().trim().min(1, 'plutusRef is required'),
  source: z.enum(PLUTUS_TRACE_SOURCES),
  market: z.enum(PLUTUS_TRACE_MARKETS),
  period: z.string().trim().min(1, 'period is required'),
});

export type PlutusTraceInput = z.infer<typeof plutusTraceInputSchema>;

export type ComponentCostsCents = Record<PoCostComponent, number>;

export function emptyComponentCosts(): ComponentCostsCents {
  return {
    manufacturing: 0,
    freight: 0,
    duty: 0,
    mfgAccessories: 0,
  };
}
