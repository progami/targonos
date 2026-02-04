'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

const STORAGE_KEY = 'plutus-setup-v5'; // Bump version for DB-backed state

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
  acctNum?: string | null;
  type: string;
  active: boolean;
};

function normalizeForMatch(value: string): string {
  return value.trim().toLowerCase();
}

function accountDepth(account: QboAccount): number {
  return account.fullyQualifiedName.split(':').length - 1;
}

function findAccountByExactName(
  accounts: QboAccount[],
  input: {
    name: string;
    type: string;
  },
): QboAccount | undefined {
  const expectedName = normalizeForMatch(input.name);
  const expectedType = input.type;

  const candidates = accounts.filter((account) => {
    if (account.type !== expectedType) return false;
    if (normalizeForMatch(account.name) !== expectedName) return false;
    return true;
  });

  if (candidates.length === 0) return undefined;

  const activeCandidates = candidates.filter((account) => account.active);
  const preferred = activeCandidates.length > 0 ? activeCandidates : candidates;

  const sorted = [...preferred].sort((a, b) => {
    const depthA = accountDepth(a);
    const depthB = accountDepth(b);
    if (depthA !== depthB) return depthA - depthB;
    return a.fullyQualifiedName.localeCompare(b.fullyQualifiedName);
  });

  return sorted[0];
}

function findAccountByFullyQualifiedName(
  accounts: QboAccount[],
  input: {
    fullyQualifiedName: string;
    type: string;
  },
): QboAccount | undefined {
  const expectedFullyQualifiedName = normalizeForMatch(input.fullyQualifiedName);
  const expectedType = input.type;

  const candidates = accounts.filter((account) => {
    if (account.type !== expectedType) return false;
    if (normalizeForMatch(account.fullyQualifiedName) !== expectedFullyQualifiedName) return false;
    return true;
  });

  if (candidates.length === 0) return undefined;

  const activeCandidates = candidates.filter((account) => account.active);
  const preferred = activeCandidates.length > 0 ? activeCandidates : candidates;

  const sorted = [...preferred].sort((a, b) => a.fullyQualifiedName.localeCompare(b.fullyQualifiedName));
  return sorted[0];
}

