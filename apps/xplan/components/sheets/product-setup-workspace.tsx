'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { ClipboardList, Package, Target, Wallet2 } from 'lucide-react';
import { ProductSetupGrid } from '@/components/sheets/product-setup-grid';
import {
  ProductSetupParametersPanel,
  type ProductSetupParametersPanelProps,
} from '@/components/sheets/product-setup-panels';
import { usePersistentState } from '@/hooks/usePersistentState';
import { cn } from '@/lib/utils';

type ParameterList = ProductSetupParametersPanelProps['parameters'];

type ProductSetupWorkspaceProps = {
  strategyId: string;
  products: Array<{ id: string; sku: string; name: string }>;
  operationsParameters: ParameterList;
  salesParameters: ParameterList;
  financeParameters: ParameterList;
};

export function ProductSetupWorkspace({
  strategyId,
  products,
  operationsParameters,
  salesParameters,
  financeParameters,
}: ProductSetupWorkspaceProps) {
  const [activeTab, setActiveTab] = usePersistentState(
    `xplan:product-setup:${strategyId}:tab`,
    'products',
  );

  const tabs = [
    {
      value: 'products',
      label: 'Products',
      description: 'Catalog',
      icon: Package,
    },
    {
      value: 'ops',
      label: 'Operations',
      description: 'Lead times',
      icon: ClipboardList,
    },
    {
      value: 'sales',
      label: 'Sales',
      description: 'Thresholds',
      icon: Target,
    },
    {
      value: 'finance',
      label: 'Finance',
      description: 'Cash flow',
      icon: Wallet2,
    },
  ] as const;

  return (
    <Tabs.Root value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80 shadow-sm backdrop-blur-sm dark:border-[#0b3a52] dark:bg-[#06182b]/70">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50 px-4 py-4 dark:border-[#0b3a52] dark:from-[#05182c] dark:via-[#061f38] dark:to-[#05182c] sm:px-5">
          <div className="flex flex-col gap-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
              Setup
            </h2>
            <p className="text-sm text-muted-foreground">
              Products and default assumptions for planning
            </p>
          </div>

          <Tabs.List
            className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            aria-label="Product setup tabs"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.value;
              return (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/70 dark:focus-visible:ring-[#00C2B9]/70',
                    isActive
                      ? 'border-cyan-500 bg-cyan-600 text-white shadow-md shadow-cyan-500/10 dark:border-[#00C2B9]/60 dark:bg-[#00C2B9] dark:text-[#002430] dark:shadow-[0_18px_50px_rgba(0,194,185,0.25)]'
                      : 'border-slate-200 bg-white hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-[#244a63] dark:bg-[#0a2438] dark:hover:border-[#00C2B9]/35 dark:hover:bg-[#0f2d45]',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'flex h-8 w-8 items-center justify-center rounded-lg border transition',
                        isActive
                          ? 'border-white/20 bg-white/10 dark:border-[#002430]/15 dark:bg-[#002430]/10'
                          : 'border-slate-200 bg-slate-50 text-slate-700 group-hover:border-cyan-200 group-hover:bg-cyan-50 group-hover:text-cyan-800 dark:border-[#244a63] dark:bg-[#051b2f] dark:text-slate-200 dark:group-hover:border-[#00C2B9]/25 dark:group-hover:bg-[#00c2b9]/10',
                      )}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold leading-tight">
                        {tab.label}
                      </div>
                      <div
                        className={cn(
                          'truncate text-xs',
                          isActive ? 'text-white/80 dark:text-[#002430]/70' : 'text-slate-500',
                        )}
                      >
                        {tab.description}
                      </div>
                    </div>
                  </div>
                </Tabs.Trigger>
              );
            })}
          </Tabs.List>
        </div>

        <div className="p-4 sm:p-5">
          <Tabs.Content value="products" forceMount className="data-[state=inactive]:hidden">
            <section className="space-y-4">
              <header className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                  Products
                </h3>
                <p className="text-sm text-muted-foreground">Manage your product catalog</p>
              </header>
              <ProductSetupGrid strategyId={strategyId} products={products} />
            </section>
          </Tabs.Content>

          <Tabs.Content value="ops" forceMount className="data-[state=inactive]:hidden">
            <section className="space-y-4">
              <header className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                  Operations
                </h3>
                <p className="text-sm text-muted-foreground">Lead times & logistics</p>
              </header>
              <ProductSetupParametersPanel
                strategyId={strategyId}
                parameterType="ops"
                parameters={operationsParameters}
              />
            </section>
          </Tabs.Content>

          <Tabs.Content value="sales" forceMount className="data-[state=inactive]:hidden">
            <section className="space-y-4">
              <header className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                  Sales
                </h3>
                <p className="text-sm text-muted-foreground">Inventory thresholds</p>
              </header>
              <ProductSetupParametersPanel
                strategyId={strategyId}
                parameterType="sales"
                parameters={salesParameters}
              />
            </section>
          </Tabs.Content>

          <Tabs.Content value="finance" forceMount className="data-[state=inactive]:hidden">
            <section className="space-y-4">
              <header className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
                  Finance
                </h3>
                <p className="text-sm text-muted-foreground">Cash flow settings</p>
              </header>
              <ProductSetupParametersPanel
                strategyId={strategyId}
                parameterType="finance"
                parameters={financeParameters}
              />
            </section>
          </Tabs.Content>
        </div>
      </div>
    </Tabs.Root>
  );
}
