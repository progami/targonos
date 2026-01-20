'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/plutus';
const LMB_APP_URL = 'https://app.linkmybooks.com';

const STORAGE_KEY = 'plutus-setup-v3';

const MARKETPLACES = [
  { id: 'amazon.com', label: 'Amazon.com', currency: 'USD' },
  { id: 'amazon.co.uk', label: 'Amazon.co.uk', currency: 'GBP' },
  { id: 'amazon.ca', label: 'Amazon.ca', currency: 'CAD' },
  { id: 'amazon.de', label: 'Amazon.de', currency: 'EUR' },
  { id: 'amazon.fr', label: 'Amazon.fr', currency: 'EUR' },
  { id: 'amazon.es', label: 'Amazon.es', currency: 'EUR' },
  { id: 'amazon.it', label: 'Amazon.it', currency: 'EUR' },
] as const;

type Brand = { name: string; marketplace: string; currency: string };

type SetupState = {
  step: number;
  lmbComplete: boolean;
  brands: Brand[];
  parentAccounts: Record<string, string>;
  accountsCreated: boolean;
  lmbProductGroupsComplete: boolean;
  complete: boolean;
};

type QboAccount = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  type: string;
  active: boolean;
};

// Icons
function ChevronIcon({ expanded, className }: { expanded: boolean; className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180', className)}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// Step indicator
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-2 rounded-full transition-all',
            i + 1 === current ? 'w-8 bg-brand-teal-500' : i + 1 < current ? 'w-2 bg-brand-teal-500' : 'w-2 bg-slate-200 dark:bg-slate-700'
          )}
        />
      ))}
    </div>
  );
}

// Account mapping row (LMB-style)
function AccountRow({
  label,
  accountId,
  accounts,
  onChange,
  type,
}: {
  label: string;
  accountId: string;
  accounts: QboAccount[];
  onChange: (id: string) => void;
  type?: string;
}) {
  const filtered = type ? accounts.filter((a) => a.type === type || !type) : accounts;
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <div className="flex items-center gap-4 py-3 px-4 border-b border-slate-100 dark:border-slate-800 last:border-b-0">
      <div className="flex-1 min-w-0">
        <span className="text-xs text-brand-teal-600 dark:text-brand-teal-400 uppercase tracking-wide">Account</span>
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{label}</p>
      </div>
      <div className="w-64">
        <span className="text-xs text-brand-teal-600 dark:text-brand-teal-400 uppercase tracking-wide">QBO Account</span>
        <select
          value={accountId}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full mt-0.5 px-3 py-1.5 text-sm rounded border bg-white dark:bg-slate-800 transition-colors',
            selected
              ? 'border-brand-teal-300 dark:border-brand-teal-700 text-slate-900 dark:text-white'
              : 'border-slate-200 dark:border-slate-700 text-slate-400'
          )}
        >
          <option value="">Select account...</option>
          {filtered.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullyQualifiedName}
            </option>
          ))}
        </select>
      </div>
      <div className="w-8 flex justify-center">
        {selected && <CheckIcon className="h-5 w-5 text-green-500" />}
      </div>
    </div>
  );
}

// Collapsible section
function Section({
  title,
  children,
  defaultExpanded = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
      >
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</span>
        <ChevronIcon expanded={expanded} className="text-slate-400" />
      </button>
      {expanded && <div className="bg-white dark:bg-slate-900">{children}</div>}
    </div>
  );
}

// Step 1: LMB Setup Acknowledgment
function Step1({ complete, onComplete }: { complete: boolean; onComplete: () => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-brand-teal-50 dark:bg-brand-teal-900/20 mb-4">
          <svg className="w-8 h-8 text-brand-teal-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">LMB Accounts & Taxes</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
          Complete the LMB wizard for each connection before continuing
        </p>
      </div>

      <a
        href={LMB_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        Open Link My Books
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>

      <button
        onClick={onComplete}
        className={cn(
          'w-full flex items-center justify-center gap-3 py-4 px-4 rounded-lg border-2 transition-all',
          complete
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-brand-teal-300'
        )}
      >
        <div
          className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center',
            complete ? 'border-green-500 bg-green-500' : 'border-slate-300 dark:border-slate-600'
          )}
        >
          {complete && <CheckIcon className="w-4 h-4 text-white" />}
        </div>
        <span className={cn('font-medium', complete ? 'text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-300')}>
          I&apos;ve completed LMB setup for all connections
        </span>
      </button>
    </div>
  );
}

