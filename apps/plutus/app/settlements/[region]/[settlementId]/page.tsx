'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { BackButton } from '@/components/back-button';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { MarketplaceFlag } from '@/components/ui/marketplace-flag';
import { StatCard } from '@/components/ui/stat-card';
import { selectAuditInvoiceForSettlement, type MarketplaceId } from '@/lib/plutus/audit-invoice-matching';
import { isBlockingProcessingCode } from '@/lib/plutus/settlement-types';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; canConnect: boolean; error?: string };

type ParentSettlementDetailResponse = {
  settlement: {
    parentId: string;
    sourceSettlementId: string;
    marketplace: {
      id: 'amazon.com' | 'amazon.co.uk';
      label: 'Amazon.com' | 'Amazon.co.uk';
      currency: 'USD' | 'GBP';
      region: 'US' | 'UK';
    };
    periodStart: string | null;
    periodEnd: string | null;
    postedDate: string;
    settlementTotal: number | null;
    qboStatus: 'Posted';
    plutusStatus: 'Pending' | 'Processed' | 'RolledBack';
    splitCount: number;
    isSplit: boolean;
    childCount: number;
    hasInconsistency: boolean;
  };
  children: Array<{
    qboJournalEntryId: string;
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
    processing: null | {
      id: string;
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
  }>;
  history: Array<{
    id: string;
    timestamp: string;
    title: string;
    description: string;
    childDocNumber: string;
    kind: 'posted' | 'processed' | 'rolled_back';
  }>;
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

type ParentPreviewResponse = {
  settlement: ParentSettlementDetailResponse['settlement'];
  children: Array<{
    qboJournalEntryId: string;
    docNumber: string;
    invoiceId: string;
    sourceFilename: string;
    preview: {
      invoiceId: string;
      blocks: Array<{ code: string; message: string; details?: Record<string, string | number> }>;
      sales: Array<unknown>;
      returns: Array<unknown>;
      cogsJournalEntry: { lines: Array<unknown> };
      pnlJournalEntry: { lines: Array<unknown> };
    };
  }>;
};

type DetailTab = 'sales-fees' | 'history';

function readDetailTab(value: string | null): DetailTab {
  return value === 'history' ? 'history' : 'sales-fees';
}

function formatPeriod(start: string | null, end: string | null): string {
  if (start === null || end === null) return '—';

  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();

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

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function PlutusPill({ status }: { status: ParentSettlementDetailResponse['settlement']['plutusStatus'] }) {
  if (status === 'Processed') {
    return <Chip label="Processed" size="small" color="success" sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }} />;
  }
  if (status === 'RolledBack') {
    return <Chip label="Rolled Back" size="small" sx={{ bgcolor: 'action.hover', color: 'text.secondary' }} />;
  }
  return <Chip label="Pending" size="small" variant="outlined" sx={{ borderColor: 'rgba(34, 197, 94, 0.45)', color: 'success.dark' }} />;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAuditData(): Promise<AuditDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  return res.json();
}

async function fetchParentSettlement(region: string, settlementId: string): Promise<ParentSettlementDetailResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details ?? data.error ?? 'Failed to fetch settlement');
  }
  return data as ParentSettlementDetailResponse;
}

async function previewParentSettlement(region: string, settlementId: string, selections: Array<{ qboJournalEntryId: string; invoiceId: string }>): Promise<ParentPreviewResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selections }),
  });
  const data = await res.json();
  if (!res.ok && !data.children) {
    throw new Error(data.details ?? data.error ?? 'Failed to preview settlement');
  }
  return data as ParentPreviewResponse;
}

async function processParentSettlement(region: string, settlementId: string, selections: Array<{ qboJournalEntryId: string; invoiceId: string }>) {
  const res = await fetch(`${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ selections }),
  });
  const data = await res.json();
  return { ok: res.ok, data };
}

async function rollbackParentSettlement(region: string, settlementId: string) {
  const res = await fetch(`${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'rollback' }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details ?? data.error ?? 'Failed to rollback settlement');
  }
}

function previewHasBlockingBlocks(preview: ParentPreviewResponse): boolean {
  return preview.children.some((child) =>
    child.preview.blocks.some((block) => isBlockingProcessingCode(block.code)),
  );
}

