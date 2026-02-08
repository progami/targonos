'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ExternalLink } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { BackButton } from '@/components/back-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { Timeline } from '@/components/ui/timeline';
import { cn } from '@/lib/utils';

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
    plutusStatus: 'Pending' | 'Processed' | 'RolledBack';
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
  rollback: null | {
    id: string;
    marketplace: string;
    invoiceId: string;
    processingHash: string;
    sourceFilename: string;
    processedAt: string;
    rolledBackAt: string;
    qboCogsJournalEntryId: string;
    qboPnlReclassJournalEntryId: string;
    orderSalesCount: number;
    orderReturnsCount: number;
  };
};

type InvoiceSummary = {
  invoiceId: string;
  rowCount: number;
  minDate: string;
  maxDate: string;
};

type AuditDataResponse = {
  uploads: Array<{ id: string; filename: string; rowCount: number; invoiceCount: number; uploadedAt: string }>;
  invoiceIds: string[];
  invoices: InvoiceSummary[];
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

function StatusPill({ status }: { status: SettlementDetailResponse['settlement']['lmbStatus'] }) {
  if (status === 'Posted') return <Badge variant="success">LMB Posted</Badge>;
  return <Badge variant="secondary">LMB {status}</Badge>;
}

function PlutusPill({ status }: { status: SettlementDetailResponse['settlement']['plutusStatus'] }) {
  if (status === 'Processed') return <Badge variant="success">Plutus Processed</Badge>;
  if (status === 'RolledBack') return <Badge variant="secondary">Plutus Rolled Back</Badge>;
  return <Badge variant="destructive">Plutus Pending</Badge>;
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

async function fetchAuditData(): Promise<AuditDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  return res.json();
}

async function fetchPreview(settlementId: string, invoiceId: string): Promise<SettlementProcessingPreview> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
  });
  return res.json();
}

async function postSettlement(settlementId: string, invoiceId: string) {
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false as const, data };
  }
  return { ok: true as const, data };
}

/**
 * Try to extract a date range from an invoice ID string.
 * Common formats: "INV-2025-01-01-2025-01-14", "2025-01-01_2025-01-14", etc.
 * We look for YYYY-MM-DD patterns in the string.
 */
function extractDatesFromInvoiceId(invoiceId: string): { start: string; end: string } | null {
  const datePattern = /(\d{4}-\d{2}-\d{2})/g;
  const matches = invoiceId.match(datePattern);
  if (!matches || matches.length < 2) return null;
  return { start: matches[0], end: matches[matches.length - 1] };
}

/**
 * Check if two date ranges overlap (all strings in YYYY-MM-DD format).
 */
