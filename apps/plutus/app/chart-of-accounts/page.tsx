'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  source: 'lmb' | 'qbo';
}

type SourceFilter = 'all' | 'qbo' | 'lmb';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

interface ConnectionStatus {
  connected: boolean;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAccounts(): Promise<{ accounts: Account[]; total: number }> {
  const res = await fetch(`${basePath}/api/qbo/accounts`);
  if (!res.ok) {
    const data = await res.json();
    const message = data.error ? data.error : 'Failed to fetch accounts';
    throw new Error(message);
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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

// Column Filter Dropdown Component
function ColumnFilterDropdown({
  label,
  options,
  selectedValues,
  onSelectionChange,
  isActive,
}: {
  label: string;
  options: string[];
  selectedValues: Set<string>;
  onSelectionChange: (values: Set<string>) => void;
  isActive: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    const newSelection = new Set(selectedValues);
    if (newSelection.has(option)) {
      newSelection.delete(option);
    } else {
      newSelection.add(option);
    }
    onSelectionChange(newSelection);
  };

  const selectAll = () => {
    onSelectionChange(new Set());
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide transition-colors',
          isActive
            ? 'text-brand-teal-600 dark:text-brand-teal-400'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        )}
      >
        {label}
        {isActive ? (
          <FilterIcon className="h-3 w-3" />
        ) : (
          <ChevronDownIcon className="h-3 w-3" />
        )}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 min-w-[200px] max-h-[300px] overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-slate-800">
          <div className="sticky top-0 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-slate-800 p-2">
            <button
              onClick={selectAll}
              className="w-full text-left px-2 py-1.5 text-sm text-brand-teal-600 dark:text-brand-teal-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
            >
              {selectedValues.size > 0 ? 'Clear filter' : 'All selected'}
            </button>
          </div>
          <div className="p-1">
            {options.map((option) => (
              <button
                key={option}
                onClick={() => toggleOption(option)}
                className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 items-center justify-center rounded border',
                    selectedValues.has(option)
                      ? 'border-brand-teal-500 bg-brand-teal-500 text-white'
                      : 'border-slate-300 dark:border-slate-600'
                  )}
                >
                  {selectedValues.has(option) && <CheckIcon className="h-3 w-3" />}
                </span>
                <span className="truncate">{option}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ChartOfAccountsPage() {
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [selectedDetailTypes, setSelectedDetailTypes] = useState<Set<string>>(new Set());
  const [selectedCurrencies, setSelectedCurrencies] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: connectionStatus, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['qbo-accounts-full'],
    queryFn: fetchAccounts,
    staleTime: 5 * 60 * 1000,
    enabled: connectionStatus?.connected === true,
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
    queryClient.invalidateQueries({ queryKey: ['qbo-accounts-full'] });
  }, [queryClient]);

  const accounts = useMemo(() => {
    return data ? data.accounts : [];
  }, [data]);
  const total = useMemo(() => {
    return data ? data.total : 0;
  }, [data]);

  // Get unique values for each filterable column
  const accountTypes = useMemo(() => {
    const types = new Set(accounts.map((a) => a.type));
    return Array.from(types).sort();
  }, [accounts]);

  const detailTypes = useMemo(() => {
    const types = new Set(accounts.map((a) => a.subType).filter(Boolean) as string[]);
    return Array.from(types).sort();
  }, [accounts]);

  const currencies = useMemo(() => {
    const curr = new Set(accounts.map((a) => a.currency));
    return Array.from(curr).sort();
  }, [accounts]);

  // Count accounts by source
  const sourceCounts = useMemo(() => {
    const qbo = accounts.filter((a) => a.source === 'qbo').length;
    const lmb = accounts.filter((a) => a.source === 'lmb').length;
    return { qbo, lmb, all: accounts.length };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        account.name.toLowerCase().includes(searchLower) ||
        account.acctNum?.toLowerCase().includes(searchLower);
      const matchesSource = sourceFilter === 'all' || account.source === sourceFilter;
      const matchesType = selectedTypes.size === 0 || selectedTypes.has(account.type);
      const matchesDetailType = selectedDetailTypes.size === 0 || (account.subType && selectedDetailTypes.has(account.subType));
      const matchesCurrency = selectedCurrencies.size === 0 || selectedCurrencies.has(account.currency);
      return matchesSearch && matchesSource && matchesType && matchesDetailType && matchesCurrency;
    });
  }, [accounts, search, sourceFilter, selectedTypes, selectedDetailTypes, selectedCurrencies]);

  const activeFiltersCount = (selectedTypes.size > 0 ? 1 : 0) + (selectedDetailTypes.size > 0 ? 1 : 0) + (selectedCurrencies.size > 0 ? 1 : 0);

  const clearAllFilters = () => {
    setSourceFilter('all');
    setSelectedTypes(new Set());
    setSelectedDetailTypes(new Set());
    setSelectedCurrencies(new Set());
    setSearch('');
  };

