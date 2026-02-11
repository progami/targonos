'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, ExternalLink, Play, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { SplitButton } from '@/components/ui/split-button';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { useMarketplaceStore, type Marketplace } from '@/lib/store/marketplace';
import { useSettlementsListStore } from '@/lib/store/settlements';
import { selectAuditInvoiceForSettlement, type AuditInvoiceSummary } from '@/lib/plutus/audit-invoice-matching';

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

type ConnectionStatus = { connected: boolean; error?: string };
type AuditDataResponse = { invoices: AuditInvoiceSummary[] };
type AuditMatch = ReturnType<typeof selectAuditInvoiceForSettlement>;

function formatPeriod(start: string | null, end: string | null): string {
  if (start === null || end === null) return '—';

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);

  const startYear = startDate.getUTCFullYear();
  const endYear = endDate.getUTCFullYear();
  const sameYear = startYear === endYear;

  const startText = startDate.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  });

  const endText = endDate.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
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
  if (status === 'Posted') return <Badge variant="success">LMB Posted</Badge>;
  return <Badge variant="secondary">LMB {status}</Badge>;
}

function PlutusPill({ status }: { status: SettlementRow['plutusStatus'] }) {
  if (status === 'Processed') return <Badge variant="success">Plutus Processed</Badge>;
  if (status === 'RolledBack') return <Badge variant="secondary">Plutus Rolled Back</Badge>;
  if (status === 'Blocked') return <Badge variant="destructive">Plutus Blocked</Badge>;
  return <Badge variant="destructive">Plutus Pending</Badge>;
}

function AuditDataPill({ match }: { match: AuditMatch | undefined }) {
  if (!match) {
    return <Badge variant="outline">—</Badge>;
  }

  if (match.kind === 'match') {
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge variant="success">Audit Ready</Badge>
        <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{match.invoiceId}</span>
      </div>
    );
  }

  if (match.kind === 'ambiguous') {
    const count = match.candidateInvoiceIds.length;
    return (
      <div className="flex flex-col items-start gap-1">
        <Badge
          variant="secondary"
          className="bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
        >
          Multiple ({count})
        </Badge>
        <span className="text-xs text-slate-500 dark:text-slate-400">Select in detail</span>
      </div>
    );
  }

  if (match.kind === 'missing_period') {
    return <Badge variant="outline">Unknown</Badge>;
  }

  return <Badge variant="outline">No Audit</Badge>;
}

