'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { useChartOfAccountsStore } from '@/lib/store/chart-of-accounts';
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

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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
          'flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide transition-colors',
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
  const search = useChartOfAccountsStore((s) => s.search);
  const sourceFilter = useChartOfAccountsStore((s) => s.sourceFilter);
  const selectedTypesRaw = useChartOfAccountsStore((s) => s.selectedTypes);
  const selectedDetailTypesRaw = useChartOfAccountsStore((s) => s.selectedDetailTypes);
  const selectedCurrenciesRaw = useChartOfAccountsStore((s) => s.selectedCurrencies);
  const setSearch = useChartOfAccountsStore((s) => s.setSearch);
  const setSourceFilter = useChartOfAccountsStore((s) => s.setSourceFilter);
  const setSelectedTypesRaw = useChartOfAccountsStore((s) => s.setSelectedTypes);
  const setSelectedDetailTypesRaw = useChartOfAccountsStore((s) => s.setSelectedDetailTypes);
  const setSelectedCurrenciesRaw = useChartOfAccountsStore((s) => s.setSelectedCurrencies);
  const clearFilters = useChartOfAccountsStore((s) => s.clearFilters);

  const selectedTypes = useMemo(() => new Set(selectedTypesRaw), [selectedTypesRaw]);
  const selectedDetailTypes = useMemo(() => new Set(selectedDetailTypesRaw), [selectedDetailTypesRaw]);
  const selectedCurrencies = useMemo(() => new Set(selectedCurrenciesRaw), [selectedCurrenciesRaw]);
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

  if (!isCheckingConnection && connectionStatus?.connected === false) {
    return <NotConnectedScreen title="Chart of Accounts" />;
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Chart of Accounts"
          variant="accent"
          actions={
            <Button onClick={handleRefresh} variant="outline" size="sm">
              <RefreshIcon className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          }
        />

        <div className="mt-6 grid gap-4">
          {/* Source Tabs */}
          <Tabs
            value={sourceFilter}
            onValueChange={(v) => setSourceFilter(v as 'all' | 'qbo' | 'lmb')}
          >
            <TabsList>
              <TabsTrigger value="all">
                All
                <span className="ml-1.5 text-xs tabular-nums opacity-60">{sourceCounts.all}</span>
              </TabsTrigger>
              <TabsTrigger value="qbo">
                QBO Created
                <span className="ml-1.5 text-xs tabular-nums opacity-60">{sourceCounts.qbo}</span>
              </TabsTrigger>
              <TabsTrigger value="lmb">
                LMB / Plutus
                <span className="ml-1.5 text-xs tabular-nums opacity-60">{sourceCounts.lmb}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Filter Bar */}
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-[1fr,auto] md:items-end">
                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    Search
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or number..."
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Count */}
                  <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                    {filteredAccounts.length === total
                      ? `${total} accounts`
                      : `${filteredAccounts.length} of ${total}`}
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => clearFilters()}
                    disabled={!search && sourceFilter === 'all' && activeFiltersCount === 0}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="border-slate-200/70 dark:border-white/10 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="table-striped">
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-white/[0.03]">
                      <TableHead className="font-semibold w-[80px]">Code</TableHead>
                      <TableHead className="font-semibold">Name</TableHead>
                      <TableHead className="font-semibold">
                        <ColumnFilterDropdown
                          label="Type"
                          options={accountTypes}
                          selectedValues={selectedTypes}
                          onSelectionChange={(values) => setSelectedTypesRaw(Array.from(values))}
                          isActive={selectedTypes.size > 0}
                        />
                      </TableHead>
                      <TableHead className="font-semibold">
                        <ColumnFilterDropdown
                          label="Detail Type"
                          options={detailTypes}
                          selectedValues={selectedDetailTypes}
                          onSelectionChange={(values) => setSelectedDetailTypesRaw(Array.from(values))}
                          isActive={selectedDetailTypes.size > 0}
                        />
                      </TableHead>
                      <TableHead className="font-semibold">
                        <ColumnFilterDropdown
                          label="Currency"
                          options={currencies}
                          selectedValues={selectedCurrencies}
                          onSelectionChange={(values) => setSelectedCurrenciesRaw(Array.from(values))}
                          isActive={selectedCurrencies.size > 0}
                        />
                      </TableHead>
                      <TableHead className="font-semibold text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(isLoading || isCheckingConnection) && (
                      <>
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <TableRow key={idx}>
                            <TableCell colSpan={6} className="py-4">
                              <Skeleton className="h-6 w-full" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}

                    {!isLoading && !isCheckingConnection && error && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-danger-700 dark:text-danger-400">
                          {error instanceof Error ? error.message : String(error)}
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && !isCheckingConnection && !error && filteredAccounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <EmptyState
                            title="No accounts found"
                            description={search || activeFiltersCount > 0 ? 'No accounts match your current filters. Try adjusting the search or filters.' : 'No accounts found.'}
                          />
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      !isCheckingConnection &&
                      !error &&
                      filteredAccounts.map((account) => (
                        <TableRow key={account.id} className="table-row-hover">
                          {/* Code */}
                          <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-400">
                            {account.acctNum ? account.acctNum : '—'}
                          </TableCell>

                          {/* Name with hierarchy indentation */}
                          <TableCell>
                            <div
                              className="flex items-center min-w-0"
                              style={{ paddingLeft: `${account.depth * 20}px` }}
                              title={account.fullyQualifiedName ? account.fullyQualifiedName : account.name}
                            >
                              {account.depth > 0 && (
                                <span className="mr-1.5 text-slate-300 dark:text-slate-600 flex-shrink-0 select-none font-mono text-xs">└</span>
                              )}
                              <span className="font-medium text-slate-900 dark:text-white truncate text-sm">
                                {account.name}
                              </span>
                              {account.source === 'lmb' && (
                                <Badge variant="secondary" className="ml-2 flex-shrink-0 text-[10px] bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 border-0">
                                  LMB
                                </Badge>
                              )}
                            </div>
                          </TableCell>

                          {/* Type */}
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {account.type}
                          </TableCell>

                          {/* Detail Type */}
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {account.subType ? account.subType : '—'}
                          </TableCell>

                          {/* Currency */}
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {account.currency}
                          </TableCell>

                          {/* Balance */}
                          <TableCell className="text-right">
                            <span className={cn(
                              'font-mono text-sm tabular-nums',
                              account.balance < 0
                                ? 'text-red-600 dark:text-red-400'
                                : account.balance > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400 dark:text-slate-500'
                            )}>
                              {formatCurrency(account.balance, account.currency)}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
