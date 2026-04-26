import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SetupWorkspace } from '@/components/sheets/setup-workspace';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

const strategy = {
  id: 'strategy-1',
  name: 'Workbook Strategy',
  description: null,
  region: 'US' as const,
  isDefault: true,
  isPrimary: true,
  strategyGroupId: 'group-1',
  strategyGroup: {
    id: 'group-1',
    code: 'workbook',
    name: 'Workbook',
    region: 'US' as const,
    createdById: null,
    createdByEmail: null,
    assigneeId: null,
    assigneeEmail: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  createdById: null,
  createdByEmail: null,
  assigneeId: null,
  assigneeEmail: null,
  strategyAssignees: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  _count: {
    products: 1,
    purchaseOrders: 0,
    salesWeeks: 0,
  },
};

describe('SetupWorkspace workbook structure cleanup', () => {
  it('keeps products separate from setup defaults and per-SKU lead-time overrides', () => {
    render(
      <SetupWorkspace
        strategies={[strategy]}
        activeStrategyId="strategy-1"
        activeYear={2026}
        viewer={{ id: null, email: null, isSuperAdmin: false }}
        products={[{ id: 'product-1', sku: 'CS001', name: 'CS001' }]}
        workbookSetupRows={[]}
        keyParametersByStrategyId={{}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Defaults & Products' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Products' }));

    expect(screen.getAllByText('Products').length).toBeGreaterThan(0);
    expect(screen.queryByText('Lead Time & Operations')).not.toBeInTheDocument();
    expect(screen.queryByText('PROD')).not.toBeInTheDocument();
    expect(screen.queryByText('SRC')).not.toBeInTheDocument();
    expect(screen.queryByText('OCEAN')).not.toBeInTheDocument();
    expect(screen.queryByText('FINAL')).not.toBeInTheDocument();
  });
});