  // Show not connected screen once we know connection status is false
  if (!isCheckingConnection && connectionStatus?.connected === false) {
    return <NotConnectedScreen title="Chart of Accounts" />;
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load accounts';

    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 p-8 text-center">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">Error</h2>
            <p className="text-red-600 dark:text-red-300 mb-4">{errorMessage}</p>
            <Button onClick={handleRefresh} variant="outline">
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
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshIcon className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </header>

        {/* Source Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-lg w-fit">
          <button
            onClick={() => setSourceFilter('all')}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              sourceFilter === 'all'
                ? 'bg-brand-teal-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
            )}
          >
            All
            <span className={cn(
              'ml-2 text-xs px-1.5 py-0.5 rounded',
              sourceFilter === 'all'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'
            )}>{sourceCounts.all}</span>
          </button>
          <button
            onClick={() => setSourceFilter('qbo')}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              sourceFilter === 'qbo'
                ? 'bg-brand-teal-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
            )}
          >
            QBO Created
            <span className={cn(
              'ml-2 text-xs px-1.5 py-0.5 rounded',
              sourceFilter === 'qbo'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'
            )}>{sourceCounts.qbo}</span>
          </button>
          <button
            onClick={() => setSourceFilter('lmb')}
            className={cn(
              'px-4 py-2 rounded-md text-sm font-medium transition-all',
              sourceFilter === 'lmb'
                ? 'bg-brand-teal-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/50 dark:hover:bg-white/5'
            )}
          >
            LMB / Plutus
            <span className={cn(
              'ml-2 text-xs px-1.5 py-0.5 rounded',
              sourceFilter === 'lmb'
                ? 'bg-white/20 text-white'
                : 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400'
            )}>{sourceCounts.lmb}</span>
          </button>
        </div>

        {/* Search Bar and Status */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/30 focus:border-brand-teal-500 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-slate-500"
            />
          </div>

          <div className="flex items-center gap-4">
            {/* Active filters indicator */}
            {(activeFiltersCount > 0 || search || sourceFilter !== 'all') && (
              <button
                onClick={clearAllFilters}
                className="text-sm text-brand-teal-600 dark:text-brand-teal-400 hover:underline"
              >
                Clear all filters
              </button>
            )}
            {/* Count */}
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {filteredAccounts.length === total
                ? `${total} accounts`
                : `${filteredAccounts.length} of ${total} accounts`}
            </div>
          </div>
        </div>

        {/* Accounts Table */}
        <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-slate-900">
          {isLoading || isCheckingConnection ? (
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
          ) : filteredAccounts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-slate-500 dark:text-slate-400">
                {search || activeFiltersCount > 0 ? 'No accounts match your filters' : 'No accounts found'}
              </p>
            </div>
          ) : (
            <div>
              {/* Table Header with Filters */}
              <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-white/10">
                <div className="col-span-1 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Code
                </div>
                <div className="col-span-3 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Name
                </div>
                <div className="col-span-2">
                  <ColumnFilterDropdown
                    label="Type"
                    options={accountTypes}
                    selectedValues={selectedTypes}
                    onSelectionChange={setSelectedTypes}
                    isActive={selectedTypes.size > 0}
                  />
                </div>
                <div className="col-span-3">
                  <ColumnFilterDropdown
                    label="Detail Type"
                    options={detailTypes}
                    selectedValues={selectedDetailTypes}
                    onSelectionChange={setSelectedDetailTypes}
                    isActive={selectedDetailTypes.size > 0}
                  />
                </div>
                <div className="col-span-1">
                  <ColumnFilterDropdown
                    label="Currency"
                    options={currencies}
                    selectedValues={selectedCurrencies}
                    onSelectionChange={setSelectedCurrencies}
                    isActive={selectedCurrencies.size > 0}
                  />
                </div>
                <div className="col-span-2 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide text-right">
                  Balance
                </div>
              </div>

              {/* Table Content */}
              <div className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredAccounts.map((account) => (
                  <div
                    key={account.id}
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    {/* Code */}
                    <div className="col-span-1 flex items-center text-slate-600 dark:text-slate-400 text-sm font-mono">
                      {account.acctNum ? account.acctNum : '—'}
                    </div>

                    {/* Name */}
                    <div
                      className="col-span-3 flex items-center gap-2 min-w-0"
                      style={{ paddingLeft: `${account.depth * 16}px` }}
                      title={account.fullyQualifiedName ? account.fullyQualifiedName : account.name}
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
                      </span>
                      {account.source === 'lmb' && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 rounded">
                          LMB
                        </span>
                      )}
                    </div>

                    {/* Type */}
                    <div className="col-span-2 flex items-center text-slate-600 dark:text-slate-400 text-sm truncate">
                      {account.type}
                    </div>

                    {/* Detail Type */}
                    <div className="col-span-3 flex items-center text-slate-600 dark:text-slate-400 text-sm truncate">
                      {account.subType ? account.subType : '—'}
                    </div>

                    {/* Currency */}
                    <div className="col-span-1 flex items-center text-slate-600 dark:text-slate-400 text-sm">
                      {account.currency}
                    </div>

                    {/* Balance */}
                    <div className="col-span-2 flex items-center justify-end">
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
