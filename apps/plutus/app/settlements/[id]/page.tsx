'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import WarningIcon from '@mui/icons-material/Warning';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import MuiTab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import MuiTabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { BackButton } from '@/components/back-button';
import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { selectAuditInvoiceForSettlement, type MarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { isNoopJournalEntryId, isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { buildSettlementSkuProfitability } from '@/lib/plutus/settlement-ads-profitability';
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

function isIdempotencyBlock(block: PreviewBlock): boolean {
  if (block.code === 'ALREADY_PROCESSED') return true;
  if (block.code === 'ORDER_ALREADY_PROCESSED') return true;
  return false;
}

function isBlockingPreviewBlock(block: PreviewBlock): boolean {
  return isBlockingProcessingCode(block.code);
}

function StatusPill({ status }: { status: SettlementDetailResponse['settlement']['lmbStatus'] }) {
  if (status === 'Posted') return <Chip label="LMB Posted" size="small" color="success" sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }} />;
  return <Chip label={`LMB ${status}`} size="small" sx={{ bgcolor: 'action.hover', color: 'text.secondary' }} />;
}

function PlutusPill({ status }: { status: SettlementDetailResponse['settlement']['plutusStatus'] }) {
  if (status === 'Processed') return <Chip label="Plutus Processed" size="small" color="success" sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }} />;
  if (status === 'RolledBack') return <Chip label="Plutus Rolled Back" size="small" sx={{ bgcolor: 'action.hover', color: 'text.secondary' }} />;
  return <Chip label="Plutus Pending" size="small" color="error" />;
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
    <Box
      component="span"
      sx={{
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
        ...(signed < 0 && { color: 'error.main' }),
      }}
    >
      {formatMoney(signed, currency)}
    </Box>
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
  const { enqueueSnackbar } = useSnackbar();
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

      enqueueSnackbar('Settlement processed and posted to QBO', { variant: 'success' });
      setOpen(false);
      setPreview(null);
      setSelectedInvoice('');
      onProcessed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      enqueueSnackbar('Failed to post settlement', { variant: 'error' });
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
    <>
      <Button size="small" variant="contained" sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' } }} onClick={() => setOpen(true)}>Process Settlement</Button>
      <Dialog
        open={open}
        onClose={() => handleOpenChange(false)}
        maxWidth="md"
        fullWidth
        slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}
      >
        <DialogContent sx={{ maxHeight: '85vh', overflowY: 'auto' }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box>
              <DialogTitle sx={{ p: 0 }}>Process Settlement</DialogTitle>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
                Match an audit data invoice to this settlement, preview the journal entries, then post to QuickBooks.
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => handleOpenChange(false)} sx={{ mt: -0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {isLoadingAuditData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 2 }}>
              <Skeleton variant="rectangular" sx={{ height: 36, width: '100%' }} />
              <Skeleton variant="rectangular" sx={{ height: 20, width: 192 }} />
            </Box>
          )}

          {!isLoadingAuditData && invoices.length === 0 && (
            <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 3, mt: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>No audit data available</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  Upload the LMB Audit Data CSV on the Audit Data page first.
                </Typography>
              </Box>
            </Box>
          )}

          {!isLoadingAuditData && invoices.length > 0 && marketplaceInvoices.length === 0 && (
            <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 3, mt: 2 }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>No invoices for this marketplace</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  Audit data exists, but none of the uploaded invoices match {marketplaceId}. Upload the correct Audit Data file.
                </Typography>
              </Box>
            </Box>
          )}

          {!isLoadingAuditData && marketplaceInvoices.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {invoiceRecommendation.kind === 'ambiguous' && (
                <Box sx={{ borderRadius: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50', p: 1.5, fontSize: '0.875rem', color: 'warning.dark' }}>
                  Multiple audit invoices match this settlement period. Select the correct invoice manually.
                </Box>
              )}
              {invoiceRecommendation.kind === 'none' && (
                <Box sx={{ borderRadius: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50', p: 1.5, fontSize: '0.875rem', color: 'warning.dark' }}>
                  No audit invoice matches this settlement period. Upload the correct Audit Data file or choose an invoice manually.
                </Box>
              )}

              {/* Invoice selector */}
              <Box>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary', mb: 0.75 }}>Invoice</Typography>
                <FormControl fullWidth size="small">
                  <Select
                    value={selectedInvoice}
                    onChange={(e) => {
                      setSelectedInvoice(e.target.value as string);
                      setPreview(null);
                      setError(null);
                    }}
                    displayEmpty
                    sx={{ bgcolor: 'background.paper' }}
                    renderValue={(selected) => {
                      if (!selected) return <Box component="span" sx={{ color: '#94a3b8' }}>Select an invoice...</Box>;
                      return selected;
                    }}
                  >
                    {invoicesWithMeta.map((inv) => (
                      <MenuItem key={inv.invoiceId} value={inv.invoiceId}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box component="span">{inv.invoiceId}</Box>
                          {inv.recommended && (
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                borderRadius: '6px',
                                bgcolor: 'rgba(69, 179, 212, 0.1)',
                                px: 0.75,
                                py: 0.25,
                                fontSize: '10px',
                                fontWeight: 500,
                                color: '#2384a1',
                              }}
                            >
                              Recommended
                            </Box>
                          )}
                          {inv.candidate && !inv.recommended && (
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                borderRadius: '6px',
                                bgcolor: 'rgba(245, 158, 11, 0.1)',
                                px: 0.75,
                                py: 0.25,
                                fontSize: '10px',
                                fontWeight: 500,
                                color: 'warning.dark',
                              }}
                            >
                              Candidate
                            </Box>
                          )}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>

                {/* Invoice metadata */}
                {selectedMeta && (
                  <Box sx={{ mt: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, fontSize: '0.75rem', color: 'text.secondary' }}>
                    <Box component="span">{selectedMeta.rowCount.toLocaleString()} row{selectedMeta.rowCount === 1 ? '' : 's'}</Box>
                    <Box component="span" sx={{ color: 'text.disabled' }}>|</Box>
                    <Box component="span">Data: {selectedMeta.minDate} to {selectedMeta.maxDate}</Box>
                    {selectedMeta.dateLabel && (
                      <>
                        <Box component="span" sx={{ color: 'text.disabled' }}>|</Box>
                        <Box component="span">ID dates: {selectedMeta.dateLabel}</Box>
                      </>
                    )}
                    {selectedMeta.recommended && (
                      <Chip label="Recommended" size="small" sx={{ fontSize: '10px', bgcolor: 'rgba(69, 179, 212, 0.1)', color: '#2384a1' }} />
                    )}
                  </Box>
                )}

                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.5 }}>
                  {marketplaceInvoices.length} invoice{marketplaceInvoices.length === 1 ? '' : 's'} for this marketplace
                </Typography>
              </Box>

              {/* Preview button */}
              <Button
                onClick={() => void handlePreview()}
                disabled={!selectedInvoice || isPreviewLoading}
                variant="outlined"
                sx={{ borderColor: 'divider', color: 'text.primary' }}
              >
                {isPreviewLoading ? 'Computing preview...' : 'Preview'}
              </Button>

              {/* Error */}
              {error && (
                <Box sx={{ borderRadius: 2, border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5, fontSize: '0.875rem', color: 'error.dark' }}>
                  {error}
                </Box>
              )}

              {/* Preview results */}
              {preview && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                        Preview &middot; Invoice {preview.invoiceId}
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                        Hash {preview.processingHash.slice(0, 10)} &middot; {preview.minDate} &rarr; {preview.maxDate}
                      </Typography>
                    </Box>
                    <Chip
                      size="small"
                      label={
                        previewBlockingBlocks.length > 0
                          ? 'Blocked'
                          : previewWarningBlocks.length > 0
                            ? 'Ready (Warnings)'
                            : 'Ready'
                      }
                      {...(previewBlockingBlocks.length > 0
                        ? { color: 'error' as const }
                        : previewWarningBlocks.length > 0
                          ? { sx: { bgcolor: 'action.hover', color: 'text.secondary' } }
                          : { color: 'success' as const, sx: { bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' } }
                      )}
                    />
                  </Box>

                  <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { sm: 'repeat(3, 1fr)' } }}>
                    <Card sx={{ border: 1, borderColor: 'divider' }}>
                      <CardContent sx={{ p: 1.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Sales</Typography>
                        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>{preview.sales.length}</Typography>
                      </CardContent>
                    </Card>
                    <Card sx={{ border: 1, borderColor: 'divider' }}>
                      <CardContent sx={{ p: 1.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Returns</Typography>
                        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>{preview.returns.length}</Typography>
                      </CardContent>
                    </Card>
                    <Card sx={{ border: 1, borderColor: 'divider' }}>
                      <CardContent sx={{ p: 1.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>JE Lines</Typography>
                        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                          {preview.cogsJournalEntry.lines.length + preview.pnlJournalEntry.lines.length}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Box>

                  {previewBlockingBlocks.length > 0 && (
                    <Box sx={{ borderRadius: 2, border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'error.dark', mb: 1 }}>Blocked</Typography>
                      <Box component="ul" sx={{ fontSize: '0.875rem', color: 'error.dark', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {previewBlockingBlocks.map((b, idx) => (
                          <li key={idx}>
                            <Box component="span" sx={{ fontFamily: 'monospace' }}>{b.code}</Box>: {b.message}
                            {b.details && 'error' in b.details && (
                              <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{String(b.details.error)}</Typography>
                            )}
                            {formatBlockDetails(b.details) && (
                              <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{formatBlockDetails(b.details)}</Typography>
                            )}
                          </li>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {previewWarningBlocks.length > 0 && (
                    <Box sx={{ borderRadius: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50', p: 1.5 }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'warning.dark', mb: 1 }}>Warnings (non-blocking)</Typography>
                      <Box component="ul" sx={{ fontSize: '0.875rem', color: 'warning.dark', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                        {previewWarningBlocks.map((b, idx) => (
                          <li key={idx}>
                            <Box component="span" sx={{ fontFamily: 'monospace' }}>{b.code}</Box>: {b.message}
                            {b.details && 'error' in b.details && (
                              <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{String(b.details.error)}</Typography>
                            )}
                            {formatBlockDetails(b.details) && (
                              <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{formatBlockDetails(b.details)}</Typography>
                            )}
                          </li>
                        ))}
                      </Box>
                    </Box>
                  )}

                  {previewBlockingBlocks.length === 0 && (
                    <Button variant="contained" sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' } }} onClick={() => void handlePost()} disabled={isPosting}>
                      {isPosting ? 'Posting...' : 'Post to QBO'}
                    </Button>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
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
  if (tab === 'lmb-preview') return 'plutus-preview';
  if (tab === 'history') return 'plutus-preview';
  if (tab === 'ads-allocation') return 'plutus-preview';
  if (tab === 'analysis') return 'plutus-preview';
  if (tab === 'plutus-preview') return 'plutus-preview';
  return 'sales';
}

export default function SettlementDetailPage() {
  const { enqueueSnackbar } = useSnackbar();
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
  const handleTabChange = (_: React.SyntheticEvent, value: string) => {
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
    if (!settlement) {
      return { ok: false as const, lines: [] as Array<{ sku: string; weightInput: string; allocatedCents: number | null }>, error: 'Settlement unavailable.' };
    }

    if (adsAllocation.weightUnit !== 'cents') {
      return { ok: false as const, lines: [], error: `Unsupported weight unit: ${adsAllocation.weightUnit}` };
    }

    const parsed = adsEditLines.map((l) => {
      const weightCents = parseMoneyInputToCents(l.weightInput);
      return { sku: l.sku, weightInput: l.weightInput, weightCents };
    });

    if (parsed.length === 0) {
      return { ok: false as const, lines: [], error: 'No amounts available for allocation.' };
    }

    const invalid = parsed.find((l) => l.weightCents === null);
    if (invalid) {
      return {
        ok: false as const,
        lines: parsed.map((l) => ({ sku: l.sku, weightInput: l.weightInput, allocatedCents: null })),
        error: 'All amounts must be positive dollar values.',
      };
    }

    const sign = adsAllocation.totalAdsCents < 0 ? -1 : 1;
    const absTotal = Math.abs(adsAllocation.totalAdsCents);
    const withAlloc = parsed.map((l) => ({ sku: l.sku, weightInput: l.weightInput, allocatedCents: sign * l.weightCents! }));

    let inputTotal = 0;
    for (const line of parsed) inputTotal += line.weightCents!;
    if (inputTotal !== absTotal) {
      return {
        ok: false as const,
        lines: withAlloc,
        error: `Allocation total must equal billed ads (${formatMoney(absTotal / 100, settlement.marketplace.currency)}). Current total is ${formatMoney(inputTotal / 100, settlement.marketplace.currency)}.`,
      };
    }

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
  }, [adsAllocation, adsEditLines, settlement]);

  const baseAdsSkuProfitability = useMemo(() => {
    if (!adsAllocation) {
      return null;
    }

    if (adsAllocation.skuProfitability) {
      return adsAllocation.skuProfitability;
    }

    if (!previewData) {
      return null;
    }

    const sales = previewData.sales.map((sale) => ({
      sku: sale.sku,
      quantity: sale.quantity,
      principalCents: sale.principalCents,
      costManufacturingCents: sale.costByComponentCents.manufacturing,
      costFreightCents: sale.costByComponentCents.freight,
      costDutyCents: sale.costByComponentCents.duty,
      costMfgAccessoriesCents: sale.costByComponentCents.mfgAccessories,
    }));

    const returns = previewData.returns.map((ret) => ({
      sku: ret.sku,
      quantity: ret.quantity,
      principalCents: ret.principalCents,
      costManufacturingCents: ret.costByComponentCents.manufacturing,
      costFreightCents: ret.costByComponentCents.freight,
      costDutyCents: ret.costByComponentCents.duty,
      costMfgAccessoriesCents: ret.costByComponentCents.mfgAccessories,
    }));

    return buildSettlementSkuProfitability({
      sales,
      returns,
      allocationLines: adsAllocation.lines.map((line) => ({
        sku: line.sku,
        allocatedCents: line.allocatedCents,
      })),
    });
  }, [adsAllocation, previewData]);

  const adsSkuProfitabilityPreview = useMemo(() => {
    if (!baseAdsSkuProfitability) {
      return null;
    }

    const baseBySku = new Map<string, AdsSkuProfitabilityLine>();
    for (const line of baseAdsSkuProfitability.lines) {
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
      for (const line of baseAdsSkuProfitability.lines) {
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
  }, [adsAllocationPreview, baseAdsSkuProfitability]);

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
      enqueueSnackbar('Saved advertising allocation', { variant: 'success' });
      setAdsDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlement-ads-allocation', settlementId] });
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message, { variant: 'error' });
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

    const cogsId = processing.qboCogsJournalEntryId;
    const pnlId = processing.qboPnlReclassJournalEntryId;
    const hasQboCogsJe = isQboJournalEntryId(cogsId);
    const hasQboPnlJe = isQboJournalEntryId(pnlId);
    const hasNoopJournals = isNoopJournalEntryId(cogsId) || isNoopJournalEntryId(pnlId);

    const confirmationLines = ['Rollback Plutus processing?', ''];
    if (hasQboCogsJe || hasQboPnlJe) {
      confirmationLines.push('Void these Journal Entries in QBO first:');
      if (hasQboCogsJe) {
        confirmationLines.push(`- COGS JE: ${cogsId}`);
      }
      if (hasQboPnlJe) {
        confirmationLines.push(`- P&L Reclass JE: ${pnlId}`);
      }
      confirmationLines.push('');
    } else if (hasNoopJournals) {
      confirmationLines.push('No Plutus JEs were posted for this settlement (fees-only).');
      confirmationLines.push('');
    }
    confirmationLines.push('Then click OK to mark this settlement as Pending in Plutus.');

    const confirmed = window.confirm(
      confirmationLines.join('\n'),
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

  const tabsSx = {
    minHeight: 40,
    bgcolor: 'action.hover',
    borderRadius: 2,
    p: 0.5,
    '& .MuiTabs-indicator': { display: 'none' },
  };

  const tabSx = {
    minHeight: 36,
    borderRadius: 1.5,
    '&.Mui-selected': {
      bgcolor: 'background.paper',
      color: 'text.primary',
      boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    },
  };

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ maxWidth: '72rem', mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
          <BackButton />
        </Box>

        <PageHeader
          sx={{ mt: 2 }}
          title="Settlement Details"
          kicker={settlement ? settlement.marketplace.label : 'Link My Books'}
          description={
            settlement ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>{settlement.docNumber}</Typography>
                <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                  {formatPeriod(settlement.periodStart, settlement.periodEnd)} &middot; Posted{' '}
                  {new Date(`${settlement.postedDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                </Typography>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                  {settlement.settlementTotal === null ? '—' : formatMoney(settlement.settlementTotal, settlement.marketplace.currency)}
                </Typography>
              </Box>
            ) : (
              'Loads the QBO journal entry for this settlement and shows Plutus processing status.'
            )
          }
          actions={
            settlement ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 1.5 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                  <Box
                    component="a"
                    href={`https://app.qbo.intuit.com/app/journal?txnId=${settlementId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, '&:hover .qbo-link-icon': { color: 'text.secondary' }, textDecoration: 'none' }}
                  >
                    <StatusPill status={settlement.lmbStatus} />
                    <OpenInNewIcon sx={{ fontSize: 12, color: 'text.disabled', transition: 'color 0.15s' }} />
                  </Box>
                  <PlutusPill status={settlement.plutusStatus} />
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
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
                    <Button variant="outlined" size="small" sx={{ borderColor: 'divider', color: 'text.primary' }} onClick={() => void handleRollback()} disabled={isRollingBack}>
                      {isRollingBack ? 'Rolling back...' : 'Rollback'}
                    </Button>
                  )}
                </Box>
              </Box>
            ) : null
          }
        />

        {actionError && (
          <Typography sx={{ mb: 2, fontSize: '0.875rem', color: 'error.main' }}>
            {actionError}
          </Typography>
        )}

        <Card sx={{ border: 1, borderColor: 'divider' }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover', px: 2, py: 1.5 }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' } }}>
                <MuiTabs value={tab} onChange={handleTabChange} sx={tabsSx}>
                  <MuiTab value="sales" label="LMB Settlement" sx={tabSx} />
                  {(settlement?.plutusStatus === 'Pending' || settlement?.plutusStatus === 'Processed') && (
                    <MuiTab value="plutus-preview" label="Plutus Settlement" sx={tabSx} />
                  )}
                </MuiTabs>

                {settlement?.plutusStatus === 'Pending' && marketplaceAuditInvoices.length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 0.75, sm: 1 }, alignItems: { sm: 'center' } }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary' }}>Preview invoice</Typography>
                    <FormControl size="small">
                      <Select
                        value={previewInvoiceId ?? ''}
                        onChange={(e) => {
                          setPendingPreviewInvoiceId(e.target.value as string);
                        }}
                        displayEmpty
                        sx={{ width: { xs: '100%', sm: 360 }, bgcolor: 'background.paper' }}
                        renderValue={(selected) => {
                          if (!selected) return <Box component="span" sx={{ color: '#94a3b8' }}>Select invoice...</Box>;
                          return selected;
                        }}
                      >
                        {marketplaceAuditInvoices.map((inv) => (
                          <MenuItem key={inv.invoiceId} value={inv.invoiceId}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box component="span">{inv.invoiceId}</Box>
                              {inv.invoiceId === recommendedInvoice && (
                                <Box
                                  component="span"
                                  sx={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    borderRadius: '6px',
                                    bgcolor: 'rgba(69, 179, 212, 0.1)',
                                    px: 0.75,
                                    py: 0.25,
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    color: '#2384a1',
                                  }}
                                >
                                  Recommended
                                </Box>
                              )}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Box>
                )}
              </Box>
            </Box>

            {tab === 'sales' && (
              <Box sx={{ p: 2 }}>
                {isLoading && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Skeleton variant="rectangular" sx={{ height: 20, width: 160 }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                  </Box>
                )}
                {!isLoading && error && (
                  <Typography sx={{ fontSize: '0.875rem', color: 'error.main' }}>
                    {error instanceof Error ? error.message : String(error)}
                  </Typography>
                )}

                {settlement && (
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell>Description</TableCell>
                          <TableCell>Account</TableCell>
                          <TableCell sx={{ textAlign: 'right' }}>Amount</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {settlement.lines.map((line, idx) => (
                          <TableRow key={`${idx}`}>
                            <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                              {line.description === '' ? '—' : line.description}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                <Box component="span">{line.accountName === '' ? '—' : line.accountName}</Box>
                                {line.accountFullyQualifiedName && (
                                  <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                                    {line.accountFullyQualifiedName}
                                  </Box>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', color: 'text.primary' }}>
                              <SignedAmount amount={line.amount} postingType={line.postingType} currency={settlement.marketplace.currency} />
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow>
                          <TableCell colSpan={2} sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
                            Net
                          </TableCell>
                          <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                            {settlement.settlementTotal === null
                              ? formatMoney(totalLines, settlement.marketplace.currency)
                              : formatMoney(settlement.settlementTotal, settlement.marketplace.currency)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Box>
            )}

            {tab === 'plutus-preview' && (
              <Box sx={{ p: 2 }}>
                {!settlement && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Skeleton variant="rectangular" sx={{ height: 20, width: 256 }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                  </Box>
                )}

                {settlement && !previewInvoiceId && (
                  <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 4 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Select an invoice</Typography>
                      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        Choose a Preview invoice above to compute advertising allocation.
                      </Typography>
                    </Box>
                  </Box>
                )}

                {settlement && previewInvoiceId && (
                  <>
                    {isAdsAllocationLoading && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                        <Skeleton variant="rectangular" sx={{ height: 20, width: 256 }} />
                        <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                        <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                        <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                      </Box>
                    )}

                    {!isAdsAllocationLoading && adsAllocationError && (
                      <Box sx={{ fontSize: '0.875rem', color: 'error.main' }}>
                        {adsAllocationError instanceof Error ? adsAllocationError.message : String(adsAllocationError)}
                        <Box sx={{ mt: 1 }}>
                          <Box
                            component={Link}
                            href="/ads-data"
                            sx={{ fontSize: '0.75rem', textDecoration: 'underline', color: 'text.secondary' }}
                          >
                            Upload Ads Data
                          </Box>
                        </Box>
                      </Box>
                    )}

                    {!isAdsAllocationLoading && !adsAllocationError && adsAllocation && (
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                          <Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                                Advertising cost allocation (SKU)
                              </Typography>
                              {!adsAllocationSaveEnabled && (
                                <Chip label="Preview" size="small" sx={{ fontSize: '10px', bgcolor: 'action.hover', color: 'text.secondary' }} />
                              )}
                            </Box>
                            <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                              Invoice <Box component="span" sx={{ fontFamily: 'monospace' }}>{adsAllocation.invoiceId}</Box> &middot; {adsAllocation.invoiceStartDate} &rarr; {adsAllocation.invoiceEndDate}
                            </Typography>
                            <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                              Total source:{' '}
                              {adsAllocation.totalSource === 'AUDIT_DATA'
                                ? 'Audit Data (Amazon Advertising Costs rows)'
                                : adsAllocation.totalSource === 'ADS_REPORT'
                                  ? 'Legacy inferred from Ads Data (no invoice billing total)'
                                  : adsAllocation.totalSource === 'SAVED'
                                    ? 'Saved allocation'
                                    : 'No source data'}
                            </Typography>
                            {adsAllocation.adsDataUpload && (
                              <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                                Source: {adsAllocation.adsDataUpload.filename} ({adsAllocation.adsDataUpload.startDate}–{adsAllocation.adsDataUpload.endDate})
                              </Typography>
                            )}
                          </Box>

                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {adsAllocationSaveEnabled && adsAllocation.totalAdsCents !== 0 && (
                              <Button
                                size="small"
                                variant="contained"
                                sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' } }}
                                onClick={() => saveAdsAllocationMutation.mutate()}
                                disabled={!adsAllocationPreview.ok || !adsAllocation.adsDataUpload || saveAdsAllocationMutation.isPending}
                              >
                                {saveAdsAllocationMutation.isPending ? 'Saving...' : 'Save'}
                              </Button>
                            )}
                          </Box>
                        </Box>

                        {!adsAllocationSaveEnabled ? (
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            Preview allocation &middot; edit amounts and match billed total exactly
                          </Typography>
                        ) : adsAllocation.kind === 'saved' ? (
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            Saved allocation &middot; edit amounts and re-save
                          </Typography>
                        ) : (
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                            Prefilled allocation &middot; review and save to lock it in
                          </Typography>
                        )}

                        {adsAllocation.totalAdsCents === 0 ? (
                          <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            No Amazon Advertising Costs rows found in Audit Data for this invoice. Nothing to allocate.
                          </Typography>
                        ) : (
                          <>
                            {adsAllocationPreview.error && (
                              <Typography sx={{ fontSize: '0.875rem', color: 'error.main' }}>
                                {adsAllocationPreview.error}
                              </Typography>
                            )}

                            {!adsAllocation.adsDataUpload && (
                              <Typography sx={{ fontSize: '0.875rem', color: 'error.main' }}>
                                Missing Ads Data upload for this invoice range.{' '}
                                <Box component={Link} href="/ads-data" sx={{ textDecoration: 'underline', color: 'inherit' }}>
                                  Upload Ads Data
                                </Box>
                                .
                              </Typography>
                            )}

                            <Box sx={{ overflowX: 'auto' }}>
                              <Table>
                                <TableHead>
                                  <TableRow>
                                    <TableCell>SKU</TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>Amount</TableCell>
                                    <TableCell sx={{ textAlign: 'right' }}>Posted</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {adsAllocationPreview.lines.map((line) => (
                                    <TableRow key={line.sku}>
                                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
                                        {line.sku}
                                      </TableCell>
                                      <TableCell sx={{ textAlign: 'right' }}>
                                        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                                          <Box sx={{ width: 140 }}>
                                            <TextField
                                              type="number"
                                              size="small"
                                              fullWidth
                                              inputProps={{ step: '0.01' }}
                                              value={line.weightInput}
                                              onChange={(event) => {
                                                const next = event.target.value;
                                                setAdsDirty(true);
                                                setAdsEditLines((prev) =>
                                                  prev.map((p) => (p.sku === line.sku ? { ...p, weightInput: next } : p)),
                                                );
                                              }}
                                            />
                                          </Box>
                                        </Box>
                                      </TableCell>
                                      <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                                        {line.allocatedCents === null
                                          ? '—'
                                          : formatMoney(line.allocatedCents / 100, settlement.marketplace.currency)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                  <TableRow>
                                    <TableCell colSpan={2} sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
                                      Total
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                                      {formatMoney(adsAllocation.totalAdsCents / 100, settlement.marketplace.currency)}
                                    </TableCell>
                                  </TableRow>
                                </TableBody>
                              </Table>
                            </Box>

                            {adsSkuProfitabilityPreview && adsSkuProfitabilityPreview.lines.length > 0 && (
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                                  SKU contribution after ads allocation
                                </Typography>
                                <Box sx={{ overflowX: 'auto' }}>
                                  <Table>
                                    <TableHead>
                                      <TableRow>
                                        <TableCell>SKU</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>Sold</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>Returns</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>Net Units</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>Principal</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>COGS</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>Ads</TableCell>
                                        <TableCell sx={{ textAlign: 'right' }}>Contribution</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {adsSkuProfitabilityPreview.lines.map((line) => (
                                        <TableRow key={`profit-${line.sku}`}>
                                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
                                            {line.sku}
                                          </TableCell>
                                          <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{line.soldUnits}</TableCell>
                                          <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{line.returnedUnits}</TableCell>
                                          <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{line.netUnits}</TableCell>
                                          <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatMoney(line.principalCents / 100, settlement.marketplace.currency)}
                                          </TableCell>
                                          <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatMoney(line.cogsCents / 100, settlement.marketplace.currency)}
                                          </TableCell>
                                          <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                                            {formatMoney(line.adsAllocatedCents / 100, settlement.marketplace.currency)}
                                          </TableCell>
                                          <TableCell
                                            sx={{
                                              textAlign: 'right',
                                              fontSize: '0.875rem',
                                              fontWeight: 600,
                                              fontVariantNumeric: 'tabular-nums',
                                              ...(line.contributionAfterAdsCents < 0
                                                ? { color: 'error.main' }
                                                : { color: 'text.primary' }),
                                            }}
                                          >
                                            {formatMoney(line.contributionAfterAdsCents / 100, settlement.marketplace.currency)}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                      <TableRow>
                                        <TableCell sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Total</TableCell>
                                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                          {adsSkuProfitabilityPreview.totals.soldUnits}
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                          {adsSkuProfitabilityPreview.totals.returnedUnits}
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                          {adsSkuProfitabilityPreview.totals.netUnits}
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                          {formatMoney(adsSkuProfitabilityPreview.totals.principalCents / 100, settlement.marketplace.currency)}
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                          {formatMoney(adsSkuProfitabilityPreview.totals.cogsCents / 100, settlement.marketplace.currency)}
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                                          {formatMoney(adsSkuProfitabilityPreview.totals.adsAllocatedCents / 100, settlement.marketplace.currency)}
                                        </TableCell>
                                        <TableCell
                                          sx={{
                                            textAlign: 'right',
                                            fontSize: '0.875rem',
                                            fontWeight: 600,
                                            fontVariantNumeric: 'tabular-nums',
                                            ...(adsSkuProfitabilityPreview.totals.contributionAfterAdsCents < 0
                                              ? { color: 'error.main' }
                                              : { color: 'text.primary' }),
                                          }}
                                        >
                                          {formatMoney(
                                            adsSkuProfitabilityPreview.totals.contributionAfterAdsCents / 100,
                                            settlement.marketplace.currency,
                                          )}
                                        </TableCell>
                                      </TableRow>
                                    </TableBody>
                                  </Table>
                                </Box>
                              </Box>
                            )}

                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                              <Box
                                component={Link}
                                href="/ads-data"
                                sx={{ fontSize: '0.75rem', textDecoration: 'underline', color: 'text.secondary' }}
                              >
                                Manage Ads Data
                              </Box>
                              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                Weight source: {adsAllocation.weightSource}
                              </Typography>
                            </Box>
                          </>
                        )}
                      </Box>
                    )}
                  </>
                )}
              </Box>
            )}

            {tab === 'plutus-preview' && (settlement?.plutusStatus === 'Pending' || settlement?.plutusStatus === 'Processed') && (
              <Box sx={{ p: 2 }}>
                {(isLoadingAudit || isPreviewLoading) && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Skeleton variant="rectangular" sx={{ height: 20, width: 224 }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                    <Skeleton variant="rectangular" sx={{ height: 40, width: '100%' }} />
                  </Box>
                )}

                {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && !auditData?.invoices?.length && (
                  <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 4 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>No audit data uploaded</Typography>
                      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        Upload the LMB Audit Data CSV on the{' '}
                        <Box
                          component={Link}
                          href="/audit-data"
                          sx={{ color: '#2384a1', '&:hover': { textDecoration: 'underline' } }}
                        >
                          Audit Data
                        </Box>{' '}
                        page first.
                      </Typography>
                    </Box>
                  </Box>
                )}

                {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && auditData?.invoices?.length && marketplaceAuditInvoices.length === 0 && (
                  <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 4 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>No invoices for this marketplace</Typography>
                      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        Audit data exists, but none of the uploaded invoices match {settlement.marketplace.id}.
                      </Typography>
                    </Box>
                  </Box>
                )}

                {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && !isPreviewLoading && marketplaceAuditInvoices.length > 0 && !previewInvoiceId && (
                  <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 4 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Select an invoice</Typography>
                      <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                        Choose a Preview invoice above to compute a settlement preview.
                      </Typography>
                    </Box>
                  </Box>
                )}

                {previewError && (
                  <Box sx={{ borderRadius: 2, border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5, fontSize: '0.875rem', color: 'error.dark' }}>
                    {previewError instanceof Error ? previewError.message : String(previewError)}
                  </Box>
                )}

                {previewData && previewData.cogsJournalEntry && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* Header */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Box>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                          Invoice {previewData.invoiceId}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontFamily: 'monospace' }}>
                          {previewData.minDate} &rarr; {previewData.maxDate}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {data?.processing && (
                          <>
                            {isQboJournalEntryId(data.processing.qboCogsJournalEntryId) && (
                              <Button
                                variant="outlined"
                                size="small"
                                sx={{ borderColor: 'divider', color: 'text.primary' }}
                                component="a"
                                href={getQboJournalHref(data.processing.qboCogsJournalEntryId)}
                                {...{ target: '_blank', rel: 'noopener noreferrer' } as any}
                                endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                              >
                                COGS JE
                              </Button>
                            )}
                            {isQboJournalEntryId(data.processing.qboPnlReclassJournalEntryId) && (
                              <Button
                                variant="outlined"
                                size="small"
                                sx={{ borderColor: 'divider', color: 'text.primary' }}
                                component="a"
                                href={getQboJournalHref(data.processing.qboPnlReclassJournalEntryId)}
                                {...{ target: '_blank', rel: 'noopener noreferrer' } as any}
                                endIcon={<OpenInNewIcon sx={{ fontSize: 12 }} />}
                              >
                                P&amp;L JE
                              </Button>
                            )}
                          </>
                        )}
                        <Chip
                          size="small"
                          label={
                            isProcessedPreview
                              ? previewIssueCount === 0
                                ? 'Processed'
                                : 'Processed (Needs Review)'
                              : previewBlockingCount > 0
                                ? 'Blocked'
                                : previewWarningCount > 0
                                  ? 'Ready (Warnings)'
                                  : 'Ready to Process'
                          }
                          {...(isProcessedPreview
                            ? previewIssueCount === 0
                              ? { color: 'success' as const, sx: { bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' } }
                              : { sx: { bgcolor: 'action.hover', color: 'text.secondary' } }
                            : previewBlockingCount > 0
                              ? { color: 'error' as const }
                              : previewWarningCount > 0
                                ? { sx: { bgcolor: 'action.hover', color: 'text.secondary' } }
                                : { color: 'success' as const, sx: { bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' } }
                          )}
                        />
                      </Box>
                    </Box>

                    {/* Summary cards */}
                    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { sm: 'repeat(4, 1fr)' } }}>
                      <Card sx={{ border: 1, borderColor: 'divider' }}>
                        <CardContent sx={{ p: 1.5 }}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Sales</Typography>
                          <Typography sx={{ mt: 0.5, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>{previewData.sales.length}</Typography>
                        </CardContent>
                      </Card>
                      <Card sx={{ border: 1, borderColor: 'divider' }}>
                        <CardContent sx={{ p: 1.5 }}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Returns</Typography>
                          <Typography sx={{ mt: 0.5, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>{previewData.returns.length}</Typography>
                        </CardContent>
                      </Card>
                      <Card sx={{ border: 1, borderColor: 'divider' }}>
                        <CardContent sx={{ p: 1.5 }}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>COGS Lines</Typography>
                          <Typography sx={{ mt: 0.5, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>{previewData.cogsJournalEntry.lines.length}</Typography>
                        </CardContent>
                      </Card>
                      <Card sx={{ border: 1, borderColor: 'divider' }}>
                        <CardContent sx={{ p: 1.5 }}>
                          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>P&amp;L Lines</Typography>
                          <Typography sx={{ mt: 0.5, fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>{previewData.pnlJournalEntry.lines.length}</Typography>
                        </CardContent>
                      </Card>
                    </Box>

                    {/* Blocks */}
                    {isProcessedPreview && previewIssueCount > 0 && (
                      <Box sx={{ borderRadius: 2, p: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <WarningIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                          <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'warning.dark' }}>
                            {previewIssueCount} review issue{previewIssueCount === 1 ? '' : 's'}
                          </Box>
                        </Box>
                        <Box component="ul" sx={{ fontSize: '0.875rem', display: 'flex', flexDirection: 'column', gap: 0.5, color: 'warning.dark' }}>
                          {visiblePreviewBlocks.map((b, idx) => (
                            <li key={idx}>
                              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{b.code}</Box>: {b.message}
                              {b.details && 'error' in b.details && (
                                <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{String(b.details.error)}</Typography>
                              )}
                              {formatBlockDetails(b.details) && (
                                <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{formatBlockDetails(b.details)}</Typography>
                              )}
                            </li>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {!isProcessedPreview && previewBlockingCount > 0 && (
                      <Box sx={{ borderRadius: 2, border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <WarningIcon sx={{ fontSize: 16, color: 'error.main' }} />
                          <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'error.dark' }}>
                            {previewBlockingCount} blocking issue{previewBlockingCount === 1 ? '' : 's'}
                          </Box>
                        </Box>
                        <Box component="ul" sx={{ fontSize: '0.875rem', color: 'error.dark', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {previewBlockingBlocks.map((b, idx) => (
                            <li key={idx}>
                              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{b.code}</Box>: {b.message}
                              {b.details && 'error' in b.details && (
                                <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{String(b.details.error)}</Typography>
                              )}
                              {formatBlockDetails(b.details) && (
                                <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{formatBlockDetails(b.details)}</Typography>
                              )}
                            </li>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {!isProcessedPreview && previewBlockingCount === 0 && previewWarningCount > 0 && (
                      <Box sx={{ borderRadius: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50', p: 2 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                          <WarningIcon sx={{ fontSize: 16, color: 'warning.main' }} />
                          <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'warning.dark' }}>
                            {previewWarningCount} warning{previewWarningCount === 1 ? '' : 's'} (non-blocking)
                          </Box>
                        </Box>
                        <Box component="ul" sx={{ fontSize: '0.875rem', color: 'warning.dark', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          {previewWarningBlocks.map((b, idx) => (
                            <li key={idx}>
                              <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{b.code}</Box>: {b.message}
                              {b.details && 'error' in b.details && (
                                <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{String(b.details.error)}</Typography>
                              )}
                              {formatBlockDetails(b.details) && (
                                <Typography sx={{ fontSize: '0.75rem', opacity: 0.75, mt: 0.25, fontFamily: 'monospace' }}>{formatBlockDetails(b.details)}</Typography>
                              )}
                            </li>
                          ))}
                        </Box>
                      </Box>
                    )}

                    {/* COGS Journal Entry */}
                    {previewData.cogsJournalEntry.lines.length > 0 && (
                      <Box>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary', mb: 1 }}>
                          COGS Journal Entry
                          <Box component="span" sx={{ ml: 1, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 400, color: 'text.secondary' }}>
                            {previewData.cogsJournalEntry.docNumber}
                          </Box>
                        </Typography>
                        <Box sx={{ overflowX: 'auto' }}>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableCell>Account</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell sx={{ textAlign: 'right' }}>Debit</TableCell>
                                <TableCell sx={{ textAlign: 'right' }}>Credit</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {previewData.cogsJournalEntry.lines.map((line, idx) => (
                                <TableRow key={idx}>
                                  <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                      <Box component="span">{line.accountName}</Box>
                                      {line.accountNumber ? (
                                        <Box component="span" sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>#{line.accountNumber}</Box>
                                      ) : (
                                        <Box component="span" sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>ID {line.accountId}</Box>
                                      )}
                                      {line.accountFullyQualifiedName && line.accountFullyQualifiedName !== line.accountName && (
                                        <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                          {line.accountFullyQualifiedName}
                                        </Box>
                                      )}
                                    </Box>
                                  </TableCell>
                                  <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                    {line.description}
                                  </TableCell>
                                  <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                                    {line.postingType === 'Debit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                  </TableCell>
                                  <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                                    {line.postingType === 'Credit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </Box>
                    )}

                    {/* P&L Reclass Journal Entry */}
                    {previewData.pnlJournalEntry.lines.length > 0 && (
                      <Box>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary', mb: 1 }}>
                          P&amp;L Reclass Journal Entry
                          <Box component="span" sx={{ ml: 1, fontFamily: 'monospace', fontSize: '0.75rem', fontWeight: 400, color: 'text.secondary' }}>
                            {previewData.pnlJournalEntry.docNumber}
                          </Box>
                        </Typography>
                        <Box sx={{ overflowX: 'auto' }}>
                          <Table>
                            <TableHead>
                              <TableRow>
                                <TableCell>Account</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell sx={{ textAlign: 'right' }}>Debit</TableCell>
                                <TableCell sx={{ textAlign: 'right' }}>Credit</TableCell>
                              </TableRow>
                            </TableHead>
                            <TableBody>
                              {previewData.pnlJournalEntry.lines.map((line, idx) => (
                                <TableRow key={idx}>
                                  <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                      <Box component="span">{line.accountName}</Box>
                                      {line.accountNumber ? (
                                        <Box component="span" sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>#{line.accountNumber}</Box>
                                      ) : (
                                        <Box component="span" sx={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'text.secondary' }}>ID {line.accountId}</Box>
                                      )}
                                      {line.accountFullyQualifiedName && line.accountFullyQualifiedName !== line.accountName && (
                                        <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                                          {line.accountFullyQualifiedName}
                                        </Box>
                                      )}
                                    </Box>
                                  </TableCell>
                                  <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                                    {line.description}
                                  </TableCell>
                                  <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                                    {line.postingType === 'Debit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                  </TableCell>
                                  <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                                    {line.postingType === 'Credit' ? formatMoney(line.amountCents / 100, settlement.marketplace.currency) : ''}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </Box>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            )}

          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
