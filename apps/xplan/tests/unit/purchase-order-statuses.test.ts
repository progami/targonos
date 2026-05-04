import { describe, expect, it } from 'vitest';

import {
  PURCHASE_ORDER_STATUS_OPTIONS,
  normalizePurchaseOrderStatus,
} from '@/components/sheets/custom-ops-planning-grid';

describe('XPLAN purchase order statuses', () => {
  it('uses the Talos active workflow states only', () => {
    expect(PURCHASE_ORDER_STATUS_OPTIONS.map((option) => option.value)).toEqual([
      'ISSUED',
      'MANUFACTURING',
      'OCEAN',
      'WAREHOUSE',
      'CANCELLED',
    ]);
  });

  it('normalizes legacy XPLAN states into Talos active workflow states', () => {
    expect(normalizePurchaseOrderStatus('draft')).toBe('ISSUED');
    expect(normalizePurchaseOrderStatus('planned')).toBe('ISSUED');
    expect(normalizePurchaseOrderStatus('production')).toBe('MANUFACTURING');
    expect(normalizePurchaseOrderStatus('in transit')).toBe('OCEAN');
    expect(normalizePurchaseOrderStatus('arrived')).toBe('WAREHOUSE');
    expect(normalizePurchaseOrderStatus('shipped')).toBe('WAREHOUSE');
    expect(normalizePurchaseOrderStatus('archived')).toBe('CANCELLED');
    expect(normalizePurchaseOrderStatus('rejected')).toBe('CANCELLED');
    expect(normalizePurchaseOrderStatus('cancelled')).toBe('CANCELLED');
  });
});
