'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import DialogActions from '@mui/material/DialogActions';
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
import Typography from '@mui/material/Typography';

import { BackButton } from '@/components/back-button';
import { StatCard } from '@/components/ui/stat-card';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { selectAuditInvoiceForSettlement, type MarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { isNoopJournalEntryId, isQboJournalEntryId } from '@/lib/plutus/journal-entry-id';
import { isBlockingProcessingCode } from '@/lib/plutus/settlement-types';
import { isSettlementDocNumber, normalizeSettlementDocNumber } from '@/lib/plutus/settlement-doc-number';

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
    qboStatus: 'Posted';
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

function displaySettlementDocNumber(docNumber: string): string {
  const raw = docNumber.trim();
  if (!isSettlementDocNumber(raw)) return raw;
  return normalizeSettlementDocNumber(raw);
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

function PlutusPill({ status }: { status: SettlementDetailResponse['settlement']['plutusStatus'] }) {
  if (status === 'Processed') return <Chip label="Processed" size="small" color="success" sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }} />;
  if (status === 'RolledBack') return <Chip label="Rolled Back" size="small" sx={{ bgcolor: 'action.hover', color: 'text.secondary' }} />;
  return <Chip label="Pending" size="small" sx={{ bgcolor: 'rgba(245, 158, 11, 0.12)', color: '#b45309' }} />;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchSettlement(id: string): Promise<SettlementDetailResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${id}`);
  const data = (await res.json()) as unknown;
  if (!res.ok) {
    const payload = data as Record<string, unknown>;
    const details = typeof payload.details === 'string' ? payload.details.trim() : '';
    const error = typeof payload.error === 'string' ? payload.error.trim() : '';
    throw new Error(details !== '' ? details : error !== '' ? error : 'Failed to fetch settlement detail');
  }
  return data as SettlementDetailResponse;
}

async function fetchAuditData(): Promise<AuditDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  return res.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readApiErrorMessage(value: unknown, fallback: string): string {
  if (!isRecord(value)) return fallback;

  const details = value.details;
  if (typeof details === 'string' && details.trim() !== '') {
    return details.trim();
  }

  const error = value.error;
  if (typeof error === 'string' && error.trim() !== '') {
    return error.trim();
  }

  return fallback;
}

function isSettlementProcessingPreview(value: unknown): value is SettlementProcessingPreview {
  if (!isRecord(value)) return false;
  if (typeof value.invoiceId !== 'string') return false;
  if (typeof value.minDate !== 'string') return false;
  if (typeof value.maxDate !== 'string') return false;
  if (!Array.isArray(value.blocks)) return false;
  if (!isRecord(value.cogsJournalEntry)) return false;
  if (!isRecord(value.pnlJournalEntry)) return false;
  if (!Array.isArray(value.sales)) return false;
  if (!Array.isArray(value.returns)) return false;
  return true;
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
  const data = (await res.json()) as unknown;

  // Preview endpoint uses HTTP 400 to indicate "blocked", but still returns a valid preview payload.
  if (isSettlementProcessingPreview(data)) {
    return data;
  }

  if (!res.ok) {
    throw new Error(readApiErrorMessage(data, 'Failed to preview settlement'));
  }

  throw new Error(readApiErrorMessage(data, 'Invalid settlement preview response'));
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
  settlementDocNumber,
  periodStart,
  periodEnd,
  marketplaceId,
  defaultInvoiceId,
  onProcessed,
}: {
  settlementId: string;
  settlementDocNumber: string;
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
      settlementDocNumber,
      invoices,
    });
  }, [invoices, marketplaceId, periodEnd, periodStart, settlementDocNumber]);

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
      <Button size="small" variant="contained" sx={{ bgcolor: '#00C2B9', color: '#fff', '&:hover': { bgcolor: '#00a89f' } }} onClick={() => setOpen(true)}>Process Settlement</Button>
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
                Match an invoice, preview, then post to QBO.
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
            <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 3, mt: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>No transaction data available</Typography>
            </Box>
          )}

          {!isLoadingAuditData && invoices.length > 0 && marketplaceInvoices.length === 0 && (
            <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 3, mt: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>No invoices for {marketplaceId}</Typography>
            </Box>
          )}

          {!isLoadingAuditData && marketplaceInvoices.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
              {invoiceRecommendation.kind === 'ambiguous' && (
                <Box sx={{ borderRadius: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50', p: 1.5, fontSize: '0.875rem', color: 'warning.dark' }}>
                  Multiple invoices match this settlement period. Select the correct invoice manually.
                </Box>
              )}
              {invoiceRecommendation.kind === 'none' && (
                <Box sx={{ borderRadius: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50', p: 1.5, fontSize: '0.875rem', color: 'warning.dark' }}>
                  No invoice matches this settlement period. Sync from Amazon to refresh transaction data, or choose an invoice manually.
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
                                bgcolor: 'rgba(0, 194, 185, 0.1)',
                                px: 0.75,
                                py: 0.25,
                                fontSize: '10px',
                                fontWeight: 500,
                                color: '#008f87',
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
                      <Chip label="Recommended" size="small" sx={{ fontSize: '10px', bgcolor: 'rgba(0, 194, 185, 0.1)', color: '#008f87' }} />
                    )}
                  </Box>
                )}

                <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled', mt: 0.5 }}>
                  {marketplaceInvoices.length} invoice{marketplaceInvoices.length === 1 ? '' : 's'}
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
                    <Button variant="contained" sx={{ bgcolor: '#00C2B9', color: '#fff', '&:hover': { bgcolor: '#00a89f' } }} onClick={() => void handlePost()} disabled={isPosting}>
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
  if (tab === 'settlement') return 'sales';
  if (tab === 'qbo-settlement') return 'sales';
  if (tab === 'plutus') return 'plutus-preview';
  if (tab === 'plutus-settlement') return 'plutus-preview';
  if (tab === 'history') return 'plutus-preview';
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
  const [rollbackDialogOpen, setRollbackDialogOpen] = useState(false);
  const [rollbackDialogLines, setRollbackDialogLines] = useState<string[]>([]);

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
    enabled: connection?.connected !== false,
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
      settlementDocNumber: settlement.docNumber,
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

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlement Details" error={connection.error} />;
  }

  async function initiateRollback() {
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

    const lines: string[] = [];
    if (hasQboCogsJe || hasQboPnlJe) {
      lines.push('Void these Journal Entries in QBO first:');
      if (hasQboCogsJe) lines.push(`COGS JE: ${cogsId}`);
      if (hasQboPnlJe) lines.push(`P&L Reclass JE: ${pnlId}`);
    } else if (hasNoopJournals) {
      lines.push('No Plutus JEs were posted for this settlement (fees-only).');
    }
    lines.push('Then click Confirm to mark this settlement as Pending in Plutus.');

    setRollbackDialogLines(lines);
    setRollbackDialogOpen(true);
  }

  async function executeRollback() {
    setRollbackDialogOpen(false);
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
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BackButton />
            {settlement && (
              <>
                <Box sx={{ height: 16, width: '1px', bgcolor: 'divider', flexShrink: 0 }} />
                <Chip
                  label={settlement.marketplace.region}
                  size="small"
                  sx={{ bgcolor: 'rgba(0, 194, 185, 0.1)', color: '#008f87', fontWeight: 600, letterSpacing: '0.05em' }}
                />
                <Typography sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
                  {displaySettlementDocNumber(settlement.docNumber)}
                </Typography>
              </>
            )}
          </Box>
          {settlement && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PlutusPill status={settlement.plutusStatus} />
              {settlement.plutusStatus === 'Pending' && (
                <ProcessSettlementDialog
                  settlementId={settlementId}
                  settlementDocNumber={settlement.docNumber}
                  periodStart={settlement.periodStart}
                  periodEnd={settlement.periodEnd}
                  marketplaceId={settlement.marketplace.id}
                  defaultInvoiceId={previewInvoiceId}
                  onProcessed={() => void handleProcessed()}
                />
              )}
              {data?.processing && (
                <Button variant="outlined" size="small" sx={{ borderColor: 'divider', color: 'text.primary' }} onClick={() => void initiateRollback()} disabled={isRollingBack}>
                  {isRollingBack ? 'Rolling back...' : 'Rollback'}
                </Button>
              )}
            </Box>
          )}
        </Box>

        {/* Summary Stats */}
        {settlement ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5, mt: 2 }}>
            <StatCard
              label="Settlement"
              value={settlement.settlementTotal === null ? '—' : formatMoney(settlement.settlementTotal, settlement.marketplace.currency)}
            />
            <StatCard
              label="Period"
              value={formatPeriod(settlement.periodStart, settlement.periodEnd)}
            />
            <StatCard
              label="Posted"
              value={new Date(`${settlement.postedDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
            />
            <StatCard label="JE Lines" value={settlement.lines.length} />
          </Box>
        ) : isLoading ? (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1.5, mt: 2 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} sx={{ height: 80, borderRadius: 3 }} />
            ))}
          </Box>
        ) : null}

        {actionError && (
          <Typography sx={{ mt: 2, fontSize: '0.875rem', color: 'error.main' }}>
            {actionError}
          </Typography>
        )}

        <Card sx={{ border: 1, borderColor: 'divider', mt: 2 }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover', px: 2, py: 1.5 }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' } }}>
                <MuiTabs value={tab} onChange={handleTabChange} sx={tabsSx}>
                  <MuiTab value="sales" label="Settlement JE" sx={tabSx} />
                  {(settlement?.plutusStatus === 'Pending' || settlement?.plutusStatus === 'Processed') && (
                    <MuiTab value="plutus-preview" label="Plutus Settlement" sx={tabSx} />
                  )}
                </MuiTabs>

                {settlement?.plutusStatus === 'Pending' && marketplaceAuditInvoices.length > 0 && (
                  <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 0.75, sm: 1 }, alignItems: { sm: 'center' } }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'text.secondary' }}>Invoice</Typography>
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
                                    bgcolor: 'rgba(0, 194, 185, 0.1)',
                                    px: 0.75,
                                    py: 0.25,
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    color: '#008f87',
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
                  <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 4, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary', mb: 0.5 }}>No transaction data</Typography>
                    <Box component={Link} href="/settlements" sx={{ fontSize: '0.875rem', color: '#008f87', '&:hover': { textDecoration: 'underline' } }}>
                      Back to Settlements
                    </Box>
                  </Box>
                )}

                {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && auditData?.invoices?.length && marketplaceAuditInvoices.length === 0 && (
                  <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 4, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>No invoices for {settlement.marketplace.id}</Typography>
                  </Box>
                )}

                {settlement?.plutusStatus === 'Pending' && !isLoadingAudit && !isPreviewLoading && marketplaceAuditInvoices.length > 0 && !previewInvoiceId && (
                  <Box sx={{ borderRadius: 3, border: 1, borderStyle: 'dashed', borderColor: 'divider', bgcolor: 'background.paper', p: 4, textAlign: 'center' }}>
                    <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>Select an invoice above</Typography>
                  </Box>
                )}

                {previewError && (
                  <Box sx={{ borderRadius: 2, border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5, fontSize: '0.875rem', color: 'error.dark' }}>
                    {previewError instanceof Error ? previewError.message : String(previewError)}
                  </Box>
                )}

                {previewData && previewData.cogsJournalEntry && (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {/* QBO JE links */}
                    {data?.processing && (isQboJournalEntryId(data.processing.qboCogsJournalEntryId) || isQboJournalEntryId(data.processing.qboPnlReclassJournalEntryId)) && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
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
                      </Box>
                    )}

                    {/* Summary cards */}
                    <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' } }}>
                      <StatCard label="Sales" value={previewData.sales.length} />
                      <StatCard label="Returns" value={previewData.returns.length} />
                      <StatCard label="COGS Lines" value={previewData.cogsJournalEntry.lines.length} />
                      <StatCard label="P&L Lines" value={previewData.pnlJournalEntry.lines.length} />
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

      {/* Rollback confirmation dialog */}
      <Dialog
        open={rollbackDialogOpen}
        onClose={() => setRollbackDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}
      >
        <DialogTitle>Rollback Plutus Processing?</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {rollbackDialogLines.map((line, i) => (
            <Typography key={i} sx={{ fontSize: '0.875rem', color: i === rollbackDialogLines.length - 1 ? 'text.primary' : 'text.secondary', fontFamily: line.startsWith('COGS JE') || line.startsWith('P&L') ? 'monospace' : undefined }}>
              {line}
            </Typography>
          ))}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={() => setRollbackDialogOpen(false)}
            sx={{ borderColor: 'divider', color: 'text.primary', borderRadius: '8px', textTransform: 'none' }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={() => void executeRollback()}
            sx={{ bgcolor: 'error.main', color: 'error.contrastText', borderRadius: '8px', textTransform: 'none', '&:hover': { bgcolor: 'error.dark' } }}
          >
            Confirm Rollback
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
