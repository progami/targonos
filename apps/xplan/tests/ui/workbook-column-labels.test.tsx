import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CustomOpsCostGrid, type OpsBatchRow } from '@/components/sheets/custom-ops-cost-grid';
import {
  CustomOpsPlanningGrid,
  type OpsInputRow,
} from '@/components/sheets/custom-ops-planning-grid';
import { SalesPlanningGrid } from '@/components/sheets/sales-planning-grid';
import {
  WorkbookSetupTable,
  type WorkbookSetupRow,
} from '@/components/sheets/workbook-setup-table';
import { TooltipProvider } from '@/components/ui/tooltip';

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => window.setTimeout(() => callback(Date.now()), 0)),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((handle: number) => window.clearTimeout(handle)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function expectLabels(labels: string[]) {
  labels.forEach((label) => {
    expect(screen.getByText(label)).toBeInTheDocument();
  });
}

describe('workbook sheet column labels', () => {
  it('renders Setup with the Excel setup columns', () => {
    const rows: WorkbookSetupRow[] = [
      {
        productId: 'product-1',
        region: 'US',
        workbookSku: 'CS001',
        displaySku: 'CS001',
        friendlyName: 'CS001',
        price: '10.00',
        demandProxySku: '',
        proxyRatio: '',
        manualGrowthMultiplier: '',
        active: 'TRUE',
        stockWeekStart: '',
        openingFbaUnits: '',
        openingThreeplUnits: '',
        openingTotalUnits: '',
        totalThresholdW: '8',
        fbaThresholdW: '4',
        pack: '',
        micron: '',
        notes: '',
      },
    ];

    render(<WorkbookSetupTable strategyId="strategy-1" activeYear={2026} rows={rows} />);

    expectLabels([
      'region',
      'sku',
      'display_sku',
      'friendly_name',
      'price',
      'demand_proxy_sku',
      'proxy_ratio',
      'manual_growth_multiplier',
      'active',
      'stock_week_start',
      'opening_fba_units',
      'opening_threepl_units',
      'opening_total_units',
      'total_threshold_w',
      'fba_threshold_w',
      'pack',
      'micron',
      'notes',
    ]);
  });

  it('renders PO Table as header-only logistics data', () => {
    const rows: OpsInputRow[] = [
      {
        id: 'po-1',
        productId: 'product-1',
        orderCode: 'PO-1',
        poDate: '',
        poClass: 'Planned',
        productionStart: '',
        productionComplete: '',
        sourceDeparture: '',
        portEta: '',
        availableDate: '',
        inboundWeekOverride: '',
        inboundWeek: '',
        shipName: 'Ship One',
        containerNumber: 'CONT-1',
        productName: 'CS001, CS002',
        quantity: '300',
        notes: '',
        region: 'UK',
        sourceType: 'talos',
        pay1Date: '',
        productionWeeks: '',
        sourceWeeks: '',
        oceanWeeks: '',
        finalWeeks: '',
        sellingPrice: '',
        manufacturingCost: '',
        freightCost: '',
        tariffRate: '',
        tacosPercent: '',
        fbaFee: '',
        referralRate: '',
        storagePerMonth: '',
        status: 'ISSUED',
      },
    ];

    render(<CustomOpsPlanningGrid rows={rows} />);

    expectLabels([
      'REGION',
      'PO CODE',
      'QTY',
      'MFG START',
      'STATUS',
      'SHIP',
      'TRANSPORT REF',
      'INBOUND WEEK',
      'SOURCE',
    ]);
    expect(screen.getByText('300')).toBeInTheDocument();
    expect(screen.queryByText('CS001, CS002')).not.toBeInTheDocument();
    expect(screen.queryByText('po_class')).not.toBeInTheDocument();
    expect(screen.queryByText('units_per_ctn')).not.toBeInTheDocument();
    expect(screen.queryByText('cartons')).not.toBeInTheDocument();
    expect(screen.queryByText('ctn_l_cm')).not.toBeInTheDocument();
    expect(screen.queryByText('ctn_w_cm')).not.toBeInTheDocument();
    expect(screen.queryByText('ctn_h_cm')).not.toBeInTheDocument();
    expect(screen.queryByText('cbm')).not.toBeInTheDocument();
  });

  it('renders Batch Finance Table with batch-scoped SKU and carton totals', () => {
    const rows: OpsBatchRow[] = [];

    render(<CustomOpsCostGrid rows={rows} products={[]} />);

    expect(screen.getByText('Batch Finance Table')).toBeInTheDocument();
    expectLabels([
      'REGION',
      'PO CODE',
      'SKU',
      'QTY',
      'CARTONS',
      'CBM',
      'UNIT COST',
      'PRODUCT COST',
      'FREIGHT COST',
      'DUTY COST',
      'LANDED COST',
    ]);
    expect(screen.queryByText('po_class')).not.toBeInTheDocument();
    expect(screen.queryByText('finance_notes')).not.toBeInTheDocument();
  });

  it('renders Batch Table as the SKU and carton authority', () => {
    const rows: OpsBatchRow[] = [
      {
        id: 'batch-1',
        purchaseOrderId: 'po-1',
        orderCode: 'PO-1',
        batchCode: 'B1',
        productId: 'product-1',
        productName: 'CS001',
        carton: '10',
        region: 'UK',
        quantity: '120',
        sellingPrice: '',
        manufacturingCost: '',
        freightCost: '',
        tariffRate: '',
        tariffCost: '',
        tacosPercent: '',
        fbaFee: '',
        referralRate: '',
        storagePerMonth: '',
        cartonSide1Cm: '50',
        cartonSide2Cm: '40',
        cartonSide3Cm: '30',
        cartonWeightKg: '12',
        unitsPerCarton: '12',
        cbm: '0.600',
      },
      {
        id: 'batch-2',
        purchaseOrderId: 'po-1',
        orderCode: 'PO-1',
        batchCode: 'B2',
        productId: 'product-2',
        productName: 'CS002',
        carton: '18',
        region: 'UK',
        quantity: '180',
        sellingPrice: '',
        manufacturingCost: '',
        freightCost: '',
        tariffRate: '',
        tariffCost: '',
        tacosPercent: '',
        fbaFee: '',
        referralRate: '',
        storagePerMonth: '',
        cartonSide1Cm: '60',
        cartonSide2Cm: '45',
        cartonSide3Cm: '35',
        cartonWeightKg: '14',
        unitsPerCarton: '10',
        cbm: '1.701',
      },
    ];

    render(<CustomOpsCostGrid rows={rows} products={[]} tableKind="batch" />);

    expect(screen.getByText('Batch Table')).toBeInTheDocument();
    expectLabels([
      'PO CODE',
      'BATCH',
      'SKU',
      'QTY',
      'UNITS/CTN',
      'CTN L (CM)',
      'CTN W (CM)',
      'CTN H (CM)',
      'CTN WT (KG)',
      'CBM',
      'REGION',
    ]);
    expect(screen.getByText('CS001')).toBeInTheDocument();
    expect(screen.getByText('CS002')).toBeInTheDocument();
  });

  it('renders Forecast with base columns and one Excel SKU block', () => {
    const metrics = [
      'inbound',
      'threePl',
      'fba',
      'actualSales',
      'forecastSales',
      'finalSales',
      'fbaCoverWeeks',
      'totalCoverWeeks',
    ];
    const columnMeta = Object.fromEntries(
      metrics.map((field) => [`product-1_${field}`, { productId: 'product-1', field }]),
    );
    const row: {
      weekNumber: string;
      weekLabel: string;
      weekDate: string;
      arrivalDetail: string;
      [key: string]: string;
    } = {
      weekNumber: '1',
      weekLabel: 'W1',
      weekDate: '2026-01-05',
      arrivalDetail: '',
    };
    metrics.forEach((field) => {
      row[`product-1_${field}`] = '0';
    });

    render(
      <TooltipProvider>
        <SalesPlanningGrid
          strategyId="strategy-1"
          rows={[row]}
          columnMeta={columnMeta}
          columnKeys={['weekLabel', 'weekDate', 'arrivalDetail', ...Object.keys(columnMeta)]}
          productOptions={[{ id: 'product-1', name: 'CS001' }]}
          stockWarningWeeks={8}
          leadTimeByProduct={{}}
          batchAllocations={new Map()}
          reorderCueByProduct={new Map()}
        />
      </TooltipProvider>,
    );

    expectLabels([
      'WEEK',
      'DATE',
      'Notes',
      'INBOUND',
      '3PL',
      'FBA',
      'ACTUAL',
      'FORECAST',
      'FINAL',
      'FBA COVER (W)',
      'TOTAL COVER (W)',
    ]);

    expect(screen.getByText('FBA COVER (W)')).toHaveClass('leading-tight');
    expect(screen.getByText('TOTAL COVER (W)')).toHaveClass('leading-tight');
    expect(screen.getByText('TOTAL COVER (W)').closest('th')).toHaveClass('whitespace-normal');
  });
});
