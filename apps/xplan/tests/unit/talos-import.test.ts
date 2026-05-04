import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const prisma = {
    strategy: {
      findUnique: vi.fn(),
    },
    businessParameter: {
      findMany: vi.fn(),
    },
    product: {
      findMany: vi.fn(),
    },
    purchaseOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const talos = {
    inboundOrder: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  return { prisma, talos };
});

vi.mock('@/lib/prisma', () => ({
  default: mocks.prisma,
}));

vi.mock('@/lib/api/auth', () => ({
  withXPlanAuth:
    (handler: (request: Request, session: unknown) => Promise<Response>) => (request: Request) =>
      handler(request, { user: { id: 'user-1' } }),
}));

vi.mock('@/lib/api/strategy-guard', () => ({
  requireXPlanStrategyAccess: vi.fn(async () => ({ response: null })),
}));

vi.mock('@/lib/integrations/talos-client', () => ({
  getTalosPrisma: vi.fn(() => mocks.talos),
}));

vi.mock('@/lib/planning', () => ({
  loadPlanningCalendar: vi.fn(async () => ({ calendar: {} })),
}));

vi.mock('@/lib/calculations/calendar', () => ({
  weekNumberForDate: vi.fn(() => 17),
}));

vi.mock('@/lib/strategy-region', () => ({
  weekStartsOnForRegion: vi.fn(() => 1),
}));

const talosOrder = {
  id: 'talos-po-1',
  inboundNumber: 'PO-100',
  orderNumber: 'ORD-100',
  status: 'MANUFACTURING',
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-20T12:00:00.000Z'),
  totalCartons: 50,
  manufacturingStartDate: new Date('2026-04-08T00:00:00.000Z'),
  expectedCompletionDate: new Date('2026-04-22T00:00:00.000Z'),
  estimatedDeparture: new Date('2026-04-29T00:00:00.000Z'),
  estimatedArrival: new Date('2026-05-20T00:00:00.000Z'),
  customsClearedDate: new Date('2026-05-24T00:00:00.000Z'),
  vesselName: 'Vessel One',
  masterBillOfLading: 'MBL-1',
  houseBillOfLading: 'HBL-1',
  notes: 'Talos note should not be used for source detection',
  lines: [
    {
      id: 'talos-line-1',
      skuCode: 'CS007',
      unitsOrdered: 1200,
      quantity: 50,
      lotRef: 'LOT-A',
      unitsPerCarton: 24,
      cartonSide1Cm: 51.2,
      cartonSide2Cm: 42.1,
      cartonSide3Cm: 34.9,
      cartonWeightKg: 12.345,
      unitCost: 0.4455,
    },
  ],
  containers: [{ containerNumber: 'CONT-1' }],
};

function resetMocks() {
  vi.clearAllMocks();
  mocks.prisma.strategy.findUnique.mockResolvedValue({ region: 'UK' });
  mocks.prisma.businessParameter.findMany.mockResolvedValue([]);
  mocks.prisma.product.findMany.mockResolvedValue([{ id: 'product-1', sku: 'CS007' }]);
  mocks.prisma.purchaseOrder.findMany.mockResolvedValue([]);
  mocks.prisma.purchaseOrder.findUnique.mockResolvedValue(null);
  mocks.prisma.purchaseOrder.create.mockResolvedValue({
    id: 'xplan-po-1',
    orderCode: 'PO-100',
    quantity: 1200,
  });
  mocks.prisma.purchaseOrder.update.mockResolvedValue({
    id: 'xplan-po-1',
    orderCode: 'PO-100',
    quantity: 1200,
  });
  mocks.talos.inboundOrder.findUnique.mockResolvedValue(talosOrder);
  mocks.talos.inboundOrder.findMany.mockResolvedValue([talosOrder]);
  mocks.talos.inboundOrder.findFirst.mockResolvedValue(talosOrder);
}

