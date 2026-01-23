'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NotConnectedScreen } from '@/components/not-connected-screen';

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
  plutusStatus: 'Pending' | 'Processed' | 'Blocked';
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

async function fetchSettlements(page: number, search: string): Promise<SettlementsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '25');
  if (search.trim() !== '') params.set('search', search.trim());

  const res = await fetch(`${basePath}/api/plutus/settlements?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

export default function SettlementsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-settlements', page, search],
    queryFn: () => fetchSettlements(page, search),
    enabled: connection !== undefined && connection.connected === true,
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
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Settlements</h1>
            <div className="hidden sm:block w-72">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
            </div>
          </div>
          <Button asChild variant="outline">
            <Link href="/setup">Setup</Link>
          </Button>
        </div>

        <div className="sm:hidden mb-4">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" />
        </div>

        <Card className="border-slate-200/70 dark:border-white/10">
          <CardContent className="p-0">
            <div className="p-4 border-b border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03]">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Select value="all" onValueChange={() => undefined}>
                  <SelectTrigger className="bg-white dark:bg-slate-900">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Period: All</SelectItem>
                  </SelectContent>
                </Select>

                <Select value="all" onValueChange={() => undefined}>
                  <SelectTrigger className="bg-white dark:bg-slate-900">
                    <SelectValue placeholder="Settlement Total" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Settlement Total: All</SelectItem>
                  </SelectContent>
                </Select>

                <Select value="posted" onValueChange={() => undefined}>
                  <SelectTrigger className="bg-white dark:bg-slate-900">
                    <SelectValue placeholder="Settlement Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="posted">Settlement Status: Posted</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant="outline" className="bg-white dark:bg-slate-900">
                  Filter
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-white dark:bg-slate-900">
                    <TableHead className="w-10">
                      <input type="checkbox" aria-label="Select all settlements" />
                    </TableHead>
                    <TableHead>Marketplace</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Settlement Total</TableHead>
                    <TableHead>Settlement Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        Loading settlements…
                      </TableCell>
                    </TableRow>
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
                        No settlements found in QBO.
                      </TableCell>
                    </TableRow>
                  )}

                  {!isLoading &&
                    !error &&
                    settlements.map((s) => (
                      <TableRow key={s.id} className="bg-white dark:bg-slate-900">
                        <TableCell className="align-top">
                          <input type="checkbox" aria-label={`Select settlement ${s.docNumber}`} />
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 dark:bg-white/10 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                              {s.marketplace.region}
                            </span>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{s.marketplace.label}</span>
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {s.docNumber}
                          </div>
                        </TableCell>
                        <TableCell className="align-top text-sm text-slate-700 dark:text-slate-200">
                          {formatPeriod(s.periodStart, s.periodEnd)}
                        </TableCell>
                        <TableCell className="align-top text-sm font-medium text-slate-900 dark:text-white">
                          {s.settlementTotal === null ? '—' : formatMoney(s.settlementTotal, s.marketplace.currency)}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col gap-2">
                            <StatusPill status={s.lmbStatus} />
                            <PlutusPill status={s.plutusStatus} />
                          </div>
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
              <div className="flex items-center justify-between p-4 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03]">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Page {data.pagination.page} of {data.pagination.totalPages}
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
    </main>
  );
}
