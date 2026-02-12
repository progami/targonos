'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, ExternalLink } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { Timeline } from '@/components/ui/timeline';
import { cn } from '@/lib/utils';
import { allocateByWeight } from '@/lib/inventory/money';
import { selectAuditInvoiceForSettlement, type MarketplaceId } from '@/lib/plutus/audit-invoice-matching';

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
  marketplace: MarketplaceId;
  rowCount: number;
  minDate: string;
  maxDate: string;
  markets: string[];
};

type AuditDataResponse = {
  uploads: Array<{ id: string; filename: string; rowCount: number; invoiceCount: number; uploadedAt: string }>;
  invoiceIds: string[];
  invoices: InvoiceSummary[];
};

type JeLinePreview = {
  accountId: string;
  accountName: string;
  postingType: 'Debit' | 'Credit';
  amountCents: number;
  description: string;
};

type JePreview = {
  txnDate: string;
  docNumber: string;
  privateNote: string;
  lines: JeLinePreview[];
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
  cogsByBrandComponentCents: Record<string, Record<string, number>>;
  pnlByBucketBrandCents: Record<string, Record<string, number>>;
  cogsJournalEntry: JePreview;
  pnlJournalEntry: JePreview;
};

type PreviewBlock = SettlementProcessingPreview['blocks'][number];

type ConnectionStatus = { connected: boolean; error?: string };

type AdsAllocationLine = { sku: string; weight: number; allocatedCents: number };

type AdsSkuProfitabilityLine = {
  sku: string;
  soldUnits: number;
  returnedUnits: number;
  netUnits: number;
  principalCents: number;
  cogsCents: number;
  adsAllocatedCents: number;
  contributionBeforeAdsCents: number;
  contributionAfterAdsCents: number;
};

type AdsSkuProfitabilityTotals = {
  soldUnits: number;
  returnedUnits: number;
  netUnits: number;
  principalCents: number;
  cogsCents: number;
  adsAllocatedCents: number;
  contributionBeforeAdsCents: number;
  contributionAfterAdsCents: number;
};

type AdsAllocationResponse = {
  kind: 'saved' | 'computed';
  marketplace: 'amazon.com' | 'amazon.co.uk';
  invoiceId: string;
  invoiceStartDate: string;
  invoiceEndDate: string;
  totalAdsCents: number;
  weightSource: string;
  weightUnit: string;
  adsDataUpload: null | { id: string; filename: string; startDate: string; endDate: string; uploadedAt: string };
  lines: AdsAllocationLine[];
  skuProfitability: {
    lines: AdsSkuProfitabilityLine[];
    totals: AdsSkuProfitabilityTotals;
  };
};

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

function formatBlockDetails(details: Record<string, string | number> | undefined): string | null {
  if (!details) return null;
  const entries = Object.entries(details).filter(([key]) => key !== 'error');
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ');
}

function isIdempotencyBlock(block: PreviewBlock): boolean {
  if (block.code === 'ALREADY_PROCESSED') return true;
  if (block.code === 'ORDER_ALREADY_PROCESSED') return true;
  return false;
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

async function fetchPreview(
  settlementId: string,
  invoiceId: string,
  marketplace: MarketplaceId,
): Promise<SettlementProcessingPreview> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoiceId, marketplace }),
  });
  return res.json();
}

async function postSettlement(settlementId: string, invoiceId: string, marketplace: MarketplaceId) {
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoiceId, marketplace }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false as const, data };
  }
  return { ok: true as const, data };
}

