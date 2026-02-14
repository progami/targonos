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
import { cn } from '@/lib/utils';
import { allocateByWeight } from '@/lib/inventory/money';
import { selectAuditInvoiceForSettlement, type MarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { isBlockingProcessingCode } from '@/lib/plutus/settlement-types';

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
  accountFullyQualifiedName?: string;
  accountNumber?: string;
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
  sales: Array<{
    orderId: string;
    sku: string;
    date: string;
    quantity: number;
    principalCents: number;
    costByComponentCents: { manufacturing: number; freight: number; duty: number; mfgAccessories: number };
  }>;
  returns: Array<{
    orderId: string;
    sku: string;
    date: string;
    quantity: number;
    principalCents: number;
    costByComponentCents: { manufacturing: number; freight: number; duty: number; mfgAccessories: number };
  }>;
  cogsByBrandComponentCents: Record<string, Record<string, number>>;
  pnlByBucketBrandCents: Record<string, Record<string, number>>;
  cogsJournalEntry: JePreview;
  pnlJournalEntry: JePreview;
};

type PreviewBlock = SettlementProcessingPreview['blocks'][number];
type PreviewBlockGroup = { code: string; count: number };

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
  totalSource: 'AUDIT_DATA' | 'ADS_REPORT' | 'NONE' | 'SAVED';
  weightSource: string;
  weightUnit: string;
  adsDataUpload: null | { id: string; filename: string; startDate: string; endDate: string; uploadedAt: string };
  lines: AdsAllocationLine[];
  skuProfitability: null | {
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

  return `${startText} — ${endText}`;
}

function getQboJournalHref(journalEntryId: string): string {
  return `https://app.qbo.intuit.com/app/journal?txnId=${journalEntryId}`;
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

function getPreviewBlockMessage(block: PreviewBlock): string {
  if (block.code === 'PNL_ALLOCATION_ERROR') {
    return 'No sales units found in this invoice, so SKU-less fees cannot be auto-allocated.';
  }
  return block.message;
}

function showPreviewBlockErrorDetails(block: PreviewBlock): boolean {
  if (!(block.details && 'error' in block.details)) return false;
  if (block.code === 'PNL_ALLOCATION_ERROR') return false;
  return true;
}

function isIdempotencyBlock(block: PreviewBlock): boolean {
  if (block.code === 'ALREADY_PROCESSED') return true;
  if (block.code === 'ORDER_ALREADY_PROCESSED') return true;
  return false;
}

function isBlockingPreviewBlock(block: PreviewBlock): boolean {
  return isBlockingProcessingCode(block.code);
}

function groupPreviewBlocksByCode(blocks: PreviewBlock[]): PreviewBlockGroup[] {
  const grouped = new Map<string, number>();
  for (const block of blocks) {
    const current = grouped.get(block.code);
    if (current === undefined) {
      grouped.set(block.code, 1);
      continue;
    }
    grouped.set(block.code, current + 1);
  }

  return [...grouped.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      return a.code.localeCompare(b.code);
    });
}

function firstPreviewBlockByCode(blocks: PreviewBlock[]): Map<string, PreviewBlock> {
  const map = new Map<string, PreviewBlock>();
  for (const block of blocks) {
    if (map.has(block.code)) continue;
    map.set(block.code, block);
  }
  return map;
}

