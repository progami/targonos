'use client';

import { SetupStrategyBar } from '@/components/sheets/setup-strategy-bar';
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
};

function NoStrategyPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-8 py-16 text-center dark:border-slate-700 dark:bg-slate-900/30">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
        No active strategy
      </p>
      <p className="text-sm text-muted-foreground">
        Select or create a strategy using the controls above.
      </p>
    </div>
  );
}

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
}: SetupWorkspaceProps) {
  const hasStrategy = Boolean(activeStrategyId);

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm dark:border-[#0b3a52] dark:bg-[#06182b]/70">
        <div className="border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-3 dark:border-[#0b3a52] dark:from-[#05182c] dark:via-[#061f38] dark:to-[#05182c] sm:px-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
            Setup
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Strategies, products, and default assumptions for planning
          </p>
        </div>

        <SetupStrategyBar
          strategies={strategies}
          activeStrategyId={activeStrategyId}
          viewer={viewer}
        />

        <div className="p-4 sm:p-5">
          {hasStrategy ? (
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
          ) : (
            <NoStrategyPlaceholder />
          )}
        </div>
      </div>
    </div>
  );
}
