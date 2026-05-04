import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrategyTable } from '@/components/sheets/strategy-table';

const pushMock = vi.fn();
const refreshMock = vi.fn();
let searchParamsInstance = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
  useSearchParams: () => searchParamsInstance,
}));

const strategies = [
  {
    id: 'demo',
    name: 'Demo Strategy',
    description: 'Demo strategy for exploring X-Plan',
    region: 'US',
    isDefault: false,
    isPrimary: true,
    strategyGroupId: 'demo-group',
    strategyGroup: {
      id: 'demo-group',
      code: 'demo-strategy',
      name: 'Demo Strategy',
      region: 'US',
      createdById: null,
      createdByEmail: null,
      assigneeId: null,
      assigneeEmail: null,
      createdAt: '2026-02-01T00:00:00.000Z',
      updatedAt: '2026-02-04T00:00:00.000Z',
    },
    createdAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-04T00:00:00.000Z',
    _count: {
      products: 0,
      purchaseOrders: 0,
      salesWeeks: 0,
    },
  },
] as const;

describe('StrategyTable', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    searchParamsInstance = new URLSearchParams();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ assignees: [], directoryConfigured: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
  });

  it('renders compact scenario controls without explanatory roster copy', () => {
    render(
      <StrategyTable
        strategies={[...strategies]}
        activeStrategyId="demo"
        viewer={{ id: null, email: null, isSuperAdmin: false }}
        keyParametersByStrategyId={{}}
      />,
    );

    expect(screen.queryByText('Scenario Roster')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'Switch the workbook between active planning scenarios without leaving setup.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('demo-strategy')).not.toBeInTheDocument();
    expect(screen.getByText('Live')).toHaveClass('dark:bg-emerald-500/18');
    expect(screen.getByRole('row', { name: /Demo Strategy/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'New Scenario' })).toBeVisible();
  });
});