function getPreviewBlockSummary(group: PreviewBlockGroup, sample: PreviewBlock | undefined): string {
  if (group.code === 'ORDER_ALREADY_PROCESSED') {
    return `${group.count.toLocaleString()} orders in this invoice were already processed by Plutus.`;
  }
  if (group.code === 'ALREADY_PROCESSED') {
    const processingId = sample?.details ? sample.details.settlementProcessingId : undefined;
    if (processingId === undefined) {
      return 'Invoice already processed by Plutus.';
    }
    return `Invoice already processed by Plutus (settlementProcessingId=${String(processingId)}).`;
  }

  const message = sample ? getPreviewBlockMessage(sample) : group.code;
  if (group.count === 1) return message;
  return `${message} (${group.count.toLocaleString()} occurrences).`;
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

async function fetchAdsAllocation(
  settlementId: string,
  invoiceId: string,
  marketplace: MarketplaceId,
): Promise<AdsAllocationResponse> {
  const query = new URLSearchParams({ invoiceId, marketplace });
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/ads-allocation?${query.toString()}`);
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

function SignedCentsAmount({
  amountCents,
  postingType,
  currency,
}: {
  amountCents: number;
  postingType: 'Debit' | 'Credit';
  currency: string;
}) {
  const signed = postingType === 'Debit' ? amountCents : -amountCents;
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        signed < 0 ? 'text-red-600 dark:text-red-400' : '',
      )}
    >
      {formatMoney(signed / 100, currency)}
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
  defaultInvoiceId,
  onProcessed,
}: {
  settlementId: string;
  periodStart: string | null;
  periodEnd: string | null;
  marketplaceId: MarketplaceId;
  defaultInvoiceId: string | null;
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
    if (!open) return;
    if (selectedInvoice !== '') return;
    if (defaultInvoiceId) {
      setSelectedInvoice(defaultInvoiceId);
      return;
    }
    if (invoiceRecommendation.kind !== 'match') return;
    setSelectedInvoice(invoiceRecommendation.invoiceId);
  }, [defaultInvoiceId, invoiceRecommendation, open, selectedInvoice]);

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
  const previewBlockingBlocks = useMemo(() => {
    if (!preview) return [] as PreviewBlock[];
    return preview.blocks.filter((block) => isBlockingPreviewBlock(block));
  }, [preview]);
  const previewWarningBlocks = useMemo(() => {
    if (!preview) return [] as PreviewBlock[];
    return preview.blocks.filter((block) => !isBlockingPreviewBlock(block));
  }, [preview]);

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
                  <Badge
                    variant={
                      previewBlockingBlocks.length > 0
                        ? 'destructive'
                        : previewWarningBlocks.length > 0
                          ? 'secondary'
                          : 'success'
                    }
                  >
                    {previewBlockingBlocks.length > 0
                      ? 'Blocked'
                      : previewWarningBlocks.length > 0
                        ? 'Ready (Warnings)'
                        : 'Ready'}
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

		                {previewBlockingBlocks.length > 0 && (
		                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20">
		                    <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Blocked</div>
		                    <ul className="text-sm text-red-700 dark:text-red-200 space-y-1">
		                      {previewBlockingBlocks.map((b, idx) => (
		                        <li key={idx}>
		                          <span className="font-mono">{b.code}</span>: {getPreviewBlockMessage(b)}
		                          {showPreviewBlockErrorDetails(b) && (
		                            <div className="text-xs opacity-75 mt-0.5 font-mono">{String(b.details?.error)}</div>
		                          )}
		                          {formatBlockDetails(b.details) && (
		                            <div className="text-xs opacity-75 mt-0.5 font-mono">{formatBlockDetails(b.details)}</div>
		                          )}
	                        </li>
	                      ))}
		                    </ul>
		                  </div>
		                )}

		                {previewWarningBlocks.length > 0 && (
		                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
		                    <div className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2">Warnings</div>
		                    <ul className="text-sm text-amber-700 dark:text-amber-200 space-y-1">
		                      {previewWarningBlocks.map((b, idx) => (
		                        <li key={idx}>
		                          <span className="font-mono">{b.code}</span>: {getPreviewBlockMessage(b)}
		                          {showPreviewBlockErrorDetails(b) && (
		                            <div className="text-xs opacity-75 mt-0.5 font-mono">{String(b.details?.error)}</div>
		                          )}
		                          {formatBlockDetails(b.details) && (
		                            <div className="text-xs opacity-75 mt-0.5 font-mono">{formatBlockDetails(b.details)}</div>
		                          )}
		                        </li>
		                      ))}
		                    </ul>
		                  </div>
		                )}

	                {previewBlockingBlocks.length === 0 && (
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

type SettlementDetailTab = 'sales' | 'plutus-preview';

function parseSettlementTab(tab: string | null): SettlementDetailTab {
  if (tab === 'lmb-preview') return 'plutus-preview';
  if (tab === 'lmb-settlement') return 'sales';
  if (tab === 'plutus-settlement') return 'plutus-preview';
  if (tab === 'history') return 'plutus-preview';
  if (tab === 'ads-allocation') return 'plutus-preview';
  if (tab === 'analysis') return 'plutus-preview';
  if (tab === 'plutus-preview') return 'plutus-preview';
  return 'sales';
}

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
  const [tab, setTab] = useState<SettlementDetailTab>(parseSettlementTab(initialTab));
  const handleTabChange = (value: string) => {
    setTab(parseSettlementTab(value));
  };

  const [actionError, setActionError] = useState<string | null>(null);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [pendingPreviewInvoiceId, setPendingPreviewInvoiceId] = useState<string>('');

  useEffect(() => {
    setPendingPreviewInvoiceId('');
  }, [settlementId]);

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

  useEffect(() => {
    if (tab !== 'plutus-preview') return;
    if (!settlement) return;
    if (settlement.plutusStatus === 'Pending') return;
    if (settlement.plutusStatus === 'Processed') return;
    setTab('sales');
  }, [settlement, tab]);

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

  const auditInvoices = useMemo(() => auditData?.invoices ?? [], [auditData?.invoices]);

  const marketplaceAuditInvoices = useMemo(() => {
    if (!settlement) return [];
    return auditInvoices.filter((inv) => inv.marketplace === settlement.marketplace.id);
  }, [auditInvoices, settlement]);

  const recommendedInvoice = useMemo(() => {
    if (!settlement) return null;
    const match = selectAuditInvoiceForSettlement({
      settlementMarketplace: settlement.marketplace.id,
      settlementPeriodStart: settlement.periodStart,
      settlementPeriodEnd: settlement.periodEnd,
      invoices: auditInvoices,
    });

    return match.kind === 'match' ? match.invoiceId : null;
  }, [auditInvoices, settlement]);

  const previewInvoiceId = useMemo(() => {
    if (!settlement) return null;
    if (settlement.plutusStatus === 'Processed' && data?.processing?.invoiceId) {
      return data.processing.invoiceId;
    }
    if (settlement.plutusStatus === 'Pending') {
      const chosen = pendingPreviewInvoiceId.trim();
      if (chosen !== '') {
        return chosen;
      }
      return recommendedInvoice;
    }
    return null;
  }, [data?.processing?.invoiceId, pendingPreviewInvoiceId, recommendedInvoice, settlement]);

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

  const previewBlockingBlocks = useMemo(() => {
    return visiblePreviewBlocks.filter((block) => isBlockingPreviewBlock(block));
  }, [visiblePreviewBlocks]);
  const previewWarningBlocks = useMemo(() => {
    return visiblePreviewBlocks.filter((block) => !isBlockingPreviewBlock(block));
  }, [visiblePreviewBlocks]);

  const isProcessedPreview = settlement?.plutusStatus === 'Processed';
  const previewBlockingCount = previewBlockingBlocks.length;
  const previewWarningCount = previewWarningBlocks.length;
  const previewIssueCount = isProcessedPreview ? visiblePreviewBlocks.length : previewBlockingCount;
  const previewIssueGroups = useMemo(() => groupPreviewBlocksByCode(visiblePreviewBlocks), [visiblePreviewBlocks]);
  const previewBlockingGroups = useMemo(() => groupPreviewBlocksByCode(previewBlockingBlocks), [previewBlockingBlocks]);
  const previewWarningGroups = useMemo(() => groupPreviewBlocksByCode(previewWarningBlocks), [previewWarningBlocks]);
  const previewIssueFirstByCode = useMemo(() => firstPreviewBlockByCode(visiblePreviewBlocks), [visiblePreviewBlocks]);
  const previewBlockingFirstByCode = useMemo(() => firstPreviewBlockByCode(previewBlockingBlocks), [previewBlockingBlocks]);
  const previewWarningFirstByCode = useMemo(() => firstPreviewBlockByCode(previewWarningBlocks), [previewWarningBlocks]);

  const adsAllocationEnabled = !!previewInvoiceId && !!settlement;

  const { data: adsAllocation, isLoading: isAdsAllocationLoading, error: adsAllocationError } = useQuery({
    queryKey: ['plutus-settlement-ads-allocation', settlementId, previewInvoiceId, settlement?.marketplace.id, settlement?.plutusStatus],
    queryFn: () => fetchAdsAllocation(settlementId, previewInvoiceId!, settlement!.marketplace.id),
    enabled: adsAllocationEnabled,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const adsAllocationSaveEnabled = settlement?.plutusStatus === 'Processed' && data?.processing !== null;

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
                  <StatusPill status={settlement.lmbStatus} />
                  <PlutusPill status={settlement.plutusStatus} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={`https://app.qbo.intuit.com/app/journal?txnId=${settlementId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open in QBO
                    </a>
                  </Button>
		                  {settlement.plutusStatus === 'Pending' && (
		                    <ProcessSettlementDialog
		                      settlementId={settlementId}
		                      periodStart={settlement.periodStart}
		                      periodEnd={settlement.periodEnd}
	                      marketplaceId={settlement.marketplace.id}
	                      defaultInvoiceId={previewInvoiceId}
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
            <Tabs value={tab} onValueChange={handleTabChange}>
              <div className="border-b border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03] px-4 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <TabsList>
                    <TabsTrigger value="sales">LMB Settlement</TabsTrigger>
                    {(settlement?.plutusStatus === 'Pending' || settlement?.plutusStatus === 'Processed') && (
                      <TabsTrigger value="plutus-preview">Plutus Settlement</TabsTrigger>
                    )}
                  </TabsList>

                  {settlement?.plutusStatus === 'Pending' && marketplaceAuditInvoices.length > 0 && tab === 'plutus-preview' && (
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
                      <div className="text-xs font-medium text-slate-600 dark:text-slate-400">Plutus invoice</div>
                      <Select
                        value={previewInvoiceId ?? ''}
                        onValueChange={(v) => {
                          setPendingPreviewInvoiceId(v);
                        }}
                      >
                        <SelectTrigger className="w-full sm:w-[360px] bg-white dark:bg-slate-900">
                          <SelectValue placeholder="Select invoice..." />
                        </SelectTrigger>
                        <SelectContent>
                          {marketplaceAuditInvoices.map((inv) => (
                            <SelectItem key={inv.invoiceId} value={inv.invoiceId}>
                              <div className="flex items-center gap-2">
                                <span>{inv.invoiceId}</span>
                                {inv.invoiceId === recommendedInvoice && (
                                  <span className="inline-flex items-center rounded-md bg-brand-teal-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-teal-700 dark:bg-brand-cyan/15 dark:text-brand-cyan">
                                    Recommended
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
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

              <TabsContent value="plutus-preview" className="p-4">
                {!settlement && (
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-64" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                )}

                {settlement && !previewInvoiceId && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <div className="text-sm font-medium text-slate-900 dark:text-white">Select an invoice</div>
                      <div className="text-sm text-slate-500 dark:text-slate-400">
                        Choose a Plutus invoice above to compute advertising allocation.
                      </div>
                    </div>
                  </div>
                )}

                {settlement && previewInvoiceId && (
                  <>
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
                              Advertising allocation
                            </div>
                            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              Invoice <span className="font-mono">{adsAllocation.invoiceId}</span> &middot; {adsAllocation.invoiceStartDate} &rarr; {adsAllocation.invoiceEndDate}
                            </div>
                            {adsAllocation.totalAdsCents !== 0 && (
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Ads total: {formatMoney(adsAllocation.totalAdsCents / 100, settlement.marketplace.currency)}
                              </div>
                            )}
                            {adsAllocation.totalAdsCents !== 0 && adsAllocation.adsDataUpload && (
                              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                Source: {adsAllocation.adsDataUpload.filename}
                              </div>
                            )}
                          </div>

                          {adsAllocationSaveEnabled && adsAllocation.totalAdsCents !== 0 && (
                            <Button
                              size="sm"
                              onClick={() => saveAdsAllocationMutation.mutate()}
                              disabled={!adsAllocationPreview.ok || !adsAllocation.adsDataUpload || saveAdsAllocationMutation.isPending}
                            >
                              {saveAdsAllocationMutation.isPending ? 'Saving...' : 'Save'}
                            </Button>
                          )}
                        </div>

                        {adsAllocation.totalAdsCents === 0 ? (
                          <div className="text-sm text-slate-500 dark:text-slate-400">
                            No advertising costs found for this invoice.
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
                  </>
                )}
              </TabsContent>

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

                  {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && auditData?.invoices?.length && marketplaceAuditInvoices.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-white/5">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">No invoices for this marketplace</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Audit data exists, but none of the uploaded invoices match {settlement.marketplace.id}.
                        </div>
                      </div>
                    </div>
                  )}

                  {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && !isPreviewLoading && marketplaceAuditInvoices.length > 0 && !previewInvoiceId && (
                    <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 dark:border-white/10 dark:bg-white/5">
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div className="text-sm font-medium text-slate-900 dark:text-white">Select an invoice</div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">
                          Choose a Plutus invoice above to compute a settlement preview.
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
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">
                            Invoice {previewData.invoiceId}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {previewData.minDate} &rarr; {previewData.maxDate}
                          </div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            Sales {previewData.sales.length} &middot; Returns {previewData.returns.length} &middot; COGS Lines {previewData.cogsJournalEntry.lines.length} &middot; P&amp;L Lines {previewData.pnlJournalEntry.lines.length}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {data?.processing && (
                            <>
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={getQboJournalHref(data.processing.qboCogsJournalEntryId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  COGS JE
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                              <Button variant="outline" size="sm" asChild>
                                <a
                                  href={getQboJournalHref(data.processing.qboPnlReclassJournalEntryId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  P&amp;L JE
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </Button>
                            </>
                          )}
                          <Badge
                            variant={
                              isProcessedPreview
                                ? previewIssueCount === 0
                                  ? 'success'
                                  : 'secondary'
                                : previewBlockingCount > 0
                                  ? 'destructive'
                                  : previewWarningCount > 0
                                    ? 'secondary'
                                    : 'success'
                            }
                          >
                            {isProcessedPreview
                              ? previewIssueCount === 0
                                ? 'Processed'
                                : 'Processed (Needs Review)'
                              : previewBlockingCount > 0
                                ? 'Blocked'
                                : previewWarningCount > 0
                                  ? 'Ready (Warnings)'
                                  : 'Ready to Process'}
                          </Badge>
                        </div>
                      </div>

                      {/* Blocks */}
                      {isProcessedPreview && previewIssueCount > 0 && (
                        <div
                          className={cn(
                            'rounded-lg p-4',
                            'border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20',
                          )}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                              {previewIssueCount} review issue{previewIssueCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {previewIssueGroups.map((group) => (
                              <span
                                key={group.code}
                                className="rounded border border-amber-300 px-1.5 py-0.5 text-xs text-amber-700 dark:border-amber-800 dark:text-amber-200"
                              >
                                <span className="font-mono">{group.code}</span> &times; {group.count.toLocaleString()}
                              </span>
                            ))}
                          </div>
                          <ul
                            className="text-sm space-y-1 text-amber-700 dark:text-amber-200"
                          >
                            {previewIssueGroups.map((group) => (
                              <li key={group.code}>
                                {getPreviewBlockSummary(group, previewIssueFirstByCode.get(group.code))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {!isProcessedPreview && previewBlockingCount > 0 && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                            <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                              {previewBlockingCount} blocking issue{previewBlockingCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {previewBlockingGroups.map((group) => (
                              <span
                                key={group.code}
                                className="rounded border border-red-300 px-1.5 py-0.5 text-xs text-red-700 dark:border-red-800 dark:text-red-200"
                              >
                                <span className="font-mono">{group.code}</span> &times; {group.count.toLocaleString()}
                              </span>
                            ))}
                          </div>
                          <ul className="text-sm text-red-700 dark:text-red-200 space-y-1">
                            {previewBlockingGroups.map((group) => (
                              <li key={group.code}>
                                {getPreviewBlockSummary(group, previewBlockingFirstByCode.get(group.code))}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {!isProcessedPreview && previewBlockingCount === 0 && previewWarningCount > 0 && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                              {previewWarningCount} warning{previewWarningCount === 1 ? '' : 's'}
                            </span>
                          </div>
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {previewWarningGroups.map((group) => (
                              <span
                                key={group.code}
                                className="rounded border border-amber-300 px-1.5 py-0.5 text-xs text-amber-700 dark:border-amber-800 dark:text-amber-200"
                              >
                                <span className="font-mono">{group.code}</span> &times; {group.count.toLocaleString()}
                              </span>
                            ))}
                          </div>
                          <ul className="text-sm text-amber-700 dark:text-amber-200 space-y-1">
                            {previewWarningGroups.map((group) => (
                              <li key={group.code}>
                                {getPreviewBlockSummary(group, previewWarningFirstByCode.get(group.code))}
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
                                  <TableHead>Description</TableHead>
                                  <TableHead>Account</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {previewData.cogsJournalEntry.lines.map((line, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                                      {line.description}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                                      <div className="flex flex-col">
                                        <span>{line.accountName}</span>
                                        {line.accountFullyQualifiedName && line.accountFullyQualifiedName !== line.accountName && (
                                          <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {line.accountFullyQualifiedName}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                                      <SignedCentsAmount
                                        amountCents={line.amountCents}
                                        postingType={line.postingType}
                                        currency={settlement.marketplace.currency}
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow>
                                  <TableCell colSpan={2} className="text-right text-sm font-medium text-slate-900 dark:text-white">
                                    Net
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">
                                    {formatMoney(
                                      previewData.cogsJournalEntry.lines.reduce(
                                        (sum, line) => sum + (line.postingType === 'Debit' ? line.amountCents : -line.amountCents),
                                        0,
                                      ) / 100,
                                      settlement.marketplace.currency,
                                    )}
                                  </TableCell>
                                </TableRow>
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
                                  <TableHead>Description</TableHead>
                                  <TableHead>Account</TableHead>
                                  <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {previewData.pnlJournalEntry.lines.map((line, idx) => (
                                  <TableRow key={idx}>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                                      {line.description}
                                    </TableCell>
                                    <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                                      <div className="flex flex-col">
                                        <span>{line.accountName}</span>
                                        {line.accountFullyQualifiedName && line.accountFullyQualifiedName !== line.accountName && (
                                          <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {line.accountFullyQualifiedName}
                                          </span>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell className="text-right text-sm font-medium tabular-nums text-slate-900 dark:text-white">
                                      <SignedCentsAmount
                                        amountCents={line.amountCents}
                                        postingType={line.postingType}
                                        currency={settlement.marketplace.currency}
                                      />
                                    </TableCell>
                                  </TableRow>
                                ))}
                                <TableRow>
                                  <TableCell colSpan={2} className="text-right text-sm font-medium text-slate-900 dark:text-white">
                                    Net
                                  </TableCell>
                                  <TableCell className="text-right text-sm font-semibold text-slate-900 dark:text-white">
                                    {formatMoney(
                                      previewData.pnlJournalEntry.lines.reduce(
                                        (sum, line) => sum + (line.postingType === 'Debit' ? line.amountCents : -line.amountCents),
                                        0,
                                      ) / 100,
                                      settlement.marketplace.currency,
                                    )}
                                  </TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              )}

            </Tabs>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