function dateRangesOverlap(
  aStart: string, aEnd: string,
  bStart: string, bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
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
  return (
    <span className={cn(
      'font-medium tabular-nums',
      signed < 0 ? 'text-red-600 dark:text-red-400' : '',
    )}>
      {formatMoney(signed, currency)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Process Settlement Dialog
// ---------------------------------------------------------------------------

function ProcessSettlementDialog({
  settlementId,
  periodStart,
  periodEnd,
  onProcessed,
}: {
  settlementId: string;
  periodStart: string | null;
  periodEnd: string | null;
  onProcessed: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [preview, setPreview] = useState<SettlementProcessingPreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: auditData, isLoading: isLoadingAuditData } = useQuery({
    queryKey: ['plutus-audit-data'],
    queryFn: fetchAuditData,
    enabled: open,
    staleTime: 60 * 1000,
  });

  const invoices = useMemo(() => auditData?.invoices ?? [], [auditData?.invoices]);

  // Compute recommendation for each invoice
  const invoicesWithMeta = useMemo(() => {
    return invoices.map((inv) => {
      const invoiceDates = extractDatesFromInvoiceId(inv.invoiceId);
      let recommended = false;
      let dateLabel: string | null = null;

      if (invoiceDates) {
        dateLabel = `${invoiceDates.start} to ${invoiceDates.end}`;
        if (periodStart !== null && periodEnd !== null) {
          recommended = dateRangesOverlap(periodStart, periodEnd, invoiceDates.start, invoiceDates.end);
        }
      }

      // Also check overlap using the actual audit data date range
      if (!recommended && periodStart !== null && periodEnd !== null) {
        recommended = dateRangesOverlap(periodStart, periodEnd, inv.minDate, inv.maxDate);
      }

      return { ...inv, recommended, dateLabel };
    });
  }, [invoices, periodStart, periodEnd]);

  // Auto-select recommended invoice when dialog opens and no invoice is selected
  useEffect(() => {
    if (selectedInvoice !== '') return;
    const rec = invoicesWithMeta.find((i) => i.recommended);
    if (rec) {
      setSelectedInvoice(rec.invoiceId);
    }
  }, [invoicesWithMeta, selectedInvoice]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      // Reset state when closing
      setSelectedInvoice('');
      setPreview(null);
      setError(null);
    }
  }

  async function handlePreview() {
    if (!selectedInvoice) return;

    setPreview(null);
    setError(null);
    setIsPreviewLoading(true);

    try {
      const result = await fetchPreview(settlementId, selectedInvoice);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handlePost() {
    if (!selectedInvoice) return;

    setIsPosting(true);
    setError(null);

    try {
      const result = await postSettlement(settlementId, selectedInvoice);
      if (!result.ok) {
        setPreview(result.data);
        return;
      }

      toast.success('Settlement processed and posted to QBO');
      setOpen(false);
      setPreview(null);
      setSelectedInvoice('');
      onProcessed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error('Failed to post settlement');
    } finally {
      setIsPosting(false);
    }
  }

  const selectedMeta = invoicesWithMeta.find((i) => i.invoiceId === selectedInvoice);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">Process Settlement</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Process Settlement</DialogTitle>
          <DialogDescription>
            Match an audit data invoice to this settlement, preview the journal entries, then post to QuickBooks.
          </DialogDescription>
        </DialogHeader>

        {isLoadingAuditData && (
          <div className="space-y-3">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-5 w-48" />
          </div>
        )}

        {!isLoadingAuditData && invoices.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-sm font-medium text-slate-900 dark:text-white">No audit data available</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Upload the LMB Audit Data CSV on the Audit Data page first.
              </div>
            </div>
          </div>
        )}

        {!isLoadingAuditData && invoices.length > 0 && (
          <div className="space-y-4">
            {/* Invoice selector */}
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Invoice</div>
              <Select
                value={selectedInvoice}
                onValueChange={(v) => {
                  setSelectedInvoice(v);
                  setPreview(null);
                  setError(null);
                }}
              >
                <SelectTrigger className="bg-white dark:bg-slate-900">
                  <SelectValue placeholder="Select an invoice..." />
                </SelectTrigger>
                <SelectContent>
                  {invoicesWithMeta.map((inv) => (
                    <SelectItem key={inv.invoiceId} value={inv.invoiceId}>
                      <div className="flex items-center gap-2">
                        <span>{inv.invoiceId}</span>
                        {inv.recommended && (
                          <span className="inline-flex items-center rounded-md bg-brand-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-teal-700 dark:bg-brand-cyan/15 dark:text-brand-cyan">
                            Recommended
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Invoice metadata */}
              {selectedMeta && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span>{selectedMeta.rowCount.toLocaleString()} row{selectedMeta.rowCount === 1 ? '' : 's'}</span>
                  <span className="text-slate-300 dark:text-white/20">|</span>
                  <span>Data: {selectedMeta.minDate} to {selectedMeta.maxDate}</span>
                  {selectedMeta.dateLabel && (
                    <>
                      <span className="text-slate-300 dark:text-white/20">|</span>
                      <span>ID dates: {selectedMeta.dateLabel}</span>
                    </>
                  )}
                  {selectedMeta.recommended && (
                    <Badge variant="default" className="text-[10px]">Recommended</Badge>
                  )}
                </div>
              )}

              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {invoices.length} invoice{invoices.length === 1 ? '' : 's'} from uploaded audit data
              </div>
            </div>

            {/* Preview button */}
            <Button
              onClick={() => void handlePreview()}
              disabled={!selectedInvoice || isPreviewLoading}
              variant="outline"
            >
              {isPreviewLoading ? 'Computing preview...' : 'Preview'}
            </Button>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            {/* Preview results */}
            {preview && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      Preview &middot; Invoice {preview.invoiceId}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      Hash {preview.processingHash.slice(0, 10)} &middot; {preview.minDate} &rarr; {preview.maxDate}
                    </div>
                  </div>
                  <Badge variant={preview.blocks.length === 0 ? 'success' : 'destructive'}>
                    {preview.blocks.length === 0 ? 'Ready' : 'Blocked'}
                  </Badge>
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

                {preview.blocks.length === 0 && (
                  <Button onClick={() => void handlePost()} disabled={isPosting}>
                    {isPosting ? 'Posting...' : 'Post to QBO'}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function SettlementDetailPage() {
  const routeParams = useParams();
  const rawId = routeParams.id;
  if (typeof rawId !== 'string') {
    throw new Error('Settlement id param is required');
  }
  const settlementId = rawId;

  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = searchParams.get('tab');
  const [tab, setTab] = useState(initialTab === 'history' ? 'history' : 'sales');

  const [actionError, setActionError] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-settlement', settlementId],
    queryFn: () => fetchSettlement(settlementId),
    enabled: connection?.connected === true,
    staleTime: 5 * 60 * 1000,
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

  async function handleRollback() {
    setActionError(null);

    let latest: SettlementDetailResponse;
    try {
      latest = await queryClient.fetchQuery({
        queryKey: ['plutus-settlement', settlementId],
        queryFn: () => fetchSettlement(settlementId),
      });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
      return;
    }

    const processing = latest.processing;
    if (!processing) return;

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
      const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'rollback' }),
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error);
      }

      await queryClient.invalidateQueries({ queryKey: ['plutus-settlement', settlementId] });
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      setTab('sales');
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsRollingBack(false);
    }
  }

  async function handleProcessed() {
    await queryClient.invalidateQueries({ queryKey: ['plutus-settlement', settlementId] });
    await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
  }

  return (
    <main className="flex-1 page-enter">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between gap-3">
          <BackButton />
        </div>

        <PageHeader
          className="mt-4"
          title="Settlement Details"
          kicker={settlement ? settlement.marketplace.label : 'Link My Books'}
          description={
            settlement ? (
              <div className="space-y-1">
                <div className="font-mono text-sm text-slate-700 dark:text-slate-300">{settlement.docNumber}</div>
                <div className="text-sm text-slate-700 dark:text-slate-200">
                  {formatPeriod(settlement.periodStart, settlement.periodEnd)} &middot; Posted{' '}
                  {new Date(`${settlement.postedDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {settlement.settlementTotal === null ? '—' : formatMoney(settlement.settlementTotal, settlement.marketplace.currency)}
                </div>
              </div>
            ) : (
              'Loads the QBO journal entry for this settlement and shows Plutus processing status.'
            )
          }
          actions={
            settlement ? (
              <div className="flex flex-col items-start gap-3 sm:items-end">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`https://app.qbo.intuit.com/app/journal?txnId=${settlementId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 group"
                  >
                    <StatusPill status={settlement.lmbStatus} />
                    <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-slate-600 transition-colors" />
                  </a>
                  <PlutusPill status={settlement.plutusStatus} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {settlement.plutusStatus === 'Pending' && (
                    <ProcessSettlementDialog
                      settlementId={settlementId}
                      periodStart={settlement.periodStart}
                      periodEnd={settlement.periodEnd}
                      onProcessed={() => void handleProcessed()}
                    />
                  )}
                  {data?.processing && (
                    <Button variant="outline" size="sm" onClick={() => void handleRollback()} disabled={isRollingBack}>
                      {isRollingBack ? 'Rolling back...' : 'Rollback'}
                    </Button>
                  )}
                </div>
              </div>
            ) : null
          }
        />

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
                </TabsList>
              </div>

              <TabsContent value="sales" className="p-4">
                {isLoading && (
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                )}
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
                  <div>
                    {!data?.processing && !data?.rollback && (
                      <div className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
                        Plutus has not processed this settlement yet.
                      </div>
                    )}

                    {(data?.processing || data?.rollback) && (
                      <Timeline
                        items={[
                          ...(data?.rollback ? [{
                            title: 'Rolled back' as const,
                            variant: 'warning' as const,
                            timestamp: new Date(data.rollback.rolledBackAt).toLocaleString('en-US'),
                            description: (
                              <div className="mt-1 space-y-1 text-xs">
                                <div>Invoice: <span className="font-mono">{data.rollback.invoiceId}</span></div>
                                <div>COGS JE: <span className="font-mono">{data.rollback.qboCogsJournalEntryId}</span></div>
                                <div>P&amp;L Reclass JE: <span className="font-mono">{data.rollback.qboPnlReclassJournalEntryId}</span></div>
                              </div>
                            ),
                          }] : []),
                          ...(data?.processing ? [{
                            title: `Processed — ${data.processing.orderSalesCount} sales, ${data.processing.orderReturnsCount} returns` as const,
                            variant: 'success' as const,
                            timestamp: new Date(data.processing.uploadedAt).toLocaleString('en-US'),
                            description: (
                              <div className="mt-1 space-y-1 text-xs">
                                <div>Invoice: <span className="font-mono">{data.processing.invoiceId}</span></div>
                                <div>Hash: <span className="font-mono">{data.processing.processingHash}</span></div>
                                <div>Source: {data.processing.sourceFilename}</div>
                                <div>COGS JE: <span className="font-mono">{data.processing.qboCogsJournalEntryId}</span></div>
                                <div>P&amp;L Reclass JE: <span className="font-mono">{data.processing.qboPnlReclassJournalEntryId}</span></div>
                              </div>
                            ),
                          }] : []),
                        ]}
                      />
                    )}
                  </div>
                )}
              </TabsContent>

            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
