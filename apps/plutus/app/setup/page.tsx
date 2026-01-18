'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;

// External URLs
const LMB_APP_URL = 'https://app.linkmybooks.com';
const LMB_SETUP_WIZARD_URL = 'https://app.linkmybooks.com/setup-wizard';
const QBO_CHART_OF_ACCOUNTS_URL = 'https://app.qbo.intuit.com/app/chartofaccounts';

// Plutus parent accounts (Inventory + COGS)
const PLUTUS_PARENT_ACCOUNTS = [
  { name: 'Inventory Asset', type: 'Other Current Assets' },
  { name: 'Manufacturing', type: 'Cost of Goods Sold' },
  { name: 'Freight & Custom Duty', type: 'Cost of Goods Sold' },
  { name: 'Land Freight', type: 'Cost of Goods Sold' },
  { name: 'Storage 3PL', type: 'Cost of Goods Sold' },
  { name: 'Mfg Accessories', type: 'Cost of Goods Sold' },
  { name: 'Inventory Shrinkage', type: 'Cost of Goods Sold' },
] as const;

// LMB parent accounts (Revenue + Fees) - LMB posts here
const LMB_PARENT_ACCOUNTS = [
  { name: 'Amazon Sales', type: 'Income' },
  { name: 'Amazon Refunds', type: 'Income' },
  { name: 'Amazon FBA Fees', type: 'Expense' },
  { name: 'Amazon Seller Fees', type: 'Expense' },
  { name: 'Amazon Storage Fees', type: 'Expense' },
  { name: 'Amazon Advertising Costs', type: 'Expense' },
  { name: 'Amazon Promotions', type: 'Expense' },
  { name: 'Amazon FBA Inventory Reimbursement', type: 'Other Income' },
] as const;

const DEFAULT_BRANDS = ['UK-Dust Sheets', 'US-Dust Sheets'];
const STORAGE_KEY = 'plutus-setup-wizard-v2';

// Marketplace options with currencies
const MARKETPLACES = [
  { id: 'amazon.com', label: 'Amazon.com', currency: 'USD' },
  { id: 'amazon.co.uk', label: 'Amazon.co.uk', currency: 'GBP' },
  { id: 'amazon.ca', label: 'Amazon.ca', currency: 'CAD' },
  { id: 'amazon.de', label: 'Amazon.de', currency: 'EUR' },
  { id: 'amazon.fr', label: 'Amazon.fr', currency: 'EUR' },
  { id: 'amazon.es', label: 'Amazon.es', currency: 'EUR' },
  { id: 'amazon.it', label: 'Amazon.it', currency: 'EUR' },
  { id: 'amazon.com.mx', label: 'Amazon.com.mx', currency: 'MXN' },
  { id: 'amazon.co.jp', label: 'Amazon.co.jp', currency: 'JPY' },
  { id: 'amazon.com.au', label: 'Amazon.com.au', currency: 'AUD' },
] as const;

type Brand = {
  name: string;
  marketplace: string;
  currency: string;
};

type Sku = {
  sku: string;
  productName: string;
  brand: string;
  asin?: string;
};

type WizardState = {
  step: number;
  // Step 1: QBO Connection
  qboConnected: boolean;
  qboCompanyName: string | null;
  // Step 2: LMB Setup
  lmbSetupAcknowledged: boolean;
  // Step 3: Brands
  brands: Brand[];
  // Step 4: Plutus Accounts
  parentsVerified: boolean;
  accountsCreated: boolean;
  accountsCreatedCount: number;
  // Step 5: SKUs
  skus: Sku[];
  // Step 6: LMB Product Groups
  lmbProductGroupsChecks: string[];
  // Step 7: Bill Entry Guidelines
  billGuidelinesAcknowledged: boolean;
  // Step 8: Historical Catch-Up
  catchUpMode: 'none' | 'from_date' | 'full' | null;
  catchUpStartDate: string | null;
  qboInitMethod: 'auto' | 'manual' | null;
  qboInitJeId: string | null;
  // Step 9: Complete
  setupComplete: boolean;
};

