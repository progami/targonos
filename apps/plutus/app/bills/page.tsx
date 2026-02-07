'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { EmptyState } from '@/components/ui/empty-state';
import { useBillsStore } from '@/lib/store/bills';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ComplianceStatus = 'compliant' | 'partial' | 'non-compliant';

type Bill = {
  id: string;
  syncToken: string;
  date: string;
  amount: number;
  docNumber: string;
  memo: string;
  vendor: string;
  vendorId?: string;
  account: string;
  accountId?: string;
  lineItems: Array<{
    id: string;
    amount: number;
    description?: string;
    account?: string;
    accountId?: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
};

type BillsResponse = {
  bills: Bill[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type ConnectionStatus = { connected: boolean };

function getMemoCompliance(memo: string | undefined): ComplianceStatus {
  if (!memo || memo.trim() === '') return 'non-compliant';
  return memo.trim().startsWith('PO: ') ? 'compliant' : 'partial';
}

function getManufacturingLineCompliance(lineDescription: string | undefined): ComplianceStatus {
  if (!lineDescription || lineDescription.trim() === '') return 'non-compliant';

  const text = lineDescription.trim();
  const match = text.match(/^[A-Za-z0-9\- ]+\s*(x|×|\s)\s*\d+\s*(units)?\s*$/i);
  return match ? 'compliant' : 'partial';
}

function isManufacturingInventoryLine(accountName: string | undefined): boolean {
  if (!accountName) return false;

  let leaf = accountName;
  if (accountName.includes(':')) {
    const parts = accountName.split(':');
    leaf = parts[parts.length - 1];
  }

  let normalized = leaf.trim().toLowerCase();
  if (normalized.startsWith('inv ')) {
    normalized = normalized.slice('inv '.length).trimStart();
  }

  return normalized.startsWith('manufacturing');
}

function getBillCompliance(bill: Bill): ComplianceStatus {
  const memoStatus = getMemoCompliance(bill.memo);

  if (memoStatus === 'non-compliant') {
    return 'non-compliant';
  }

  const manufacturingLines = bill.lineItems.filter((line) => isManufacturingInventoryLine(line.account));

  if (manufacturingLines.length === 0) {
    return memoStatus;
  }

  const lineStatuses = manufacturingLines.map((line) =>
    getManufacturingLineCompliance(line.description),
  );

  if (lineStatuses.every((s) => s === 'compliant') && memoStatus === 'compliant') return 'compliant';
  if (lineStatuses.some((s) => s === 'non-compliant')) return 'non-compliant';
  return 'partial';
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchBills(page: number, startDate?: string, endDate?: string): Promise<BillsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '50',
  });
  if (startDate !== undefined) params.set('startDate', startDate);
  if (endDate !== undefined) params.set('endDate', endDate);

  const res = await fetch(`${basePath}/api/qbo/bills?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

function StatusPill({ status }: { status: ComplianceStatus }) {
  const config: Record<ComplianceStatus, { icon: typeof CheckCircle2; style: string; label: string }> = {
    compliant: {
      icon: CheckCircle2,
      style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
      label: 'OK',
    },
    partial: {
      icon: AlertTriangle,
      style: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      label: 'Check',
    },
    'non-compliant': {
      icon: XCircle,
      style: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
      label: 'Missing',
    },
  };

  const { icon: Icon, style, label } = config[status];

  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', style)}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

export default function BillsPage() {
  const tab = useBillsStore((s) => s.tab);
  const page = useBillsStore((s) => s.page);
  const startDate = useBillsStore((s) => s.startDate);
  const endDate = useBillsStore((s) => s.endDate);
  const setTab = useBillsStore((s) => s.setTab);
  const setPage = useBillsStore((s) => s.setPage);
  const setStartDate = useBillsStore((s) => s.setStartDate);
  const setEndDate = useBillsStore((s) => s.setEndDate);
  const clearDates = useBillsStore((s) => s.clearDates);

  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 5 * 60 * 1000,
  });

  const scannerEnabled = tab === 'scanner' && connection !== undefined && connection.connected === true;
  const billsQuery = useQuery({
    queryKey: ['qbo-bills', page, startDate, endDate],
    queryFn: () => {
      const normalizedStartDate = startDate === '' ? undefined : startDate;
      const normalizedEndDate = endDate === '' ? undefined : endDate;
      return fetchBills(page, normalizedStartDate, normalizedEndDate);
    },
    enabled: scannerEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const bills = useMemo(() => {
    return billsQuery.data ? billsQuery.data.bills : [];
  }, [billsQuery.data]);

  const rows = useMemo(() => {
    return bills.map((bill) => ({
      bill,
      compliance: getBillCompliance(bill),
      memoStatus: getMemoCompliance(bill.memo),
    }));
  }, [bills]);

  const counts = useMemo(() => {
    const all = rows.length;
    const compliant = rows.filter((r) => r.compliance === 'compliant').length;
    const partial = rows.filter((r) => r.compliance === 'partial').length;
    const nonCompliant = rows.filter((r) => r.compliance === 'non-compliant').length;
    return { all, compliant, partial, nonCompliant };
  }, [rows]);

  const complianceScore = counts.all > 0 ? Math.round((counts.compliant / counts.all) * 100) : null;
  const totalPages = billsQuery.data ? billsQuery.data.pagination.totalPages : 1;

  const toggleBillExpand = (billId: string) => {
    setExpandedBills((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
      }
      return next;
    });
  };

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Bills" />;
  }

  // Generate page numbers for pagination
  const pageNumbers: number[] = [];
  const maxVisiblePages = 5;
  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);
    if (end - start < maxVisiblePages - 1) start = Math.max(1, end - maxVisiblePages + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Bills" variant="accent" />

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'guide' | 'scanner')} className="mt-6">
          <TabsList>
            <TabsTrigger value="guide">Bill Guide</TabsTrigger>
            <TabsTrigger value="scanner">Compliance Scanner</TabsTrigger>
          </TabsList>

          <TabsContent value="guide">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5 border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-600 dark:bg-brand-teal-950/50 dark:text-brand-teal-400">
                    1
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">PO Memo Rule</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Every Manufacturing/Freight/Duty bill for a PO must use the exact memo format.
                </p>
                <pre className="code-block">{`PO: PO-2026-001`}</pre>
                <ul className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Start with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono dark:bg-white/10">PO: </code> (including the space)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>No extra text in memo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Same memo across manufacturing + freight + duty bills</span>
                  </li>
                </ul>
              </Card>

              <Card className="p-5 border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-600 dark:bg-brand-teal-950/50 dark:text-brand-teal-400">
                    2
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Manufacturing Line Description
                  </h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Manufacturing lines must be parseable into SKU + quantity.
                </p>
                <pre className="code-block">{`CS-007 x 500 units\nCS 007 x 500\nCS-010 500 units`}</pre>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Plutus uses these lines to calculate unit costs from bills.
                </p>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="scanner">
            <div className="space-y-4">
              {/* Compliance Score + Filters */}
              <Card className="p-5 border-slate-200/70 dark:border-white/10">
                {complianceScore !== null && (
                  <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-white/5">
                    <div className={cn(
                      'flex h-14 w-14 items-center justify-center rounded-xl text-xl font-bold',
                      complianceScore >= 80
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                        : complianceScore >= 50
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400',
                    )}>
                      {complianceScore}%
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Compliance Score</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {counts.compliant} of {counts.all} bills fully compliant
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Start date
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      End date
                    </label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => clearDates()}>
                      Clear
                    </Button>
                    <Button
                      onClick={() => {
                        setPage(1);
                        billsQuery.refetch();
                      }}
                      disabled={billsQuery.isFetching}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', billsQuery.isFetching && 'animate-spin')} />
                      {billsQuery.isFetching ? 'Scanning…' : 'Scan'}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                    Total: {counts.all}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    OK: {counts.compliant}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-3 w-3" />
                    Check: {counts.partial}
                  </span>
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100/60 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                    <XCircle className="h-3 w-3" />
                    Missing: {counts.nonCompliant}
                  </span>
                </div>
              </Card>

              {billsQuery.error && (
                <Card className="p-5 border-red-200 dark:border-red-900">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {billsQuery.error instanceof Error ? billsQuery.error.message : String(billsQuery.error)}
                  </p>
                </Card>
              )}

              <Card className="p-0 overflow-hidden border-slate-200/70 dark:border-white/10">
                <div className="overflow-x-auto">
                  <Table className="table-striped">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                        <TableHead className="w-10" />
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Memo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0">
                            <EmptyState
                              title={isCheckingConnection || billsQuery.isFetching ? 'Loading…' : 'No bills found'}
                              description={isCheckingConnection || billsQuery.isFetching ? undefined : 'Try adjusting your date range or scan again.'}
                            />
                          </TableCell>
                        </TableRow>
                      ) : (
                        rows.map(({ bill, compliance }) => (
                          <Fragment key={bill.id}>
                            <TableRow
                              className="table-row-hover cursor-row"
                              onClick={() => toggleBillExpand(bill.id)}
                            >
                              <TableCell className="w-10">
                                {bill.lineItems.length > 0 && (
                                  expandedBills.has(bill.id)
                                    ? <ChevronDown className="h-4 w-4 text-slate-400" />
                                    : <ChevronRight className="h-4 w-4 text-slate-400" />
                                )}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{bill.date}</TableCell>
                              <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{bill.vendor}</TableCell>
                              <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                                {bill.memo === '' ? <span className="text-slate-400 italic">(empty)</span> : bill.memo}
                              </TableCell>
                              <TableCell>
                                <StatusPill status={compliance} />
                              </TableCell>
                              <TableCell className="text-right tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                                {new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                                }).format(bill.amount)}
                              </TableCell>
                            </TableRow>
                            {expandedBills.has(bill.id) && bill.lineItems.length > 0 && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-slate-50/50 dark:bg-white/[0.02] p-0">
                                  <div className="expand-content px-4 py-3 ml-10">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                                          <th className="text-left pb-2 pr-4">Description</th>
                                          <th className="text-left pb-2 pr-4">Account</th>
                                          <th className="text-right pb-2">Amount</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                                        {bill.lineItems.map((line) => (
                                          <tr key={line.id}>
                                            <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">
                                              {line.description ? line.description : '—'}
                                            </td>
                                            <td className="py-2 pr-4 text-slate-500 dark:text-slate-400 text-xs font-mono">
                                              {line.account ? line.account : '—'}
                                            </td>
                                            <td className="py-2 text-right tabular-nums font-medium text-slate-700 dark:text-slate-300">
                                              {new Intl.NumberFormat('en-US', {
                                                style: 'currency',
                                                currency: 'USD',
                                              }).format(line.amount)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page > 1 ? page - 1 : 1)}
                    disabled={page === 1 || billsQuery.isFetching}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <div className="flex items-center gap-1">
                    {pageNumbers.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        disabled={billsQuery.isFetching}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                          p === page
                            ? 'bg-brand-teal-500 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={billsQuery.isFetching || page >= totalPages}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
