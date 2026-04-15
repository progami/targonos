'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Skeleton from '@mui/material/Skeleton';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';

import { BackButton } from '@/components/back-button';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { SettlementHistoryList } from '@/components/settlements/settlement-history-list';
import { SettlementLedgerSection } from '@/components/settlements/settlement-ledger-section';
import { MarketplaceFlag } from '@/components/ui/marketplace-flag';
import {
  buildSettlementHistoryViewModel,
  buildSettlementListRowViewModel,
  buildSettlementPostingSectionViewModels,
} from '@/lib/plutus/settlement-review';

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
    invoiceResolution:
      | {
          status: 'resolved';
          invoiceId: string;
          source: 'processing' | 'rollback' | 'doc_number' | 'contained' | 'overlap';
        }
      | {
          status: 'unresolved';
          reason: 'missing_period' | 'none' | 'ambiguous';
          candidateInvoiceIds: string[];
        };
    invoiceResolutionMessage: string;
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

type DetailTab = 'review' | 'analysis';

function readDetailTab(value: string | null): DetailTab {
  if (value === 'analysis') return 'analysis';
  if (value === 'history') return 'analysis';
  return 'review';
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

async function fetchParentSettlement(region: string, settlementId: string): Promise<ParentSettlementDetailResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details ?? data.error ?? 'Failed to fetch settlement');
  }
  return data as ParentSettlementDetailResponse;
}