async function fetchAdsAllocation(settlementId: string): Promise<AdsAllocationResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/ads-allocation`);
  const data = await res.json();
  if (!res.ok) {
    const message = typeof data.details === 'string' ? data.details : data.error ?? 'Failed to load settlement advertising allocation';
    throw new Error(message);
  }
  return data as AdsAllocationResponse;
}

async function saveAdsAllocation(input: { settlementId: string; lines: Array<{ sku: string; weight: number }> }) {
  const res = await fetch(`${basePath}/api/plutus/settlements/${input.settlementId}/ads-allocation`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ lines: input.lines }),
  });
  const data = await res.json();
  if (!res.ok) {
    const message = typeof data.details === 'string' ? data.details : data.error ?? 'Failed to save settlement advertising allocation';
    throw new Error(message);
  }
  return data as { success: true };
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
  marketplaceId,
  onProcessed,
}: {
  settlementId: string;
  periodStart: string | null;
  periodEnd: string | null;
  marketplaceId: MarketplaceId;
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
  const marketplaceInvoices = useMemo(
    () => invoices.filter((inv) => inv.marketplace === marketplaceId),
    [invoices, marketplaceId],
  );

  const invoiceRecommendation = useMemo(() => {
    if (periodStart === null || periodEnd === null) {
      return { kind: 'missing_period' } as const;
    }

    return selectAuditInvoiceForSettlement({
      settlementMarketplace: marketplaceId,
      settlementPeriodStart: periodStart,
      settlementPeriodEnd: periodEnd,
      invoices,
    });
  }, [invoices, marketplaceId, periodEnd, periodStart]);

  // Compute meta for each invoice
  const invoicesWithMeta = useMemo(() => {
    return marketplaceInvoices.map((inv) => {
      const invoiceDates = extractDatesFromInvoiceId(inv.invoiceId);
      let dateLabel: string | null = null;

      if (invoiceDates) {
        dateLabel = `${invoiceDates.start} to ${invoiceDates.end}`;
      }

      const recommended = invoiceRecommendation.kind === 'match' && inv.invoiceId === invoiceRecommendation.invoiceId;
      const candidate =
        invoiceRecommendation.kind === 'ambiguous' && invoiceRecommendation.candidateInvoiceIds.includes(inv.invoiceId);

      return { ...inv, recommended, candidate, dateLabel };
    });
  }, [invoiceRecommendation, marketplaceInvoices]);

  // Auto-select recommended invoice when dialog opens and no invoice is selected
  useEffect(() => {
    if (selectedInvoice !== '') return;
    if (invoiceRecommendation.kind !== 'match') return;
    setSelectedInvoice(invoiceRecommendation.invoiceId);
  }, [invoiceRecommendation, selectedInvoice]);

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
      const result = await fetchPreview(settlementId, selectedInvoice, marketplaceId);
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
      const result = await postSettlement(settlementId, selectedInvoice, marketplaceId);
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

        {!isLoadingAuditData && invoices.length > 0 && marketplaceInvoices.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="text-sm font-medium text-slate-900 dark:text-white">No invoices for this marketplace</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                Audit data exists, but none of the uploaded invoices match {marketplaceId}. Upload the correct Audit Data file.
              </div>
            </div>
          </div>
        )}

        {!isLoadingAuditData && marketplaceInvoices.length > 0 && (
          <div className="space-y-4">
            {invoiceRecommendation.kind === 'ambiguous' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                Multiple audit invoices match this settlement period. Select the correct invoice manually.
              </div>
            )}
            {invoiceRecommendation.kind === 'none' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
                No audit invoice matches this settlement period. Upload the correct Audit Data file or choose an invoice manually.
              </div>
            )}

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
	                        {inv.candidate && !inv.recommended && (
	                          <span className="inline-flex items-center rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-200">
	                            Candidate
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
	                {marketplaceInvoices.length} invoice{marketplaceInvoices.length === 1 ? '' : 's'} for this marketplace
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
	                          {b.details && 'error' in b.details && (
	                            <div className="text-xs opacity-75 mt-0.5 font-mono">{String(b.details.error)}</div>
	                          )}
	                          {formatBlockDetails(b.details) && (
	                            <div className="text-xs opacity-75 mt-0.5 font-mono">{formatBlockDetails(b.details)}</div>
	                          )}
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
  const [tab, setTab] = useState(
    initialTab === 'history' ? 'history' : initialTab === 'ads-allocation' ? 'ads-allocation' : 'sales',
  );

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

  // Eager-load preview for Pending settlements
  const { data: auditData, isLoading: isLoadingAudit } = useQuery({
    queryKey: ['plutus-audit-data'],
    queryFn: fetchAuditData,
    enabled: settlement?.plutusStatus === 'Pending',
    staleTime: 60 * 1000,
  });

  const recommendedInvoice = useMemo(() => {
    if (!auditData?.invoices || !settlement) return null;
    const match = selectAuditInvoiceForSettlement({
      settlementMarketplace: settlement.marketplace.id,
      settlementPeriodStart: settlement.periodStart,
      settlementPeriodEnd: settlement.periodEnd,
      invoices: auditData.invoices,
    });

    return match.kind === 'match' ? match.invoiceId : null;
  }, [auditData?.invoices, settlement]);

  const previewInvoiceId = useMemo(() => {
    if (!settlement) return null;
    if (settlement.plutusStatus === 'Processed' && data?.processing?.invoiceId) {
      return data.processing.invoiceId;
    }
    return recommendedInvoice;
  }, [data?.processing?.invoiceId, recommendedInvoice, settlement]);

  const previewEnabled = !!previewInvoiceId && (settlement?.plutusStatus === 'Pending' || settlement?.plutusStatus === 'Processed');

  const { data: previewData, isLoading: isPreviewLoading, error: previewError } = useQuery({
    queryKey: ['plutus-settlement-preview', settlementId, previewInvoiceId, settlement?.plutusStatus],
    queryFn: () => fetchPreview(settlementId, previewInvoiceId!, settlement!.marketplace.id),
    enabled: previewEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const visiblePreviewBlocks = useMemo(() => {
    if (!previewData) return [] as PreviewBlock[];
    if (settlement?.plutusStatus !== 'Processed') return previewData.blocks;
    return previewData.blocks.filter((block) => !isIdempotencyBlock(block));
  }, [previewData, settlement?.plutusStatus]);

  const isProcessedPreview = settlement?.plutusStatus === 'Processed';
  const previewIssueCount = visiblePreviewBlocks.length;

  const adsAllocationEnabled = settlement?.plutusStatus === 'Processed' && data?.processing !== null;

  const { data: adsAllocation, isLoading: isAdsAllocationLoading, error: adsAllocationError } = useQuery({
    queryKey: ['plutus-settlement-ads-allocation', settlementId],
    queryFn: () => fetchAdsAllocation(settlementId),
    enabled: adsAllocationEnabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const showAdsAllocationTab = useMemo(() => {
    if (!adsAllocationEnabled) return false;
    if (isAdsAllocationLoading) return true;
    if (adsAllocationError) return true;
    if (!adsAllocation) return false;
    return adsAllocation.totalAdsCents !== 0;
  }, [adsAllocation, adsAllocationEnabled, adsAllocationError, isAdsAllocationLoading]);

  useEffect(() => {
    if (!settlement) return;
    if (tab !== 'ads-allocation') return;
    if (showAdsAllocationTab) return;
    setTab('sales');
  }, [settlement, showAdsAllocationTab, tab]);

  type AdsEditLine = { sku: string; weightInput: string };
  const [adsEditLines, setAdsEditLines] = useState<AdsEditLine[]>([]);
  const [adsDirty, setAdsDirty] = useState(false);

  useEffect(() => {
    setAdsDirty(false);
    setAdsEditLines([]);
  }, [settlementId]);

  useEffect(() => {
    if (!adsAllocation) return;
    if (adsDirty) return;

    setAdsEditLines(
      adsAllocation.lines.map((l) => ({
        sku: l.sku,
        weightInput: adsAllocation.weightUnit === 'cents' ? (l.weight / 100).toFixed(2) : String(l.weight),
      })),
    );
  }, [adsAllocation, adsDirty]);

  function parseMoneyInputToCents(value: string): number | null {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const amount = Number(trimmed);
    if (!Number.isFinite(amount)) return null;
    const cents = Math.round(amount * 100);
    if (!Number.isInteger(cents) || cents <= 0) return null;
    return cents;
  }

  const adsAllocationPreview = useMemo(() => {
    if (!adsAllocation || adsAllocation.totalAdsCents === 0) {
      return { ok: false as const, lines: [] as Array<{ sku: string; weightInput: string; allocatedCents: number | null }>, error: null as string | null };
    }

    if (adsAllocation.weightUnit !== 'cents') {
      return { ok: false as const, lines: [], error: `Unsupported weight unit: ${adsAllocation.weightUnit}` };
    }

    const parsed = adsEditLines.map((l) => {
      const weightCents = parseMoneyInputToCents(l.weightInput);
      return { sku: l.sku, weightInput: l.weightInput, weightCents };
    });

    if (parsed.length === 0) {
      return { ok: false as const, lines: [], error: 'No weights available for allocation.' };
    }

    const invalid = parsed.find((l) => l.weightCents === null);
    if (invalid) {
      return {
        ok: false as const,
        lines: parsed.map((l) => ({ sku: l.sku, weightInput: l.weightInput, allocatedCents: null })),
        error: 'All weights must be positive dollar amounts.',
      };
    }

    const weightsSorted = [...parsed].sort((a, b) => a.sku.localeCompare(b.sku));
    const sign = adsAllocation.totalAdsCents < 0 ? -1 : 1;
    const absTotal = Math.abs(adsAllocation.totalAdsCents);

    const allocatedAbs = allocateByWeight(
      absTotal,
      weightsSorted.map((w) => ({ key: w.sku, weight: w.weightCents! })),
    );

    const withAlloc = parsed.map((l) => {
      const centsAbs = allocatedAbs[l.sku];
      if (centsAbs === undefined) {
        return { sku: l.sku, weightInput: l.weightInput, allocatedCents: null };
      }
      return { sku: l.sku, weightInput: l.weightInput, allocatedCents: sign * centsAbs };
    });

    let sum = 0;
    for (const line of withAlloc) {
      if (line.allocatedCents === null) {
        return { ok: false as const, lines: withAlloc, error: 'Allocation failed. Fix invalid rows.' };
      }
      sum += line.allocatedCents;
    }

    if (sum !== adsAllocation.totalAdsCents) {
      return { ok: false as const, lines: withAlloc, error: `Allocated total mismatch (${sum} vs ${adsAllocation.totalAdsCents}).` };
    }

    return { ok: true as const, lines: withAlloc, error: null };
  }, [adsAllocation, adsEditLines]);

  const adsSkuProfitabilityPreview = useMemo(() => {
    if (!adsAllocation) {
      return null;
    }

    const baseBySku = new Map<string, AdsSkuProfitabilityLine>();
    for (const line of adsAllocation.skuProfitability.lines) {
      baseBySku.set(line.sku, line);
    }

    const adsBySku = new Map<string, number>();
    if (adsAllocationPreview.ok) {
      for (const line of adsAllocationPreview.lines) {
        if (line.allocatedCents === null) {
          continue;
        }
        adsBySku.set(line.sku, line.allocatedCents);
      }
    } else {
      for (const line of adsAllocation.skuProfitability.lines) {
        adsBySku.set(line.sku, line.adsAllocatedCents);
      }
    }

    const allSkus = new Set<string>();
    for (const sku of baseBySku.keys()) {
      allSkus.add(sku);
    }
    for (const sku of adsBySku.keys()) {
      allSkus.add(sku);
    }

    const lines: AdsSkuProfitabilityLine[] = [];
    for (const sku of allSkus.values()) {
      const base = baseBySku.get(sku);
      const adsAllocated = adsBySku.get(sku);

      const soldUnits = base ? base.soldUnits : 0;
      const returnedUnits = base ? base.returnedUnits : 0;
      const netUnits = base ? base.netUnits : soldUnits - returnedUnits;
      const principalCents = base ? base.principalCents : 0;
      const cogsCents = base ? base.cogsCents : 0;
      const contributionBeforeAdsCents = base ? base.contributionBeforeAdsCents : principalCents - cogsCents;
      const adsAllocatedCents = adsAllocated !== undefined ? adsAllocated : 0;
      const contributionAfterAdsCents = contributionBeforeAdsCents - adsAllocatedCents;

      lines.push({
        sku,
        soldUnits,
        returnedUnits,
        netUnits,
        principalCents,
        cogsCents,
        adsAllocatedCents,
        contributionBeforeAdsCents,
        contributionAfterAdsCents,
      });
    }

    lines.sort((a, b) => a.sku.localeCompare(b.sku));

    const totals: AdsSkuProfitabilityTotals = {
      soldUnits: 0,
      returnedUnits: 0,
      netUnits: 0,
      principalCents: 0,
      cogsCents: 0,
      adsAllocatedCents: 0,
      contributionBeforeAdsCents: 0,
      contributionAfterAdsCents: 0,
    };

    for (const line of lines) {
      totals.soldUnits += line.soldUnits;
      totals.returnedUnits += line.returnedUnits;
      totals.netUnits += line.netUnits;
      totals.principalCents += line.principalCents;
      totals.cogsCents += line.cogsCents;
      totals.adsAllocatedCents += line.adsAllocatedCents;
      totals.contributionBeforeAdsCents += line.contributionBeforeAdsCents;
      totals.contributionAfterAdsCents += line.contributionAfterAdsCents;
    }

    return { lines, totals };
  }, [adsAllocation, adsAllocationPreview]);

  const saveAdsAllocationMutation = useMutation({
    mutationFn: async () => {
      if (!adsAllocation || adsAllocation.totalAdsCents === 0) {
        throw new Error('No advertising cost found for this invoice');
      }
      if (adsAllocation.weightUnit !== 'cents') {
        throw new Error(`Unsupported weight unit: ${adsAllocation.weightUnit}`);
      }

      const lines = adsEditLines
        .map((l) => {
          const weight = parseMoneyInputToCents(l.weightInput);
          if (weight === null) {
            throw new Error(`Invalid weight for ${l.sku}`);
          }
          return { sku: l.sku, weight };
        })
        .sort((a, b) => a.sku.localeCompare(b.sku));

      return saveAdsAllocation({ settlementId, lines });
    },
    onSuccess: async () => {
      toast.success('Saved advertising allocation');
      setAdsDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlement-ads-allocation', settlementId] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlement Details" error={connection.error} />;
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
                      marketplaceId={settlement.marketplace.id}
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
                  {showAdsAllocationTab && (
                    <TabsTrigger value="ads-allocation">Advertising Allocation</TabsTrigger>
                  )}
                  {(settlement?.plutusStatus === 'Pending' || settlement?.plutusStatus === 'Processed') && (
                    <TabsTrigger value="plutus-preview">Plutus Preview</TabsTrigger>
                  )}
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

              {showAdsAllocationTab && data?.processing && settlement && (
                <TabsContent value="ads-allocation" className="p-4">
                  {isAdsAllocationLoading && (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-64" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  )}

                  {!isAdsAllocationLoading && adsAllocationError && (
                    <div className="text-sm text-danger-700 dark:text-danger-400">
                      {adsAllocationError instanceof Error ? adsAllocationError.message : String(adsAllocationError)}
                      <div className="mt-2">
                        <Link href="/ads-data" className="text-xs underline text-slate-600 dark:text-slate-300">
                          Upload Ads Data
                        </Link>
                      </div>
                    </div>
                  )}

                  {!isAdsAllocationLoading && !adsAllocationError && adsAllocation && (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            Advertising cost allocation (SKU)
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Invoice <span className="font-mono">{adsAllocation.invoiceId}</span> &middot; {adsAllocation.invoiceStartDate} &rarr; {adsAllocation.invoiceEndDate}
                          </div>
                          {adsAllocation.adsDataUpload && (
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Source: {adsAllocation.adsDataUpload.filename} ({adsAllocation.adsDataUpload.startDate}–{adsAllocation.adsDataUpload.endDate})
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {adsAllocation.totalAdsCents !== 0 && (
                            <Button
                              size="sm"
                              onClick={() => saveAdsAllocationMutation.mutate()}
                              disabled={!adsAllocationPreview.ok || !adsAllocation.adsDataUpload || saveAdsAllocationMutation.isPending}
                            >
                              {saveAdsAllocationMutation.isPending ? 'Saving...' : 'Save'}
                            </Button>
                          )}
                        </div>
                      </div>

                      {adsAllocation.kind === 'saved' ? (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Saved allocation &middot; weights can be edited and re-saved
                        </div>
                      ) : (
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          Prefilled allocation &middot; review and save to lock it in
                        </div>
                      )}

                      {adsAllocation.totalAdsCents === 0 ? (
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          No Amazon Advertising Costs found for this invoice in the stored Audit Data. Nothing to allocate.
                        </div>
                      ) : (
                        <>
                          {adsAllocationPreview.error && (
                            <div className="text-sm text-danger-700 dark:text-danger-400">
                              {adsAllocationPreview.error}
                            </div>
                          )}

                          {!adsAllocation.adsDataUpload && (
                            <div className="text-sm text-danger-700 dark:text-danger-400">
                              Missing Ads Data upload for this invoice range.{' '}
                              <Link href="/ads-data" className="underline">
                                Upload Ads Data
                              </Link>
                              .
                            </div>
                          )}

                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>SKU</TableHead>
                                  <TableHead className="text-right">Weight (Spend)</TableHead>
                                  <TableHead className="text-right">Allocated</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {adsAllocationPreview.lines.map((line) => (
                                  <TableRow key={line.sku}>
                                    <TableCell className="font-mono text-sm text-slate-700 dark:text-slate-200">
                                      {line.sku}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex justify-end">
                                        <div className="w-[140px]">
                                          <Input
                                            type="number"
                                            step="0.01"
                                            value={line.weightInput}
                                            onChange={(event) => {
                                              const next = event.target.value;
                                              setAdsDirty(true);
                                              setAdsEditLines((prev) =>
                                                prev.map((p) => (p.sku === line.sku ? { ...p, weightInput: next } : p)),
                                              );
                                            }}
                                          />
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                                      {line.allocatedCents === null
                                        ? '—'
                                        : formatMoney(line.allocatedCents / 100, settlement.marketplace.currency)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow>
                                  <TableCell colSpan={2} className="text-right text-sm font-medium text-slate-900 dark:text-white">
                                    Total
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">
                                    {formatMoney(adsAllocation.totalAdsCents / 100, settlement.marketplace.currency)}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>

                          {adsSkuProfitabilityPreview && adsSkuProfitabilityPreview.lines.length > 0 && (
                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                SKU contribution after ads allocation
                              </div>
                              <div className="overflow-x-auto">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>SKU</TableHead>
                                      <TableHead className="text-right">Sold</TableHead>
                                      <TableHead className="text-right">Returns</TableHead>
                                      <TableHead className="text-right">Net Units</TableHead>
                                      <TableHead className="text-right">Principal</TableHead>
                                      <TableHead className="text-right">COGS</TableHead>
                                      <TableHead className="text-right">Ads</TableHead>
                                      <TableHead className="text-right">Contribution</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {adsSkuProfitabilityPreview.lines.map((line) => (
                                      <TableRow key={`profit-${line.sku}`}>
                                        <TableCell className="font-mono text-sm text-slate-700 dark:text-slate-200">
                                          {line.sku}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">{line.soldUnits}</TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">{line.returnedUnits}</TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">{line.netUnits}</TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">
                                          {formatMoney(line.principalCents / 100, settlement.marketplace.currency)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">
                                          {formatMoney(line.cogsCents / 100, settlement.marketplace.currency)}
                                        </TableCell>
                                        <TableCell className="text-right text-sm tabular-nums">
                                          {formatMoney(line.adsAllocatedCents / 100, settlement.marketplace.currency)}
                                        </TableCell>
                                        <TableCell
                                          className={cn(
                                            'text-right text-sm font-semibold tabular-nums',
                                            line.contributionAfterAdsCents < 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white',
                                          )}
                                        >
                                          {formatMoney(line.contributionAfterAdsCents / 100, settlement.marketplace.currency)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow>
                                      <TableCell className="text-sm font-semibold text-slate-900 dark:text-white">Total</TableCell>
                                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                                        {adsSkuProfitabilityPreview.totals.soldUnits}
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                                        {adsSkuProfitabilityPreview.totals.returnedUnits}
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                                        {adsSkuProfitabilityPreview.totals.netUnits}
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                                        {formatMoney(adsSkuProfitabilityPreview.totals.principalCents / 100, settlement.marketplace.currency)}
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                                        {formatMoney(adsSkuProfitabilityPreview.totals.cogsCents / 100, settlement.marketplace.currency)}
                                      </TableCell>
                                      <TableCell className="text-right text-sm font-semibold tabular-nums">
                                        {formatMoney(adsSkuProfitabilityPreview.totals.adsAllocatedCents / 100, settlement.marketplace.currency)}
                                      </TableCell>
                                      <TableCell
                                        className={cn(
                                          'text-right text-sm font-semibold tabular-nums',
                                          adsSkuProfitabilityPreview.totals.contributionAfterAdsCents < 0
                                            ? 'text-red-600 dark:text-red-400'
                                            : 'text-slate-900 dark:text-white',
                                        )}
                                      >
                                        {formatMoney(
                                          adsSkuProfitabilityPreview.totals.contributionAfterAdsCents / 100,
                                          settlement.marketplace.currency,
                                        )}
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          )}

                          <div className="flex items-center justify-between">
                            <Link href="/ads-data" className="text-xs underline text-slate-600 dark:text-slate-300">
                              Manage Ads Data
                            </Link>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              Weight source: {adsAllocation.weightSource}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </TabsContent>
              )}

              {(settlement?.plutusStatus === 'Pending' || settlement?.plutusStatus === 'Processed') && (
                <TabsContent value="plutus-preview" className="p-4">
                  {(isLoadingAudit || isPreviewLoading) && (
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-56" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                      <Skeleton className="h-10 w-full" />
                    </div>
                  )}

                  {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && !auditData?.invoices?.length && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-white/5">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">No audit data uploaded</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Upload the LMB Audit Data CSV on the{' '}
                          <Link href="/audit-data" className="text-brand-teal-600 hover:underline dark:text-brand-cyan">
                            Audit Data
                          </Link>{' '}
                          page first.
                        </div>
                      </div>
                    </div>
                  )}

                  {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && !isPreviewLoading && auditData?.invoices?.length && !recommendedInvoice && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-white/5">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">No matching invoice found</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Use the Process Settlement dialog to select an invoice manually.
                        </div>
                      </div>
                    </div>
                  )}

                  {previewError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                      {previewError instanceof Error ? previewError.message : String(previewError)}
                    </div>
                  )}

                  {previewData && previewData.cogsJournalEntry && (
                    <div className="space-y-6">
                      {settlement?.plutusStatus === 'Processed' && (
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-300">
                          Showing read-only Plutus posting preview for the processed invoice. Posted JE IDs are in History.
                        </div>
                      )}
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            Invoice {previewData.invoiceId}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {previewData.minDate} &rarr; {previewData.maxDate}
                          </div>
                        </div>
                        <Badge
                          variant={
                            isProcessedPreview
                              ? previewIssueCount === 0
                                ? 'success'
                                : 'secondary'
                              : previewIssueCount === 0
                                ? 'success'
                                : 'destructive'
                          }
                        >
                          {isProcessedPreview
                            ? previewIssueCount === 0
                              ? 'Processed'
                              : 'Processed (Needs Review)'
                            : previewIssueCount === 0
                              ? 'Ready to Process'
                              : 'Blocked'}
                        </Badge>
                      </div>

                      {/* Summary cards */}
                      <div className="grid gap-3 sm:grid-cols-4">
                        <Card className="border-slate-200/70 dark:border-white/10">
                          <CardContent className="p-3">
                            <div className="text-xs text-slate-500 dark:text-slate-400">Sales</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{previewData.sales.length}</div>
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200/70 dark:border-white/10">
                          <CardContent className="p-3">
                            <div className="text-xs text-slate-500 dark:text-slate-400">Returns</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{previewData.returns.length}</div>
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200/70 dark:border-white/10">
                          <CardContent className="p-3">
                            <div className="text-xs text-slate-500 dark:text-slate-400">COGS Lines</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{previewData.cogsJournalEntry.lines.length}</div>
                          </CardContent>
                        </Card>
                        <Card className="border-slate-200/70 dark:border-white/10">
                          <CardContent className="p-3">
                            <div className="text-xs text-slate-500 dark:text-slate-400">P&amp;L Lines</div>
                            <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{previewData.pnlJournalEntry.lines.length}</div>
                          </CardContent>
                        </Card>
                      </div>

                      {/* Blocks */}
                      {previewIssueCount > 0 && (
                        <div
                          className={cn(
                            'rounded-lg p-4',
                            isProcessedPreview
                              ? 'border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20'
                              : 'border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20',
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className={cn('h-4 w-4', isProcessedPreview ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')} />
                            <span className={cn('text-sm font-semibold', isProcessedPreview ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300')}>
                              {previewIssueCount} {isProcessedPreview ? 'review' : 'blocking'} issue{previewIssueCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <ul
                            className={cn(
                              'text-sm space-y-1',
                              isProcessedPreview ? 'text-amber-700 dark:text-amber-200' : 'text-red-700 dark:text-red-200',
                            )}
                          >
                            {visiblePreviewBlocks.map((b, idx) => (
                              <li key={idx}>
                                <span className="font-mono text-xs">{b.code}</span>: {b.message}
                                {b.details && 'error' in b.details && (
                                  <div className="text-xs opacity-75 mt-0.5 font-mono">{String(b.details.error)}</div>
                                )}
                                {formatBlockDetails(b.details) && (
                                  <div className="text-xs opacity-75 mt-0.5 font-mono">{formatBlockDetails(b.details)}</div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* COGS Journal Entry */}
                      {previewData.cogsJournalEntry.lines.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                            COGS Journal Entry
                            <span className="ml-2 font-mono text-xs font-normal text-slate-500 dark:text-slate-400">
                              {previewData.cogsJournalEntry.docNumber}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Account</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right">Debit</TableHead>
                                  <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {previewData.cogsJournalEntry.lines.map((line, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                                      {line.accountName}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                                      {line.description}
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                                      {line.postingType === 'Debit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                                      {line.postingType === 'Credit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}

                      {/* P&L Reclass Journal Entry */}
                      {previewData.pnlJournalEntry.lines.length > 0 && (
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                            P&amp;L Reclass Journal Entry
                            <span className="ml-2 font-mono text-xs font-normal text-slate-500 dark:text-slate-400">
                              {previewData.pnlJournalEntry.docNumber}
                            </span>
                          </div>
                          <div className="overflow-x-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Account</TableHead>
                                  <TableHead>Description</TableHead>
                                  <TableHead className="text-right">Debit</TableHead>
                                  <TableHead className="text-right">Credit</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {previewData.pnlJournalEntry.lines.map((line, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                                      {line.accountName}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-500 dark:text-slate-400">
                                      {line.description}
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                                      {line.postingType === 'Debit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                                      {line.postingType === 'Credit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              )}

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