function MarketplaceFlag({ region }: { region: 'US' | 'UK' }) {
  if (region === 'US') {
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-xs dark:bg-blue-950/40" title="United States">
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="10" rx="1.5" className="fill-blue-600" />
          <path d="M1 5h14M1 7h14M1 9h14M1 11h14" className="stroke-white" strokeWidth="0.6" />
          <rect x="1" y="3" width="6" height="5" className="fill-blue-800" />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-50 text-xs dark:bg-red-950/40" title="United Kingdom">
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="1.5" className="fill-blue-700" />
        <path d="M1 3l14 10M15 3L1 13" className="stroke-white" strokeWidth="1.5" />
        <path d="M1 3l14 10M15 3L1 13" className="stroke-red-600" strokeWidth="0.8" />
        <path d="M8 3v10M1 8h14" className="stroke-white" strokeWidth="2.5" />
        <path d="M8 3v10M1 8h14" className="stroke-red-600" strokeWidth="1.5" />
      </svg>
    </span>
  );
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAuditData(): Promise<AuditDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function fetchSettlements({
  page,
  search,
  startDate,
  endDate,
  marketplace,
}: {
  page: number;
  search: string;
  startDate: string | null;
  endDate: string | null;
  marketplace: Marketplace;
}): Promise<SettlementsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '25');
  if (search.trim() !== '') params.set('search', search.trim());
  if (startDate !== null && startDate.trim() !== '') params.set('startDate', startDate.trim());
  if (endDate !== null && endDate.trim() !== '') params.set('endDate', endDate.trim());
  if (marketplace !== 'all') params.set('marketplace', marketplace);

  const res = await fetch(`${basePath}/api/plutus/settlements?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

function SettlementsEmptyIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="6" width="32" height="36" rx="4" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" />
      <path d="M16 16h16M16 22h12M16 28h8" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

type AutopostCheckResult = {
  processed: Array<{ settlementId: string; docNumber: string; invoiceId: string }>;
  skipped: Array<{ settlementId: string; docNumber: string; reason: string }>;
  errors: Array<{ settlementId: string; docNumber: string; error: string }>;
};

async function runAutopostCheck(): Promise<AutopostCheckResult> {
  const res = await fetch(`${basePath}/api/plutus/autopost/check`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

export default function SettlementsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const marketplace = useMarketplaceStore((s) => s.marketplace);
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

  const { data: auditData } = useQuery({
    queryKey: ['plutus-audit-data'],
    queryFn: fetchAuditData,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-settlements', page, search, normalizedStartDate, normalizedEndDate, marketplace],
    queryFn: () => fetchSettlements({ page, search, startDate: normalizedStartDate, endDate: normalizedEndDate, marketplace }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const settlements = useMemo(() => {
    if (!data) return [];
    return data.settlements;
  }, [data]);

  const auditInvoices = useMemo(() => auditData?.invoices ?? [], [auditData?.invoices]);

  const auditMatchBySettlementId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof selectAuditInvoiceForSettlement>>();
    for (const settlement of settlements) {
      map.set(
        settlement.id,
        selectAuditInvoiceForSettlement({
          settlementMarketplace: settlement.marketplace.id,
          settlementPeriodStart: settlement.periodStart,
          settlementPeriodEnd: settlement.periodEnd,
          invoices: auditInvoices,
        }),
      );
    }
    return map;
  }, [auditInvoices, settlements]);

  // Compute KPI stats from loaded data
  const stats = useMemo(() => {
    const total = data?.pagination.totalCount ?? 0;
    const processed = settlements.filter((s) => s.plutusStatus === 'Processed').length;
    const pending = settlements.filter((s) => s.plutusStatus === 'Pending').length;
    const hasAnyTotal = settlements.some((s) => s.settlementTotal !== null);
    const totalAmount = settlements.reduce((sum, s) => sum + (s.settlementTotal ?? 0), 0);
    const primaryCurrency = settlements[0]?.marketplace.currency ?? 'USD';
    return { total, processed, pending, hasAnyTotal, totalAmount, primaryCurrency };
  }, [data, settlements]);

  const autoprocessMutation = useMutation({
    mutationFn: runAutopostCheck,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      const processedCount = result.processed.length;
      const skippedCount = result.skipped.length;
      const errorCount = result.errors.length;

      if (processedCount > 0) {
        toast.success(`Auto-processed ${processedCount} settlement${processedCount === 1 ? '' : 's'}`);
      } else if (errorCount > 0) {
        toast.error(`${errorCount} error${errorCount === 1 ? '' : 's'} during auto-processing`);
      } else {
        toast.info(`No settlements to auto-process (${skippedCount} skipped)`);
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Auto-process failed');
    },
  });

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlements" error={connection.error} />;
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Settlements"
            description="Process LMB-posted settlements from QBO. Prereqs: upload Audit Data and map Bills so Plutus can compute COGS + allocate fees by brand."
            variant="accent"
          />
          <Button
            variant="outline"
            onClick={() => autoprocessMutation.mutate()}
            disabled={autoprocessMutation.isPending}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {autoprocessMutation.isPending ? 'Processing…' : 'Auto-process'}
          </Button>
        </div>

        {/* KPI Strip */}
        {!isLoading && data && (
          <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Total"
              value={stats.total}
              icon={
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 6h6M7 10h4M7 14h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />
            <StatCard
              label="Settlement Value"
              value={stats.hasAnyTotal ? formatMoney(stats.totalAmount, stats.primaryCurrency) : 'No data'}
            />
            <StatCard
              label="Processed"
              value={stats.processed}
              dotColor="bg-emerald-500"
            />
            <StatCard
              label="Pending"
              value={stats.pending}
              dotColor="bg-amber-500"
            />
          </div>
        )}

        <div className="mt-6 grid gap-4">
          {/* Filter Bar */}
          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-[1.4fr,0.55fr,0.55fr,auto] md:items-end">
                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    Search
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Doc number, memo…"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
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

                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
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

          {/* Table */}
          <Card className="border-slate-200/70 dark:border-white/10 overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="table-striped">
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-white/[0.03]">
                      <TableHead className="font-semibold">Marketplace</TableHead>
                      <TableHead className="font-semibold">Period</TableHead>
                      <TableHead className="font-semibold">Settlement Total</TableHead>
                      <TableHead className="font-semibold">LMB</TableHead>
                      <TableHead className="font-semibold">Audit Data</TableHead>
                      <TableHead className="font-semibold text-right">Plutus</TableHead>
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
                        <TableCell colSpan={6}>
                          <EmptyState
                            icon={<SettlementsEmptyIcon />}
                            title="No settlements found"
                            description="No settlements match your current filters. Try adjusting the date range or search terms."
                          />
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      !error &&
                      settlements.map((s) => (
                        <TableRow
                          key={s.id}
                          className="table-row-hover cursor-row group"
                          onClick={() => router.push(`/settlements/${s.id}`)}
                        >
                          <TableCell className="align-top">
                            <div className="flex items-center gap-2.5">
                              <MarketplaceFlag region={s.marketplace.region} />
                              <div className="min-w-0">
                                <div className="truncate text-sm font-medium text-slate-900 dark:text-white group-hover:text-brand-teal-600 dark:group-hover:text-brand-cyan transition-colors">
                                  {s.marketplace.label}
                                </div>
                                <div className="mt-0.5 truncate font-mono text-sm text-slate-700 dark:text-slate-300">
                                  {s.docNumber}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm">
                            <div className="font-medium text-slate-900 dark:text-white">
                              {formatPeriod(s.periodStart, s.periodEnd)}
                            </div>
                            <div className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                              Posted {new Date(`${s.postedDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          </TableCell>
                          <TableCell className="align-top text-sm font-semibold tabular-nums text-slate-900 dark:text-white">
                            {s.settlementTotal === null ? '—' : formatMoney(s.settlementTotal, s.marketplace.currency)}
                          </TableCell>
                          <TableCell className="align-top">
                            <a
                              href={`https://app.qbo.intuit.com/app/journal?txnId=${s.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1.5 group"
                            >
                              <StatusPill status={s.lmbStatus} />
                              <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-slate-600 transition-colors" />
                            </a>
                          </TableCell>
                          <TableCell className="align-top">
                            <AuditDataPill match={auditMatchBySettlementId.get(s.id)} />
                          </TableCell>
                          <TableCell className="align-top text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-2">
                              <PlutusPill status={s.plutusStatus} />
                              <SplitButton
                                onClick={() => router.push(`/settlements/${s.id}`)}
                                dropdownItems={[
                                  { label: 'View', onClick: () => router.push(`/settlements/${s.id}`) },
                                  { label: 'History', onClick: () => router.push(`/settlements/${s.id}?tab=history`) },
                                  { label: 'Analysis', onClick: () => router.push(`/settlements/${s.id}?tab=analysis`) },
                                  { label: 'Open in QBO', onClick: () => window.open(`https://app.qbo.intuit.com/app/journal?txnId=${s.id}`, '_blank') },
                                ]}
                              >
                                Action
                              </SplitButton>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>

              {data && data.pagination.totalPages > 1 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03]">
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Page {data.pagination.page} of {data.pagination.totalPages} &middot; {data.pagination.totalCount} settlements
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {/* Page number buttons */}
                    {Array.from({ length: Math.min(data.pagination.totalPages, 5) }).map((_, idx) => {
                      const pageNum = idx + 1;
                      return (
                        <Button
                          key={pageNum}
                          variant={page === pageNum ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setPage(pageNum)}
                          className="h-8 w-8 p-0 tabular-nums"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                    {data.pagination.totalPages > 5 && (
                      <span className="px-1 text-xs text-slate-400">…</span>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.pagination.totalPages}
                      onClick={() => setPage(page + 1)}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
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
