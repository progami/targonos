'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { ClipboardList, Package, Settings, Target, Wallet2 } from 'lucide-react';
import { StrategiesWorkspace } from '@/components/sheets/strategies-workspace';
import { ProductSetupGrid } from '@/components/sheets/product-setup-grid';
import {
  ProductSetupParametersPanel,
  type ProductSetupParametersPanelProps,
} from '@/components/sheets/product-setup-panels';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/utils';

type ParameterList = ProductSetupParametersPanelProps['parameters'];

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
  viewer: { id: string | null; email: string | null; isSuperAdmin: boolean };
  products: Array<{ id: string; sku: string; name: string }>;
  operationsParameters: ParameterList;
  salesParameters: ParameterList;
  financeParameters: ParameterList;
};

function NoStrategyPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-8 py-16 text-center dark:border-slate-700 dark:bg-slate-900/30">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
        No active strategy
      </p>
      <p className="text-sm text-muted-foreground">
        Select or create a strategy in the Strategies tab first.
      </p>
    </div>
  );
}

const TABS = [
  { value: 'strategies', label: 'Strategies', description: 'Manage strategies', icon: Settings },
  { value: 'products', label: 'Products', description: 'Catalog', icon: Package },
  { value: 'ops', label: 'Operations', description: 'Lead times', icon: ClipboardList },
  { value: 'sales', label: 'Sales', description: 'Thresholds', icon: Target },
  { value: 'finance', label: 'Finance', description: 'Cash flow', icon: Wallet2 },
] as const;

export function SetupWorkspace({
  strategies,
  activeStrategyId,
  viewer,
  products,
  operationsParameters,
  salesParameters,
  financeParameters,
}: SetupWorkspaceProps) {
  const [activeTab, setActiveTab] = usePersistentState('xplan:setup:tab', 'strategies');
  const hasStrategy = Boolean(activeStrategyId);

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm dark:border-[#0b3a52] dark:bg-[#06182b]/70">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-4 dark:border-[#0b3a52] dark:from-[#05182c] dark:via-[#061f38] dark:to-[#05182c] sm:px-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
              Setup
            </h2>
            <p className="text-sm text-muted-foreground">
              Strategies, products, and default assumptions for planning
            </p>
          </div>

          <Tabs.List className="grid grid-cols-2 gap-2 sm:grid-cols-5" aria-label="Setup tabs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  title={tab.description}
                  className={cn(
                    'group relative overflow-hidden rounded-lg border px-2.5 py-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70 dark:focus-visible:ring-[#00C2B9]/70',
                    isActive
                      ? 'border-cyan-500 bg-cyan-600 text-white shadow-md shadow-cyan-500/10 dark:border-[#00C2B9]/60 dark:bg-[#00C2B9] dark:text-[#002430] dark:shadow-[0_18px_50px_rgba(0,194,185,0.25)]'
                      : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-[#244a63] dark:bg-[#0a2438] dark:hover:border-[#00C2B9]/35 dark:hover:bg-[#0f2d45]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-lg border transition',
                        isActive
                          ? 'border-white/20 bg-white/10 dark:border-[#002430]/15 dark:bg-[#002430]/10'
                          : 'border-slate-200 bg-slate-50 text-slate-700 group-hover:border-cyan-200 group-hover:bg-cyan-50 group-hover:text-cyan-800 dark:border-[#244a63] dark:bg-[#051b2f] dark:text-slate-200 dark:group-hover:border-[#00C2B9]/25 dark:group-hover:bg-[#00c2b9]/10',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <div className="truncate text-sm font-semibold leading-tight">{tab.label}</div>
                  </div>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>
        </div>

        <div className="p-4 sm:p-5">
          <Tabs.Content value="strategies" forceMount className="data-[state=inactive]:hidden">
            <StrategiesWorkspace
              strategies={strategies}
              activeStrategyId={activeStrategyId}
              viewer={viewer}
            />
          </Tabs.Content>

          <Tabs.Content value="products" forceMount className="data-[state=inactive]:hidden">
            {hasStrategy ? (
              <section className="space-y-4">
                <header className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                    Products
                  </h3>
                  <p className="text-sm text-muted-foreground">Manage your product catalog</p>
                </header>
                <ProductSetupGrid strategyId={activeStrategyId!} products={products} />
              </section>
            ) : (
              <NoStrategyPlaceholder />
            )}
          </Tabs.Content>

          <Tabs.Content value="ops" forceMount className="data-[state=inactive]:hidden">
            {hasStrategy ? (
              <section className="space-y-4">
                <header className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                    Operations
                  </h3>
                  <p className="text-sm text-muted-foreground">Lead times & logistics</p>
                </header>
                <ProductSetupParametersPanel
                  strategyId={activeStrategyId!}
                  parameterType="ops"
                  parameters={operationsParameters}
                />
              </section>
            ) : (
              <NoStrategyPlaceholder />
            )}
          </Tabs.Content>

          <Tabs.Content value="sales" forceMount className="data-[state=inactive]:hidden">
            {hasStrategy ? (
              <section className="space-y-4">
                <header className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                    Sales
                  </h3>
                  <p className="text-sm text-muted-foreground">Inventory thresholds</p>
                </header>
                <ProductSetupParametersPanel
                  strategyId={activeStrategyId!}
                  parameterType="sales"
                  parameters={salesParameters}
                />
              </section>
            ) : (
              <NoStrategyPlaceholder />
            )}
          </Tabs.Content>

          <Tabs.Content value="finance" forceMount className="data-[state=inactive]:hidden">
            {hasStrategy ? (
              <section className="space-y-4">
                <header className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                    Finance
                  </h3>
                  <p className="text-sm text-muted-foreground">Cash flow settings</p>
                </header>
                <ProductSetupParametersPanel
                  strategyId={activeStrategyId!}
                  parameterType="finance"
                  parameters={financeParameters}
                />
              </section>
            ) : (
              <NoStrategyPlaceholder />
            )}
          </Tabs.Content>
        </div>
      </div>
    </Tabs.Root>
  );
}