async function previewParentSettlement(region: string, settlementId: string): Promise<ParentPreviewResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}/preview`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok && !data.children) {
    throw new Error(data.details ?? data.error ?? 'Failed to preview settlement');
  }
  return data as ParentPreviewResponse;
}

async function processParentSettlement(region: string, settlementId: string) {
  const res = await fetch(`${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}/process`, {
    method: 'POST',
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
  useEffect(() => {
    const nextTab = readDetailTab(searchParams.get('tab'));
    setTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);
  const settlementView = useMemo(
    () =>
      data
        ? buildSettlementListRowViewModel({
            sourceSettlementId: data.settlement.sourceSettlementId,
            marketplace: { label: data.settlement.marketplace.label },
            periodStart: data.settlement.periodStart,
            periodEnd: data.settlement.periodEnd,
            settlementTotal: data.settlement.settlementTotal,
            plutusStatus: data.settlement.plutusStatus,
            splitCount: data.settlement.splitCount,
            isSplit: data.settlement.isSplit,
            hasInconsistency: data.settlement.hasInconsistency,
            children: data.children.map((child) => ({ docNumber: child.docNumber })),
          })
        : null,
    [data],
  );
  const visibleSettlementId = settlementView ? settlementView.title : '';
  const postingSections = useMemo(
    () =>
      data
        ? buildSettlementPostingSectionViewModels(
            {
              settlement: data.settlement,
              children: data.children,
            },
            null,
          )
        : [],
    [data],
  );
  const previewSections = useMemo(
    () =>
      data && preview
        ? buildSettlementPostingSectionViewModels(
            {
              settlement: data.settlement,
              children: data.children,
            },
            preview,
          )
        : [],
    [data, preview],
  );
  const ledgerSections = preview === null ? postingSections : previewSections;
  const childByJournalEntryId = useMemo(
    () => new Map((data?.children ?? []).map((child) => [child.qboJournalEntryId, child] as const)),
    [data],
  );
  const historyRows = useMemo(() => (data ? buildSettlementHistoryViewModel(data.history) : []), [data]);
  const unresolvedChildren = useMemo(
    () => (data ? data.children.filter((child) => child.invoiceResolution.status !== 'resolved') : []),
    [data],
  );

  function handleTabChange(nextTab: DetailTab) {
    setTab(nextTab);
    const nextParams = new URLSearchParams(searchParams.toString());
    if (nextTab === 'analysis') {
      nextParams.set('tab', 'analysis');
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
    if (unresolvedChildren.length > 0) {
      setActionError('Plutus could not resolve an audit invoice for one or more month-end postings.');
      return;
    }

    setActionError(null);
    setIsPreviewLoading(true);
    try {
      const nextPreview = await previewParentSettlement(region, settlementId);
      setPreview(nextPreview);
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handleProcess() {
    if (unresolvedChildren.length > 0) {
      setActionError('Plutus could not resolve an audit invoice for one or more month-end postings.');
      return;
    }

    setActionError(null);
    setIsProcessing(true);
    try {
      const result = await processParentSettlement(region, settlementId);
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
      const result = await processParentSettlement(region, settlementId);
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
          <Box sx={{ display: 'grid', gap: 0.35 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <BackButton />
            {data && (
              <>
                <MarketplaceFlag region={data.settlement.marketplace.region} />
                <Typography variant="h4" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                  {visibleSettlementId}
                </Typography>
                <PlutusPill status={settlementView ? settlementView.statusText : data.settlement.plutusStatus} />
              </>
            )}
            </Box>
            {data ? (
              <Typography sx={{ pl: { sm: '2.25rem' }, fontSize: '0.8rem', color: 'text.secondary' }}>
                {formatPeriod(data.settlement.periodStart, data.settlement.periodEnd)} · {data.settlement.marketplace.label}
              </Typography>
            ) : null}
          </Box>

          {data && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {data.settlement.plutusStatus !== 'Processed' && (
                <>
                  <Button variant="outlined" onClick={() => void handlePreview()} disabled={isPreviewLoading || unresolvedChildren.length > 0}>
                    {isPreviewLoading ? 'Previewing…' : 'Preview'}
                  </Button>
                  <Button variant="contained" onClick={() => void handleProcess()} disabled={isProcessing || unresolvedChildren.length > 0}>
                    {isProcessing
                      ? 'Processing…'
                      : data.settlement.plutusStatus === 'RolledBack'
                        ? 'Reprocess settlement'
                        : 'Process settlement'}
                  </Button>
                </>
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
            <Skeleton variant="rounded" sx={{ height: 96 }} />
            <Skeleton variant="rounded" sx={{ height: 320 }} />
          </Box>
        )}

        {!isLoading && error && (
          <Box sx={{ mt: 3, py: 1.5, borderTop: '1px solid', borderBottom: '1px solid', borderColor: 'error.light' }}>
            <Typography color="error.main">{error instanceof Error ? error.message : String(error)}</Typography>
          </Box>
        )}

        {!isLoading && data && (
          <Box sx={{ mt: 3, display: 'grid', gap: 2.5 }}>
            <Box sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
              <Tabs
                value={tab}
                onChange={(_, value: DetailTab) => handleTabChange(value)}
                sx={{ minHeight: 42, '& .MuiTab-root': { minHeight: 42, textTransform: 'none' } }}
              >
                <Tab value="review" label="Ledger review" />
                <Tab value="analysis" label="Analysis" />
              </Tabs>
            </Box>

            {tab === 'review' ? (
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {data.settlement.isSplit ? (
                  <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                    {data.settlement.splitCount} month-end postings cover this settlement. Review them in order below.
                  </Typography>
                ) : null}

                {data.settlement.hasInconsistency ? (
                  <Typography color="warning.main" sx={{ fontSize: '0.8rem' }}>
                    Child posting states disagree. Treat this settlement as inconsistent until the backend state is repaired.
                  </Typography>
                ) : null}

                {unresolvedChildren.length > 0 ? (
                  <Typography color="warning.main" sx={{ fontSize: '0.8rem' }}>
                    Preview and processing stay blocked until every posting resolves to one audit invoice.
                  </Typography>
                ) : null}

                {actionError === null ? null : (
                  <Typography color="error.main" sx={{ fontSize: '0.8rem' }}>
                    {actionError}
                  </Typography>
                )}

                <Box component="section" sx={{ display: 'grid', gap: 0 }}>
                  {ledgerSections.map((section) => {
                    const child = childByJournalEntryId.get(section.qboJournalEntryId);
                    if (child === undefined) {
                      throw new Error(`Missing child posting for ${section.qboJournalEntryId}`);
                    }

                    return (
                      <SettlementLedgerSection
                        key={section.qboJournalEntryId}
                        section={section}
                        currency={data.settlement.marketplace.currency}
                        lines={child.lines}
                      />
                    );
                  })}
                </Box>

                <Box component="section" sx={{ display: 'grid', gap: 0.5 }}>
                  <Typography sx={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'text.secondary' }}>
                    History
                  </Typography>
                  <SettlementHistoryList rows={historyRows} />
                </Box>
              </Box>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.75 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    {formatPeriod(data.settlement.periodStart, data.settlement.periodEnd)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    {data.settlement.marketplace.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    Posted{' '}
                    {new Date(`${data.settlement.postedDate}T00:00:00Z`).toLocaleDateString('en-US', {
                      timeZone: 'UTC',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                    Total{' '}
                    {data.settlement.settlementTotal === null
                      ? '—'
                      : formatMoney(data.settlement.settlementTotal, data.settlement.marketplace.currency)}
                  </Typography>
                </Box>
                <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
                  {data.settlement.childCount} posting{data.settlement.childCount === 1 ? '' : 's'} · {data.settlement.marketplace.region} settlement workspace
                </Typography>
              </Box>
            )}
          </Box>
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
