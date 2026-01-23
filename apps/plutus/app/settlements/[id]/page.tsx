'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotConnectedScreen } from '@/components/not-connected-screen';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type SettlementDetailResponse = {
  settlement: {
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
    plutusStatus: 'Pending' | 'Processed';
    lines: Array<{
      id?: string;
      description: string;
      amount: number;
      postingType: 'Debit' | 'Credit';
      accountId: string;
      accountName: string;
      accountFullyQualifiedName?: string;
      accountType?: string;
    }>;
  };
  processing: null | {
    id: string;
    marketplace: string;
    invoiceId: string;
    processingHash: string;
    sourceFilename: string;
    uploadedAt: string;
    qboCogsJournalEntryId: string;
    qboPnlReclassJournalEntryId: string;
    orderSalesCount: number;
    orderReturnsCount: number;
  };
};

type InvoiceSummary = {
  invoice: string;
  minDate: string;
  maxDate: string;
  rowCount: number;
  skuCount: number;
};

type AuditAnalyzeResponse = {
  fileName: string;
  innerName: string;
  size: number;
  rowCount: number;
  minDate: string;
  maxDate: string;
  invoiceSummaries: InvoiceSummary[];
};

type SettlementProcessingPreview = {
  marketplace: string;
  settlementJournalEntryId: string;
  settlementDocNumber: string;
  settlementPostedDate: string;
  invoiceId: string;
  processingHash: string;
  minDate: string;
  maxDate: string;
  blocks: Array<{ code: string; message: string; details?: Record<string, string | number> }>;
  sales: Array<{ orderId: string; sku: string; date: string; quantity: number; principalCents: number }>;
  returns: Array<{ orderId: string; sku: string; date: string; quantity: number; principalCents: number }>;
  cogsJournalEntry: { lines: Array<{ postingType: 'Debit' | 'Credit'; amountCents: number }> };
  pnlJournalEntry: { lines: Array<{ postingType: 'Debit' | 'Credit'; amountCents: number }> };
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

function StatusPill({ status }: { status: SettlementDetailResponse['settlement']['lmbStatus'] }) {
  if (status === 'Posted') return <Badge variant="success">Posted</Badge>;
  return <Badge variant="secondary">{status}</Badge>;
}

function PlutusPill({ status }: { status: SettlementDetailResponse['settlement']['plutusStatus'] }) {
  if (status === 'Processed') return <Badge variant="success">Plutus: Processed</Badge>;
  return <Badge variant="outline">Plutus: Pending</Badge>;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchSettlement(id: string): Promise<SettlementDetailResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${id}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function analyzeAuditFile(file: File): Promise<AuditAnalyzeResponse> {
  const formData = new FormData();
  formData.set('file', file);
  const res = await fetch(`${basePath}/api/plutus/audit-data/analyze`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error);
  }
  return data;
}

async function fetchPreview(settlementId: string, file: File, invoiceId: string): Promise<SettlementProcessingPreview> {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('invoice', invoiceId);
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/preview`, { method: 'POST', body: formData });
  const data = await res.json();
  return data;
}

async function processSettlement(settlementId: string, file: File, invoiceId: string) {
  const formData = new FormData();
  formData.set('file', file);
  formData.set('invoice', invoiceId);
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/process`, { method: 'POST', body: formData });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false, data };
  }
  return { ok: true, data };
}

function SignedAmount({
  amount,
  postingType,
  currency,
}: {
  amount: number;
  postingType: 'Debit' | 'Credit';
  currency: string;
}) {
  const signed = postingType === 'Debit' ? amount : -amount;
  return <span className="font-medium">{formatMoney(signed, currency)}</span>;
}

