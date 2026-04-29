import { describe, expect, it } from 'vitest';
import { purchaseOrderSourceType } from '@/lib/purchase-order-source';

describe('purchaseOrderSourceType', () => {
  it('uses durable source metadata instead of Talos notes', () => {
    expect(purchaseOrderSourceType({ sourceSystem: 'TALOS', notes: 'raw Talos note' })).toBe(
      'Talos',
    );
  });

  it('keeps migration notes separate from ordinary XPLAN notes', () => {
    expect(purchaseOrderSourceType({ sourceSystem: null, notes: 'Migrated from Excel' })).toBe(
      'Migration',
    );
    expect(purchaseOrderSourceType({ sourceSystem: null, notes: 'Imported from Talos old note' })).toBe(
      'XPLAN',
    );
  });
});
