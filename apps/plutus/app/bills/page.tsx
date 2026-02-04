'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BackButton } from '@/components/back-button';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotConnectedScreen } from '@/components/not-connected-screen';
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

  // v1 parser rules (approx): SKU then qty, separated by x/× or whitespace
  // Examples:
  // - CS-007 x 500 units
  // - CS 007 x 500
  // - CS-007 500 units
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
  const styles: Record<ComplianceStatus, string> = {
    compliant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
    'non-compliant': 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  };

  const labels: Record<ComplianceStatus, string> = {
    compliant: 'OK',
    partial: 'Check',
    'non-compliant': 'Missing',
  };

  return (
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', styles[status])}>
      {labels[status]}
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

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
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

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Bills" />;
  }

  return (
    <main className="flex-1">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-3">
          <BackButton />
        </div>
        <PageHeader
          className="mt-4"
          title="Bills"
          kicker="Inventory"
          description="Audit QBO bills for PO memo + manufacturing line compliance so Plutus can build cost basis."
          actions={
            <Button asChild variant="outline">
              <Link href="/setup">Setup</Link>
            </Button>
          }
        />

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'guide' | 'scanner')}>
          <TabsList>
            <TabsTrigger value="guide">Bill Guide</TabsTrigger>
            <TabsTrigger value="scanner">Compliance Scanner</TabsTrigger>
          </TabsList>

          <TabsContent value="guide">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">PO Memo Rule</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Every Manufacturing/Freight/Duty bill for a PO must use the exact memo format.
                </p>
                <pre className="rounded-lg bg-slate-950 text-slate-50 p-4 text-sm overflow-x-auto">
{`PO: PO-2026-001`}
                </pre>
                <ul className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <li>Start with `PO: ` (including the space)</li>
                  <li>No extra text in memo</li>
                  <li>Same memo across manufacturing + freight + duty bills</li>
                </ul>
              </Card>

              <Card className="p-5">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                  Manufacturing Line Description
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Manufacturing lines must be parseable into SKU + quantity.
                </p>
                <pre className="rounded-lg bg-slate-950 text-slate-50 p-4 text-sm overflow-x-auto">
{`CS-007 x 500 units\nCS 007 x 500\nCS-010 500 units`}
                </pre>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Plutus uses these lines to calculate unit costs from bills.
                </p>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="scanner">
            <div className="space-y-4">
              <Card className="p-5">
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
                    <Button
                      variant="outline"
                      onClick={() => {
                        clearDates();
                      }}
                    >
                      Clear
                    </Button>
                    <Button
                      onClick={() => {
                        setPage(1);
                        billsQuery.refetch();
                      }}
                      disabled={billsQuery.isFetching}
                    >
                      {billsQuery.isFetching ? 'Scanning…' : 'Scan'}
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                    Total: {counts.all}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-emerald-100/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                    OK: {counts.compliant}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                    Check: {counts.partial}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-red-100/60 dark:bg-red-900/30 text-red-700 dark:text-red-300">
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

              <Card className="p-0 overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Memo</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(({ bill, compliance }) => (
                        <TableRow key={bill.id}>
                          <TableCell className="whitespace-nowrap">{bill.date}</TableCell>
                          <TableCell>{bill.vendor}</TableCell>
                          <TableCell className="font-mono text-xs text-slate-600 dark:text-slate-400">
                            {bill.memo === '' ? '(empty)' : bill.memo}
                          </TableCell>
                          <TableCell>
                            <StatusPill status={compliance} />
                          </TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-200">
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: 'USD',
                            }).format(bill.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-10 text-center text-slate-500 dark:text-slate-400">
                            {isCheckingConnection || billsQuery.isFetching ? 'Loading…' : 'No bills found for this range.'}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/5">
                  <Button
                    variant="outline"
                    onClick={() => setPage(page > 1 ? page - 1 : 1)}
                    disabled={page === 1 || billsQuery.isFetching}
                  >
                    Prev
                  </Button>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Page {page} / {billsQuery.data ? billsQuery.data.pagination.totalPages : 1}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setPage(page + 1)}
                    disabled={
                      billsQuery.isFetching ||
                      (billsQuery.data?.pagination.totalPages ? page >= billsQuery.data.pagination.totalPages : true)
                    }
                  >
                    Next
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
