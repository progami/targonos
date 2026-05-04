import { describe, expect, it } from 'vitest';
import { comparePurchaseOrderCodes, comparePurchaseOrderRows } from '@/lib/purchase-order-ordering';

describe('purchase order ordering', () => {
  it('sorts PO codes by their numeric sequence', () => {
    const codes = ['PO-14-PDS', 'PO-3-PDS', 'PO-11-PDS', 'PO-8-PDS'];

    expect(codes.sort(comparePurchaseOrderCodes)).toEqual([
      'PO-3-PDS',
      'PO-8-PDS',
      'PO-11-PDS',
      'PO-14-PDS',
    ]);
  });

  it('sorts purchase orders by production start then natural PO code', () => {
    const rows = [
      { orderCode: 'PO-14-PDS', productionStart: new Date('2026-02-02T00:00:00.000Z') },
      { orderCode: 'PO-3-PDS', productionStart: new Date('2026-02-02T00:00:00.000Z') },
      { orderCode: 'PO-1-PDS', productionStart: new Date('2026-01-05T00:00:00.000Z') },
      { orderCode: 'PO-2-PDS', productionStart: null },
    ];

    expect(rows.sort(comparePurchaseOrderRows).map((row) => row.orderCode)).toEqual([
      'PO-1-PDS',
      'PO-3-PDS',
      'PO-14-PDS',
      'PO-2-PDS',
    ]);
  });

  it('uses natural PO code order when production start is missing on every row', () => {
    const rows = [
      { orderCode: 'PO-14-PDS', productionStart: null },
      { orderCode: 'PO-3-PDS', productionStart: null },
      { orderCode: 'PO-11-PDS', productionStart: null },
      { orderCode: 'PO-8-PDS', productionStart: null },
    ];

    expect(rows.sort(comparePurchaseOrderRows).map((row) => row.orderCode)).toEqual([
      'PO-3-PDS',
      'PO-8-PDS',
      'PO-11-PDS',
      'PO-14-PDS',
    ]);
  });
});
