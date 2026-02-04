'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';

import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTransactionsStore } from '@/lib/store/transactions';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = {
  connected: boolean;
  homeCurrency?: string;
};

type TransactionLine = {
  id: string;
  amount: number;
  postingType?: 'Debit' | 'Credit';
  description: string | null;
  accountId: string | null;
  accountName: string | null;
  accountFullyQualifiedName: string | null;
  accountType: string | null;
};

type TransactionRow = {
  id: string;
  type: 'JournalEntry' | 'Bill' | 'Purchase';
  txnDate: string;
  docNumber: string;
  memo: string;
  entityName: string;
  totalAmount: number;
  lines: TransactionLine[];
  createdAt?: string;
  updatedAt?: string;
};

type TransactionsResponse = {
  transactions: TransactionRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
      />
    </svg>
  );
}

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Math.abs(amount));

  if (amount < 0) return `(${formatted})`;
  return formatted;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchTransactions(input: {
  type: 'journalEntry' | 'bill' | 'purchase';
  page: number;
  pageSize: number;
  search: string;
  startDate: string | null;
  endDate: string | null;
}): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  params.set('type', input.type);
  params.set('page', String(input.page));
  params.set('pageSize', String(input.pageSize));
  if (input.search.trim() !== '') params.set('search', input.search.trim());
  if (input.startDate !== null && input.startDate.trim() !== '') params.set('startDate', input.startDate.trim());
  if (input.endDate !== null && input.endDate.trim() !== '') params.set('endDate', input.endDate.trim());

  const res = await fetch(`${basePath}/api/plutus/transactions?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const tab = useTransactionsStore((s) => s.tab);
  const searchInput = useTransactionsStore((s) => s.searchInput);
  const search = useTransactionsStore((s) => s.search);
  const startDate = useTransactionsStore((s) => s.startDate);
  const endDate = useTransactionsStore((s) => s.endDate);
  const page = useTransactionsStore((s) => s.page);
  const pageSize = useTransactionsStore((s) => s.pageSize);
  const setTab = useTransactionsStore((s) => s.setTab);
  const setSearchInput = useTransactionsStore((s) => s.setSearchInput);
  const setSearch = useTransactionsStore((s) => s.setSearch);
  const setStartDate = useTransactionsStore((s) => s.setStartDate);
  const setEndDate = useTransactionsStore((s) => s.setEndDate);
  const setPage = useTransactionsStore((s) => s.setPage);
  const setPageSize = useTransactionsStore((s) => s.setPageSize);
  const clear = useTransactionsStore((s) => s.clear);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, setPage, setSearch]);

  const normalizedStartDate = startDate.trim() === '' ? null : startDate.trim();
  const normalizedEndDate = endDate.trim() === '' ? null : endDate.trim();

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const apiType = tab;
  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-transactions', apiType, page, pageSize, search, normalizedStartDate, normalizedEndDate],
    queryFn: () =>
      fetchTransactions({
        type: apiType,
        page,
        pageSize,
        search,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
      }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 15 * 1000,
  });

  const currency = connection?.homeCurrency ? connection.homeCurrency : 'USD';

  const rows = useMemo(() => (data ? data.transactions : []), [data]);

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Transactions" />;
  }

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Transactions"
          variant="accent"
          actions={
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['plutus-transactions'] })}
            >
              Refresh
            </Button>
          }
        />

        <div className="mt-6 grid gap-4">
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-[1.25fr,0.55fr,0.55fr,0.45fr,auto] md:items-end">
                <div className="space-y-1">
                  <div className="text-2xs font-semibold uppercase tracking-wide text-brand-teal-600 dark:text-brand-teal-400">
                    Search
                  </div>
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Doc number…"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-2xs font-semibold uppercase tracking-wide text-brand-teal-600 dark:text-brand-teal-400">
                    Start date
                  </div>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      setStartDate(value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-2xs font-semibold uppercase tracking-wide text-brand-teal-600 dark:text-brand-teal-400">
                    End date
                  </div>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      setEndDate(value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <div className="text-2xs font-semibold uppercase tracking-wide text-brand-teal-600 dark:text-brand-teal-400">
                    Rows
                  </div>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setExpanded({});
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="bg-white dark:bg-white/5">
                      <SelectValue placeholder="Rows…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="250">250</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => clear()}
                    disabled={searchInput.trim() === '' && startDate.trim() === '' && endDate.trim() === ''}
                  >
                    Clear
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <Tabs
                  value={tab}
                  onValueChange={(v) => {
                    setTab(v as typeof tab);
                    setExpanded({});
                    setPage(1);
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="journalEntry">Journal entries</TabsTrigger>
                    <TabsTrigger value="bill">Bills</TabsTrigger>
                    <TabsTrigger value="purchase">Purchases</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"> </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>No.</TableHead>
                      <TableHead>Payee</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <>
                        {Array.from({ length: 8 }).map((_, idx) => (
                          <TableRow key={idx}>
                            <TableCell colSpan={8} className="py-3">
                              <Skeleton className="h-10 w-full" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}

                    {!isLoading && error && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-sm text-danger-700 dark:text-danger-400">
                          {error instanceof Error ? error.message : String(error)}
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && !error && rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                          No transactions found in QBO for this filter.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      !error &&
                      rows.map((row) => {
                        const isExpanded = expanded[row.id] === true;
                        const docNumber = row.docNumber.trim() === '' ? '—' : row.docNumber;
                        const memo = row.memo.trim() === '' ? '—' : row.memo;

                        const uniqueAccounts = Array.from(
                          new Set(
                            row.lines
                              .map((line) =>
                                line.accountFullyQualifiedName
                                  ? line.accountFullyQualifiedName
                                  : line.accountName
                                    ? line.accountName
                                    : '',
                              )
                              .map((name) => name.trim())
                              .filter((name) => name !== ''),
                          ),
                        );

                        let accountLabel = '—';
                        if (uniqueAccounts.length === 1) {
                          accountLabel = uniqueAccounts[0] as string;
                        } else if (uniqueAccounts.length > 1) {
                          accountLabel = `Split (${uniqueAccounts.length})`;
                        }

                        let typeLabel = row.type;
                        if (row.type === 'JournalEntry') typeLabel = 'Journal Entry';
                        if (row.type === 'Purchase') typeLabel = 'Expense';

                        return (
                          <Fragment key={row.id}>
                            <TableRow className="group">
                              <TableCell className="align-top">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpanded((prev) => ({
                                      ...prev,
                                      [row.id]: !(prev[row.id] === true),
                                    }))
                                  }
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-white/5"
                                  aria-expanded={isExpanded}
                                >
                                  <ChevronDown
                                    className={cn(
                                      'h-4 w-4 transition-transform',
                                      isExpanded ? 'rotate-180' : 'rotate-0',
                                    )}
                                  />
                                </button>
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700 dark:text-slate-200">
                                {new Date(`${row.txnDate}T00:00:00Z`).toLocaleDateString('en-US')}
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                {typeLabel}
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="font-mono text-xs text-slate-700 dark:text-slate-200">{docNumber}</div>
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700 dark:text-slate-200">
                                {row.entityName.trim() === '' ? '—' : row.entityName}
                              </TableCell>
                              <TableCell
                                className="align-top text-xs text-slate-700 dark:text-slate-200 line-clamp-1"
                                title={memo === '—' ? undefined : memo}
                              >
                                {memo}
                              </TableCell>
                              <TableCell
                                className="align-top text-xs text-slate-700 dark:text-slate-200 line-clamp-1"
                                title={accountLabel === '—' ? undefined : accountLabel}
                              >
                                {accountLabel}
                              </TableCell>
                              <TableCell className="align-top text-right text-xs font-semibold text-slate-900 dark:text-white">
                                {formatMoney(row.totalAmount, currency)}
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow className="bg-slate-50/50 dark:bg-white/[0.03]">
                                <TableCell colSpan={8} className="p-0">
                                  <div className="p-4">
                                    <div className="rounded-xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950/40 overflow-hidden">
                                      <div className="px-4 py-3 border-b border-slate-200/70 dark:border-white/10">
                                        <div className="text-2xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                          Line items
                                        </div>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5">
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Account</TableHead>
                                              <TableHead>Description</TableHead>
                                              <TableHead>Type</TableHead>
                                              <TableHead>Posting</TableHead>
                                              <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {row.lines.length === 0 && (
                                              <TableRow>
                                                <TableCell
                                                  colSpan={5}
                                                  className="py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                                                >
                                                  No line items found for this transaction.
                                                </TableCell>
                                              </TableRow>
                                            )}

                                            {row.lines.map((line) => {
                                              const accountLabel = line.accountFullyQualifiedName
                                                ? line.accountFullyQualifiedName
                                                : line.accountName
                                                  ? line.accountName
                                                  : 'Uncategorized';

                                              return (
                                                <TableRow key={line.id}>
                                                  <TableCell className="min-w-[340px]">
                                                    <div className="text-xs font-medium text-slate-900 dark:text-white line-clamp-1" title={accountLabel}>
                                                      {accountLabel}
                                                    </div>
                                                  </TableCell>
                                                  <TableCell
                                                    className="min-w-[280px] text-xs text-slate-700 dark:text-slate-200 line-clamp-1"
                                                    title={line.description && line.description.trim() !== '' ? line.description : undefined}
                                                  >
                                                    {line.description && line.description.trim() !== '' ? line.description : '—'}
                                                  </TableCell>
                                                  <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                                                    {line.accountType ? line.accountType : '—'}
                                                  </TableCell>
                                                  <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                                                    {line.postingType ? line.postingType : '—'}
                                                  </TableCell>
                                                  <TableCell className="text-right text-xs font-semibold text-slate-900 dark:text-white">
                                                    {formatMoney(
                                                      line.postingType === 'Credit' ? -line.amount : line.amount,
                                                      currency,
                                                    )}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                  </TableBody>
                </Table>
              </div>

              {data && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03]">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Showing {(data.pagination.page - 1) * data.pagination.pageSize + 1}–{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount)} of {data.pagination.totalCount}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Prev
                    </Button>
                    <Button
                      variant="outline"
                      disabled={page >= data.pagination.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
