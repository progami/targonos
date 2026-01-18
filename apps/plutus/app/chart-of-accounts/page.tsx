'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { cn } from '@/lib/utils';

interface Account {
  id: string;
  name: string;
  type: string;
  subType?: string;
  fullyQualifiedName?: string;
  acctNum?: string;
  balance: number;
  currency: string;
  classification?: string;
  isSubAccount: boolean;
  parentName: string | null;
  depth: number;
  isFirstInGroup?: boolean;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/plutus';

async function fetchAccounts(): Promise<{ accounts: Account[]; total: number }> {
  const res = await fetch(`${basePath}/api/qbo/accounts`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to fetch accounts');
  }
  return res.json();
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

// Account type icons matching QBO style
function BankIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
    </svg>
  );
}

function WalletIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
    </svg>
  );
}

function CreditCardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function getAccountTypeIcon(type: string) {
  const iconClass = 'h-4 w-4';
  switch (type) {
    case 'Bank':
      return <BankIcon className={iconClass} />;
    case 'Credit Card':
      return <CreditCardIcon className={iconClass} />;
    case 'Other Current Asset':
    case 'Other Current Assets':
    case 'Fixed Asset':
      return <WalletIcon className={iconClass} />;
    case 'Income':
    case 'Other Income':
      return <ChartIcon className={iconClass} />;
    case 'Expense':
    case 'Other Expense':
    case 'Cost of Goods Sold':
      return <ReceiptIcon className={iconClass} />;
    default:
      return <WalletIcon className={iconClass} />;
  }
}

function BalBadge() {
  return (
    <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-emerald-500 text-white rounded">
      BAL
    </span>
  );
}

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// Account types that typically have balance tracking
const BALANCE_TYPES = ['Bank', 'Credit Card', 'Accounts Receivable (A/R)', 'Accounts Payable (A/P)', 'Other Current Asset', 'Other Current Assets', 'Fixed Asset'];

export default function ChartOfAccountsPage() {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['qbo-accounts-full'],
    queryFn: fetchAccounts,
    staleTime: 5 * 60 * 1000,
  });

  const accounts = useMemo(() => {
    return data ? data.accounts : [];
  }, [data]);
  const total = useMemo(() => {
    return data ? data.total : 0;
  }, [data]);

  const accountTypes = useMemo(() => {
    const types = new Set(accounts.map((a) => a.type));
    return Array.from(types).sort();
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        account.name.toLowerCase().includes(searchLower) ||
        account.acctNum?.toLowerCase().includes(searchLower) ||
        account.type.toLowerCase().includes(searchLower) ||
        account.subType?.toLowerCase().includes(searchLower);
      const matchesType = !selectedType || account.type === selectedType;
      return matchesSearch && matchesType;
    });
  }, [accounts, search, selectedType]);

  // Group accounts by type for section headers
  const groupedAccounts = useMemo(() => {
    const groups: { type: string; accounts: Account[] }[] = [];
    let currentGroup: { type: string; accounts: Account[] } | null = null;

    for (const account of filteredAccounts) {
      if (!currentGroup || currentGroup.type !== account.type) {
        currentGroup = { type: account.type, accounts: [] };
        groups.push(currentGroup);
      }
      currentGroup.accounts.push(account);
    }

    return groups;
  }, [filteredAccounts]);

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load accounts';
    if (errorMessage === 'Not connected to QBO') {
      return <NotConnectedScreen title="Chart of Accounts" />;
    }

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 p-8 text-center">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">Error</h2>
            <p className="text-red-600 dark:text-red-300 mb-4">{errorMessage}</p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshIcon className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Chart of Accounts</h1>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshIcon className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </header>

        {/* Search and Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by name or number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/30 focus:border-brand-teal-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          {/* Type Filter Dropdown */}
          <select
            value={selectedType || ''}
            onChange={(e) => setSelectedType(e.target.value || null)}
            className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/30 focus:border-brand-teal-500 dark:border-white/10 dark:bg-white/5 dark:text-white"
          >
            <option value="">All</option>
            {accountTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          {/* Pagination info */}
          <div className="text-sm text-slate-500 dark:text-slate-400 ml-auto">
            {filteredAccounts.length === total
              ? `1 - ${total}`
              : `Showing ${filteredAccounts.length} of ${total}`
            }
          </div>
        </div>

        {/* Grouped Accounts Table */}
        <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900">
          {isLoading ? (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {Array.from({ length: 15 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-4">
                  <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                  <div className="h-4 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse ml-auto" />
                </div>
              ))}
            </div>
          ) : groupedAccounts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-500 dark:text-slate-400">
                {search || selectedType ? 'No accounts match your filter' : 'No accounts found'}
              </p>
            </div>
          ) : (
            <div>
              {/* Table Header */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/10 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                <div className="col-span-5">Name</div>
                <div className="col-span-2">Detail Type</div>
                <div className="col-span-2">Currency</div>
                <div className="col-span-3 text-right">Balance</div>
              </div>

              {/* Grouped Content */}
              {groupedAccounts.map((group) => (
                <div key={group.type}>
                  {/* Section Header */}
                  <div className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 border-y border-slate-200 dark:border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 dark:text-slate-400">
                        {getAccountTypeIcon(group.type)}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-white text-sm">
                        {group.type}
                      </span>
                      {BALANCE_TYPES.includes(group.type) && <BalBadge />}
                      <span className="text-xs text-slate-400 dark:text-slate-500 ml-2">
                        ({group.accounts.length})
                      </span>
                    </div>
                  </div>

                  {/* Accounts in this group */}
                  <div className="divide-y divide-slate-100 dark:divide-white/5">
                    {group.accounts.map((account) => (
                      <div
                        key={account.id}
                        className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        {/* Name */}
                        <div
                          className="col-span-5 flex items-center gap-2 min-w-0"
                          style={{ paddingLeft: `${account.depth * 20}px` }}
                          title={account.fullyQualifiedName || account.name}
                        >
                          {account.isSubAccount && (
                            <span className="text-slate-400 dark:text-slate-500 text-xs flex-shrink-0">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </span>
                          )}
                          <span className="font-medium text-slate-900 dark:text-white truncate">
                            {account.name}
                            {account.acctNum && (
                              <span className="text-slate-500 dark:text-slate-400 ml-1">
                                ({account.acctNum})
                              </span>
                            )}
                          </span>
                          {account.isSubAccount && account.parentName && (
                            <span className="text-xs text-slate-400 dark:text-slate-500 hidden lg:inline flex-shrink-0">
                              in {account.parentName}
                            </span>
                          )}
                        </div>

                        {/* Detail Type */}
                        <div className="col-span-2 flex items-center text-slate-600 dark:text-slate-400 text-sm truncate">
                          {account.subType || '—'}
                        </div>

                        {/* Currency */}
                        <div className="col-span-2 flex items-center text-slate-600 dark:text-slate-400 text-sm">
                          {account.currency}
                        </div>

                        {/* Balance */}
                        <div className="col-span-3 flex items-center justify-end">
                          <span className={cn(
                            'font-mono text-sm',
                            account.balance < 0
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-700 dark:text-slate-300'
                          )}>
                            {formatCurrency(account.balance, account.currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-slate-500 dark:text-slate-400">
          Synced from QuickBooks Online
        </div>
      </div>
    </div>
  );
}