const STEPS = [
  'QuickBooks',
  'LMB Setup',
  'Brands',
  'Accounts',
  'SKUs',
  'LMB Config',
  'Bill Guide',
  'Catch-Up',
  'Complete',
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center justify-between max-w-2xl mx-auto overflow-x-auto pb-2">
      {STEPS.map((label, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;

        return (
          <div key={label} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-all',
                  isActive && 'bg-teal-500 text-white',
                  isComplete && 'bg-teal-500 text-white',
                  !isActive && !isComplete && 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                )}
              >
                {isComplete ? '✓' : stepNum}
              </div>
              <span
                className={cn(
                  'mt-1 text-[9px] font-medium whitespace-nowrap',
                  isActive && 'text-teal-600 dark:text-teal-400',
                  isComplete && 'text-slate-500 dark:text-slate-400',
                  !isActive && !isComplete && 'text-slate-400 dark:text-slate-500'
                )}
              >
                {label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <div
                className={cn(
                  'w-4 sm:w-6 h-0.5 mx-0.5',
                  stepNum < currentStep ? 'bg-teal-500' : 'bg-slate-200 dark:bg-slate-700'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Step 1: Connect QuickBooks
function ConnectQboStep({
  connected,
  companyName,
  onNext,
  onConnectionChange,
}: {
  connected: boolean;
  companyName: string | null;
  onNext: () => void;
  onConnectionChange: (connected: boolean, companyName: string | null) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(connected);
  const [company, setCompany] = useState(companyName);
  const [homeCurrency, setHomeCurrency] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const checkConnection = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${basePath}/api/qbo/status`);
        const data = await res.json();
        if (!cancelled && data.connected) {
          setIsConnected(true);
          const name = data.companyName || 'Connected';
          setCompany(name);
          setHomeCurrency(data.homeCurrency || null);
          setSubscription(data.subscription || null);
        }
      } catch {
        // Not connected
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    checkConnection();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
  };

  const disconnect = async () => {
    setLoading(true);
    try {
      await fetch(`${basePath}/api/qbo/disconnect`, { method: 'POST' });
      setIsConnected(false);
      setCompany(null);
      setHomeCurrency(null);
      setSubscription(null);
      onConnectionChange(false, null);
    } catch (err) {
      setError('Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Connect QuickBooks</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Plutus needs access to your QuickBooks Online account to read your Chart of Accounts, read supplier bills,
          and post COGS journal entries.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="p-6 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
        {loading ? (
          <p className="text-slate-500 dark:text-slate-400">Checking connection...</p>
        ) : isConnected ? (
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              Connected
            </div>
            <div className="space-y-1">
              <p className="text-slate-900 dark:text-white font-medium">{company}</p>
              {homeCurrency && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Home Currency: {homeCurrency}</p>
              )}
              {subscription && (
                <p className="text-sm text-slate-500 dark:text-slate-400">Subscription: {subscription}</p>
              )}
            </div>
            <Button onClick={disconnect} variant="outline" size="sm">
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
              <span className="w-2 h-2 rounded-full bg-slate-400"></span>
              Not Connected
            </div>
            <div>
              <Button onClick={connect} className="bg-teal-500 hover:bg-teal-600 text-white">
                Connect to QuickBooks
              </Button>
            </div>
          </div>
        )}
      </div>

      <Button
        onClick={() => {
          onConnectionChange(isConnected, company);
          onNext();
        }}
        disabled={!isConnected}
        className="w-full bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
      >
        Continue
      </Button>
    </div>
  );
}

// Step 2: Verify LMB Setup
function VerifyLmbSetupStep({
  acknowledged,
  onAcknowledge,
  onNext,
  onBack,
}: {
  acknowledged: boolean;
  onAcknowledge: (val: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Verify LMB Setup</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Plutus works alongside Link My Books. You must complete the LMB Accounts & Taxes Setup Wizard BEFORE
          continuing.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-3">
          What to do in LMB for EACH connection (US, UK, etc.):
        </p>
        <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-2 list-decimal list-inside">
          <li>Go to LMB → Accounts & Taxes → Setup Wizard</li>
          <li>Step 1: Map transactions to accounts (use LMB defaults or your own names)</li>
          <li>Step 2: Configure QuickBooks bank accounts</li>
          <li>Step 3: Confirm tax rates</li>
          <li>Complete the wizard</li>
        </ol>
      </div>

      <a
        href={LMB_SETUP_WIZARD_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium transition-colors"
      >
        Open LMB Setup Wizard →
      </a>

      <button
        onClick={() => onAcknowledge(!acknowledged)}
        className={cn(
          'flex items-center gap-3 w-full p-4 rounded-lg border transition-all text-left',
          acknowledged
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
        )}
      >
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded border-2 text-xs',
            acknowledged ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600'
          )}
        >
          {acknowledged && '✓'}
        </div>
        <span
          className={cn(
            'font-medium',
            acknowledged ? 'text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-300'
          )}
        >
          I have completed the LMB Accounts & Taxes Wizard for all my Amazon connections
        </span>
      </button>

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!acknowledged}
          className="flex-1 bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// Step 3: Brand Setup
function BrandSetupStep({
  brands,
  onBrandsChange,
  onNext,
  onBack,
}: {
  brands: Brand[];
  onBrandsChange: (brands: Brand[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandMarketplace, setNewBrandMarketplace] = useState('amazon.com');

  const addBrand = () => {
    const trimmed = newBrandName.trim();
    if (trimmed && !brands.some((b) => b.name === trimmed)) {
      const marketplace = MARKETPLACES.find((m) => m.id === newBrandMarketplace);
      onBrandsChange([
        ...brands,
        {
          name: trimmed,
          marketplace: newBrandMarketplace,
          currency: marketplace?.currency || 'USD',
        },
      ]);
      setNewBrandName('');
    }
  };

  const removeBrand = (index: number) => {
    onBrandsChange(brands.filter((_, i) => i !== index));
  };

  const updateBrandMarketplace = (index: number, marketplaceId: string) => {
    const marketplace = MARKETPLACES.find((m) => m.id === marketplaceId);
    const updated = [...brands];
    updated[index] = {
      ...updated[index],
      marketplace: marketplaceId,
      currency: marketplace?.currency || 'USD',
    };
    onBrandsChange(updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Brand Setup</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Brands let you track P&L separately for different product lines or marketplaces. Plutus will create
          sub-accounts for each brand you define.
        </p>
      </div>

      <div className="space-y-3">
        {brands.map((brand, index) => (
          <div
            key={index}
            className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 space-y-2">
                <div className="font-medium text-slate-900 dark:text-white">{brand.name}</div>
                <div className="flex items-center gap-2">
                  <select
                    value={brand.marketplace}
                    onChange={(e) => updateBrandMarketplace(index, e.target.value)}
                    className="text-sm px-3 py-1.5 rounded border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                  >
                    {MARKETPLACES.map((mp) => (
                      <option key={mp.id} value={mp.id}>
                        {mp.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-slate-500 dark:text-slate-400">Currency: {brand.currency}</span>
                </div>
              </div>
              <button onClick={() => removeBrand(index)} className="text-slate-400 hover:text-red-500 transition-colors">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 p-4 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700">
        <input
          type="text"
          value={newBrandName}
          onChange={(e) => setNewBrandName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addBrand()}
          placeholder="Brand name..."
          className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
        />
        <div className="flex gap-2">
          <select
            value={newBrandMarketplace}
            onChange={(e) => setNewBrandMarketplace(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            {MARKETPLACES.map((mp) => (
              <option key={mp.id} value={mp.id}>
                {mp.label}
              </option>
            ))}
          </select>
          <Button onClick={addBrand} disabled={!newBrandName.trim()} className="bg-teal-500 hover:bg-teal-600 text-white">
            Add Brand
          </Button>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={brands.length === 0}
          className="flex-1 bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// Step 4: Plutus Account Setup
function AccountSetupStep({
  brands,
  onVerified,
  onAccountsCreated,
  onNext,
  onBack,
}: {
  brands: Brand[];
  onVerified: () => void;
  onAccountsCreated: (count: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<'verify' | 'create' | 'done'>('verify');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plutusParentStatus, setPlutusParentStatus] = useState<
    { name: string; type: string; status: 'pass' | 'fail' | 'pending' }[]
  >(PLUTUS_PARENT_ACCOUNTS.map((item) => ({ name: item.name, type: item.type, status: 'pending' })));
  const [lmbParentStatus, setLmbParentStatus] = useState<
    { name: string; type: string; status: 'pass' | 'fail' | 'pending' }[]
  >(LMB_PARENT_ACCOUNTS.map((item) => ({ name: item.name, type: item.type, status: 'pending' })));
  const [createResult, setCreateResult] = useState<{ created: number; skipped: number } | null>(null);

  const verifyParents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/qbo/accounts`);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to fetch accounts (${res.status})`);
      }

      const accounts: Array<{ name: string; parentName: string | null; active?: boolean }> = data.accounts || [];

      // Check Plutus parent accounts
      const plutusResults = PLUTUS_PARENT_ACCOUNTS.map((item) => {
        const account = accounts.find(
          (a) => a.parentName === null && a.name.toLowerCase() === item.name.toLowerCase()
        );
        const exists = account && account.active !== false;
        return { name: item.name, type: item.type, status: (exists ? 'pass' : 'fail') as 'pass' | 'fail' };
      });
      setPlutusParentStatus(plutusResults);

      // Check LMB parent accounts
      const lmbResults = LMB_PARENT_ACCOUNTS.map((item) => {
        const account = accounts.find(
          (a) => a.parentName === null && a.name.toLowerCase() === item.name.toLowerCase()
        );
        const exists = account && account.active !== false;
        return { name: item.name, type: item.type, status: (exists ? 'pass' : 'fail') as 'pass' | 'fail' };
      });
      setLmbParentStatus(lmbResults);

      const allPassed = plutusResults.every((r) => r.status === 'pass') && lmbResults.every((r) => r.status === 'pass');
      if (allPassed) {
        onVerified();
        setPhase('create');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const createAccounts = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${basePath}/api/qbo/accounts/create-plutus-qbo-lmb-plan`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to create accounts (${res.status})`);
      }

      const created = data.created?.length || 0;
      const skipped = data.skipped?.length || 0;
      setCreateResult({ created, skipped });
      onAccountsCreated(created);
      setPhase('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const plutusHasFailed = plutusParentStatus.some((p) => p.status === 'fail');
  const lmbHasFailed = lmbParentStatus.some((p) => p.status === 'fail');
  const hasFailed = plutusHasFailed || lmbHasFailed;
  const brandCount = brands.length;
  // 4 Inv Asset + 7 COGS + 8 Revenue/Fee per brand = 19 per brand
  const expectedSubAccounts = brandCount * 19;

  // Sub-account names for preview
  const inventorySubAccounts = ['Mfg', 'Freight', 'Duty', 'MfgAcc'];
  const cogsSubAccounts = ['Manufacturing', 'Freight', 'Duty', 'Land Freight', 'Storage 3PL', 'Mfg Accessories', 'Inventory Shrinkage'];
  const lmbSubAccounts = ['Sales', 'Refunds', 'FBA Fees', 'Seller Fees', 'Storage Fees', 'Advertising', 'Promotions', 'FBA Inv Reimb'];

  const renderParentAccountRow = (item: { name: string; type: string; status: 'pass' | 'fail' | 'pending' }) => (
    <div
      key={item.name}
      className={cn(
        'px-4 py-2 rounded-lg font-medium text-sm flex items-center justify-between',
        item.status === 'pending' && 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
        item.status === 'pass' && 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
        item.status === 'fail' && 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
      )}
    >
      <span>
        {item.status === 'pass' && '✓ '}
        {item.status === 'fail' && '✗ '}
        {item.name}
      </span>
      <span className="font-normal opacity-75 text-xs">({item.type})</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Plutus Account Setup</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {phase === 'verify' && 'Verify parent accounts exist in QBO. Plutus will create sub-accounts under them.'}
          {phase === 'create' && `Create sub-accounts for ${brandCount} brand(s).`}
          {phase === 'done' && 'QBO accounts are ready.'}
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line">{error}</p>
        </div>
      )}

      {phase === 'verify' && (
        <>
          {/* Plutus Accounts Section */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              PLUTUS ACCOUNTS (Inventory + COGS)
            </h3>
            <div className="space-y-2">{plutusParentStatus.map(renderParentAccountRow)}</div>
          </div>

          {/* LMB Accounts Section */}
          <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              LMB ACCOUNTS (Revenue + Fees) - LMB posts here
            </h3>
            <div className="space-y-2">{lmbParentStatus.map(renderParentAccountRow)}</div>
          </div>

          {hasFailed && (
            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                Create the missing parent accounts in QuickBooks, then re-verify.
              </p>
              <a
                href={QBO_CHART_OF_ACCOUNTS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white text-sm font-medium transition-colors"
              >
                Open QBO Chart of Accounts →
              </a>
            </div>
          )}
        </>
      )}

      {phase === 'create' && !createResult && (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Sub-accounts will be created for each brand. Preview:
          </p>

          {brands.map((brand) => (
            <div
              key={brand.name}
              className="p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
            >
              <h4 className="font-semibold text-slate-900 dark:text-white mb-3">{brand.name}</h4>

              <div className="space-y-3 text-xs">
                <div>
                  <p className="font-medium text-slate-600 dark:text-slate-400 mb-1">Inventory Asset Sub-Accounts:</p>
                  <div className="flex flex-wrap gap-1">
                    {inventorySubAccounts.map((sub) => (
                      <span
                        key={sub}
                        className="px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                      >
                        Inv Asset: {sub} - {brand.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-medium text-slate-600 dark:text-slate-400 mb-1">COGS Sub-Accounts:</p>
                  <div className="flex flex-wrap gap-1">
                    {cogsSubAccounts.map((sub) => (
                      <span
                        key={sub}
                        className="px-2 py-1 rounded bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400"
                      >
                        {sub} - {brand.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="font-medium text-slate-600 dark:text-slate-400 mb-1">Revenue/Fee Sub-Accounts (for LMB):</p>
                  <div className="flex flex-wrap gap-1">
                    {lmbSubAccounts.map((sub) => (
                      <span
                        key={sub}
                        className="px-2 py-1 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400"
                      >
                        Amazon {sub} - {brand.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Summary: {expectedSubAccounts} sub-accounts to create
            </p>
            <ul className="text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <li>• {brandCount * 4} Inventory Asset sub-accounts ({inventorySubAccounts.length} per brand)</li>
              <li>• {brandCount * cogsSubAccounts.length} COGS sub-accounts ({cogsSubAccounts.length} per brand)</li>
              <li>• {brandCount * lmbSubAccounts.length} Revenue/Fee sub-accounts ({lmbSubAccounts.length} per brand)</li>
            </ul>
          </div>

          <Button onClick={createAccounts} disabled={loading} className="w-full bg-teal-500 hover:bg-teal-600 text-white">
            {loading ? 'Creating...' : 'Create All Sub-Accounts in QBO'}
          </Button>
        </div>
      )}

      {phase === 'done' && createResult && (
        <div className="p-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-center">
          <p className="text-lg font-semibold text-green-700 dark:text-green-400 mb-3">Accounts Ready!</p>
          <div className="flex justify-center gap-8">
            <div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{createResult.created}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Created</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-400">{createResult.skipped}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Already Existed</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        {phase === 'verify' && (
          <Button onClick={verifyParents} disabled={loading} className="flex-1 bg-teal-500 hover:bg-teal-600 text-white">
            {loading ? 'Checking...' : 'Verify Parents'}
          </Button>
        )}
        {phase === 'done' && (
          <Button onClick={onNext} className="flex-1 bg-green-500 hover:bg-green-600 text-white">
            Continue
          </Button>
        )}
      </div>
    </div>
  );
}

// Step 5: SKU Setup
function SkuSetupStep({
  skus,
  brands,
  onSkusChange,
  onNext,
  onBack,
}: {
  skus: Sku[];
  brands: Brand[];
  onSkusChange: (skus: Sku[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [newSku, setNewSku] = useState('');
  const [newProductName, setNewProductName] = useState('');
  const [newBrand, setNewBrand] = useState(brands[0]?.name || '');
  const [newAsin, setNewAsin] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const addSku = () => {
    const trimmedSku = newSku.trim();
    const trimmedName = newProductName.trim();
    if (trimmedSku && newBrand && !skus.some((s) => s.sku === trimmedSku)) {
      onSkusChange([
        ...skus,
        {
          sku: trimmedSku,
          productName: trimmedName,
          brand: newBrand,
          asin: newAsin.trim() || undefined,
        },
      ]);
      setNewSku('');
      setNewProductName('');
      setNewAsin('');
      setShowModal(false);
    }
  };

  const removeSku = (index: number) => {
    onSkusChange(skus.filter((_, i) => i !== index));
  };

  const handleCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setCsvError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter((line) => line.trim());

      if (lines.length < 2) {
        setCsvError('CSV must have a header row and at least one data row');
        return;
      }

      // Parse header
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const skuIdx = header.indexOf('sku');
      const productIdx = header.indexOf('product_name');
      const brandIdx = header.indexOf('brand');
      const asinIdx = header.indexOf('asin');

      if (skuIdx === -1 || brandIdx === -1) {
        setCsvError('CSV must have "sku" and "brand" columns');
        return;
      }

      const brandNames = brands.map((b) => b.name.toLowerCase());
      const newSkus: Sku[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        const sku = cols[skuIdx];
        const brand = cols[brandIdx];
        const productName = productIdx !== -1 ? cols[productIdx] : '';
        const asin = asinIdx !== -1 ? cols[asinIdx] : '';

        if (!sku || !brand) {
          errors.push(`Row ${i + 1}: Missing SKU or brand`);
          continue;
        }

        if (!brandNames.includes(brand.toLowerCase())) {
          errors.push(`Row ${i + 1}: Brand "${brand}" not found`);
          continue;
        }

        const matchedBrand = brands.find((b) => b.name.toLowerCase() === brand.toLowerCase());
        if (matchedBrand && !skus.some((s) => s.sku === sku) && !newSkus.some((s) => s.sku === sku)) {
          newSkus.push({
            sku,
            productName,
            brand: matchedBrand.name,
            asin: asin || undefined,
          });
        }
      }

      if (newSkus.length > 0) {
        onSkusChange([...skus, ...newSkus]);
      }

      if (errors.length > 0) {
        setCsvError(`Imported ${newSkus.length} SKUs. Errors:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ''}`);
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
  };

  const downloadTemplate = () => {
    const template = 'sku,product_name,brand,asin\nCS-007,6 Pack Drop Cloth 12x9ft,US-Dust Sheets,B08XYZ123\nCS-010,3 Pack Drop Cloth 12x9ft,US-Dust Sheets,B08XYZ456';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sku-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">SKU Setup</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Add your product SKUs and assign them to brands. You don&apos;t need to enter costs here - Plutus calculates
          unit costs automatically from your supplier bills.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setShowModal(true)} className="bg-teal-500 hover:bg-teal-600 text-white">
          + Add SKU
        </Button>
        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
          <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
          Bulk Import CSV
        </label>
        <button
          onClick={downloadTemplate}
          className="text-sm text-teal-600 dark:text-teal-400 hover:underline"
        >
          Download Template
        </button>
      </div>

      {csvError && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <p className="text-sm text-amber-800 dark:text-amber-200 whitespace-pre-line">{csvError}</p>
        </div>
      )}

      {skus.length > 0 ? (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-400">SKU</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Product</th>
                <th className="px-4 py-2 text-left font-medium text-slate-600 dark:text-slate-400">Brand</th>
                <th className="px-4 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {skus.map((sku, index) => (
                <tr key={index} className="bg-white dark:bg-slate-900">
                  <td className="px-4 py-2 font-mono text-slate-900 dark:text-white">{sku.sku}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{sku.productName || '-'}</td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{sku.brand}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => removeSku(index)}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-8 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center">
          <p className="text-slate-500 dark:text-slate-400">No SKUs added yet. Click &quot;Add SKU&quot; to get started.</p>
        </div>
      )}

      <p className="text-xs text-slate-500 dark:text-slate-400">Total: {skus.length} SKUs configured</p>

      {/* Add SKU Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add SKU</h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SKU *</label>
                <input
                  type="text"
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value)}
                  placeholder="e.g., CS-007"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Product Name</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g., 6 Pack Drop Cloth 12x9ft"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Brand *</label>
                <select
                  value={newBrand}
                  onChange={(e) => setNewBrand(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                >
                  {brands.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                  ASIN (optional)
                </label>
                <input
                  type="text"
                  value={newAsin}
                  onChange={(e) => setNewAsin(e.target.value)}
                  placeholder="e.g., B08XYZ123"
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => setShowModal(false)} variant="outline" className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={addSku}
                disabled={!newSku.trim() || !newBrand}
                className="flex-1 bg-teal-500 hover:bg-teal-600 text-white"
              >
                Save SKU
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={skus.length === 0}
          className="flex-1 bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// Step 6: LMB Product Groups (External)
function LmbProductGroupsStep({
  brands,
  checks,
  onChecksChange,
  onNext,
  onBack,
}: {
  brands: Brand[];
  checks: string[];
  onChecksChange: (checks: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const items = [
    ...brands.map((b) => ({ id: `group-${b.name}`, label: `Create Product Group "${b.name}"` })),
    { id: 'accounts-mapped', label: 'Map all Product Groups to QBO accounts (from Step 4)' },
    { id: 'skus-assigned', label: 'Assign all SKUs to their Product Groups' },
    { id: 'cogs-off', label: 'Set COGS to OFF (Plutus handles COGS)' },
  ];

  const toggleCheck = (id: string) => {
    if (checks.includes(id)) {
      onChecksChange(checks.filter((c) => c !== id));
    } else {
      onChecksChange([...checks, id]);
    }
  };

  const allChecked = items.every((item) => checks.includes(item.id));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">LMB Product Groups</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This step is completed in Link My Books, not in Plutus. Create Product Groups and map them to the brand
          sub-accounts.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <p className="text-sm text-amber-800 dark:text-amber-200 font-medium mb-2">Complete for EACH LMB connection:</p>
        <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
          <li>LMB → Inventory → Product Groups → Create</li>
          <li>Map to accounts: Sales, Refunds, FBA Fees, Seller Fees, etc.</li>
          <li>Assign SKUs to the Product Group</li>
        </ol>
      </div>

      <a
        href={LMB_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-sm font-medium transition-colors"
      >
        Open Link My Books →
      </a>

      <div className="space-y-2">
        {items.map((item) => {
          const isChecked = checks.includes(item.id);
          return (
            <button
              key={item.id}
              onClick={() => toggleCheck(item.id)}
              className={cn(
                'flex items-center gap-3 w-full p-4 rounded-lg border transition-all text-left',
                isChecked
                  ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
              )}
            >
              <div
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded border-2 text-xs flex-shrink-0',
                  isChecked ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600'
                )}
              >
                {isChecked && '✓'}
              </div>
              <span
                className={cn(
                  'font-medium text-sm',
                  isChecked ? 'text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-300'
                )}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!allChecked}
          className="flex-1 bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// Step 7: Bill Entry Guidelines
function BillGuidelinesStep({
  acknowledged,
  onAcknowledge,
  onNext,
  onBack,
}: {
  acknowledged: boolean;
  onAcknowledge: (val: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Bill Entry Guidelines</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Plutus links supplier bills together using the PO Number. You&apos;ll enter the PO in the bill&apos;s
          &quot;Memo&quot; field.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Required Format for Bill Memo:</p>
        <div className="px-4 py-3 rounded bg-white dark:bg-slate-900 font-mono text-teal-600 dark:text-teal-400 border border-slate-200 dark:border-slate-700">
          PO: PO-2026-001
        </div>
        <ul className="mt-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <li>• Start with &quot;PO: &quot; (including the space)</li>
          <li>• Follow with your PO number (e.g., PO-2026-001)</li>
          <li>• Keep the memo EXACTLY this format - no extra text</li>
        </ul>
      </div>

      <div className="p-4 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
        <p className="text-sm font-medium text-teal-800 dark:text-teal-200 mb-2">Why This Matters:</p>
        <p className="text-sm text-teal-700 dark:text-teal-300">
          Plutus reads all bills with the same PO number and combines them to calculate your landed cost per unit:
        </p>
        <div className="mt-3 text-xs font-mono text-teal-700 dark:text-teal-300 space-y-1">
          <div>Manufacturing Bill (PO: PO-2026-001) → $5,000 / 1000 units</div>
          <div>+ Freight Bill (PO: PO-2026-001) → $500 / 1000 units</div>
          <div>+ Duty Bill (PO: PO-2026-001) → $200 / 1000 units</div>
          <div className="border-t border-teal-300 dark:border-teal-700 pt-1 font-semibold">
            = Total Landed Cost → $5.70 per unit
          </div>
        </div>
      </div>

      <button
        onClick={() => onAcknowledge(!acknowledged)}
        className={cn(
          'flex items-center gap-3 w-full p-4 rounded-lg border transition-all text-left',
          acknowledged
            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
        )}
      >
        <div
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded border-2 text-xs',
            acknowledged ? 'bg-green-500 border-green-500 text-white' : 'border-slate-300 dark:border-slate-600'
          )}
        >
          {acknowledged && '✓'}
        </div>
        <span
          className={cn(
            'font-medium',
            acknowledged ? 'text-green-700 dark:text-green-400' : 'text-slate-700 dark:text-slate-300'
          )}
        >
          I understand how to enter bills with the PO memo format
        </span>
      </button>

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!acknowledged}
          className="flex-1 bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// Step 8: Historical Catch-Up
function CatchUpStep({
  mode,
  startDate,
  qboInitMethod,
  brands,
  onModeChange,
  onStartDateChange,
  onQboInitMethodChange,
  onNext,
  onBack,
}: {
  mode: 'none' | 'from_date' | 'full' | null;
  startDate: string | null;
  qboInitMethod: 'auto' | 'manual' | null;
  brands: Brand[];
  onModeChange: (mode: 'none' | 'from_date' | 'full') => void;
  onStartDateChange: (date: string | null) => void;
  onQboInitMethodChange: (method: 'auto' | 'manual') => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [valuationSource, setValuationSource] = useState<'bills' | 'accountant' | null>(null);
  const [inventoryFile, setInventoryFile] = useState<File | null>(null);
  const [valuationFile, setValuationFile] = useState<File | null>(null);

  const options = [
    {
      id: 'none' as const,
      title: "I'm just starting (no historical data)",
      description: "You're a new seller or just started using LMB. Plutus will process settlements as they come.",
    },
    {
      id: 'from_date' as const,
      title: 'Catch up from a specific date (with opening snapshot)',
      description: 'Requires: Opening inventory snapshot (Amazon report + valuation).',
    },
    {
      id: 'full' as const,
      title: 'Catch up from the beginning',
      description: 'Process ALL historical bills and settlements. Most accurate, but more work upfront.',
    },
  ];

  // For from_date mode, we need: date + inventory file + valuation source (+ valuation file if accountant) + qboInitMethod
  const fromDateValid =
    mode === 'from_date' &&
    startDate &&
    inventoryFile &&
    valuationSource &&
    (valuationSource === 'bills' || (valuationSource === 'accountant' && valuationFile)) &&
    qboInitMethod;

  const canProceed = mode === 'none' || mode === 'full' || fromDateValid;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Historical Catch-Up</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Plutus maintains a strict audit trail. Every inventory movement must be linked to a source document.
        </p>
      </div>

      <div className="p-4 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <span className="font-semibold">INVENTORY IN</span> → Bills in QBO (Plutus reads these)<br />
          <span className="font-semibold">INVENTORY OUT</span> → LMB Settlements (via Audit Data CSV)<br />
          <span className="font-semibold">OPENING POS.</span> → Amazon Inventory Report + Valuation
        </p>
      </div>

      <div className="space-y-3">
        {options.map((option) => (
          <button
            key={option.id}
            onClick={() => onModeChange(option.id)}
            className={cn(
              'w-full p-4 rounded-lg border transition-all text-left',
              mode === option.id
                ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-slate-300'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2',
                  mode === option.id ? 'border-teal-500 bg-teal-500' : 'border-slate-300 dark:border-slate-600'
                )}
              >
                {mode === option.id && <div className="w-2 h-2 rounded-full bg-white"></div>}
              </div>
              <div className="flex-1">
                <p
                  className={cn(
                    'font-medium',
                    mode === option.id ? 'text-teal-700 dark:text-teal-400' : 'text-slate-700 dark:text-slate-300'
                  )}
                >
                  {option.title}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{option.description}</p>
              </div>
            </div>

            {option.id === 'from_date' && mode === 'from_date' && (
              <div className="mt-4 ml-8 space-y-4" onClick={(e) => e.stopPropagation()}>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Start from:
                  </label>
                  <input
                    type="date"
                    value={startDate || ''}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    max={new Date().toISOString().split('T')[0]}
                    className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Opening Inventory Snapshot Panel - only shown when from_date is selected */}
      {mode === 'from_date' && startDate && (
        <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 space-y-4">
          <h3 className="font-semibold text-amber-800 dark:text-amber-200">Opening Inventory Snapshot</h3>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            To start from {startDate}, we need to know your inventory position on that date.
          </p>

          {/* Step 1: Amazon Inventory Report */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Step 1: Upload Amazon Inventory Report
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Download from: Seller Central → Reports → Inventory → Inventory Ledger (as-of {startDate})
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={(e) => setInventoryFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              {inventoryFile ? inventoryFile.name : 'Choose File'}
            </label>
            {inventoryFile && (
              <span className="text-xs text-green-600 dark:text-green-400 ml-2">✓ File selected</span>
            )}
          </div>

          {/* Step 2: Valuation Source */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Step 2: Provide Inventory Valuation
            </p>

            <div className="space-y-2">
              <button
                onClick={() => setValuationSource('bills')}
                className={cn(
                  'w-full p-3 rounded-lg border text-left text-sm',
                  valuationSource === 'bills'
                    ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2',
                      valuationSource === 'bills' ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                    )}
                  >
                    {valuationSource === 'bills' && <div className="w-2 h-2 rounded-full bg-white m-0.5" />}
                  </div>
                  <span className="font-medium">Compute from historical bills in QBO</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-6 mt-1">
                  Plutus will read all bills before {startDate} to calculate weighted average cost per SKU.
                </p>
              </button>

              <button
                onClick={() => setValuationSource('accountant')}
                className={cn(
                  'w-full p-3 rounded-lg border text-left text-sm',
                  valuationSource === 'accountant'
                    ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full border-2',
                      valuationSource === 'accountant' ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                    )}
                  >
                    {valuationSource === 'accountant' && <div className="w-2 h-2 rounded-full bg-white m-0.5" />}
                  </div>
                  <span className="font-medium">Use accountant&apos;s valuation</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 ml-6 mt-1">
                  Upload component breakdown from your accountant (SKU, Qty, Mfg, Freight, Duty, MfgAcc).
                </p>
              </button>

              {valuationSource === 'accountant' && (
                <div className="ml-6 mt-2">
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      onChange={(e) => setValuationFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                    {valuationFile ? valuationFile.name : 'Upload Valuation File'}
                  </label>
                  {valuationFile && (
                    <span className="text-xs text-green-600 dark:text-green-400 ml-2">✓ File selected</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Step 3: QBO Initialization Journal Entry */}
          {valuationSource && (inventoryFile || valuationSource === 'bills') && (
            <div className="space-y-3 pt-3 border-t border-amber-300 dark:border-amber-700">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Step 3: QBO Initialization Journal Entry
              </p>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-700 dark:text-red-300">
                  <span className="font-semibold">IMPORTANT:</span> Your QBO inventory sub-accounts are currently at $0.
                  Without an initialization JE, they will go <span className="font-semibold">NEGATIVE</span> when you post your first COGS.
                </p>
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => onQboInitMethodChange('auto')}
                  className={cn(
                    'w-full p-3 rounded-lg border text-left text-sm',
                    qboInitMethod === 'auto'
                      ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full border-2',
                        qboInitMethod === 'auto' ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                      )}
                    >
                      {qboInitMethod === 'auto' && <div className="w-2 h-2 rounded-full bg-white m-0.5" />}
                    </div>
                    <span className="font-medium">Let Plutus create the initialization JE automatically</span>
                    <span className="text-xs text-teal-600 dark:text-teal-400 font-medium">(Recommended)</span>
                  </div>
                </button>

                <button
                  onClick={() => onQboInitMethodChange('manual')}
                  className={cn(
                    'w-full p-3 rounded-lg border text-left text-sm',
                    qboInitMethod === 'manual'
                      ? 'bg-teal-50 dark:bg-teal-900/20 border-teal-300 dark:border-teal-700'
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full border-2',
                        qboInitMethod === 'manual' ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                      )}
                    >
                      {qboInitMethod === 'manual' && <div className="w-2 h-2 rounded-full bg-white m-0.5" />}
                    </div>
                    <span className="font-medium">I&apos;ll create it manually / have my accountant do it</span>
                  </div>
                  {qboInitMethod === 'manual' && (
                    <div className="ml-6 mt-2">
                      <button className="text-xs text-teal-600 dark:text-teal-400 hover:underline font-medium">
                        Download JE Details
                      </button>
                    </div>
                  )}
                </button>
              </div>

              {/* Preview of Initialization JE */}
              {qboInitMethod && (
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Preview of Initialization JE:</p>
                  <div className="text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1">
                    <p className="font-semibold">Date: {startDate}</p>
                    <div className="mt-2">
                      <p className="text-slate-500">DEBITS:</p>
                      {brands.map((brand) => (
                        <div key={brand.name} className="ml-2">
                          <p>Inv Asset: Manufacturing - {brand.name} <span className="text-slate-400">$X,XXX.XX</span></p>
                          <p>Inv Asset: Freight - {brand.name} <span className="text-slate-400">$XXX.XX</span></p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <p className="text-slate-500">CREDITS:</p>
                      <p className="ml-2">Opening Balance Equity <span className="text-slate-400">$X,XXX.XX</span></p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">How Catch-Up Works:</p>
        <ol className="text-sm text-slate-600 dark:text-slate-400 space-y-1 list-decimal list-inside">
          <li>Ensure all supplier bills are in QBO with PO number in Memo</li>
          <li>Download Audit Data CSV from LMB for each past settlement</li>
          <li>Upload CSVs to Plutus (Dashboard → Upload Audit Data)</li>
          <li>Plutus processes in chronological order</li>
        </ol>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="flex-1 bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// Step 9: Review & Complete
function ReviewCompleteStep({
  state,
  onComplete,
  onBack,
  onReset,
}: {
  state: WizardState;
  onComplete: () => void;
  onBack: () => void;
  onReset: () => void;
}) {
  const catchUpLabel =
    state.catchUpMode === 'none'
      ? 'Just starting (no historical data)'
      : state.catchUpMode === 'full'
        ? 'Full historical catch-up'
        : state.catchUpMode === 'from_date'
          ? `From specific date (${state.catchUpStartDate})`
          : 'Not selected';

  if (state.setupComplete) {
    return (
      <div className="text-center py-8">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Setup Complete!</h2>
        <p className="text-slate-500 dark:text-slate-400 mb-6">
          Plutus is ready for {state.brands.map((b) => b.name).join(' & ')}.
        </p>

        {state.catchUpMode !== 'none' && (
          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-6 text-left">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-2">What&apos;s Next (Catch-Up Mode):</p>
            <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
              {state.catchUpMode === 'from_date' && (
                <li>Ensure all bills since {state.catchUpStartDate} are in QBO</li>
              )}
              {state.catchUpMode === 'full' && <li>Ensure all historical bills are in QBO</li>}
              <li>Go to LMB and check for settlements</li>
              <li>Download Audit Data CSV for each settlement</li>
              <li>Upload CSVs to Plutus to process COGS</li>
            </ol>
          </div>
        )}

        <div className="space-y-3">
          <Link href="/" className="block">
            <Button className="w-full bg-teal-500 hover:bg-teal-600 text-white">Go to Dashboard</Button>
          </Link>
          <Button onClick={onReset} variant="outline" className="w-full">
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">Review & Complete</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">Setup is almost complete! Review your configuration:</p>
      </div>

      <div className="space-y-4">
        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">QuickBooks Connection</h3>
          <p className="text-sm text-green-600 dark:text-green-400">✓ Connected to: {state.qboCompanyName}</p>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">LMB Setup</h3>
          <p className="text-sm text-green-600 dark:text-green-400">✓ Acknowledged as complete</p>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
            Brands ({state.brands.length})
          </h3>
          {state.brands.map((b, i) => (
            <p key={i} className="text-sm text-green-600 dark:text-green-400">
              ✓ {b.name} ({MARKETPLACES.find((m) => m.id === b.marketplace)?.label})
            </p>
          ))}
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Accounts</h3>
          <p className="text-sm text-green-600 dark:text-green-400">✓ Parent accounts verified</p>
          <p className="text-sm text-green-600 dark:text-green-400">
            ✓ {state.accountsCreatedCount} sub-accounts created
          </p>
          <p className="text-sm text-green-600 dark:text-green-400">✓ Bill memo format guidelines acknowledged</p>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">SKUs ({state.skus.length})</h3>
          <p className="text-sm text-green-600 dark:text-green-400">✓ {state.skus.length} SKUs configured</p>
          <p className="text-sm text-green-600 dark:text-green-400">✓ All SKUs assigned to brands</p>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">LMB Product Groups</h3>
          <p className="text-sm text-green-600 dark:text-green-400">✓ Acknowledged as complete</p>
        </div>

        <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Historical Catch-Up</h3>
          <p className="text-sm text-green-600 dark:text-green-400">✓ Mode: {catchUpLabel}</p>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button onClick={onBack} variant="outline" className="flex-1">
          Back
        </Button>
        <Button onClick={onComplete} className="flex-1 bg-green-500 hover:bg-green-600 text-white">
          Complete Setup ✓
        </Button>
      </div>
    </div>
  );
}

// Main Wizard
export default function SetupPage() {
  const [state, setState] = useState<WizardState>({
    step: 1,
    qboConnected: false,
    qboCompanyName: null,
    lmbSetupAcknowledged: false,
    brands: DEFAULT_BRANDS.map((name, i) => ({
      name,
      marketplace: i === 0 ? 'amazon.co.uk' : 'amazon.com',
      currency: i === 0 ? 'GBP' : 'USD',
    })),
    parentsVerified: false,
    accountsCreated: false,
    accountsCreatedCount: 0,
    skus: [],
    lmbProductGroupsChecks: [],
    billGuidelinesAcknowledged: false,
    catchUpMode: null,
    catchUpStartDate: null,
    qboInitMethod: null,
    qboInitJeId: null,
    setupComplete: false,
  });

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    try {
      const parsed = JSON.parse(saved);
      if (typeof parsed === 'object' && parsed !== null) {
        setState((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const saveState = useCallback((newState: WizardState) => {
    setState(newState);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  }, []);

  const setStep = (step: number) => saveState({ ...state, step });

  const resetWizard = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      step: 1,
      qboConnected: false,
      qboCompanyName: null,
      lmbSetupAcknowledged: false,
      brands: DEFAULT_BRANDS.map((name, i) => ({
        name,
        marketplace: i === 0 ? 'amazon.co.uk' : 'amazon.com',
        currency: i === 0 ? 'GBP' : 'USD',
      })),
      parentsVerified: false,
      accountsCreated: false,
      accountsCreatedCount: 0,
      skus: [],
      lmbProductGroupsChecks: [],
      billGuidelinesAcknowledged: false,
      catchUpMode: null,
      catchUpStartDate: null,
      qboInitMethod: null,
      qboInitJeId: null,
      setupComplete: false,
    });
  };

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <div className="max-w-xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 mb-4"
          >
            ← Back to Plutus
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Plutus Setup Wizard</h1>
        </div>

        <div className="mb-8">
          <StepIndicator currentStep={state.step} />
        </div>

        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-6">
            {state.step === 1 && (
              <ConnectQboStep
                connected={state.qboConnected}
                companyName={state.qboCompanyName}
                onConnectionChange={(connected, companyName) => {
                  saveState({ ...state, qboConnected: connected, qboCompanyName: companyName });
                }}
                onNext={() => {
                  saveState({ ...state, step: 2, qboConnected: true });
                }}
              />
            )}
            {state.step === 2 && (
              <VerifyLmbSetupStep
                acknowledged={state.lmbSetupAcknowledged}
                onAcknowledge={(val) => saveState({ ...state, lmbSetupAcknowledged: val })}
                onNext={() => setStep(3)}
                onBack={() => setStep(1)}
              />
            )}
            {state.step === 3 && (
              <BrandSetupStep
                brands={state.brands}
                onBrandsChange={(brands) => saveState({ ...state, brands })}
                onNext={() => setStep(4)}
                onBack={() => setStep(2)}
              />
            )}
            {state.step === 4 && (
              <AccountSetupStep
                brands={state.brands}
                onVerified={() => saveState({ ...state, parentsVerified: true })}
                onAccountsCreated={(count) => saveState({ ...state, accountsCreated: true, accountsCreatedCount: count })}
                onNext={() => setStep(5)}
                onBack={() => setStep(3)}
              />
            )}
            {state.step === 5 && (
              <SkuSetupStep
                skus={state.skus}
                brands={state.brands}
                onSkusChange={(skus) => saveState({ ...state, skus })}
                onNext={() => setStep(6)}
                onBack={() => setStep(4)}
              />
            )}
            {state.step === 6 && (
              <LmbProductGroupsStep
                brands={state.brands}
                checks={state.lmbProductGroupsChecks}
                onChecksChange={(checks) => saveState({ ...state, lmbProductGroupsChecks: checks })}
                onNext={() => setStep(7)}
                onBack={() => setStep(5)}
              />
            )}
            {state.step === 7 && (
              <BillGuidelinesStep
                acknowledged={state.billGuidelinesAcknowledged}
                onAcknowledge={(val) => saveState({ ...state, billGuidelinesAcknowledged: val })}
                onNext={() => setStep(8)}
                onBack={() => setStep(6)}
              />
            )}
            {state.step === 8 && (
              <CatchUpStep
                mode={state.catchUpMode}
                startDate={state.catchUpStartDate}
                qboInitMethod={state.qboInitMethod}
                brands={state.brands}
                onModeChange={(mode) => saveState({ ...state, catchUpMode: mode })}
                onStartDateChange={(date) => saveState({ ...state, catchUpStartDate: date })}
                onQboInitMethodChange={(method) => saveState({ ...state, qboInitMethod: method })}
                onNext={() => setStep(9)}
                onBack={() => setStep(7)}
              />
            )}
            {state.step === 9 && (
              <ReviewCompleteStep
                state={state}
                onComplete={() => saveState({ ...state, setupComplete: true })}
                onBack={() => setStep(8)}
                onReset={resetWizard}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
