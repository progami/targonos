'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { StrategyTable } from '@/components/sheets/strategy-table';
import { SetupProductTable } from '@/components/sheets/setup-product-table';
import {
  WorkbookSetupTable,
  type WorkbookSetupRow,
} from '@/components/sheets/workbook-setup-table';

type Strategy = {
  id: string;
  name: string;
  description: string | null;
  region: 'US' | 'UK';
  isDefault: boolean;
  isPrimary: boolean;
  strategyGroupId: string;
  strategyGroup: {
    id: string;
    code: string;
    name: string;
    region: 'US' | 'UK';
    createdById: string | null;
    createdByEmail: string | null;
    assigneeId: string | null;
    assigneeEmail: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  createdById?: string | null;
  createdByEmail?: string | null;
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  strategyAssignees?: Array<{
    id: string;
    assigneeId: string;
    assigneeEmail: string;
  }>;
  createdAt: string;
  updatedAt: string;
  _count: {
    products: number;
    purchaseOrders: number;
    salesWeeks: number;
  };
};

type SetupWorkspaceProps = {
  strategies: Strategy[];
  activeStrategyId: string | null;
  activeYear: number;
  viewer: { id: string | null; email: string | null; isSuperAdmin: boolean };
  products: Array<{ id: string; sku: string; name: string }>;
  workbookSetupRows: WorkbookSetupRow[];
  keyParametersByStrategyId: Record<string, Array<{ label: string; value: string }>>;
};

const TABS = [
  { id: 'workbook' as const, label: 'Workbook Setup' },
  { id: 'strategies' as const, label: 'Strategies' },
  { id: 'products' as const, label: 'Products' },
];

type TabId = (typeof TABS)[number]['id'];

export function SetupWorkspace({
  strategies,
  activeStrategyId,
  activeYear,
  viewer,
  products,
  workbookSetupRows,
  keyParametersByStrategyId,
}: SetupWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>(activeStrategyId ? 'workbook' : 'strategies');

  const hasStrategy = Boolean(activeStrategyId);
  const tabHelperText =
    activeTab === 'workbook'
      ? `${workbookSetupRows.length} SKU rows`
      : activeTab === 'strategies'
        ? `${strategies.length} scenarios`
        : `${products.length} products`;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[16px] border border-slate-200/80 bg-white/90 p-2 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.34)] dark:border-slate-700/70 dark:bg-slate-950/50 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-[12px] bg-slate-100/90 p-1 dark:bg-slate-900/70">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-[9px] px-3.5 py-2 text-sm font-semibold transition-colors',
                activeTab === tab.id
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#0d3048] dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-white',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
          {tabHelperText}
        </p>
      </div>

      {activeTab === 'strategies' && (
        <StrategyTable
          strategies={strategies}
          activeStrategyId={activeStrategyId}
          viewer={viewer}
          keyParametersByStrategyId={keyParametersByStrategyId}
        />
      )}

      {activeTab === 'workbook' && hasStrategy && (
        <WorkbookSetupTable
          strategyId={activeStrategyId!}
          activeYear={activeYear}
          rows={workbookSetupRows}
        />
      )}

      {activeTab === 'products' && hasStrategy && (
        <SetupProductTable strategyId={activeStrategyId!} products={products} />
      )}
    </div>
  );
}