function suggestPlutusAccountMappings(accounts: QboAccount[]): Record<string, string> {
  const suggestions: Record<string, string> = {};

  const inventoryAsset = findAccountByExactName(accounts, {
    name: 'Inventory Asset',
    type: 'Other Current Asset',
  });
  if (inventoryAsset) {
    suggestions.invManufacturing = inventoryAsset.id;
    suggestions.invFreight = inventoryAsset.id;
    suggestions.invDuty = inventoryAsset.id;
    suggestions.invMfgAccessories = inventoryAsset.id;
  }

  const freightAndDuty = findAccountByExactName(accounts, {
    name: 'Freight & Custom Duty',
    type: 'Cost of Goods Sold',
  });
  if (freightAndDuty) {
    suggestions.cogsFreight = freightAndDuty.id;
    suggestions.cogsDuty = freightAndDuty.id;
  }

  const manufacturing = findAccountByExactName(accounts, { name: 'Manufacturing', type: 'Cost of Goods Sold' });
  if (manufacturing) {
    suggestions.cogsManufacturing = manufacturing.id;
  }

  const mfgAccessories = findAccountByExactName(accounts, { name: 'Mfg Accessories', type: 'Cost of Goods Sold' });
  if (mfgAccessories) {
    suggestions.cogsMfgAccessories = mfgAccessories.id;
  }

  let landFreight = findAccountByFullyQualifiedName(accounts, {
    fullyQualifiedName: 'Warehousing:3PL:Land Freight',
    type: 'Cost of Goods Sold',
  });
  if (!landFreight) {
    landFreight = findAccountByExactName(accounts, { name: 'Land Freight', type: 'Cost of Goods Sold' });
  }
  if (landFreight) {
    suggestions.cogsLandFreight = landFreight.id;
  }

  let storage3pl = findAccountByExactName(accounts, { name: 'Storage 3PL', type: 'Cost of Goods Sold' });
  if (!storage3pl) {
    storage3pl = findAccountByExactName(accounts, { name: '3PL Storage', type: 'Cost of Goods Sold' });
  }
  if (storage3pl) {
    suggestions.cogsStorage3pl = storage3pl.id;
  }

  const warehousing3pl = findAccountByFullyQualifiedName(accounts, {
    fullyQualifiedName: 'Warehousing:3PL',
    type: 'Cost of Goods Sold',
  });
  if (warehousing3pl) {
    suggestions.warehousing3pl = warehousing3pl.id;
  }

  const warehousingAmazonFc = findAccountByFullyQualifiedName(accounts, {
    fullyQualifiedName: 'Warehousing:Amazon FC',
    type: 'Cost of Goods Sold',
  });
  if (warehousingAmazonFc) {
    suggestions.warehousingAmazonFc = warehousingAmazonFc.id;
  }

  const warehousingAwd = findAccountByFullyQualifiedName(accounts, {
    fullyQualifiedName: 'Warehousing:AWD',
    type: 'Cost of Goods Sold',
  });
  if (warehousingAwd) {
    suggestions.warehousingAwd = warehousingAwd.id;
  }

  const shrinkage = findAccountByExactName(accounts, { name: 'Inventory Shrinkage', type: 'Cost of Goods Sold' });
  if (shrinkage) {
    suggestions.cogsShrinkage = shrinkage.id;
  }

  const amazonSales = findAccountByExactName(accounts, { name: 'Amazon Sales', type: 'Income' });
  if (amazonSales) {
    suggestions.amazonSales = amazonSales.id;
  }

  const amazonRefunds = findAccountByExactName(accounts, { name: 'Amazon Refunds', type: 'Income' });
  if (amazonRefunds) {
    suggestions.amazonRefunds = amazonRefunds.id;
  }

  const reimbursement = findAccountByExactName(accounts, { name: 'Amazon FBA Inventory Reimbursement', type: 'Other Income' });
  if (reimbursement) {
    suggestions.amazonFbaInventoryReimbursement = reimbursement.id;
  }

  const sellerFees = findAccountByExactName(accounts, { name: 'Amazon Seller Fees', type: 'Cost of Goods Sold' });
  if (sellerFees) {
    suggestions.amazonSellerFees = sellerFees.id;
  }

  const fbaFees = findAccountByExactName(accounts, { name: 'Amazon FBA Fees', type: 'Cost of Goods Sold' });
  if (fbaFees) {
    suggestions.amazonFbaFees = fbaFees.id;
  }

  const storageFees = findAccountByExactName(accounts, { name: 'Amazon Storage Fees', type: 'Cost of Goods Sold' });
  if (storageFees) {
    suggestions.amazonStorageFees = storageFees.id;
  }

  const advertisingCosts = findAccountByExactName(accounts, { name: 'Amazon Advertising Costs', type: 'Cost of Goods Sold' });
  if (advertisingCosts) {
    suggestions.amazonAdvertisingCosts = advertisingCosts.id;
  }

  const promotions = findAccountByExactName(accounts, { name: 'Amazon Promotions', type: 'Cost of Goods Sold' });
  if (promotions) {
    suggestions.amazonPromotions = promotions.id;
  }

  return suggestions;
}

// Icons
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4', className)} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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

