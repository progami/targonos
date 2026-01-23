'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { useSettlementsListStore } from '@/lib/store/settlements';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type SettlementRow = {
  id: string;
  docNumber: string;
  postedDate: string;
  memo: string;
  marketplace: {
    id: 'amazon.com' | 'amazon.co.uk';
    label: 'Amazon.com' | 'Amazon.co.uk';
    currency: 'USD' | 'GBP';
    region: 'US' | 'UK';
  };
  periodStart: string | null;
  periodEnd: string | null;
  settlementTotal: number | null;
  lmbStatus: 'Posted';
  plutusStatus: 'Pending' | 'Processed' | 'Blocked' | 'RolledBack';
};

type SettlementsResponse = {
  settlements: SettlementRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type ConnectionStatus = { connected: boolean };

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
    </svg>
  );
}

function formatPeriod(start: string | null, end: string | null): string {
  if (start === null || end === null) return '—';

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  const sameYear = startYear === endYear;

  const startMonth = startDate.getUTCMonth();
  const endMonth = endDate.getUTCMonth();
  const sameMonth = sameYear && startMonth === endMonth;

  const startText = startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });

  const endText = endDate.toLocaleDateString('en-US', {
    month: sameMonth ? undefined : 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return `${startText} – ${endText}`;
}

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Math.abs(amount));

  if (amount < 0) return `(${formatted})`;
  return formatted;
}

function StatusPill({ status }: { status: SettlementRow['lmbStatus'] }) {
  if (status === 'Posted') return <Badge variant="success">Posted</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function PlutusPill({ status }: { status: SettlementRow['plutusStatus'] }) {
  if (status === 'Processed') return <Badge variant="success">Plutus: Processed</Badge>;
  if (status === 'RolledBack') return <Badge variant="secondary">Plutus: Rolled back</Badge>;
  if (status === 'Blocked') return <Badge variant="destructive">Plutus: Blocked</Badge>;
  return <Badge variant="outline">Plutus: Pending</Badge>;
}

function ActionButton() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide">Action</span>
      <ChevronDownIcon className="h-4 w-4" />
    </span>
  );
}

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchSettlements({
  page,
  search,
  startDate,
  endDate,
}: {
  page: number;
  search: string;
  startDate: string | null;
  endDate: string | null;
}): Promise<SettlementsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '25');
  if (search.trim() !== '') params.set('search', search.trim());
  if (startDate !== null && startDate.trim() !== '') params.set('startDate', startDate.trim());
  if (endDate !== null && endDate.trim() !== '') params.set('endDate', endDate.trim());

  const res = await fetch(`${basePath}/api/plutus/settlements?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

export default function SettlementsPage() {
  const queryClient = useQueryClient();
  const searchInput = useSettlementsListStore((s) => s.searchInput);
  const search = useSettlementsListStore((s) => s.search);
  const page = useSettlementsListStore((s) => s.page);
  const startDate = useSettlementsListStore((s) => s.startDate);
  const endDate = useSettlementsListStore((s) => s.endDate);
  const setSearchInput = useSettlementsListStore((s) => s.setSearchInput);
  const setSearch = useSettlementsListStore((s) => s.setSearch);
  const setPage = useSettlementsListStore((s) => s.setPage);
  const setStartDate = useSettlementsListStore((s) => s.setStartDate);
  const setEndDate = useSettlementsListStore((s) => s.setEndDate);
  const clear = useSettlementsListStore((s) => s.clear);

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

  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-settlements', page, search, normalizedStartDate, normalizedEndDate],
    queryFn: () => fetchSettlements({ page, search, startDate: normalizedStartDate, endDate: normalizedEndDate }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 15 * 1000,
  });

  const settlements = useMemo(() => {
    if (!data) return [];
    return data.settlements;
  }, [data]);

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlements" />;
  }

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Settlements"
          kicker="Link My Books"
          description="Plutus polls QuickBooks for LMB-posted settlement journal entries and tracks which ones you’ve processed."
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
                }}
              >
                Refresh
              </Button>
              <Button asChild variant="outline">
                <Link href="/setup">Setup</Link>
              </Button>
            </>
          }
        />

        <div className="mt-6 grid gap-4">
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-[1.4fr,0.55fr,0.55fr,auto] md:items-end">
                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Search
                  </div>
                  <div className="relative">
                    <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Doc number, memo…"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      clear();
                    }}
                    disabled={searchInput.trim() === '' && startDate.trim() === '' && endDate.trim() === ''}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Settlement Total</TableHead>
                      <TableHead>LMB</TableHead>
                      <TableHead>Plutus</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading && (
                      <>
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <TableRow key={idx}>
                            <TableCell colSpan={6} className="py-4">
                              <Skeleton className="h-10 w-full" />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}

                    {!isLoading && error && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-danger-700 dark:text-danger-400">
                          {error instanceof Error ? error.message : String(error)}
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && !error && settlements.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                          No settlements found in QBO for this filter.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      !error &&
                      settlements.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="align-top">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
                                {s.marketplace.region}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                  {s.marketplace.label}
                                </div>
                                <div className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-400">
                                  {s.docNumber}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm">
                            <div className="text-slate-700 dark:text-slate-200">
                              {formatPeriod(s.periodStart, s.periodEnd)}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              Posted {new Date(`${s.postedDate}T00:00:00Z`).toLocaleDateString('en-US')}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm font-medium text-slate-900 dark:text-white">
                            {s.settlementTotal === null ? '—' : formatMoney(s.settlementTotal, s.marketplace.currency)}
                          </TableCell>
                          <TableCell className="align-top">
                            <StatusPill status={s.lmbStatus} />
                          </TableCell>
                          <TableCell className="align-top">
                            <PlutusPill status={s.plutusStatus} />
                          </TableCell>
                          <TableCell className="align-top text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="h-9 px-3">
                                  <ActionButton />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem asChild>
                                  <Link href={`/settlements/${s.id}`}>View</Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <Link href={`/settlements/${s.id}?tab=analysis`}>Upload Audit</Link>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>

              {data && data.pagination.totalPages > 1 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03]">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Page {data.pagination.page} of {data.pagination.totalPages} • {data.pagination.totalCount} settlements
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      Prev
                    </Button>
                    <Button variant="outline" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>
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