async function postImport(body: unknown) {
  const { POST } = await import('@/app/api/v1/xplan/purchase-orders/import-talos/route');
  return POST(
    new Request('http://xplan.test/api/v1/xplan/purchase-orders/import-talos', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
}

describe('Talos purchase order import', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('loads a single Talos order by exact id and preserves source, carton, and cost fields', async () => {
    const response = await postImport({
      strategyId: 'strategy-1',
      references: ['talos-po-1'],
    });

    expect(response.status).toBe(200);
    expect(mocks.talos.inboundOrder.findUnique).toHaveBeenCalledWith({
      where: { id: 'talos-po-1' },
      include: { lines: true, containers: true },
    });
    expect(mocks.talos.inboundOrder.findFirst).not.toHaveBeenCalled();

    const createData = mocks.prisma.purchaseOrder.create.mock.calls[0]![0].data;
    expect(createData).toMatchObject({
      strategyId: 'strategy-1',
      productId: 'product-1',
      orderCode: 'PO-100',
      quantity: 1200,
      sourceSystem: 'TALOS',
      sourceId: 'talos-po-1',
      sourceReference: 'PO-100',
      sourceUpdatedAt: talosOrder.updatedAt,
      notes: talosOrder.notes,
      batchTableRows: {
        create: [
          {
            productId: 'product-1',
            quantity: 1200,
            batchCode: 'LOT-A',
            sourceSystem: 'TALOS',
            sourceLineId: 'talos-line-1',
            sourceUpdatedAt: talosOrder.updatedAt,
            unitsPerCarton: 24,
            cartonSide1Cm: 51.2,
            cartonSide2Cm: 42.1,
            cartonSide3Cm: 34.9,
            cartonWeightKg: 12.345,
            overrideManufacturingCost: 0.4455,
          },
        ],
      },
    });
  });

  it('refreshes an existing Talos-sourced order instead of rejecting it as a duplicate', async () => {
    mocks.prisma.purchaseOrder.findUnique.mockResolvedValue({
      id: 'existing-xplan-po',
      orderCode: 'PO-100',
    });
    mocks.prisma.purchaseOrder.update.mockResolvedValue({
      id: 'existing-xplan-po',
      orderCode: 'PO-100',
      quantity: 1200,
    });

    const response = await postImport({
      strategyId: 'strategy-1',
      references: ['talos-po-1'],
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.importedCount).toBe(1);
    expect(mocks.prisma.purchaseOrder.create).not.toHaveBeenCalled();
    expect(mocks.prisma.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-xplan-po' },
        data: expect.objectContaining({
          sourceSystem: 'TALOS',
          sourceId: 'talos-po-1',
          batchTableRows: expect.objectContaining({
            deleteMany: {},
            create: expect.any(Array),
          }),
        }),
      }),
    );
  });

  it('adopts an existing migrated row with the same PO code', async () => {
    mocks.prisma.purchaseOrder.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'migrated-xplan-po',
        orderCode: 'PO-100',
        sourceSystem: null,
        notes: 'Migrated from Dust Sheets - UK/01 Batches/Batch 100',
      });

    const response = await postImport({
      strategyId: 'strategy-1',
      references: ['talos-po-1'],
    });

    expect(response.status).toBe(200);
    expect(mocks.prisma.purchaseOrder.create).not.toHaveBeenCalled();
    expect(mocks.prisma.purchaseOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'migrated-xplan-po' },
        data: expect.objectContaining({
          sourceSystem: 'TALOS',
          sourceId: 'talos-po-1',
        }),
      }),
    );
  });

  it('matches Talos SKUs to standardized X-Plan product SKUs', async () => {
    mocks.talos.inboundOrder.findUnique.mockResolvedValue({
      ...talosOrder,
      lines: [{ ...talosOrder.lines[0], skuCode: 'CS-007' }],
    });
    mocks.prisma.product.findMany.mockResolvedValue([{ id: 'product-1', sku: 'CS 007' }]);

    const response = await postImport({
      strategyId: 'strategy-1',
      references: ['talos-po-1'],
    });

    expect(response.status).toBe(200);

    const createData = mocks.prisma.purchaseOrder.create.mock.calls[0]![0].data;
    expect(createData.productId).toBe('product-1');
    expect(createData.batchTableRows.create[0]).toMatchObject({
      productId: 'product-1',
      quantity: 1200,
    });
  });

  it('rejects Talos orders where header cartons do not match line cartons', async () => {
    mocks.talos.inboundOrder.findUnique.mockResolvedValue({
      ...talosOrder,
      totalCartons: 269,
      lines: [
        {
          ...talosOrder.lines[0],
          quantity: 1,
          unitsOrdered: 1,
        },
      ],
    });

    const response = await postImport({
      strategyId: 'strategy-1',
      references: ['talos-po-1'],
    });
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('Talos line carton total (1) does not match PO total cartons (269)');
    expect(mocks.prisma.purchaseOrder.create).not.toHaveBeenCalled();
    expect(mocks.prisma.purchaseOrder.update).not.toHaveBeenCalled();
  });
});

describe('Talos purchase order picker', () => {
  beforeEach(() => {
    resetMocks();
  });

  it('uses workbook/operations ordering instead of most recently updated ordering', async () => {
    const { GET } = await import('@/app/api/v1/xplan/purchase-orders/talos/route');

    await GET(new Request('http://xplan.test/api/v1/xplan/purchase-orders/talos?strategyId=strategy-1'));

    expect(mocks.talos.inboundOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { manufacturingStartDate: 'asc' },
          { expectedCompletionDate: 'asc' },
          { expectedDate: 'asc' },
          { inboundNumber: 'asc' },
          { orderNumber: 'asc' },
        ],
      }),
    );
  });
});