const WAREHOUSING_ACCOUNTS = [
  { key: 'warehousing3pl', label: '3PL', type: 'Cost of Goods Sold' },
  { key: 'warehousingAmazonFc', label: 'Amazon FC', type: 'Cost of Goods Sold' },
  { key: 'warehousingAwd', label: 'AWD', type: 'Cost of Goods Sold' },
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

const ALL_ACCOUNTS = [...INVENTORY_ACCOUNTS, ...COGS_ACCOUNTS, ...WAREHOUSING_ACCOUNTS, ...LMB_ACCOUNTS];

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
    { id: 'accounts' as const, label: 'Map accounts', complete: accountsComplete },
    { id: 'skus' as const, label: 'Inventory', complete: skusComplete },
  ];

  return (
    <nav className="w-full md:w-72 flex-shrink-0 border-b border-slate-200/70 dark:border-white/10 md:border-b-0 md:border-r bg-white/60 dark:bg-white/[0.02]">
      <div className="px-5 pt-5 pb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Wizard
        </div>
      </div>

      <ol className="relative px-5 pb-5">
        {items.map((item, index) => {
          const isActive = section === item.id;
          const isLast = index === items.length - 1;

          return (
            <li key={item.id} className={cn('relative pl-9', !isLast && 'pb-6')}>
              {!isLast && (
                <div className="absolute left-[13px] top-7 h-full w-px bg-slate-200 dark:bg-white/10" />
              )}

              <div
                className={cn(
                  'absolute left-2 top-1.5 flex h-6 w-6 items-center justify-center rounded-full border',
                  item.complete
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : isActive
                      ? 'bg-white border-brand-teal-500 text-brand-teal-600 dark:bg-slate-950 dark:border-brand-cyan dark:text-brand-cyan'
                      : 'bg-white border-slate-300 text-slate-400 dark:bg-slate-950 dark:border-white/10 dark:text-slate-500',
                )}
              >
                {item.complete ? <CheckIcon className="h-4 w-4" /> : <span className="text-xs font-semibold">{index + 1}</span>}
              </div>

              <button
                type="button"
                onClick={() => onSectionChange(item.id)}
                className={cn(
                  'w-full text-left text-sm transition-colors',
                  isActive
                    ? 'font-semibold text-slate-900 dark:text-white'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
                )}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ol>
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
      </div>

      {brands.length > 0 && (
        <Card className="border-slate-200/70 dark:border-white/10">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Brand</TableHead>
                    <TableHead>Marketplace</TableHead>
                    <TableHead>Currency</TableHead>
                    <TableHead className="w-12 text-right"> </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.map((brand, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{brand.name}</TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                        {MARKETPLACES.find((m) => m.id === brand.marketplace)?.label}
                      </TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">{brand.currency}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => removeBrand(i)} aria-label={`Remove brand ${brand.name}`}>
                          <XIcon className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-slate-200/70 dark:border-white/10">
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr,240px,auto] sm:items-end">
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Brand name
              </div>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => (e.key === 'Enter' ? addBrand() : undefined)}
                placeholder="US-Dust Sheets"
              />
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Marketplace
              </div>
              <Select value={newMarketplace} onValueChange={setNewMarketplace}>
                <SelectTrigger>
                  <SelectValue placeholder="Select marketplace…" />
                </SelectTrigger>
                <SelectContent>
                  {MARKETPLACES.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={addBrand} disabled={!newName.trim()}>
                <PlusIcon className="h-4 w-4" />
                Add Brand
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
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
    <TableRow>
      <TableCell className="text-sm font-medium text-slate-900 dark:text-white">
        {label}
      </TableCell>
      <TableCell>
        <Select value={accountId} onValueChange={onChange}>
          <SelectTrigger
            className={cn(
              'bg-white dark:bg-white/5',
              selected ? 'border-brand-teal-300 dark:border-brand-teal-700' : undefined,
            )}
          >
            <SelectValue placeholder="Select parent account…" />
          </SelectTrigger>
          <SelectContent>
            {filtered.map((a) => {
              const label = a.acctNum ? `${a.acctNum} · ${a.fullyQualifiedName}` : a.fullyQualifiedName;
              return (
                <SelectItem key={a.id} value={a.id}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="w-12 text-right">
        {selected && <CheckIcon className="h-4 w-4 text-green-500" />}
      </TableCell>
    </TableRow>
  );
}

// Accounts Section
function AccountsSection({
  isQboConnected,
  accounts,
  accountMappings,
  onAccountMappingsChange,
  brands,
  onAccountsCreated,
  accountsCreated,
  isLoadingAccounts,
}: {
  isQboConnected: boolean;
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
  const [lastEnsureSummary, setLastEnsureSummary] = useState<{ created: number; skipped: number } | null>(null);

  const mappedCount = ALL_ACCOUNTS.filter((a) => accountMappings[a.key]).length;
  const allMapped = mappedCount === ALL_ACCOUNTS.length;

  const updateAccount = (key: string, id: string) => {
    onAccountMappingsChange({ ...accountMappings, [key]: id });
  };

  const suggestedMappings = useMemo(() => suggestPlutusAccountMappings(accounts), [accounts]);

  useEffect(() => {
    if (!isQboConnected) return;
    if (isLoadingAccounts) return;
    if (accounts.length === 0) return;

    const next = { ...accountMappings };
    let changed = false;
    for (const [key, value] of Object.entries(suggestedMappings)) {
      const current = next[key];
      const isEmpty = current === undefined ? true : current === '';
      if (isEmpty && value !== '') {
        next[key] = value;
        changed = true;
      }
    }

    if (changed) {
      onAccountMappingsChange(next);
    }
  }, [accountMappings, accounts.length, isLoadingAccounts, isQboConnected, onAccountMappingsChange, suggestedMappings]);

  const handleConnect = () => {
    window.location.href = `${basePath}/api/qbo/connect`;
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
      if (!res.ok) {
        const message = data.error ? data.error : 'Failed to create accounts';
        throw new Error(message);
      }

      if (!Array.isArray(data.created) || !Array.isArray(data.skipped)) {
        throw new Error('Unexpected response from account creation endpoint');
      }

      setLastEnsureSummary({ created: data.created.length, skipped: data.skipped.length });
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

  if (!isQboConnected) {
    return (
      <div className="flex items-center justify-center py-12">
        <Card className="max-w-md w-full border-slate-200/70 dark:border-white/10">
          <CardContent className="p-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
              <PlusIcon className="h-5 w-5" />
            </div>
            <div className="mt-4 text-sm font-semibold text-slate-900 dark:text-white">Connect QuickBooks</div>
            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Account mapping is available after connecting QBO.
            </div>
            <div className="mt-5">
              <Button
                onClick={handleConnect}
                className="w-full rounded-xl bg-brand-teal-600 hover:bg-brand-teal-700 dark:bg-brand-cyan dark:hover:bg-brand-cyan/90 text-white shadow-lg shadow-brand-teal-500/25 dark:shadow-brand-cyan/20"
              >
                Connect to QuickBooks
              </Button>
            </div>
          </CardContent>
        </Card>
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

  const renderAccountGroup = (title: string, accountList: Array<{ key: string; label: string; type: string }>) => (
    <Card className="border-slate-200/70 dark:border-white/10 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">{title}</div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead>QBO parent account</TableHead>
                <TableHead className="w-12 text-right"> </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accountList.map((acc) => (
                <AccountRow
                  key={acc.key}
                  label={acc.label}
                  accountId={accountMappings[acc.key] ? accountMappings[acc.key] : ''}
                  accounts={accounts}
                  onChange={(id) => updateAccount(acc.key, id)}
                  type={acc.type}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Account Mapping</h2>
      </div>

      {accountsCreated && (
        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4 text-sm text-emerald-900 dark:border-emerald-900/30 dark:bg-emerald-900/10 dark:text-emerald-200">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 text-emerald-700 ring-1 ring-emerald-200/70 dark:bg-white/5 dark:text-emerald-300 dark:ring-emerald-900/30">
              <CheckIcon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold">Sub-accounts ensured in QBO</div>
              <div className="mt-0.5 text-emerald-800/80 dark:text-emerald-200/80">
                {lastEnsureSummary
                  ? `Created ${lastEnsureSummary.created}, skipped ${lastEnsureSummary.skipped}.`
                  : `Ready for ${brands.length} brand${brands.length > 1 ? 's' : ''}.`}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {renderAccountGroup('Inventory Asset', INVENTORY_ACCOUNTS)}
        {renderAccountGroup('Cost of Goods Sold', COGS_ACCOUNTS)}
        {renderAccountGroup('Warehousing', WAREHOUSING_ACCOUNTS)}
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
        className="w-full"
      >
        {creating ? 'Ensuring…' : `Ensure Sub-Accounts for ${brands.length} Brand${brands.length > 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}

// Marketplace to country mapping for SKU scoping
const MARKETPLACE_COUNTRY: Record<string, 'US' | 'UK'> = {
  'amazon.com': 'US',
  'amazon.co.uk': 'UK',
};

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
  const normalizeSkuKey = useCallback((raw: string) => raw.trim().replace(/\s+/g, '-').toUpperCase(), []);

  // Derive unique countries from brands
  const countries = useMemo(() => {
    const set = new Set<'US' | 'UK'>();
    for (const b of brands) {
      const country = MARKETPLACE_COUNTRY[b.marketplace];
      if (country) set.add(country);
    }
    return Array.from(set);
  }, [brands]);

  const [draftSkus, setDraftSkus] = useState<Sku[]>(skus);

  useEffect(() => {
    setDraftSkus(skus);
  }, [skus]);

  // Get brands for a given country
  const brandsForCountry = useCallback((country: 'US' | 'UK') => {
    return brands.filter((b) => MARKETPLACE_COUNTRY[b.marketplace] === country);
  }, [brands]);

  const brandByName = useMemo(() => new Map(brands.map((b) => [b.name, b])), [brands]);

  const keyForSku = useCallback(
    (sku: Sku) => {
      const brand = brandByName.get(sku.brand);
      if (!brand) {
        throw new Error(`Unknown brand: ${sku.brand}`);
      }
      const country = MARKETPLACE_COUNTRY[brand.marketplace];
      if (!country) {
        throw new Error(`Unsupported marketplace for brand: ${brand.marketplace}`);
      }
  return `${country}::${normalizeSkuKey(sku.sku)}`;
    },
    [brandByName, normalizeSkuKey],
  );

  const draftByKey = useMemo(() => {
    const map = new Map<string, Sku>();
    for (const sku of draftSkus) {
      map.set(keyForSku(sku), sku);
    }
    return map;
  }, [draftSkus, keyForSku]);

  const handleRemoveConfiguredSku = useCallback(
    (key: string) => {
      setDraftSkus((prev) => prev.filter((sku) => keyForSku(sku) !== key));
    },
    [keyForSku],
  );

  const handleUpdateConfiguredSku = useCallback(
    (key: string, patch: Partial<Sku>) => {
      setDraftSkus((prev) => {
        const next = [...prev];
        const index = next.findIndex((sku) => keyForSku(sku) === key);
        if (index === -1) return prev;

        const current = next[index];
        if (!current) return prev;

        next[index] = { ...current, ...patch };
        return next;
      });
    },
    [keyForSku],
  );

  const supportedBrands = useMemo(
    () => brands.filter((b) => MARKETPLACE_COUNTRY[b.marketplace] !== undefined),
    [brands],
  );

  const [manualSku, setManualSku] = useState<{ sku: string; productName: string; asin: string; brand: string }>({
    sku: '',
    productName: '',
    asin: '',
    brand: '',
  });

  const handleAddManualSku = useCallback(() => {
    const sku = manualSku.sku.trim();
    if (sku === '') return;
    if (manualSku.brand.trim() === '') return;

    const brand = brandByName.get(manualSku.brand);
    if (!brand) {
      throw new Error(`Unknown brand: ${manualSku.brand}`);
    }
    const country = MARKETPLACE_COUNTRY[brand.marketplace];
    if (!country) {
      throw new Error(`Unsupported marketplace for brand: ${brand.marketplace}`);
    }

    const key = `${country}::${normalizeSkuKey(sku)}`;
    if (draftByKey.has(key)) return;

    const productName = manualSku.productName.trim() === '' ? sku : manualSku.productName.trim();
    const asin = manualSku.asin.trim() === '' ? undefined : manualSku.asin.trim();

    setDraftSkus((prev) => [
      ...prev,
      {
        sku,
        productName,
        asin,
        brand: manualSku.brand.trim(),
      },
    ]);

    setManualSku({ sku: '', productName: '', asin: '', brand: manualSku.brand });
  }, [brandByName, draftByKey, manualSku, normalizeSkuKey]);

  // Save configured SKUs
  const handleSave = useCallback(() => {
    onSkusChange(draftSkus);
  }, [draftSkus, onSkusChange]);

  if (brands.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Add brands first before adding SKUs.</p>
      </div>
    );
  }

  if (countries.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">No supported marketplaces found. Add US or UK brands first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Inventory</h2>
      </div>

      <Card className="border-slate-200/70 dark:border-white/10 overflow-hidden">
        <CardContent className="p-0">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">Configured SKUs</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{draftSkus.length} total</div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product name</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead className="w-12 text-right"> </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {draftSkus.length > 0 ? (
                  draftSkus
                    .map((sku) => {
                      const key = keyForSku(sku);
                      const [country] = key.split('::');
                      return { sku, key, country: country as 'US' | 'UK' };
                    })
                    .sort((a, b) => a.key.localeCompare(b.key))
                    .map(({ sku, key, country }) => (
                      <TableRow key={key}>
                        <TableCell className="font-mono text-sm text-slate-900 dark:text-white whitespace-nowrap">{sku.sku}</TableCell>
                        <TableCell className="min-w-[220px]">
                          <Input
                            value={sku.productName}
                            onChange={(e) => handleUpdateConfiguredSku(key, { productName: e.target.value })}
                            placeholder="Product name"
                          />
                        </TableCell>
                        <TableCell className="min-w-[170px]">
                          <Input
                            value={sku.asin ? sku.asin : ''}
                            onChange={(e) =>
                              handleUpdateConfiguredSku(
                                key,
                                e.target.value.trim() === '' ? { asin: undefined } : { asin: e.target.value },
                              )
                            }
                            placeholder="ASIN"
                            className="font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {country}
                          </span>
                        </TableCell>
                        <TableCell className="min-w-[220px]">
                          <Select value={sku.brand} onValueChange={(value) => handleUpdateConfiguredSku(key, { brand: value })}>
                            <SelectTrigger className="w-[220px]">
                              <SelectValue placeholder="Select brand…" />
                            </SelectTrigger>
                            <SelectContent>
                              {brandsForCountry(country).map((b) => (
                                <SelectItem key={b.name} value={b.name}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" onClick={() => handleRemoveConfiguredSku(key)} aria-label={`Remove SKU ${sku.sku}`}>
                            <XIcon className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No SKUs configured yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="border-t border-slate-200/70 dark:border-white/10 bg-white/60 dark:bg-white/[0.02] px-4 py-4">
            <div className="grid gap-3 md:grid-cols-[1.2fr,2fr,1.2fr,1.2fr,auto] md:items-end">
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">SKU</div>
                <Input
                  value={manualSku.sku}
                  onChange={(e) => setManualSku((prev) => ({ ...prev, sku: e.target.value }))}
                  placeholder="e.g. CSTDS001002"
                  className="font-mono"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Product name</div>
                <Input
                  value={manualSku.productName}
                  onChange={(e) => setManualSku((prev) => ({ ...prev, productName: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">ASIN</div>
                <Input
                  value={manualSku.asin}
                  onChange={(e) => setManualSku((prev) => ({ ...prev, asin: e.target.value }))}
                  placeholder="Optional"
                  className="font-mono"
                />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Brand</div>
                <Select value={manualSku.brand} onValueChange={(value) => setManualSku((prev) => ({ ...prev, brand: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brand…" />
                  </SelectTrigger>
                  <SelectContent>
                    {supportedBrands.map((b) => (
                      <SelectItem key={b.name} value={b.name}>
                        {b.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddManualSku} disabled={manualSku.sku.trim() === '' || manualSku.brand.trim() === ''}>
                Add SKU
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {draftSkus.length} configured SKU{draftSkus.length !== 1 ? 's' : ''}
        </p>
        <Button onClick={handleSave}>
          Save SKUs
        </Button>
      </div>
    </div>
  );
}

// Status Bar
function StatusBar({ brands, mappedAccounts, totalAccounts, skus }: { brands: number; mappedAccounts: number; totalAccounts: number; skus: number }) {
  return (
    <div className="border-t border-slate-200/70 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] px-6 py-3">
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
  const queryClient = useQueryClient();

  const [state, setState] = useState<SetupState>({
    section: 'brands',
    brands: [],
    accountMappings: {},
    accountsCreated: false,
    skus: [],
  });

  // Fetch setup data from API
  const { data: setupData, isLoading: isLoadingSetup } = useQuery({
    queryKey: ['setup'],
    queryFn: async () => {
      const res = await fetch(`${basePath}/api/setup`);
      if (!res.ok) throw new Error('Failed to fetch setup');
      return res.json() as Promise<{
        brands: Array<{ id: string; name: string; marketplace: string; currency: string }>;
        skus: Array<{ id: string; sku: string; productName: string | null; brand: string; asin: string | null }>;
        accountMappings: Record<string, string | null>;
        accountsCreated: boolean;
      }>;
    },
    staleTime: 30 * 1000,
  });

  // Initialize state from API data
  useEffect(() => {
    if (setupData) {
      setState((prev) => ({
        ...prev,
        brands: setupData.brands.map((b) => ({ name: b.name, marketplace: b.marketplace, currency: b.currency })),
        skus: setupData.skus.map((s) => ({
          sku: s.sku,
          productName: s.productName ? s.productName : '',
          brand: s.brand,
          asin: s.asin ? s.asin : undefined,
        })),
        accountMappings: Object.fromEntries(Object.entries(setupData.accountMappings).filter(([, v]) => v != null)) as Record<string, string>,
        accountsCreated: setupData.accountsCreated,
      }));
    } else {
      // Fall back to localStorage if API returns nothing
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setState((prev) => ({ ...prev, ...parsed }));
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    }
  }, [setupData]);

  // Mutations for saving data
  const saveBrandsMutation = useMutation({
    mutationFn: async (brands: Brand[]) => {
      const res = await fetch(`${basePath}/api/setup/brands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brands }),
      });
      if (!res.ok) throw new Error('Failed to save brands');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });

  const saveSkusMutation = useMutation({
    mutationFn: async (skus: Sku[]) => {
      const res = await fetch(`${basePath}/api/setup/skus`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus }),
      });
      if (!res.ok) throw new Error('Failed to save SKUs');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });

  const saveAccountsMutation = useMutation({
    mutationFn: async (data: { accountMappings: Record<string, string>; accountsCreated?: boolean }) => {
      const res = await fetch(`${basePath}/api/setup/accounts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to save accounts');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['setup'] }),
  });

  // Save state (local + API)
  const saveState = useCallback((patch: Partial<SetupState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      // Save to localStorage as backup
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  // Save brands to API when they change
  const saveBrands = useCallback((brands: Brand[]) => {
    saveState({ brands, accountsCreated: false });
    saveBrandsMutation.mutate(brands);
  }, [saveState, saveBrandsMutation]);

  // Save SKUs to API when they change
  const saveSkus = useCallback((skus: Sku[]) => {
    saveState({ skus });
    saveSkusMutation.mutate(skus);
  }, [saveState, saveSkusMutation]);

  // Save account mappings to API
  const saveAccountMappings = useCallback((accountMappings: Record<string, string>) => {
    saveState({ accountMappings });
    saveAccountsMutation.mutate({ accountMappings });
  }, [saveState, saveAccountsMutation]);

  // Mark accounts as created
  const markAccountsCreated = useCallback(() => {
    saveState({ accountsCreated: true });
    saveAccountsMutation.mutate({ accountMappings: state.accountMappings, accountsCreated: true });
  }, [saveState, saveAccountsMutation, state.accountMappings]);

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

  const accounts = useMemo(() => (accountsData ? accountsData.accounts : []), [accountsData]);
  const mappedCount = ALL_ACCOUNTS.filter((a) => state.accountMappings[a.key]).length;

  // Show loading while checking connection or loading setup
  if (isCheckingConnection || isLoadingSetup) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <PageHeader
            title="Accounts & Taxes Setup Wizard"
            variant="accent"
          />
          <div className="mt-6">
            <Card className="border-slate-200/70 dark:border-white/10">
              <CardContent className="p-6">
                <div className="text-sm text-slate-500">Loading setup…</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Accounts & Taxes Setup Wizard"
          variant="accent"
        />

        {connectionStatus?.connected !== true && (
          <Card className="mt-6 border-slate-200/70 dark:border-white/10">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
                  <InfoIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">Not connected to QuickBooks</div>
                  <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    You can still add brands and inventory. Connect QBO to map accounts and use dashboards.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="mt-6 overflow-hidden border-slate-200/70 dark:border-white/10">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row">
              <Sidebar
                section={state.section}
                onSectionChange={(s) => saveState({ section: s })}
                brandsComplete={state.brands.length > 0}
                accountsComplete={state.accountsCreated && mappedCount === ALL_ACCOUNTS.length}
                skusComplete={state.skus.length > 0}
              />

              <div className="flex-1 p-6">
                <div className="max-w-4xl">
                  {state.section === 'brands' && <BrandsSection brands={state.brands} onBrandsChange={saveBrands} />}
                  {state.section === 'accounts' && (
                    <AccountsSection
                      isQboConnected={connectionStatus?.connected === true}
                      accounts={accounts}
                      accountMappings={state.accountMappings}
                      onAccountMappingsChange={saveAccountMappings}
                      brands={state.brands}
                      onAccountsCreated={markAccountsCreated}
                      accountsCreated={state.accountsCreated}
                      isLoadingAccounts={isLoadingAccounts}
                    />
                  )}
                  {state.section === 'skus' && <SkusSection skus={state.skus} onSkusChange={saveSkus} brands={state.brands} />}
                </div>
              </div>
            </div>
          </CardContent>

          <StatusBar
            brands={state.brands.length}
            mappedAccounts={mappedCount}
            totalAccounts={ALL_ACCOUNTS.length}
            skus={state.skus.length}
          />
        </Card>
      </div>
    </main>
  );
}
