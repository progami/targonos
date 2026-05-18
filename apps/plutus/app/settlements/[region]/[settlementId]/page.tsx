'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
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
  formatPlutusSettlementStatus,
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
  cogsConsumptions: Array<{
    id: string;
    settlementId: string;
    marketplace: string;
    sku: string;
    poNumber: string;
    costLayerId: string;
    qtyConsumed: number;
    unitCost: number;
    cogsAmountCents: number;
    currency: string;
    qboJournalId: string | null;
    qboDocNumber: string | null;
    txnDate: string | null;
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
      pnlJournalEntry: { lines: Array<unknown> };
    };
  }>;
};

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

function PlutusPill({
  status,
}: {
  status: ParentSettlementDetailResponse['settlement']['plutusStatus'];
}) {
  if (status === 'Processed') {
    return (
      <Chip
        label="Processed"
        size="small"
        color="success"
        sx={{ bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }}
      />
    );
  }
  if (status === 'RolledBack') {
    return (
      <Chip
        label="Rolled Back"
        size="small"
        sx={{ bgcolor: 'action.hover', color: 'text.secondary' }}
      />
    );
  }
  return (
    <Chip
      label={formatPlutusSettlementStatus(status)}
      size="small"
      variant="outlined"
      sx={{ borderColor: 'rgba(34, 197, 94, 0.45)', color: 'success.dark' }}
    />
  );
}

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Math.abs(amount));

  if (amount < 0) return `(${formatted})`;
  return formatted;
}

function formatInteger(value: number): string {
  return value.toLocaleString('en-US');
}

function SettlementCogsSection({
  rows,
  currency,
}: {
  rows: ParentSettlementDetailResponse['cogsConsumptions'];
  currency: string;
}) {
  const totalCents = rows.reduce((sum, row) => sum + row.cogsAmountCents, 0);

  return (
    <Box
      component="section"
      sx={{
        display: 'grid',
        gap: 1.5,
        py: 2,
        borderTop: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Box
        component="header"
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'grid', gap: 0.35 }}>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700 }}>FIFO COGS</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
            PO/SKU consumption support for this settlement
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', justifyItems: 'end', gap: 0.35 }}>
          <Typography
            sx={{
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'text.secondary',
            }}
          >
            COGS total
          </Typography>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 700 }}>
            {formatMoney(totalCents / 100, currency)}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Table size="small" sx={{ minWidth: 980 }}>
          <TableHead>
            <TableRow>
              <TableCell>Support Settlement</TableCell>
              <TableCell>PO</TableCell>
              <TableCell>SKU</TableCell>
              <TableCell>QBO COGS Doc</TableCell>
              <TableCell>QBO JE</TableCell>
              <TableCell align="right">Qty</TableCell>
              <TableCell align="right">Unit Cost</TableCell>
              <TableCell align="right">COGS</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8}>
                  <Typography sx={{ py: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
                    No FIFO COGS consumption rows are posted for this settlement.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.settlementId}</TableCell>
                  <TableCell>{row.poNumber}</TableCell>
                  <TableCell>{row.sku}</TableCell>
                  <TableCell>{row.qboDocNumber ?? '-'}</TableCell>
                  <TableCell>{row.qboJournalId ?? '-'}</TableCell>
                  <TableCell align="right">{formatInteger(row.qtyConsumed)}</TableCell>
                  <TableCell align="right">{formatMoney(row.unitCost, row.currency)}</TableCell>
                  <TableCell align="right">
                    {formatMoney(row.cogsAmountCents / 100, row.currency)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Box>
  );
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  const data = (await res.json()) as Partial<ConnectionStatus> & {
    error?: string;
    details?: string;
  };
  if (!res.ok) {
    return {
      connected: false,
      canConnect: false,
      error: data.details ?? data.error ?? 'Plutus API authentication failed.',
    };
  }
  if (typeof data.connected !== 'boolean' || typeof data.canConnect !== 'boolean') {
    return {
      connected: false,
      canConnect: false,
      error: 'Plutus API returned an invalid QBO status response.',
    };
  }
  return data as ConnectionStatus;
}

async function fetchParentSettlement(
  region: string,
  settlementId: string,
): Promise<ParentSettlementDetailResponse> {
  const res = await fetch(
    `${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}`,
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.details ?? data.error ?? 'Failed to fetch settlement');
  }
  return data as ParentSettlementDetailResponse;
}

