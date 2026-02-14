'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StrategyGroupCard } from '@/components/sheets/strategy-group-card';
import { SetupDefaultsBand } from '@/components/sheets/setup-defaults-band';
import { SetupProductTable } from '@/components/sheets/setup-product-table';

type ParameterList = Array<{
  id: string;
  label: string;
  value: string;
  type: 'numeric' | 'text';
}>;

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

type LeadStageTemplateView = {
  id: string;
  label: string;
  defaultWeeks: number;
  sequence: number;
};

type LeadTimeProfileView = {
  productionWeeks: number;
  sourceWeeks: number;
  oceanWeeks: number;
  finalWeeks: number;
};

type LeadTimeOverrideId = {
  productId: string;
  stageTemplateId: string;
};

type StrategyGroupView = {
  id: string;
  code: string;
  name: string;
  region: 'US' | 'UK';
  strategies: Strategy[];
};

type SetupWorkspaceProps = {
  strategies: Strategy[];
  activeStrategyId: string | null;
  viewer: { id: string | null; email: string | null; isSuperAdmin: boolean };
  products: Array<{ id: string; sku: string; name: string }>;
  operationsParameters: ParameterList;
  salesParameters: ParameterList;
  financeParameters: ParameterList;
  leadStageTemplates: LeadStageTemplateView[];
  leadTimeProfiles: Record<string, LeadTimeProfileView>;
  leadTimeOverrideIds: LeadTimeOverrideId[];
  keyParametersByStrategyId: Record<string, Array<{ label: string; value: string }>>;
};

const TABS = [
  { id: 'strategies' as const, label: 'Strategies' },
  { id: 'products' as const, label: 'Products' },
  { id: 'operations' as const, label: 'Operations' },
  { id: 'sales' as const, label: 'Sales' },
  { id: 'finance' as const, label: 'Finance' },
];

type TabId = (typeof TABS)[number]['id'];

export function SetupWorkspace({
  strategies,
  activeStrategyId,
  viewer,
  products,
  operationsParameters,
  salesParameters,
  financeParameters,
  leadStageTemplates,
  leadTimeProfiles,
  leadTimeOverrideIds,
  keyParametersByStrategyId,
}: SetupWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<TabId>('strategies');

  const hasStrategy = Boolean(activeStrategyId);

  const groups = useMemo<StrategyGroupView[]>(() => {
    const map = new Map<string, StrategyGroupView>();

    for (const strategy of strategies) {
      const group = strategy.strategyGroup;
      if (!group) continue;

      const existing = map.get(group.id);
      if (existing) {
        existing.strategies.push(strategy);
      } else {
        map.set(group.id, {
          id: group.id,
          code: group.code,
          name: group.name,
          region: group.region,
          strategies: [strategy],
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [strategies]);

  const usGroups = groups.filter((g) => g.region === 'US');
  const ukGroups = groups.filter((g) => g.region === 'UK');

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Setup Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage strategies, products, and default assumptions for planning across regions.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-[#0b3a52] dark:bg-[#0c2a40] dark:text-slate-200 dark:hover:bg-[#0c2a40]/80">
            <Plus className="h-4 w-4" />
            Add Region
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-5 gap-3">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'p-3 rounded-lg border shadow-sm flex items-center gap-3 font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-white dark:bg-[#0c2a40] border-cyan-500 dark:border-[#00C2B9] ring-1 ring-cyan-500 dark:ring-[#00C2B9] text-cyan-700 dark:text-[#00C2B9]'
                : 'bg-white dark:bg-[#06182b]/70 border-slate-200 dark:border-[#0b3a52] text-slate-500 dark:text-slate-400 opacity-60 hover:opacity-100 hover:border-cyan-300 dark:hover:border-cyan-500/50',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === 'strategies' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* US Column */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#0b3a52] pb-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                🇺🇸 United States (US)
              </h2>
            </div>
            {usGroups.map((group) => (
              <StrategyGroupCard
                key={group.id}
                group={group}
                activeStrategyId={activeStrategyId}
                viewer={viewer}
                keyParametersByStrategyId={keyParametersByStrategyId}
              />
            ))}
            <button className="w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-8 flex flex-col items-center justify-center gap-3 hover:border-cyan-400 dark:hover:border-[#00C2B9]/50 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all group">
              <Plus className="h-6 w-6 text-slate-400 group-hover:text-cyan-500 dark:group-hover:text-[#00C2B9]" />
              <span className="font-medium text-slate-500 group-hover:text-cyan-600 dark:text-slate-400 dark:group-hover:text-[#00C2B9]">
                Add Product Group to US
              </span>
            </button>
          </div>

          {/* UK Column */}
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#0b3a52] pb-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                🇬🇧 United Kingdom (UK)
              </h2>
            </div>
            {ukGroups.map((group) => (
              <StrategyGroupCard
                key={group.id}
                group={group}
                activeStrategyId={activeStrategyId}
                viewer={viewer}
                keyParametersByStrategyId={keyParametersByStrategyId}
              />
            ))}
            <button className="w-full rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 p-8 flex flex-col items-center justify-center gap-3 hover:border-cyan-400 dark:hover:border-[#00C2B9]/50 hover:bg-cyan-50/50 dark:hover:bg-cyan-900/10 transition-all group">
              <Plus className="h-6 w-6 text-slate-400 group-hover:text-cyan-500 dark:group-hover:text-[#00C2B9]" />
              <span className="font-medium text-slate-500 group-hover:text-cyan-600 dark:text-slate-400 dark:group-hover:text-[#00C2B9]">
                Add Product Group to UK
              </span>
            </button>
          </div>
        </div>
      )}

      {activeTab === 'products' && hasStrategy && (
        <SetupProductTable
          strategyId={activeStrategyId!}
          products={products}
          leadStageTemplates={leadStageTemplates}
          leadTimeProfiles={leadTimeProfiles}
          leadTimeOverrideIds={leadTimeOverrideIds}
          operationsParameters={operationsParameters}
        />
      )}

      {activeTab === 'operations' && hasStrategy && (
        <SetupDefaultsBand
          strategyId={activeStrategyId!}
          operationsParameters={operationsParameters}
          salesParameters={salesParameters}
          financeParameters={financeParameters}
        />
      )}

      {activeTab === 'sales' && hasStrategy && (
        <SetupDefaultsBand
          strategyId={activeStrategyId!}
          operationsParameters={operationsParameters}
          salesParameters={salesParameters}
          financeParameters={financeParameters}
        />
      )}

      {activeTab === 'finance' && hasStrategy && (
        <SetupDefaultsBand
          strategyId={activeStrategyId!}
          operationsParameters={operationsParameters}
          salesParameters={salesParameters}
          financeParameters={financeParameters}
        />
      )}
    </div>
  );
}
