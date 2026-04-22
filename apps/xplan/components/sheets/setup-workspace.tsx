'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { StrategyTable } from '@/components/sheets/strategy-table';
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
  const activeStrategy = strategies.find((strategy) => strategy.id === activeStrategyId) ?? null;
  const regionCount = new Set(strategies.map((strategy) => strategy.region)).size;
  const regionsLabel = regionCount === 2 ? 'US + UK' : strategies[0]?.region ?? 'None';
  const summaryItems = [
    {
      label: 'Scenarios',
      value: String(strategies.length),
      detail: 'Strategy sets available',
    },
    {
      label: 'Products',
      value: String(products.length),
      detail: hasStrategy ? 'Loaded in the active scenario' : 'Pick a scenario to continue',
    },
    {
      label: 'Coverage',
      value: regionsLabel,
      detail: activeStrategy ? `${activeStrategy.region} focus` : 'No active scenario selected',
    },
  ];
  const tabHelperText =
    activeTab === 'strategies'
      ? 'Pick the scenario the workbook should follow, then switch or edit it in place.'
      : 'Tune defaults and product assumptions before moving into ops, sales, and finance sheets.';

  return (
    <div className="space-y-5">
      <section className="rounded-[24px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.25)] dark:border-[#153a54] dark:bg-[#081a2b]/88">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700 dark:text-[#5fd8d2]">
                Planning Control
              </p>
              <div>
                <h1 className="text-[2rem] font-semibold tracking-[-0.04em] text-slate-950 dark:text-white">
                  Setup
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                  Strategies, defaults, and product configuration for the workbook before execution moves into ops, sales, and finance.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 font-semibold text-cyan-900 dark:border-cyan-900/60 dark:bg-cyan-950/40 dark:text-cyan-100">
                {activeStrategy ? `Active scenario: ${activeStrategy.name}` : 'No active scenario'}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-medium dark:border-slate-700 dark:bg-slate-900/60">
                Workbook scope {regionsLabel}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {summaryItems.map((item) => (
              <div
                key={item.label}
                className="min-w-[148px] rounded-[18px] border border-slate-200/80 bg-slate-50/90 px-4 py-3 dark:border-slate-700/80 dark:bg-slate-900/55"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                  {item.label}
                </p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.03em] text-slate-950 dark:text-white">
                  {item.value}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="flex flex-col gap-3 rounded-[20px] border border-slate-200/80 bg-white/88 p-2.5 shadow-[0_20px_40px_-34px_rgba(15,23,42,0.34)] dark:border-[#153a54] dark:bg-[#081a2b]/84 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex flex-wrap gap-1 rounded-[16px] bg-slate-100/90 p-1 dark:bg-slate-900/60">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'rounded-[12px] px-3.5 py-2 text-sm font-semibold transition-colors',
                activeTab === tab.id
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-[#0d3048] dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <p className="px-1 text-sm text-slate-500 dark:text-slate-400">{tabHelperText}</p>
      </div>

      {activeTab === 'strategies' && (
        <StrategyTable
          strategies={strategies}
          activeStrategyId={activeStrategyId}
          viewer={viewer}
          keyParametersByStrategyId={keyParametersByStrategyId}
        />
      )}

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