export default function ParentSettlementDetailPage() {
  const { enqueueSnackbar } = useSnackbar();
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const region = typeof params.region === 'string' ? params.region : '';
  const settlementId = typeof params.settlementId === 'string' ? decodeURIComponent(params.settlementId) : '';

  if (region === '' || settlementId === '') {
    throw new Error('Settlement route params are required');
  }

  const [tab, setTab] = useState<DetailTab>(() => readDetailTab(searchParams.get('tab')));
  const [selectedInvoices, setSelectedInvoices] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ParentPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [repairOpen, setRepairOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['parent-settlement', region, settlementId],
    queryFn: () => fetchParentSettlement(region, settlementId),
    enabled: connection?.connected !== false,
    staleTime: 5 * 60 * 1000,
  });

  const { data: auditData } = useQuery({
    queryKey: ['plutus-audit-data'],
    queryFn: fetchAuditData,
    staleTime: 60 * 1000,
  });

  const childRecommendations = useMemo(() => {
    if (!data || !auditData) return new Map<string, string>();

    const result = new Map<string, string>();
    for (const child of data.children) {
      const match = selectAuditInvoiceForSettlement({
        settlementMarketplace: child.marketplace.id,
        settlementPeriodStart: child.periodStart,
        settlementPeriodEnd: child.periodEnd,
        settlementDocNumber: child.docNumber,
        invoices: auditData.invoices,
      });
      if (child.processing?.invoiceId) {
        result.set(child.qboJournalEntryId, child.processing.invoiceId);
        continue;
      }
      if (child.rollback?.invoiceId) {
        result.set(child.qboJournalEntryId, child.rollback.invoiceId);
        continue;
      }
      if (match.kind === 'match') {
        result.set(child.qboJournalEntryId, match.invoiceId);
      }
    }
    return result;
  }, [auditData, data]);

  useEffect(() => {
    if (!data) return;
    setSelectedInvoices((current) => {
      const next = { ...current };
      let changed = false;
      for (const child of data.children) {
        if (typeof next[child.qboJournalEntryId] === 'string' && next[child.qboJournalEntryId] !== '') continue;
        const recommended = childRecommendations.get(child.qboJournalEntryId);
        if (!recommended) continue;
        next[child.qboJournalEntryId] = recommended;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [childRecommendations, data]);

  useEffect(() => {
    const nextTab = readDetailTab(searchParams.get('tab'));
    setTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);

  const selectionPayload = useMemo(() => {
    if (!data) return [] as Array<{ qboJournalEntryId: string; invoiceId: string }>;
    return data.children.map((child) => ({
      qboJournalEntryId: child.qboJournalEntryId,
      invoiceId: selectedInvoices[child.qboJournalEntryId] ?? '',
    }));
  }, [data, selectedInvoices]);

  const missingSelections = useMemo(
    () => selectionPayload.filter((selection) => selection.invoiceId.trim() === '').map((selection) => selection.qboJournalEntryId),
    [selectionPayload],
  );

  function handleTabChange(nextTab: DetailTab) {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextTab === 'history') {
      nextParams.set('tab', 'history');
    } else {
      nextParams.delete('tab');
    }

    const query = nextParams.toString();
    router.replace(query === '' ? pathname : `${pathname}?${query}`, { scroll: false });
  }

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlement Details" canConnect={connection.canConnect} error={connection.error} />;
  }

  async function handlePreview() {
    if (missingSelections.length > 0) {
      setActionError('Select an invoice for each month-end posting before previewing.');
      return;
    }

    setActionError(null);
    setIsPreviewLoading(true);
    try {
      const nextPreview = await previewParentSettlement(region, settlementId, selectionPayload);
      setPreview(nextPreview);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleProcess() {
    if (missingSelections.length > 0) {
      setActionError('Select an invoice for each month-end posting before processing.');
      return;
    }

    setActionError(null);
    setIsProcessing(true);
    try {
      const result = await processParentSettlement(region, settlementId, selectionPayload);
      if (!result.ok) {
        if (result.data.children) {
          setPreview(result.data as ParentPreviewResponse);
          setActionError('Processing is blocked. Review the posting previews below.');
        } else {
          setActionError(result.data.details ?? result.data.error ?? 'Failed to process settlement');
        }
        return;
      }

      enqueueSnackbar('Settlement processed in Plutus', { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['parent-settlement', region, settlementId] });
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      setPreview(null);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : String(nextError));
      enqueueSnackbar('Failed to process settlement', { variant: 'error' });
    } finally {
      setIsProcessing(false);
    }
  }

  async function executeRollback() {
    setRollbackOpen(false);
    setIsRollingBack(true);
    setActionError(null);
    try {
      await rollbackParentSettlement(region, settlementId);
      enqueueSnackbar('Settlement rolled back in Plutus', { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['parent-settlement', region, settlementId] });
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      setPreview(null);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsRollingBack(false);
    }
  }

  async function executeRepair() {
    setRepairOpen(false);
    try {
      await rollbackParentSettlement(region, settlementId);
      const result = await processParentSettlement(region, settlementId, selectionPayload);
      if (!result.ok) {
        if (result.data.children) {
          setPreview(result.data as ParentPreviewResponse);
        }
        throw new Error(result.data.details ?? result.data.error ?? 'Repair failed');
      }

      enqueueSnackbar('Settlement repaired in Plutus', { variant: 'success' });
      await queryClient.invalidateQueries({ queryKey: ['parent-settlement', region, settlementId] });
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      setPreview(null);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : String(nextError));
      enqueueSnackbar('Failed to repair settlement', { variant: 'error' });
    }
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ maxWidth: '78rem', mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <BackButton />
            {data && (
              <>
                <MarketplaceFlag region={data.settlement.marketplace.region} />
                <Typography variant="h4" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {data.settlement.sourceSettlementId}
                </Typography>
                <PlutusPill status={data.settlement.plutusStatus} />
              </>
            )}
          </Box>

          {data && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {data.settlement.plutusStatus !== 'Processed' && (
                <Button variant="contained" onClick={() => void handleProcess()} disabled={isProcessing}>
                  {isProcessing
                    ? 'Processing…'
                    : data.settlement.plutusStatus === 'RolledBack'
                      ? 'Reprocess settlement'
                      : 'Process settlement'}
                </Button>
              )}
              {data.settlement.plutusStatus === 'Processed' && (
                <>
                  <Button variant="outlined" onClick={() => setRepairOpen(true)} disabled={isRollingBack || isProcessing}>
                    Repair
                  </Button>
                  <Button variant="outlined" color="error" onClick={() => setRollbackOpen(true)} disabled={isRollingBack}>
                    Rollback
                  </Button>
                </>
              )}
            </Box>
          )}
        </Box>

        {isLoading && (
          <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
            <Skeleton variant="rounded" sx={{ height: 120 }} />
            <Skeleton variant="rounded" sx={{ height: 240 }} />
          </Box>
        )}

        {!isLoading && error && (
          <Card sx={{ mt: 3, border: 1, borderColor: 'error.light' }}>
            <CardContent>
              <Typography color="error.main">{error instanceof Error ? error.message : String(error)}</Typography>
            </CardContent>
          </Card>
        )}

        {!isLoading && data && (
          <>
            <Card sx={{ mt: 3, border: 1, borderColor: data.settlement.isSplit ? 'rgba(0, 194, 185, 0.3)' : 'divider', background: data.settlement.isSplit ? 'linear-gradient(135deg, rgba(0,194,185,0.08), rgba(0,44,81,0.02))' : 'background.paper' }}>
              <CardContent sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Box sx={{ maxWidth: '48rem' }}>
                    <Typography sx={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#008f87', fontWeight: 700 }}>
                      Source settlement
                    </Typography>
                    <Typography sx={{ mt: 1, fontSize: '1.25rem', fontWeight: 700, color: 'text.primary' }}>
                      {formatPeriod(data.settlement.periodStart, data.settlement.periodEnd)}
                    </Typography>
                    <Typography sx={{ mt: 0.75, color: 'text.secondary', maxWidth: '44rem' }}>
                      {data.settlement.isSplit
                        ? `This settlement crosses month-end, so Plutus posted it as ${data.settlement.splitCount} month-end postings in QBO. The postings are shown below as accounting detail, not as separate settlements.`
                        : 'This settlement was posted as a single month-end posting in QBO.'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 1, minWidth: 220 }}>
                    <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Settlement value</Typography>
                      <Typography sx={{ mt: 0.25, fontSize: '1.1rem', fontWeight: 700 }}>
                        {data.settlement.settlementTotal === null ? '—' : formatMoney(data.settlement.settlementTotal, data.settlement.marketplace.currency)}
                      </Typography>
                    </Box>
                    <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Posted</Typography>
                      <Typography sx={{ mt: 0.25, fontSize: '0.95rem', fontWeight: 600 }}>
                        {new Date(`${data.settlement.postedDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {data.settlement.hasInconsistency && (
                  <Box sx={{ mt: 2, display: 'flex', alignItems: 'flex-start', gap: 1, borderRadius: 2, border: 1, borderColor: 'warning.light', bgcolor: 'warning.50', p: 1.5 }}>
                    <WarningAmberIcon sx={{ fontSize: 18, color: 'warning.dark', mt: 0.1 }} />
                    <Typography sx={{ fontSize: '0.875rem', color: 'warning.dark' }}>
                      Plutus found mixed child posting states inside this settlement. The UI treats that as a backend inconsistency and will not show a mixed settlement status.
                    </Typography>
                  </Box>
                )}

                {actionError && (
                  <Box sx={{ mt: 2, borderRadius: 2, border: 1, borderColor: 'error.light', bgcolor: 'error.50', p: 1.5 }}>
                    <Typography sx={{ fontSize: '0.875rem', color: 'error.dark' }}>{actionError}</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>

            <Box sx={{ mt: 3, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
              <StatCard label="Total Settlements" value={1} />
              <StatCard label="Month-end Postings" value={data.settlement.splitCount} />
              <StatCard label="Marketplace" value={data.settlement.marketplace.label} />
            </Box>

            <Box sx={{ mt: 3 }}>
              <Tabs value={tab} onChange={(_, value: DetailTab) => handleTabChange(value)} sx={{ minHeight: 42, '& .MuiTab-root': { textTransform: 'none', minHeight: 42 } }}>
                <Tab value="sales-fees" label="Sales & Fees" />
                <Tab value="history" label="History" />
              </Tabs>
            </Box>

            {tab === 'sales-fees' && (
              <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
                <Card sx={{ border: 1, borderColor: 'divider' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>Processing plan</Typography>
                        <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                          Choose the invoice for each month-end posting, then preview or process the full settlement as one parent action.
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button variant="outlined" onClick={() => void handlePreview()} disabled={isPreviewLoading}>
                          {isPreviewLoading ? 'Previewing…' : 'Preview'}
                        </Button>
                        {data.settlement.plutusStatus !== 'Processed' && (
                          <Button variant="contained" onClick={() => void handleProcess()} disabled={isProcessing}>
                            {isProcessing
                              ? 'Processing…'
                              : data.settlement.plutusStatus === 'RolledBack'
                                ? 'Reprocess settlement'
                                : 'Process settlement'}
                          </Button>
                        )}
                      </Box>
                    </Box>

                    <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
                      {data.children.map((child) => {
                        const selected = selectedInvoices[child.qboJournalEntryId] ?? '';
                        const invoiceOptions = (auditData?.invoices ?? []).filter((invoice) => invoice.marketplace === child.marketplace.id);
                        return (
                          <Box key={child.qboJournalEntryId} sx={{ display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', lg: '1.2fr 1fr' }, alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2, p: 1.5, bgcolor: 'background.paper' }}>
                            <Box>
                              <Typography sx={{ fontWeight: 600 }}>{formatPeriod(child.periodStart, child.periodEnd)}</Typography>
                              <Typography sx={{ mt: 0.35, fontSize: '0.8rem', color: 'text.secondary' }}>
                                Posting {child.docNumber}
                              </Typography>
                            </Box>
                            <Select
                              size="small"
                              value={selected}
                              onChange={(event) =>
                                setSelectedInvoices((current) => ({
                                  ...current,
                                  [child.qboJournalEntryId]: String(event.target.value),
                                }))
                              }
                              displayEmpty
                            >
                              <MenuItem value="">
                                <em>Select invoice…</em>
                              </MenuItem>
                              {invoiceOptions.map((invoice) => (
                                <MenuItem key={`${invoice.marketplace}:${invoice.invoiceId}`} value={invoice.invoiceId}>
                                  {invoice.invoiceId} · {invoice.minDate} to {invoice.maxDate}
                                </MenuItem>
                              ))}
                            </Select>
                          </Box>
                        );
                      })}
                    </Box>
                  </CardContent>
                </Card>

                {preview && (
                  <Card sx={{ border: 1, borderColor: previewHasBlockingBlocks(preview) ? 'warning.light' : 'divider' }}>
                    <CardContent sx={{ p: 3 }}>
                      <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>Preview</Typography>
                      <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                        Review the child posting previews below. Processing remains parent-level.
                      </Typography>

                      <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
                        {preview.children.map((child) => {
                          const blockingBlocks = child.preview.blocks.filter((block) => isBlockingProcessingCode(block.code));
                          const warningBlocks = child.preview.blocks.filter((block) => !isBlockingProcessingCode(block.code));
                          return (
                            <Card key={child.qboJournalEntryId} variant="outlined" sx={{ borderColor: blockingBlocks.length > 0 ? 'warning.light' : 'divider' }}>
                              <CardContent sx={{ p: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                                  <Box>
                                    <Typography sx={{ fontWeight: 700 }}>{child.docNumber}</Typography>
                                    <Typography sx={{ mt: 0.35, fontSize: '0.8rem', color: 'text.secondary' }}>
                                      Invoice {child.invoiceId}
                                    </Typography>
                                  </Box>
                                  <Chip
                                    size="small"
                                    label={blockingBlocks.length > 0 ? 'Blocked' : warningBlocks.length > 0 ? 'Ready with warnings' : 'Ready'}
                                    color={blockingBlocks.length > 0 ? 'warning' : 'success'}
                                  />
                                </Box>

                                <Box sx={{ mt: 1.5, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                                  <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Sales rows</Typography>
                                    <Typography sx={{ mt: 0.35, fontWeight: 700 }}>{child.preview.sales.length}</Typography>
                                  </Box>
                                  <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Return rows</Typography>
                                    <Typography sx={{ mt: 0.35, fontWeight: 700 }}>{child.preview.returns.length}</Typography>
                                  </Box>
                                  <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                                    <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Plutus JE lines</Typography>
                                    <Typography sx={{ mt: 0.35, fontWeight: 700 }}>
                                      {child.preview.cogsJournalEntry.lines.length + child.preview.pnlJournalEntry.lines.length}
                                    </Typography>
                                  </Box>
                                </Box>

                                {child.preview.blocks.length > 0 && (
                                  <Box sx={{ mt: 1.5, display: 'grid', gap: 0.75 }}>
                                    {child.preview.blocks.map((block, index) => (
                                      <Box key={`${child.qboJournalEntryId}:${index}`} sx={{ borderRadius: 2, border: 1, borderColor: isBlockingProcessingCode(block.code) ? 'warning.light' : 'divider', bgcolor: isBlockingProcessingCode(block.code) ? 'warning.50' : 'action.hover', p: 1 }}>
                                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>
                                          {block.code}
                                        </Typography>
                                        <Typography sx={{ mt: 0.25, fontSize: '0.8rem', color: 'text.secondary' }}>
                                          {block.message}
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Box>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </Box>
                    </CardContent>
                  </Card>
                )}

                <Card sx={{ border: 1, borderColor: 'divider' }}>
                  <CardContent sx={{ p: 3 }}>
                    <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>Month-end postings</Typography>
                    <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                      These are the internal accounting postings created for this source settlement. They stay here so the top-level settlements list remains aligned with Amazon.
                    </Typography>

                    <Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
                      {data.children.map((child) => (
                        <Card key={child.qboJournalEntryId} variant="outlined" sx={{ borderColor: child.plutusStatus === 'Processed' ? 'rgba(34,197,94,0.28)' : 'divider' }}>
                          <CardContent sx={{ p: 2.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                              <Box>
                                <Typography sx={{ fontWeight: 700 }}>{formatPeriod(child.periodStart, child.periodEnd)}</Typography>
                                <Typography sx={{ mt: 0.35, fontSize: '0.8rem', color: 'text.secondary' }}>
                                  {child.docNumber}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                <PlutusPill status={child.plutusStatus} />
                                <Button
                                  component="a"
                                  href={`https://app.qbo.intuit.com/app/journal?txnId=${child.qboJournalEntryId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  variant="text"
                                  endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
                                >
                                  Open in QBO
                                </Button>
                              </Box>
                            </Box>

                            <Box sx={{ mt: 1.5, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' } }}>
                              <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Posting total</Typography>
                                <Typography sx={{ mt: 0.35, fontWeight: 700 }}>
                                  {child.settlementTotal === null ? '—' : formatMoney(child.settlementTotal, child.marketplace.currency)}
                                </Typography>
                              </Box>
                              <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Posted date</Typography>
                                <Typography sx={{ mt: 0.35, fontWeight: 700 }}>
                                  {new Date(`${child.postedDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                                </Typography>
                              </Box>
                              <Box sx={{ borderRadius: 2, bgcolor: 'action.hover', p: 1.25 }}>
                                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Matched invoice</Typography>
                                <Typography sx={{ mt: 0.35, fontWeight: 700 }}>
                                  {child.processing?.invoiceId ?? child.rollback?.invoiceId ?? 'Not processed'}
                                </Typography>
                              </Box>
                            </Box>

                            <Box component="details" sx={{ mt: 1.5 }}>
                              <Box component="summary" sx={{ cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}>
                                Journal lines
                              </Box>
                              <Box sx={{ mt: 1.25, overflowX: 'auto' }}>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Description</TableCell>
                                      <TableCell>Account</TableCell>
                                      <TableCell align="right">Amount</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {child.lines.map((line, index) => {
                                      const signed = line.postingType === 'Debit' ? line.amount : -line.amount;
                                      return (
                                        <TableRow key={`${child.qboJournalEntryId}:${line.id ?? index}`}>
                                          <TableCell>{line.description === '' ? '—' : line.description}</TableCell>
                                          <TableCell>{line.accountFullyQualifiedName ?? line.accountName}</TableCell>
                                          <TableCell align="right">{formatMoney(signed, child.marketplace.currency)}</TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      ))}
                    </Box>
                  </CardContent>
                </Card>
              </Box>
            )}

            {tab === 'history' && (
              <Card sx={{ mt: 3, border: 1, borderColor: 'divider' }}>
                <CardContent sx={{ p: 3 }}>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 700 }}>Settlement history</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                    Timeline for the source settlement and its month-end postings.
                  </Typography>

                  <Box sx={{ mt: 2, display: 'grid', gap: 1.25 }}>
                    {data.history.map((entry) => (
                      <Box key={entry.id} sx={{ display: 'grid', gap: 0.35, borderLeft: '2px solid #00C2B9', pl: 1.5, py: 0.5 }}>
                        <Typography sx={{ fontSize: '0.875rem', fontWeight: 700 }}>{entry.title}</Typography>
                        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                          {entry.description} · {entry.childDocNumber}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: 'text.disabled' }}>{formatTimestamp(entry.timestamp)}</Typography>
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Dialog open={rollbackOpen} onClose={() => setRollbackOpen(false)}>
          <DialogTitle>Rollback settlement?</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              This will roll back all month-end postings for the settlement, not just one child posting.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRollbackOpen(false)}>Cancel</Button>
            <Button color="error" onClick={() => void executeRollback()} disabled={isRollingBack}>
              Confirm rollback
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog open={repairOpen} onClose={() => setRepairOpen(false)}>
          <DialogTitle>Repair settlement?</DialogTitle>
          <DialogContent>
            <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              This will roll back all child postings and then reprocess the full settlement using the selected invoices above.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRepairOpen(false)}>Cancel</Button>
            <Button onClick={() => void executeRepair()}>Confirm repair</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </Box>
  );
}
