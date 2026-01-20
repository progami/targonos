'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/plutus';

const STORAGE_KEY = 'plutus-setup-v4';

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
type Sku = { sku: string; productName: string; brand: string; asin?: string };

type SetupState = {
  section: 'brands' | 'accounts' | 'skus';
  brands: Brand[];
  accountMappings: Record<string, string>;
  accountsCreated: boolean;
  skus: Sku[];
};

type QboAccount = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  type: string;
  active: boolean;
};

// Icons
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

// Account definitions
const INVENTORY_ACCOUNTS = [
  { key: 'invManufacturing', label: 'Manufacturing', type: 'Other Current Asset' },
  { key: 'invFreight', label: 'Freight', type: 'Other Current Asset' },
  { key: 'invDuty', label: 'Duty', type: 'Other Current Asset' },
  { key: 'invMfgAccessories', label: 'Mfg Accessories', type: 'Other Current Asset' },
];

const COGS_ACCOUNTS = [
  { key: 'cogsManufacturing', label: 'Manufacturing', type: 'Cost of Goods Sold' },
  { key: 'cogsFreight', label: 'Freight', type: 'Cost of Goods Sold' },
  { key: 'cogsDuty', label: 'Duty', type: 'Cost of Goods Sold' },
  { key: 'cogsMfgAccessories', label: 'Mfg Accessories', type: 'Cost of Goods Sold' },
  { key: 'cogsLandFreight', label: 'Land Freight', type: 'Cost of Goods Sold' },
  { key: 'cogsStorage3pl', label: 'Storage 3PL', type: 'Cost of Goods Sold' },
  { key: 'cogsShrinkage', label: 'Shrinkage', type: 'Cost of Goods Sold' },
];

const LMB_ACCOUNTS = [
  { key: 'amazonSales', label: 'Amazon Sales', type: 'Income' },
  { key: 'amazonRefunds', label: 'Amazon Refunds', type: 'Income' },
  { key: 'amazonFbaInventoryReimbursement', label: 'FBA Reimbursement', type: 'Other Income' },
  { key: 'amazonSellerFees', label: 'Seller Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonFbaFees', label: 'FBA Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonStorageFees', label: 'Storage Fees', type: 'Cost of Goods Sold' },
  { key: 'amazonAdvertisingCosts', label: 'Advertising', type: 'Cost of Goods Sold' },
  { key: 'amazonPromotions', label: 'Promotions', type: 'Cost of Goods Sold' },
];

const ALL_ACCOUNTS = [...INVENTORY_ACCOUNTS, ...COGS_ACCOUNTS, ...LMB_ACCOUNTS];

