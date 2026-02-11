'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Download,
  FileSearch,
  Upload,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatCard } from '@/components/ui/stat-card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ReconciliationRow = {
  orderId: string;
  date: string;
  type: string;
  amazonTotal: number;
  lmbTotal: number;
  status: 'matched' | 'discrepancy' | 'amazon-only' | 'lmb-only';
  difference: number;
};

type ReconciliationResult = {
  summary: {
    totalAmazonTransactions: number;
    totalLmbRows: number;
    matched: number;
    discrepancies: number;
    amazonOnly: number;
    lmbOnly: number;
  };
  rows: ReconciliationRow[];
};

type ConnectionStatus = { connected: boolean; error?: string };

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

function getDefaultMonth(): string {
  const now = new Date();
  // Default to previous month
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currencyForMarketplace(marketplace: 'US' | 'UK'): 'USD' | 'GBP' {
  if (marketplace === 'UK') return 'GBP';
  return 'USD';
}

function formatCurrency(amount: number, currency: 'USD' | 'GBP'): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

function statusBadge(status: ReconciliationRow['status']) {
  switch (status) {
    case 'matched':
      return <Badge variant="success">Matched</Badge>;
    case 'discrepancy':
      return <Badge variant="destructive">Discrepancy</Badge>;
    case 'amazon-only':
      return <Badge variant="secondary">Amazon Only</Badge>;
    case 'lmb-only':
      return <Badge variant="secondary">LMB Only</Badge>;
  }
}

function exportToCsv(rows: ReconciliationRow[], month: string, marketplace: string) {
  const header = ['Order ID', 'Date', 'Type', 'Amazon Amount', 'LMB Amount', 'Status', 'Difference'];
  const csvRows = rows.map((r) => [
    r.orderId,
    r.date,
    r.type,
    r.amazonTotal.toFixed(2),
    r.lmbTotal.toFixed(2),
    r.status,
    r.difference.toFixed(2),
  ]);

  const csv = [header, ...csvRows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reconciliation-${marketplace}-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReconciliationPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [month, setMonth] = useState(getDefaultMonth);
  const [marketplace, setMarketplace] = useState<'US' | 'UK'>('US');

  const currency = currencyForMarketplace(marketplace);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const handleReconcile = useCallback(async () => {
    if (!selectedFile) return;

    setIsReconciling(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set('file', selectedFile);
    formData.set('month', month);
    formData.set('marketplace', marketplace);

    const res = await fetch(`${basePath}/api/plutus/reconciliation`, {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error);
      setIsReconciling(false);
      return;
    }

    setResult(json as ReconciliationResult);
    setIsReconciling(false);
  }, [selectedFile, month, marketplace]);

  const onFileSelected = useCallback((file: File) => {
    setSelectedFile(file);
    setResult(null);
    setError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelected(file);
      e.target.value = '';
    },
    [onFileSelected],
  );

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Reconciliation" error={connection.error} />;
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Reconciliation"
          description="Optional: compare an Amazon Seller Central Date Range Transaction Report against stored LMB audit data"
          variant="accent"
        />

        {/* Instructions */}
        <Card className="mt-6 border-slate-200/70 dark:border-white/10">
          <CardContent className="p-6">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">How it works</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-700 dark:bg-brand-teal-950/40 dark:text-brand-cyan">
                  1
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Download your report</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Export the Date Range Transaction Report from Amazon Seller Central (this is not required for settlement processing)
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-700 dark:bg-brand-teal-950/40 dark:text-brand-cyan">
                  2
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Select month and marketplace</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Choose the period and marketplace to reconcile
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-700 dark:bg-brand-teal-950/40 dark:text-brand-cyan">
                  3
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Upload and reconcile</p>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Compare Amazon order totals against your stored LMB audit data
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Form */}
        <Card className="mt-6 border-slate-200/70 dark:border-white/10">
          <CardContent className="p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="month-input" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
                  Month
                </label>
                <Input id="month-input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Marketplace</label>
                <Select value={marketplace} onValueChange={(v) => setMarketplace(v as 'US' | 'UK')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">US - Amazon.com</SelectItem>
                    <SelectItem value="UK">UK - Amazon.co.uk</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Drop Zone */}
            <div
              className={`relative mt-4 flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                isDragging
                  ? 'border-brand-teal-500 bg-brand-teal-50/50 dark:border-brand-cyan dark:bg-brand-cyan/5'
                  : 'border-slate-300 hover:border-brand-teal-400 dark:border-slate-700 dark:hover:border-brand-cyan/50'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <input ref={fileInputRef} type="file" accept=".csv" onChange={onFileChange} className="hidden" />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{selectedFile.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-medium text-brand-teal-600 hover:text-brand-teal-700 dark:text-brand-cyan dark:hover:text-brand-cyan/80"
                  >
                    Choose a different file
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal-600 dark:bg-brand-teal-950/40 dark:text-brand-cyan">
                    <Upload className="h-6 w-6" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Drop your Amazon Transaction Report here
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    CSV format, Date Range Transaction Report from Seller Central
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 rounded-lg bg-brand-teal-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 dark:bg-brand-cyan dark:text-slate-900 dark:hover:bg-brand-cyan/90"
                  >
                    Choose File
                  </button>
                </>
              )}
            </div>

            {/* Reconcile Button */}
            <div className="mt-4 flex justify-end">
              <Button onClick={handleReconcile} disabled={!selectedFile || isReconciling}>
                {isReconciling ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Reconciling...
                  </>
                ) : (
                  <>
                    <FileSearch className="h-4 w-4" />
                    Reconcile
                  </>
                )}
              </Button>
            </div>

            {/* Error */}
            {error !== null && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {result !== null && (
          <>
            {/* Summary Stats */}
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Amazon Transactions"
                value={result.summary.totalAmazonTransactions.toLocaleString()}
                icon={<ArrowDownToLine className="h-5 w-5" />}
              />
              <StatCard
                label="Matched"
                value={result.summary.matched.toLocaleString()}
                icon={<CheckCircle2 className="h-5 w-5" />}
                dotColor="bg-emerald-500"
              />
              <StatCard
                label="Discrepancies"
                value={result.summary.discrepancies.toLocaleString()}
                icon={<AlertCircle className="h-5 w-5" />}
                dotColor="bg-red-500"
              />
              <StatCard
                label="Unmatched"
                value={(result.summary.amazonOnly + result.summary.lmbOnly).toLocaleString()}
                icon={<XCircle className="h-5 w-5" />}
                dotColor="bg-amber-500"
              />
            </div>

            {/* Detail Breakdown */}
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 px-1">
              <span>LMB rows: {result.summary.totalLmbRows.toLocaleString()}</span>
              <span>&middot;</span>
              <span>Amazon only: {result.summary.amazonOnly.toLocaleString()}</span>
              <span>&middot;</span>
              <span>LMB only: {result.summary.lmbOnly.toLocaleString()}</span>
            </div>

            {/* Results Table */}
            <Card className="mt-4 border-slate-200/70 dark:border-white/10 overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between border-b border-slate-200/70 px-4 py-3 dark:border-white/10">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Reconciliation Details
                    <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">
                      ({result.rows.length.toLocaleString()} orders)
                    </span>
                  </h3>
                  <Button variant="outline" size="sm" onClick={() => exportToCsv(result.rows, month, marketplace)}>
                    <Download className="h-3.5 w-3.5" />
                    Export CSV
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table className="table-striped">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-white/[0.03]">
                        <TableHead className="font-semibold">Order ID</TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold text-right">Amazon</TableHead>
                        <TableHead className="font-semibold text-right">LMB</TableHead>
                        <TableHead className="font-semibold text-right">Difference</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                            No matching orders found for this period
                          </TableCell>
                        </TableRow>
                      )}
                      {result.rows.map((row) => (
                        <TableRow key={row.orderId}>
                          <TableCell className="font-mono text-xs">{row.orderId}</TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-300">{row.date}</TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-300">{row.type}</TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {row.amazonTotal !== 0 ? formatCurrency(row.amazonTotal, currency) : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-right tabular-nums">
                            {row.lmbTotal !== 0 ? formatCurrency(row.lmbTotal, currency) : '—'}
                          </TableCell>
                          <TableCell
                            className={`text-sm text-right tabular-nums ${
                              row.difference !== 0
                                ? row.difference > 0
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {row.difference !== 0
                              ? `${row.difference > 0 ? '+' : ''}${formatCurrency(row.difference, currency)}`
                              : '—'}
                          </TableCell>
                          <TableCell>{statusBadge(row.status)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