export default function SettlementDetailPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(initialTab === 'analysis' ? 'analysis' : initialTab === 'history' ? 'history' : 'sales');

  const [auditFile, setAuditFile] = useState<File | null>(null);
  const [auditAnalyze, setAuditAnalyze] = useState<AuditAnalyzeResponse | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [preview, setPreview] = useState<SettlementProcessingPreview | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-settlement', params.id],
    queryFn: () => fetchSettlement(params.id),
    enabled: connection?.connected === true,
    staleTime: 30 * 1000,
  });

  const settlement = data?.settlement;

  const totalLines = useMemo(() => {
    if (!settlement) return 0;
    let total = 0;
    for (const line of settlement.lines) {
      const signed = line.postingType === 'Debit' ? line.amount : -line.amount;
      total += signed;
    }
    return total;
  }, [settlement]);

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlement Details" />;
  }

  async function handleAuditSelected(file: File) {
    setAuditFile(file);
    setAuditAnalyze(null);
    setSelectedInvoice('');
    setPreview(null);
    setAnalysisError(null);
    setIsAnalyzing(true);

    try {
      const analyzed = await analyzeAuditFile(file);
      setAuditAnalyze(analyzed);

      const invoices = analyzed.invoiceSummaries;
      if (invoices.length === 1) {
        const only = invoices[0];
        if (!only) throw new Error('No invoice found');
        setSelectedInvoice(only.invoice);
        setIsPreviewLoading(true);
        const nextPreview = await fetchPreview(params.id, file, only.invoice);
        setPreview(nextPreview);
        setIsPreviewLoading(false);
      }
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleInvoiceSelected(invoiceId: string) {
    setSelectedInvoice(invoiceId);
    setPreview(null);
    setAnalysisError(null);

    const file = auditFile;
    if (!file) return;

    setIsPreviewLoading(true);
    try {
      const nextPreview = await fetchPreview(params.id, file, invoiceId);
      setPreview(nextPreview);
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handlePost() {
    const file = auditFile;
    if (!file) return;
    if (selectedInvoice.trim() === '') return;

    setIsPosting(true);
    setAnalysisError(null);
    try {
      const result = await processSettlement(params.id, file, selectedInvoice);
      if (!result.ok) {
        setPreview(result.data);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['plutus-settlement', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      setTab('history');
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPosting(false);
    }
  }

  async function handleRollback() {
    const processing = data?.processing;
    if (!processing) return;

    setActionError(null);

    const confirmed = window.confirm(
      [
        'Rollback Plutus processing?',
        '',
        'Void these Journal Entries in QBO first:',
        `- COGS JE: ${processing.qboCogsJournalEntryId}`,
        `- P&L Reclass JE: ${processing.qboPnlReclassJournalEntryId}`,
        '',
        'Then click OK to mark this settlement as Pending in Plutus.',
      ].join('\n'),
    );

    if (!confirmed) return;

    setIsRollingBack(true);
    try {
      const res = await fetch(`${basePath}/api/plutus/settlements/${params.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rollback' }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error);
      }

      await queryClient.invalidateQueries({ queryKey: ['plutus-settlement', params.id] });
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      setTab('analysis');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRollingBack(false);
    }
  }

  return (
    <main className="flex-1">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Button asChild variant="outline" size="sm">
                <Link href="/settlements">Back</Link>
              </Button>
              <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Settlement Details</h1>
            </div>
            {settlement && (
              <div className="mt-3 text-sm text-slate-600 dark:text-slate-300 space-y-1">
                <div className="font-mono text-xs text-slate-500 dark:text-slate-400">{settlement.docNumber}</div>
                <div>
                  {settlement.marketplace.label} • {formatPeriod(settlement.periodStart, settlement.periodEnd)}
                </div>
              </div>
            )}
          </div>

          {settlement && (
            <div className="flex flex-col items-end gap-2 flex-shrink-0">
              <div className="flex gap-2">
                <StatusPill status={settlement.lmbStatus} />
                <PlutusPill status={settlement.plutusStatus} />
              </div>
              <div className="text-sm font-medium text-slate-900 dark:text-white">
                {settlement.settlementTotal === null ? '—' : formatMoney(settlement.settlementTotal, settlement.marketplace.currency)}
              </div>
              {data?.processing && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRollback()}
                  disabled={isRollingBack}
                >
                  {isRollingBack ? 'Rolling back…' : 'Rollback'}
                </Button>
              )}
            </div>
          )}
        </div>

        {actionError && (
          <div className="mb-4 text-sm text-danger-700 dark:text-danger-400">
            {actionError}
          </div>
        )}

        <Card className="border-slate-200/70 dark:border-white/10">
          <CardContent className="p-0">
            <Tabs value={tab} onValueChange={setTab}>
              <div className="border-b border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] px-4 py-3">
                <TabsList>
                  <TabsTrigger value="sales">Sales &amp; Fees</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                  <TabsTrigger value="analysis">Analysis</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="sales" className="p-4">
                {isLoading && <div className="text-sm text-slate-500">Loading settlement…</div>}
                {!isLoading && error && (
                  <div className="text-sm text-danger-700 dark:text-danger-400">
                    {error instanceof Error ? error.message : String(error)}
                  </div>
                )}

                {settlement && (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead>Account</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {settlement.lines.map((line, idx) => (
                          <TableRow key={`${idx}`}>
                            <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                              {line.description === '' ? '—' : line.description}
                            </TableCell>
                            <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                              <div className="flex flex-col">
                                <span>{line.accountName === '' ? '—' : line.accountName}</span>
                                {line.accountFullyQualifiedName && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                    {line.accountFullyQualifiedName}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right text-sm text-slate-900 dark:text-white">
                              <SignedAmount amount={line.amount} postingType={line.postingType} currency={settlement.marketplace.currency} />
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={2} className="text-right text-sm font-medium text-slate-900 dark:text-white">
                            Net
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">
                            {settlement.settlementTotal === null
                              ? formatMoney(totalLines, settlement.marketplace.currency)
                              : formatMoney(settlement.settlementTotal, settlement.marketplace.currency)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="p-4">
                {settlement && (
                  <div className="space-y-4">
                    {!data?.processing && (
                      <div className="text-sm text-slate-500 dark:text-slate-400">Plutus has not processed this settlement yet.</div>
                    )}

                    {data?.processing && (
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Card className="border-slate-200/70 dark:border-white/10">
                            <CardContent className="p-4">
                              <div className="text-xs text-slate-500 dark:text-slate-400">Invoice</div>
                              <div className="mt-1 font-mono text-sm text-slate-900 dark:text-white">{data.processing.invoiceId}</div>
                              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">Hash</div>
                              <div className="mt-1 font-mono text-sm text-slate-900 dark:text-white">{data.processing.processingHash}</div>
                            </CardContent>
                          </Card>
                          <Card className="border-slate-200/70 dark:border-white/10">
                            <CardContent className="p-4">
                              <div className="text-xs text-slate-500 dark:text-slate-400">Upload</div>
                              <div className="mt-1 text-sm text-slate-900 dark:text-white">{data.processing.sourceFilename}</div>
                              <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">Uploaded At</div>
                              <div className="mt-1 text-sm text-slate-900 dark:text-white">
                                {new Date(data.processing.uploadedAt).toLocaleString('en-US')}
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        <Card className="border-slate-200/70 dark:border-white/10">
                          <CardContent className="p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-sm font-semibold text-slate-900 dark:text-white">Posted by Plutus</div>
                              <Badge variant="success">
                                {data.processing.orderSalesCount} sales • {data.processing.orderReturnsCount} returns
                              </Badge>
                            </div>
                            <div className="text-sm text-slate-700 dark:text-slate-200">
                              COGS JE ID: <span className="font-mono">{data.processing.qboCogsJournalEntryId}</span>
                            </div>
                            <div className="text-sm text-slate-700 dark:text-slate-200">
                              P&amp;L Reclass JE ID: <span className="font-mono">{data.processing.qboPnlReclassJournalEntryId}</span>
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="analysis" className="p-4">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Audit Data</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Upload the LMB Audit Data file (CSV or ZIP) for this settlement.
                      </div>
                    </div>
                    <div className="w-64">
                      <Input
                        type="file"
                        accept=".csv,.zip"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          void handleAuditSelected(file);
                        }}
                      />
                    </div>
                  </div>

                  {analysisError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                      {analysisError}
                    </div>
                  )}

                  {isAnalyzing && <div className="text-sm text-slate-500">Analyzing audit file…</div>}

                  {auditAnalyze && (
                    <Card className="border-slate-200/70 dark:border-white/10">
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{auditAnalyze.fileName}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            {auditAnalyze.rowCount} rows • {auditAnalyze.minDate} → {auditAnalyze.maxDate}
                          </div>
                        </div>

                        {auditAnalyze.invoiceSummaries.length > 1 && (
                          <div className="grid gap-2 sm:grid-cols-2 items-end">
                            <div>
                              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Invoice</div>
                              <Select value={selectedInvoice} onValueChange={(v) => void handleInvoiceSelected(v)}>
                                <SelectTrigger className="bg-white dark:bg-slate-900">
                                  <SelectValue placeholder="Select invoice…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {auditAnalyze.invoiceSummaries.map((inv) => (
                                    <SelectItem key={inv.invoice} value={inv.invoice}>
                                      {inv.invoice} ({inv.skuCount} SKUs)
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              Choose the invoice group to process.
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {isPreviewLoading && <div className="text-sm text-slate-500">Computing preview…</div>}

                  {preview && (
                    <Card className="border-slate-200/70 dark:border-white/10">
                      <CardContent className="p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-semibold text-slate-900 dark:text-white">
                              Preview • Invoice {preview.invoiceId}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              Hash {preview.processingHash.slice(0, 10)} • {preview.minDate} → {preview.maxDate}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={preview.blocks.length === 0 ? 'success' : 'destructive'}>
                              {preview.blocks.length === 0 ? 'Ready' : 'Blocked'}
                            </Badge>
                            {preview.blocks.length === 0 && (
                              <Button onClick={() => void handlePost()} disabled={isPosting}>
                                {isPosting ? 'Posting…' : 'Post to QBO'}
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <Card className="border-slate-200/70 dark:border-white/10">
                            <CardContent className="p-3">
                              <div className="text-xs text-slate-500 dark:text-slate-400">Sales</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{preview.sales.length}</div>
                            </CardContent>
                          </Card>
                          <Card className="border-slate-200/70 dark:border-white/10">
                            <CardContent className="p-3">
                              <div className="text-xs text-slate-500 dark:text-slate-400">Returns</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{preview.returns.length}</div>
                            </CardContent>
                          </Card>
                          <Card className="border-slate-200/70 dark:border-white/10">
                            <CardContent className="p-3">
                              <div className="text-xs text-slate-500 dark:text-slate-400">JE Lines</div>
                              <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                                {preview.cogsJournalEntry.lines.length + preview.pnlJournalEntry.lines.length}
                              </div>
                            </CardContent>
                          </Card>
                        </div>

                        {preview.blocks.length > 0 && (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20">
                            <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Blocked</div>
                            <ul className="text-sm text-red-700 dark:text-red-200 space-y-1">
                              {preview.blocks.map((b, idx) => (
                                <li key={idx}>
                                  <span className="font-mono">{b.code}</span>: {b.message}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