// Sidebar
function Sidebar({
  section,
  onSectionChange,
  brandsComplete,
  accountsComplete,
  skusComplete,
}: {
  section: string;
  onSectionChange: (s: 'brands' | 'accounts' | 'skus') => void;
  brandsComplete: boolean;
  accountsComplete: boolean;
  skusComplete: boolean;
}) {
  const items = [
    { id: 'brands' as const, label: 'Brands', complete: brandsComplete },
    { id: 'accounts' as const, label: 'Accounts', complete: accountsComplete },
    { id: 'skus' as const, label: 'SKUs', complete: skusComplete },
  ];

  return (
    <nav className="w-48 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 p-4">
      <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Setup</h2>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors',
                section === item.id
                  ? 'bg-brand-teal-50 dark:bg-brand-teal-900/20 text-brand-teal-700 dark:text-brand-teal-300 font-medium'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
            >
              {item.complete ? (
                <CheckIcon className="w-4 h-4 text-green-500" />
              ) : (
                <div className="w-4 h-4 rounded-full border-2 border-slate-300 dark:border-slate-600" />
              )}
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// Brands Section
function BrandsSection({
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
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Brands</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Add brands for separate P&L tracking. Plutus creates sub-accounts for each brand.
        </p>
      </div>

      {brands.length > 0 && (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Brand Name</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Marketplace</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Currency</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {brands.map((brand, i) => (
                <tr key={i} className="bg-white dark:bg-slate-900">
                  <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">{brand.name}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">
                    {MARKETPLACES.find((m) => m.id === brand.marketplace)?.label}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{brand.currency}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeBrand(i)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addBrand()}
          placeholder="Brand name..."
          className="flex-1 px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/30"
        />
        <select
          value={newMarketplace}
          onChange={(e) => setNewMarketplace(e.target.value)}
          className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300"
        >
          {MARKETPLACES.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
        </select>
        <Button onClick={addBrand} disabled={!newName.trim()} className="bg-brand-teal-500 hover:bg-brand-teal-600 text-white">
          <PlusIcon className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>
    </div>
  );
}

// Account Row
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
  const filtered = type ? accounts.filter((a) => a.type === type) : accounts;
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <tr className="bg-white dark:bg-slate-900">
      <td className="px-4 py-2.5 text-sm text-slate-900 dark:text-white">{label}</td>
      <td className="px-4 py-2.5">
        <select
          value={accountId}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'w-full px-3 py-1.5 text-sm rounded border bg-white dark:bg-slate-800 transition-colors',
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
      </td>
      <td className="px-4 py-2.5 w-12">
        {selected && <CheckIcon className="h-4 w-4 text-green-500" />}
      </td>
    </tr>
  );
}

// Accounts Section
function AccountsSection({
  accounts,
  accountMappings,
  onAccountMappingsChange,
  brands,
  onAccountsCreated,
  accountsCreated,
  isLoadingAccounts,
}: {
  accounts: QboAccount[];
  accountMappings: Record<string, string>;
  onAccountMappingsChange: (accounts: Record<string, string>) => void;
  brands: Brand[];
  onAccountsCreated: () => void;
  accountsCreated: boolean;
  isLoadingAccounts: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mappedCount = ALL_ACCOUNTS.filter((a) => accountMappings[a.key]).length;
  const allMapped = mappedCount === ALL_ACCOUNTS.length;

  const updateAccount = (key: string, id: string) => {
    onAccountMappingsChange({ ...accountMappings, [key]: id });
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
          accountMappings,
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

  if (brands.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Add brands first before mapping accounts.</p>
      </div>
    );
  }

  if (isLoadingAccounts) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Loading QBO accounts...</p>
      </div>
    );
  }

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

  const renderAccountGroup = (title: string, accountList: typeof INVENTORY_ACCOUNTS) => (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-800/50 px-4 py-2">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{title}</h3>
      </div>
      <table className="w-full">
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {accountList.map((acc) => (
            <AccountRow
              key={acc.key}
              label={acc.label}
              accountId={accountMappings[acc.key] || ''}
              accounts={accounts}
              onChange={(id) => updateAccount(acc.key, id)}
              type={acc.type}
            />
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Account Mapping</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Map QBO parent accounts. Plutus creates brand sub-accounts under each.
        </p>
      </div>

      <div className="grid gap-4">
        {renderAccountGroup('Inventory Asset', INVENTORY_ACCOUNTS)}
        {renderAccountGroup('Cost of Goods Sold', COGS_ACCOUNTS)}
        {renderAccountGroup('Revenue & Fees (LMB)', LMB_ACCOUNTS)}
      </div>

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
    </div>
  );
}

// SKUs Section
function SkusSection({
  skus,
  onSkusChange,
  brands,
}: {
  skus: Sku[];
  onSkusChange: (skus: Sku[]) => void;
  brands: Brand[];
}) {
  const [showModal, setShowModal] = useState(false);
  const [newSku, setNewSku] = useState({ sku: '', productName: '', brand: '', asin: '' });

  const addSku = () => {
    if (!newSku.sku.trim() || !newSku.brand) return;
    if (skus.some((s) => s.sku === newSku.sku.trim())) return;
    onSkusChange([...skus, { ...newSku, sku: newSku.sku.trim() }]);
    setNewSku({ sku: '', productName: '', brand: '', asin: '' });
    setShowModal(false);
  };

  const removeSku = (index: number) => {
    onSkusChange(skus.filter((_, i) => i !== index));
  };

  if (brands.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Add brands first before adding SKUs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">SKUs</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Add product SKUs and assign them to brands. Costs come from bills.
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} className="bg-brand-teal-500 hover:bg-brand-teal-600 text-white">
          <PlusIcon className="w-4 h-4 mr-1" />
          Add SKU
        </Button>
      </div>

      {skus.length > 0 ? (
        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">SKU</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Product Name</th>
                <th className="text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide px-4 py-3">Brand</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {skus.map((sku, i) => (
                <tr key={i} className="bg-white dark:bg-slate-900">
                  <td className="px-4 py-3 text-sm font-mono text-slate-900 dark:text-white">{sku.sku}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{sku.productName || '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-400">{sku.brand}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => removeSku(i)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No SKUs added yet</p>
        </div>
      )}

      <p className="text-sm text-slate-500 dark:text-slate-400">Total: {skus.length} SKU{skus.length !== 1 ? 's' : ''}</p>

      {/* Add SKU Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Add SKU</h3>
              <button onClick={() => setShowModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">SKU *</label>
                <input
                  type="text"
                  value={newSku.sku}
                  onChange={(e) => setNewSku({ ...newSku, sku: e.target.value })}
                  placeholder="CS-007"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Product Name</label>
                <input
                  type="text"
                  value={newSku.productName}
                  onChange={(e) => setNewSku({ ...newSku, productName: e.target.value })}
                  placeholder="6 Pack Drop Cloth 12x9ft"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Brand *</label>
                <select
                  value={newSku.brand}
                  onChange={(e) => setNewSku({ ...newSku, brand: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="">Select brand...</option>
                  {brands.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ASIN (optional)</label>
                <input
                  type="text"
                  value={newSku.asin}
                  onChange={(e) => setNewSku({ ...newSku, asin: e.target.value })}
                  placeholder="B08XYZ123"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => setShowModal(false)} variant="outline" className="flex-1">Cancel</Button>
              <Button
                onClick={addSku}
                disabled={!newSku.sku.trim() || !newSku.brand}
                className="flex-1 bg-brand-teal-500 hover:bg-brand-teal-600 text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Status Bar
function StatusBar({ brands, mappedAccounts, totalAccounts, skus }: { brands: number; mappedAccounts: number; totalAccounts: number; skus: number }) {
  return (
    <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 px-6 py-3">
      <div className="flex items-center gap-6 text-sm">
        <span className={cn('flex items-center gap-1.5', brands > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-500')}>
          <span className={cn('w-2 h-2 rounded-full', brands > 0 ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600')} />
          {brands} brand{brands !== 1 ? 's' : ''}
        </span>
        <span className={cn('flex items-center gap-1.5', mappedAccounts === totalAccounts ? 'text-green-600 dark:text-green-400' : mappedAccounts > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500')}>
          <span className={cn('w-2 h-2 rounded-full', mappedAccounts === totalAccounts ? 'bg-green-500' : mappedAccounts > 0 ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600')} />
          {mappedAccounts}/{totalAccounts} accounts
        </span>
        <span className={cn('flex items-center gap-1.5', skus > 0 ? 'text-green-600 dark:text-green-400' : 'text-slate-500')}>
          <span className={cn('w-2 h-2 rounded-full', skus > 0 ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600')} />
          {skus} SKU{skus !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}

// Main
export default function SetupPage() {
  const [state, setState] = useState<SetupState>({
    section: 'brands',
    brands: [
      { name: 'US-Dust Sheets', marketplace: 'amazon.com', currency: 'USD' },
      { name: 'UK-Dust Sheets', marketplace: 'amazon.co.uk', currency: 'GBP' },
    ],
    accountMappings: {},
    accountsCreated: false,
    skus: [],
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
    enabled: connectionStatus?.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const accounts = useMemo(() => accountsData?.accounts || [], [accountsData]);
  const mappedCount = ALL_ACCOUNTS.filter((a) => state.accountMappings[a.key]).length;

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
    return <NotConnectedScreen title="Setup" />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white transition-colors"
          >
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Setup</h1>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1">
        <Sidebar
          section={state.section}
          onSectionChange={(s) => saveState({ section: s })}
          brandsComplete={state.brands.length > 0}
          accountsComplete={state.accountsCreated}
          skusComplete={state.skus.length > 0}
        />

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-4xl">
            {state.section === 'brands' && (
              <BrandsSection
                brands={state.brands}
                onBrandsChange={(brands) => saveState({ brands, accountsCreated: false })}
              />
            )}
            {state.section === 'accounts' && (
              <AccountsSection
                accounts={accounts}
                accountMappings={state.accountMappings}
                onAccountMappingsChange={(accountMappings) => saveState({ accountMappings })}
                brands={state.brands}
                onAccountsCreated={() => saveState({ accountsCreated: true })}
                accountsCreated={state.accountsCreated}
                isLoadingAccounts={isLoadingAccounts}
              />
            )}
            {state.section === 'skus' && (
              <SkusSection
                skus={state.skus}
                onSkusChange={(skus) => saveState({ skus })}
                brands={state.brands}
              />
            )}
          </div>
        </main>
      </div>

      {/* Status bar */}
      <StatusBar
        brands={state.brands.length}
        mappedAccounts={mappedCount}
        totalAccounts={ALL_ACCOUNTS.length}
        skus={state.skus.length}
      />
    </div>
  );
}
