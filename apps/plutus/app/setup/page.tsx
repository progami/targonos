'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { BackButton } from '@/components/back-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { NotConnectedScreen } from '@/components/not-connected-screen';
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

// Account definitions with tooltips
const INVENTORY_ACCOUNTS = [
  { key: 'invManufacturing', label: 'Manufacturing', type: 'Other Current Asset', tip: 'Product cost from supplier' },
  { key: 'invFreight', label: 'Freight', type: 'Other Current Asset', tip: 'International shipping costs' },
  { key: 'invDuty', label: 'Duty', type: 'Other Current Asset', tip: 'Import duty/customs charges' },
  { key: 'invMfgAccessories', label: 'Mfg Accessories', type: 'Other Current Asset', tip: 'Packaging, labels, inserts' },
];

const COGS_ACCOUNTS = [
  { key: 'cogsManufacturing', label: 'Manufacturing', type: 'Cost of Goods Sold', tip: 'Product cost when sold' },
  { key: 'cogsFreight', label: 'Freight', type: 'Cost of Goods Sold', tip: 'Freight cost when sold' },
  { key: 'cogsDuty', label: 'Duty', type: 'Cost of Goods Sold', tip: 'Duty cost when sold' },
  { key: 'cogsMfgAccessories', label: 'Mfg Accessories', type: 'Cost of Goods Sold', tip: 'Accessories cost when sold' },
  { key: 'cogsLandFreight', label: 'Land Freight', type: 'Cost of Goods Sold', tip: 'Local shipping (3PL to FBA)' },
  { key: 'cogsStorage3pl', label: 'Storage 3PL', type: 'Cost of Goods Sold', tip: '3PL warehouse storage fees' },
  { key: 'cogsShrinkage', label: 'Shrinkage', type: 'Cost of Goods Sold', tip: 'Lost/damaged inventory' },
];