// Step 2: Brands
function Step2({
  brands,
  onBrandsChange,
}: {
  brands: Brand[];
  onBrandsChange: (brands: Brand[]) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newMarketplace, setNewMarketplace] = useState('amazon.com');

  const addBrand = () => {
    const name = newName.trim();
    if (!name || brands.some((b) => b.name === name)) return;
    const mp = MARKETPLACES.find((m) => m.id === newMarketplace);
    if (!mp) return;
    onBrandsChange([...brands, { name, marketplace: mp.id, currency: mp.currency }]);
    setNewName('');
  };

  const removeBrand = (index: number) => {
    onBrandsChange(brands.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Your Brands</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Add brands for separate P&L tracking</p>
      </div>

      {brands.length > 0 && (
        <div className="space-y-2">
          {brands.map((brand, i) => (
            <div
              key={i}
              className="flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
            >
              <div className="flex-1">
                <p className="font-medium text-slate-900 dark:text-white">{brand.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {MARKETPLACES.find((m) => m.id === brand.marketplace)?.label} ({brand.currency})
                </p>
              </div>
              <button onClick={() => removeBrand(i)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addBrand()}
          placeholder="Brand name..."
          className="flex-1 px-4 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/30"
        />
        <select
          value={newMarketplace}
          onChange={(e) => setNewMarketplace(e.target.value)}
          className="px-3 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          {MARKETPLACES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <Button onClick={addBrand} disabled={!newName.trim()} className="bg-brand-teal-500 hover:bg-brand-teal-600 text-white">
          <PlusIcon className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Step 3: Account Mapping
function Step3({
  accounts,
  parentAccounts,
  onParentAccountsChange,
  brands,
  onAccountsCreated,
  accountsCreated,
  isLoadingAccounts,
}: {
  accounts: QboAccount[];
  parentAccounts: Record<string, string>;
  onParentAccountsChange: (accounts: Record<string, string>) => void;
  brands: Brand[];
  onAccountsCreated: () => void;
  accountsCreated: boolean;
  isLoadingAccounts: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inventory Asset accounts - user maps each component to their existing accounts
  const inventoryAccounts = [
    { key: 'invManufacturing', label: 'Manufacturing', type: 'Other Current Asset' },
    { key: 'invFreight', label: 'Freight', type: 'Other Current Asset' },
    { key: 'invDuty', label: 'Duty', type: 'Other Current Asset' },
    { key: 'invMfgAccessories', label: 'Mfg Accessories', type: 'Other Current Asset' },
  ];

  // COGS accounts - user maps each component to their existing accounts
  const cogsAccounts = [
    { key: 'cogsManufacturing', label: 'Manufacturing', type: 'Cost of Goods Sold' },
    { key: 'cogsFreight', label: 'Freight', type: 'Cost of Goods Sold' },
    { key: 'cogsDuty', label: 'Duty', type: 'Cost of Goods Sold' },
    { key: 'cogsMfgAccessories', label: 'Mfg Accessories', type: 'Cost of Goods Sold' },
    { key: 'cogsLandFreight', label: 'Land Freight', type: 'Cost of Goods Sold' },
    { key: 'cogsStorage3pl', label: 'Storage 3PL', type: 'Cost of Goods Sold' },
    { key: 'cogsShrinkage', label: 'Inventory Shrinkage', type: 'Cost of Goods Sold' },
  ];

  // LMB Revenue/Fee accounts (P&L) - where LMB posts sales and fees
  const lmbAccounts = [
    { key: 'amazonSales', label: 'Amazon Sales', type: 'Income' },
    { key: 'amazonRefunds', label: 'Amazon Refunds', type: 'Income' },
    { key: 'amazonFbaInventoryReimbursement', label: 'Amazon FBA Inventory Reimbursement', type: 'Other Income' },
    { key: 'amazonSellerFees', label: 'Amazon Seller Fees', type: 'Cost of Goods Sold' },
    { key: 'amazonFbaFees', label: 'Amazon FBA Fees', type: 'Cost of Goods Sold' },
    { key: 'amazonStorageFees', label: 'Amazon Storage Fees', type: 'Cost of Goods Sold' },
    { key: 'amazonAdvertisingCosts', label: 'Amazon Advertising Costs', type: 'Cost of Goods Sold' },
    { key: 'amazonPromotions', label: 'Amazon Promotions', type: 'Cost of Goods Sold' },
  ];

  const allRequired = [...inventoryAccounts, ...cogsAccounts, ...lmbAccounts];
  const allMapped = allRequired.every((p) => parentAccounts[p.key]);

  const updateAccount = (key: string, id: string) => {
    onParentAccountsChange({ ...parentAccounts, [key]: id });
  };

  const createAccounts = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/qbo/accounts/create-plutus-qbo-lmb-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandNames: brands.map((b) => b.name),
          accountMappings: parentAccounts,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create accounts');
      onAccountsCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create accounts');
    } finally {
      setCreating(false);
    }
  };

  if (accountsCreated) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
          <CheckIcon className="w-8 h-8 text-green-500" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Accounts Created</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Sub-accounts for {brands.length} brand{brands.length > 1 ? 's' : ''} are ready in QBO
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Map QBO Accounts</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Select parent accounts for sub-account creation</p>
      </div>

      {isLoadingAccounts ? (
        <div className="py-12 text-center text-slate-500">Loading accounts...</div>
      ) : (
        <>
          <Section title="Inventory Asset">
            {inventoryAccounts.map((p) => (
              <AccountRow
                key={p.key}
                label={p.label}
                accountId={parentAccounts[p.key] || ''}
                accounts={accounts}
                onChange={(id) => updateAccount(p.key, id)}
                type={p.type}
              />
            ))}
          </Section>

          <Section title="Cost of Goods Sold">
            {cogsAccounts.map((p) => (
              <AccountRow
                key={p.key}
                label={p.label}
                accountId={parentAccounts[p.key] || ''}
                accounts={accounts}
                onChange={(id) => updateAccount(p.key, id)}
                type={p.type}
              />
            ))}
          </Section>

          <Section title="Revenue & Fees (LMB)">
            {lmbAccounts.map((p) => (
              <AccountRow
                key={p.key}
                label={p.label}
                accountId={parentAccounts[p.key] || ''}
                accounts={accounts}
                onChange={(id) => updateAccount(p.key, id)}
                type={p.type}
              />
            ))}
          </Section>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <Button
            onClick={createAccounts}
            disabled={!allMapped || creating}
            className="w-full bg-brand-teal-500 hover:bg-brand-teal-600 text-white disabled:opacity-50"
          >
            {creating ? 'Creating...' : `Create Sub-Accounts for ${brands.length} Brand${brands.length > 1 ? 's' : ''}`}
          </Button>
        </>
      )}
    </div>
  );
}

// Step 4: LMB Product Groups
function Step4({ complete, onComplete, brands }: { complete: boolean; onComplete: () => void; brands: Brand[] }) {
  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">LMB Product Groups</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Create Product Groups in LMB for each brand</p>
      </div>

      <div className="space-y-2">
        {brands.map((brand) => (
          <div key={brand.name} className="flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="w-2 h-2 rounded-full bg-brand-teal-500" />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Create group <span className="font-medium text-slate-900 dark:text-white">&ldquo;{brand.name}&rdquo;</span>
            </span>
          </div>
        ))}
        <div className="flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-sm text-slate-700 dark:text-slate-300">
            Map to brand sub-accounts (e.g., Amazon Sales - Brand)
          </span>
        </div>
        <div className="flex items-center gap-3 py-3 px-4 rounded-lg border border-slate-200 dark:border-slate-700">
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-sm text-slate-700 dark:text-slate-300">Assign SKUs to Product Groups</span>
        </div>
      </div>

      <a
        href={LMB_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full py-3 px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        Open Link My Books
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>

      <button
        onClick={onComplete}
        className={cn(
          'w-full flex items-center justify-center gap-3 py-4 px-4 rounded-lg border-2 transition-all',
          complete
            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
            : 'border-slate-200 dark:border-slate-700 hover:border-brand-teal-300'
        )}
      >
        <div
          className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center',
            complete ? 'border-green-500 bg-green-500' : 'border-slate-300 dark:border-slate-600'
          )}
        >
          {complete && <CheckIcon className="w-4 h-4 text-white" />}
        </div>
        <span className={cn('font-medium', complete ? 'text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-300')}>
          Product Groups configured
        </span>
      </button>
    </div>
  );
}

// Step 5: Complete
function Step5({ brands, onReset }: { brands: Brand[]; onReset: () => void }) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/20 mb-6">
        <CheckIcon className="w-10 h-10 text-green-500" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Setup Complete</h2>
      <p className="text-slate-500 dark:text-slate-400 mb-8">
        Plutus is ready for {brands.map((b) => b.name).join(' & ')}
      </p>

      <div className="space-y-3 max-w-xs mx-auto">
        <Link href="/">
          <Button className="w-full bg-brand-teal-500 hover:bg-brand-teal-600 text-white">Go to Dashboard</Button>
        </Link>
        <Button onClick={onReset} variant="outline" className="w-full">
          Start Over
        </Button>
      </div>
    </div>
  );
}

// Main
export default function SetupPage() {
  const queryClient = useQueryClient();

  const [state, setState] = useState<SetupState>({
    step: 1,
    lmbComplete: false,
    brands: [
      { name: 'US-Dust Sheets', marketplace: 'amazon.com', currency: 'USD' },
      { name: 'UK-Dust Sheets', marketplace: 'amazon.co.uk', currency: 'GBP' },
    ],
    parentAccounts: {},
    accountsCreated: false,
    lmbProductGroupsComplete: false,
    complete: false,
  });

  // Load saved state
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setState((prev) => ({ ...prev, ...JSON.parse(saved) }));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  // Save state
  const saveState = useCallback((patch: Partial<SetupState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      step: 1,
      lmbComplete: false,
      brands: [],
      parentAccounts: {},
      accountsCreated: false,
      lmbProductGroupsComplete: false,
      complete: false,
    });
  };

  // Check QBO connection
  const { data: connectionStatus, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/qbo/status`);
      return res.json() as Promise<{ connected: boolean }>;
    },
    staleTime: 30 * 1000,
  });

  // Fetch QBO accounts
  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['qbo-accounts'],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/qbo/accounts`);
      if (!res.ok) throw new Error('Failed to fetch accounts');
      return res.json() as Promise<{ accounts: QboAccount[] }>;
    },
    enabled: connectionStatus?.connected === true && state.step === 3,
    staleTime: 5 * 60 * 1000,
  });

  const accounts = useMemo(() => accountsData?.accounts || [], [accountsData]);

  // Show loading while checking connection
  if (isCheckingConnection) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-slate-500">Loading...</div>
      </div>
    );
  }

  // Show not connected screen
  if (!connectionStatus?.connected) {
    return <NotConnectedScreen title="Setup Wizard" />;
  }

  const canProceed = () => {
    switch (state.step) {
      case 1:
        return state.lmbComplete;
      case 2:
        return state.brands.length > 0;
      case 3:
        return state.accountsCreated;
      case 4:
        return state.lmbProductGroupsComplete;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (state.step === 4) {
      saveState({ step: 5, complete: true });
    } else {
      saveState({ step: state.step + 1 });
    }
  };

  const prevStep = () => {
    saveState({ step: Math.max(1, state.step - 1) });
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-xl mx-auto px-4 py-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Setup</h1>
          </div>
          {!state.complete && <StepIndicator current={state.step} total={4} />}
        </header>

        {/* Content */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6">
          {state.step === 1 && (
            <Step1 complete={state.lmbComplete} onComplete={() => saveState({ lmbComplete: !state.lmbComplete })} />
          )}
          {state.step === 2 && (
            <Step2
              brands={state.brands}
              onBrandsChange={(brands) => saveState({ brands, accountsCreated: false })}
            />
          )}
          {state.step === 3 && (
            <Step3
              accounts={accounts}
              parentAccounts={state.parentAccounts}
              onParentAccountsChange={(parentAccounts) => saveState({ parentAccounts })}
              brands={state.brands}
              onAccountsCreated={() => saveState({ accountsCreated: true })}
              accountsCreated={state.accountsCreated}
              isLoadingAccounts={isLoadingAccounts}
            />
          )}
          {state.step === 4 && (
            <Step4
              complete={state.lmbProductGroupsComplete}
              onComplete={() => saveState({ lmbProductGroupsComplete: !state.lmbProductGroupsComplete })}
              brands={state.brands}
            />
          )}
          {state.step === 5 && <Step5 brands={state.brands} onReset={reset} />}
        </div>

        {/* Navigation */}
        {!state.complete && (
          <div className="flex gap-3 mt-6">
            {state.step > 1 && (
              <Button onClick={prevStep} variant="outline" className="flex-1">
                Back
              </Button>
            )}
            <Button
              onClick={nextStep}
              disabled={!canProceed()}
              className="flex-1 bg-brand-teal-500 hover:bg-brand-teal-600 text-white disabled:opacity-50"
            >
              {state.step === 4 ? 'Complete' : 'Continue'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