async function previewParentSettlement(
  region: string,
  settlementId: string,
): Promise<ParentPreviewResponse> {
  const res = await fetch(
    `${basePath}/api/plutus/settlements/${region}/${encodeURIComponent(settlementId)}/preview`,
    {
      method: 'POST',
    },
  );
  const data = await res.json();
  if (!res.ok && !data.children) {
    throw new Error(data.details ?? data.error ?? 'Failed to preview settlement');
  }
  return data as ParentPreviewResponse;
}

export default function ParentSettlementDetailPage() {
  const params = useParams();
  const region = typeof params.region === 'string' ? params.region : '';
  const settlementId =
    typeof params.settlementId === 'string' ? decodeURIComponent(params.settlementId) : '';

  if (region === '' || settlementId === '') {
    throw new Error('Settlement route params are required');
  }

  const [preview, setPreview] = useState<ParentPreviewResponse | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
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
  const historyRows = useMemo(
    () => (data ? buildSettlementHistoryViewModel(data.history) : []),
    [data],
  );
  const unresolvedChildren = useMemo(
    () =>
      data ? data.children.filter((child) => child.invoiceResolution.status !== 'resolved') : [],
    [data],
  );

  if (!isCheckingConnection && connection?.connected === false) {
    return (
      <NotConnectedScreen
        title="Settlement Details"
        canConnect={connection.canConnect}
        error={connection.error}
      />
    );
  }

  async function handlePreview() {
    if (unresolvedChildren.length > 0) {
      setActionError(
        'Plutus could not resolve settlement support for one or more month-end postings.',
      );
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

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ maxWidth: '78rem', mx: 'auto', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box sx={{ display: 'grid', gap: 0.35 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <BackButton />
              {data && (
                <>
                  <MarketplaceFlag region={data.settlement.marketplace.region} />
                  <Typography variant="h4" sx={{ fontSize: '1.5rem', fontWeight: 700 }}>
                    {visibleSettlementId}
                  </Typography>
                  <PlutusPill
                    status={
                      settlementView ? settlementView.statusText : data.settlement.plutusStatus
                    }
                  />
                </>
              )}
            </Box>
            {data ? (
              <Typography
                sx={{ pl: { sm: '2.25rem' }, fontSize: '0.8rem', color: 'text.secondary' }}
              >
                {formatPeriod(data.settlement.periodStart, data.settlement.periodEnd)} ·{' '}
                {data.settlement.marketplace.label}
              </Typography>
            ) : null}
          </Box>

          {data && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {data.settlement.plutusStatus !== 'Processed' && (
                <Button
                  variant="outlined"
                  onClick={() => void handlePreview()}
                  disabled={isPreviewLoading || unresolvedChildren.length > 0}
                >
                  {isPreviewLoading ? 'Previewing…' : 'Preview'}
                </Button>
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
          <Box
            sx={{
              mt: 3,
              py: 1.5,
              borderTop: '1px solid',
              borderBottom: '1px solid',
              borderColor: 'error.light',
            }}
          >
            <Typography color="error.main">
              {error instanceof Error ? error.message : String(error)}
            </Typography>
          </Box>
        )}

        {!isLoading && data && (
          <Box sx={{ mt: 3, display: 'grid', gap: 1.5 }}>
            {data.settlement.isSplit ? (
              <Typography sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                {data.settlement.splitCount} month-end postings cover this settlement. Review them
                in order below.
              </Typography>
            ) : null}

            {data.settlement.hasInconsistency ? (
              <Typography color="warning.main" sx={{ fontSize: '0.8rem' }}>
                Child posting states disagree. Treat this settlement as inconsistent until the
                backend state is repaired.
              </Typography>
            ) : null}

            {unresolvedChildren.length > 0 ? (
              <Typography color="warning.main" sx={{ fontSize: '0.8rem' }}>
                Preview stays blocked until every posting resolves to settlement support.
              </Typography>
            ) : null}

            {actionError === null ? null : (
              <Typography color="error.main" sx={{ fontSize: '0.8rem' }}>
                {actionError}
              </Typography>
            )}

            <Box component="section" sx={{ display: 'grid', gap: 0.5 }}>
              <Typography
                sx={{
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'text.secondary',
                }}
              >
                Regular Settlement Posting
              </Typography>
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

            <SettlementCogsSection
              rows={data.cogsConsumptions}
              currency={data.settlement.marketplace.currency}
            />

            <Box component="section" sx={{ display: 'grid', gap: 0.5 }}>
              <Typography
                sx={{
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: 'text.secondary',
                }}
              >
                History
              </Typography>
              <SettlementHistoryList rows={historyRows} />
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
