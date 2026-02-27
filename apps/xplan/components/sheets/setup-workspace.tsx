'use client';

import { Fragment, useMemo, useState } from 'react';
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
  { id: 'defaults' as const, label: 'Defaults & Products' },
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
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
          Setup
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Strategies, defaults, and product configuration
        </p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-6 border-b border-slate-200 dark:border-[#0b3a52]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'relative pb-2.5 text-sm font-semibold transition-colors',
              activeTab === tab.id
                ? 'text-cyan-700 dark:text-[#00C2B9]'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300',
            )}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-cyan-500 dark:bg-[#00C2B9]" />
            )}
          </button>
        ))}
      </div>

      {/* Content based on active tab */}
      {activeTab === 'strategies' && (() => {
        const maxGroups = Math.max(usGroups.length, ukGroups.length);
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
            {/* Region headers */}
            <div className="pt-1">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                🇺🇸 United States (US)
              </h2>
            </div>
            <div className="pt-1">
              <h2 className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 flex items-center gap-2">
                🇬🇧 United Kingdom (UK)
              </h2>
            </div>

            {/* Paired group cards */}
            {Array.from({ length: maxGroups }, (_, i) => (
              <Fragment key={i}>
                {usGroups[i] ? (
                  <StrategyGroupCard
                    group={usGroups[i]}
                    activeStrategyId={activeStrategyId}
                    viewer={viewer}
                    keyParametersByStrategyId={keyParametersByStrategyId}
                  />
                ) : <div />}
                {ukGroups[i] ? (
                  <StrategyGroupCard
                    group={ukGroups[i]}
                    activeStrategyId={activeStrategyId}
                    viewer={viewer}
                    keyParametersByStrategyId={keyParametersByStrategyId}
                  />
                ) : <div />}
              </Fragment>
            ))}

          </div>
        );
      })()}

      {activeTab === 'defaults' && hasStrategy && (
        <div className="space-y-6">
          <SetupDefaultsBand
            strategyId={activeStrategyId!}
            operationsParameters={operationsParameters}
            salesParameters={salesParameters}
            financeParameters={financeParameters}
          />
          <SetupProductTable
            strategyId={activeStrategyId!}
            products={products}
            leadStageTemplates={leadStageTemplates}
            leadTimeProfiles={leadTimeProfiles}
            leadTimeOverrideIds={leadTimeOverrideIds}
            operationsParameters={operationsParameters}
          />
        </div>
      )}
    </div>
  );
}