const LMB_ACCOUNTS = [
  { key: 'amazonSales', label: 'Amazon Sales', type: 'Income', tip: 'Revenue from product sales' },
  { key: 'amazonRefunds', label: 'Amazon Refunds', type: 'Income', tip: 'Customer refunds (contra-revenue)' },
  { key: 'amazonFbaInventoryReimbursement', label: 'FBA Reimbursement', type: 'Other Income', tip: 'Amazon reimbursements for lost inventory' },
  { key: 'amazonSellerFees', label: 'Seller Fees', type: 'Cost of Goods Sold', tip: 'Referral fees, closing fees' },
  { key: 'amazonFbaFees', label: 'FBA Fees', type: 'Cost of Goods Sold', tip: 'Fulfillment fees' },
  { key: 'amazonStorageFees', label: 'Storage Fees', type: 'Cost of Goods Sold', tip: 'FBA warehouse storage' },
  { key: 'amazonAdvertisingCosts', label: 'Advertising', type: 'Cost of Goods Sold', tip: 'PPC and sponsored ads' },
  { key: 'amazonPromotions', label: 'Promotions', type: 'Cost of Goods Sold', tip: 'Coupons and promotions' },
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
    <nav className="w-full md:w-56 flex-shrink-0 border-b border-slate-200/70 dark:border-white/10 md:border-b-0 md:border-r p-4">
      <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">Setup</h2>
      <ul className="flex gap-2 overflow-x-auto pb-1 md:block md:space-y-1 md:overflow-visible md:pb-0">
        {items.map((item) => (
          <li key={item.id}>
            <button
              onClick={() => onSectionChange(item.id)}
              className={cn(
                'w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors whitespace-nowrap',
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
  tip,
}: {
  label: string;
  accountId: string;
  accounts: QboAccount[];
  onChange: (id: string) => void;
  type?: string;
  tip?: string;
}) {
  const filtered = type ? accounts.filter((a) => a.type === type) : accounts;
  const selected = accounts.find((a) => a.id === accountId);

  return (
    <TableRow>
      <TableCell className="text-sm font-medium text-slate-900 dark:text-white">
        <div className="flex items-center gap-1.5">
          <span>{label}</span>
          {tip && (
            <Tooltip content={tip} className="inline-flex">
              <InfoIcon className="h-3.5 w-3.5 text-slate-400" />
            </Tooltip>
          )}
        </div>
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
      if (!res.ok) {
        const message = data.error ? data.error : 'Failed to create accounts';
        throw new Error(message);
      }
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

  const renderAccountGroup = (title: string, description: string, accountList: typeof INVENTORY_ACCOUNTS) => (
    <Card className="border-slate-200/70 dark:border-white/10 overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/70 bg-slate-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
              {title}
            </div>
            <Tooltip content={description} className="inline-flex">
              <InfoIcon className="h-3.5 w-3.5 text-slate-400" />
            </Tooltip>
          </div>
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
                  tip={acc.tip}
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
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Select your existing QBO <span className="font-medium text-slate-600 dark:text-slate-300">parent accounts</span>. Plutus will create brand sub-accounts under each (e.g., &quot;Manufacturing - US-Dust Sheets&quot;).
        </p>
      </div>

      <Card className="border-slate-200/70 dark:border-white/10">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300">
              <InfoIcon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Prerequisite</div>
              <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Run the Link My Books Accounts &amp; Taxes wizard first so the base Amazon accounts exist in QBO. Then map those parent accounts here.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4">
        {renderAccountGroup(
          'Inventory Asset',
          'For most setups, select your QBO "Inventory Asset" parent for all 4 rows. Plutus creates sub-accounts like "Inv Manufacturing - US-Dust Sheets" under it.',
          INVENTORY_ACCOUNTS,
        )}
        {renderAccountGroup('Cost of Goods Sold', 'Select parent accounts for COGS sub-accounts. Plutus posts here when inventory is sold.', COGS_ACCOUNTS)}
        {renderAccountGroup('Revenue & Fees (LMB)', 'Select LMB parent accounts. Plutus creates brand sub-accounts for fee allocation.', LMB_ACCOUNTS)}
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
        {creating ? 'Creating…' : `Create Sub-Accounts for ${brands.length} Brand${brands.length > 1 ? 's' : ''}`}
      </Button>
    </div>
  );
}

// Marketplace to country mapping for Talos DB queries
const MARKETPLACE_COUNTRY: Record<string, 'US' | 'UK'> = {
  'amazon.com': 'US',
  'amazon.co.uk': 'UK',
};

type TalosSku = { skuCode: string; asin: string | null; description: string; country: 'US' | 'UK' };

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
  // Derive unique countries from brands
  const countries = useMemo(() => {
    const set = new Set<'US' | 'UK'>();
    for (const b of brands) {
      const country = MARKETPLACE_COUNTRY[b.marketplace];
      if (country) set.add(country);
    }
    return Array.from(set);
  }, [brands]);

  // Fetch Talos SKUs for each country
  const { data: talosSkus, isLoading: isLoadingTalos } = useQuery({
    queryKey: ['talos-skus', countries],
    queryFn: async () => {
      const results: TalosSku[] = [];
      for (const country of countries) {
        const res = await fetch(`${basePath}/api/setup/talos-skus?country=${country}`);
        if (!res.ok) throw new Error(`Failed to fetch ${country} SKUs`);
        const data = await res.json() as { skus: { skuCode: string; asin: string | null; description: string }[] };
        for (const s of data.skus) {
          results.push({ ...s, country });
        }
      }
      return results;
    },
    enabled: countries.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Brand assignments: skuCode -> brand name
  const [brandAssignments, setBrandAssignments] = useState<Record<string, string>>({});

  // Initialize assignments from existing saved SKUs
  useEffect(() => {
    if (skus.length > 0 && talosSkus && talosSkus.length > 0) {
      const initial: Record<string, string> = {};
      for (const s of skus) {
        initial[s.sku] = s.brand;
      }
      setBrandAssignments(initial);
    }
  }, [skus, talosSkus]);

  // Get brands for a given country
  const brandsForCountry = useCallback((country: 'US' | 'UK') => {
    return brands.filter((b) => MARKETPLACE_COUNTRY[b.marketplace] === country);
  }, [brands]);

  // Save assigned SKUs
  const handleSave = useCallback(() => {
    if (!talosSkus) return;
    const skusToSave: Sku[] = talosSkus
      .filter((s) => brandAssignments[s.skuCode])
      .map((s) => ({
        sku: s.skuCode,
        productName: s.description,
        asin: s.asin ?? undefined,
        brand: brandAssignments[s.skuCode],
      }));
    onSkusChange(skusToSave);
  }, [talosSkus, brandAssignments, onSkusChange]);

  const assignedCount = Object.values(brandAssignments).filter(Boolean).length;

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

  if (isLoadingTalos) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500 dark:text-slate-400">Loading SKUs from Talos…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">SKUs</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          SKUs imported from Talos. Assign each SKU to a brand for COGS tracking.
        </p>
      </div>

      <Card className="border-slate-200/70 dark:border-white/10">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Product name</TableHead>
                  <TableHead>ASIN</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Brand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {talosSkus && talosSkus.length > 0 ? (
                  talosSkus.map((s) => (
                    <TableRow key={`${s.country}-${s.skuCode}`}>
                      <TableCell className="font-mono text-sm text-slate-900 dark:text-white">{s.skuCode}</TableCell>
                      <TableCell className="text-sm text-slate-600 dark:text-slate-300">{s.description}</TableCell>
                      <TableCell className="font-mono text-sm text-slate-500 dark:text-slate-400">
                        {s.asin ?? '—'}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                          {s.country}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={brandAssignments[s.skuCode] ?? ''}
                          onValueChange={(value) =>
                            setBrandAssignments((prev) => ({ ...prev, [s.skuCode]: value }))
                          }
                        >
                          <SelectTrigger className="w-[200px]">
                            <SelectValue placeholder="Select brand…" />
                          </SelectTrigger>
                          <SelectContent>
                            {brandsForCountry(s.country).map((b) => (
                              <SelectItem key={b.name} value={b.name}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                      No SKUs found in Talos for {countries.join(', ')}.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {assignedCount} of {talosSkus?.length ?? 0} SKUs assigned to brands
        </p>
        <Button onClick={handleSave} disabled={assignedCount === 0}>
          Save SKU Assignments
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
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between gap-3">
            <BackButton />
          </div>
          <PageHeader
            className="mt-4"
            title="Setup"
            kicker="Plutus"
            description="Configure brands, map QBO parent accounts, and assign SKUs to build brand-level P&Ls."
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

  // Show not connected screen
  if (!connectionStatus?.connected) {
    return <NotConnectedScreen title="Setup" />;
  }

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-3">
          <BackButton />
        </div>
        <PageHeader
          className="mt-4"
          title="Setup"
          kicker="Plutus"
          description="Configure brands, map QBO parent accounts, and assign SKUs to build brand-level P&Ls."
          actions={
            <>
              <Button asChild variant="outline">
                <Link href="/settlements">Settlements</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/bills">Bills</Link>
              </Button>
            </>
          }
        />

        <Card className="mt-6 overflow-hidden border-slate-200/70 dark:border-white/10">
          <CardContent className="p-0">
            <div className="flex flex-col md:flex-row">
              <Sidebar
                section={state.section}
                onSectionChange={(s) => saveState({ section: s })}
                brandsComplete={state.brands.length > 0}
                accountsComplete={state.accountsCreated}
                skusComplete={state.skus.length > 0}
              />

              <div className="flex-1 p-6">
                <div className="max-w-4xl">
                  {state.section === 'brands' && <BrandsSection brands={state.brands} onBrandsChange={saveBrands} />}
                  {state.section === 'accounts' && (
                    <AccountsSection
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
