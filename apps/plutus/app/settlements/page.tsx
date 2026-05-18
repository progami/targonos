'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Box from '@mui/material/Box';
import MuiButton from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import MuiTable from '@mui/material/Table';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableCell from '@mui/material/TableCell';
import MuiTableHead from '@mui/material/TableHead';
import MuiTableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';

import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { normalizeSettlementMarketplaceQuery } from '@/lib/plutus/settlement-marketplace-query';
import { useMarketplaceStore, type Marketplace } from '@/lib/store/marketplace';
import {
  buildSettlementListRowViewModel,
  formatPlutusSettlementStatus,
} from '@/lib/plutus/settlement-review';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type SettlementRow = {
  parentId: string;
  sourceSettlementId: string;
  postedDate: string;
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
  plutusStatus: PlutusSettlementStatus;
  splitCount: number;
  isSplit: boolean;
  childCount: number;
  hasInconsistency: boolean;
  children: Array<{
    qboJournalEntryId: string;
    docNumber: string;
    postedDate: string;
    memo: string;
  }>;
};

type PlutusSettlementStatus = 'Pending' | 'Processed' | 'RolledBack';

type SettlementCurrencyTotal = {
  currency: 'USD' | 'GBP';
  amount: number;
  count: number;
};

type SettlementsSummary = {
  totalCount: number;
  processedCount: number;
  pendingCount: number;
  rolledBackCount: number;
  inconsistencyCount: number;
  splitCount: number;
  totalsByCurrency: SettlementCurrencyTotal[];
};

type SettlementsResponse = {
  settlements: SettlementRow[];
  summary: SettlementsSummary;
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type ConnectionStatus = { connected: boolean; canConnect: boolean; error?: string };

/* ── shared chip styles ── */
const chipBase = {
  height: 22,
  fontSize: '0.6875rem',
  fontWeight: 500,
  borderRadius: '6px',
} as const;

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

function formatCount(value: number): string {
  return new Intl.NumberFormat('en-US').format(value);
}

function formatCurrencyTotals(totals: SettlementCurrencyTotal[]): string {
  if (totals.length === 0) return '—';
  return totals.map((total) => formatMoney(total.amount, total.currency)).join(' / ');
}

function SettlementOverviewCards({
  summary,
  page,
  totalPages,
  isLoading,
}: {
  summary: SettlementsSummary | null;
  page: number;
  totalPages: number;
  isLoading: boolean;
}) {
  const processed = summary?.processedCount ?? 0;
  const pending = summary?.pendingCount ?? 0;
  const rolledBack = summary?.rolledBackCount ?? 0;
  const cards = [
    {
      label: 'Settlements',
      value: summary ? formatCount(summary.totalCount) : '0',
      detail: `Page ${formatCount(page)} of ${formatCount(Math.max(totalPages, 1))}`,
    },
    {
      label: 'Settlement Total',
      value: summary ? formatCurrencyTotals(summary.totalsByCurrency) : '—',
      detail: 'QBO settlement-control amount',
    },
    {
      label: 'Plutus Processed',
      value: summary ? formatCount(processed) : '0',
      detail: `${formatCount(pending)} pending · ${formatCount(rolledBack)} rolled back`,
    },
    {
      label: 'Needs Review',
      value: summary ? formatCount(summary.inconsistencyCount) : '0',
      detail: `${formatCount(summary?.splitCount ?? 0)} split settlements`,
    },
  ];

  return (
    <Box
      sx={{
        mt: 3,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))',
        gap: 1.5,
      }}
    >
      {cards.map((card) => (
        <Box
          key={card.label}
          sx={{
            minHeight: 104,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            p: 2,
            display: 'grid',
            alignContent: 'space-between',
            gap: 1,
          }}
        >
          <Typography
            sx={{
              fontSize: '0.6875rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#008f87',
            }}
          >
            {card.label}
          </Typography>
          {isLoading ? (
            <Skeleton variant="text" sx={{ width: '65%', fontSize: '1.65rem' }} />
          ) : (
            <Typography
              sx={{
                color: 'text.primary',
                fontSize: '1.35rem',
                lineHeight: 1.2,
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                overflowWrap: 'anywhere',
              }}
            >
              {card.value}
            </Typography>
          )}
          <Typography sx={{ color: 'text.secondary', fontSize: '0.8125rem' }}>
            {card.detail}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function PlutusPill({ status }: { status: SettlementRow['plutusStatus'] }) {
  if (status === 'Processed')
    return (
      <Chip
        label="Processed"
        size="small"
        color="success"
        variant="filled"
        sx={{ ...chipBase, bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }}
      />
    );
  if (status === 'RolledBack')
    return (
      <Chip
        label="Rolled Back"
        size="small"
        color="default"
        variant="filled"
        sx={{ ...chipBase, bgcolor: 'action.hover', color: 'text.secondary' }}
      />
    );
  return (
    <Chip
      label={formatPlutusSettlementStatus(status)}
      size="small"
      variant="outlined"
      sx={{
        ...chipBase,
        borderColor: 'rgba(34, 197, 94, 0.5)',
        color: 'success.dark',
        bgcolor: 'rgba(34, 197, 94, 0.05)',
      }}
    />
  );
}

function QboPill({ status }: { status: SettlementRow['qboStatus'] }) {
  return (
    <Chip
      label={`QBO ${status}`}
      size="small"
      variant="outlined"
      sx={{
        ...chipBase,
        borderColor: 'divider',
        color: 'text.secondary',
        bgcolor: 'background.paper',
      }}
    />
  );
}

function buildParentSettlementHref(settlement: SettlementRow): string {
  return `/settlements/${settlement.marketplace.region}/${encodeURIComponent(settlement.sourceSettlementId)}`;
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

async function fetchSettlements({
  page,
  marketplace,
}: {
  page: number;
  marketplace: Marketplace;
}): Promise<SettlementsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '25');
  if (marketplace !== 'all') params.set('marketplace', marketplace);

  const res = await fetch(`${basePath}/api/plutus/settlements?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

function SettlementsEmptyIcon() {
  return (
    <svg style={{ height: 40, width: 40 }} viewBox="0 0 48 48" fill="none">
      <rect x="8" y="6" width="32" height="36" rx="4" stroke="#cbd5e1" strokeWidth="2" />
      <path d="M16 16h16M16 22h12M16 28h8" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/* ── shared table-cell styles ── */
const thSx = {
  height: 44,
  px: 1.5,
  fontSize: '0.75rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'text.secondary',
} as const;

const tdSx = {
  px: 1.5,
  py: 1.5,
  color: 'text.primary',
  fontVariantNumeric: 'tabular-nums',
} as const;

const rowHoverSx = {
  borderBottom: 1,
  borderColor: 'divider',
  transition: 'background-color 0.15s',
  '&:hover': { bgcolor: 'action.hover' },
} as const;

/* ── shared button style helpers ── */
const btnBase = {
  borderRadius: '8px',
  textTransform: 'none',
  fontWeight: 500,
  gap: 1,
  whiteSpace: 'nowrap',
  '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'none' },
  '& .MuiButton-startIcon, & .MuiButton-endIcon': { '& > *': { fontSize: 16 } },
} as const;

const outlineSx = {
  ...btnBase,
  borderColor: 'divider',
  color: 'text.primary',
  bgcolor: 'background.paper',
  '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
} as const;

const defaultBtnSx = {
  ...btnBase,
  bgcolor: '#00C2B9',
  color: '#fff',
  '&:hover': { bgcolor: '#00a89f' },
  '&:active': { bgcolor: '#008f87' },
} as const;

const smSize = { height: 32, px: 1.5, fontSize: '0.75rem' } as const;
const defaultSize = { height: 36, px: 2, fontSize: '0.875rem' } as const;

function SettlementMarketplaceQuerySync({
  setMarketplace,
  setPage,
}: {
  setMarketplace: (marketplace: Marketplace) => void;
  setPage: (page: number) => void;
}) {
  const searchParams = useSearchParams();
  const appliedQueryMarketplaceRef = useRef<string | null>(null);

  useEffect(() => {
    const queryMarketplace = searchParams.get('marketplace');
    if (appliedQueryMarketplaceRef.current === queryMarketplace) return;
    appliedQueryMarketplaceRef.current = queryMarketplace;
    const nextMarketplace = normalizeSettlementMarketplaceQuery(queryMarketplace);
    if (nextMarketplace === null) return;
    if (nextMarketplace === useMarketplaceStore.getState().marketplace) return;
    setMarketplace(nextMarketplace);
    setPage(1);
  }, [searchParams, setMarketplace, setPage]);

  return null;
}

export default function SettlementsPage() {
  const router = useRouter();
  const marketplace = useMarketplaceStore((s) => s.marketplace);
  const setMarketplace = useMarketplaceStore((s) => s.setMarketplace);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [marketplace]);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'plutus-settlements',
      page,
      marketplace,
    ],
    queryFn: () =>
      fetchSettlements({
        page,
        marketplace,
      }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const settlements = useMemo(() => {
    if (!data) return [];
    return data.settlements;
  }, [data]);

  if (!isCheckingConnection && connection?.connected === false) {
    return (
      <NotConnectedScreen
        title="Settlements"
        canConnect={connection.canConnect}
        error={connection.error}
      />
    );
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Suspense fallback={null}>
        <SettlementMarketplaceQuerySync setMarketplace={setMarketplace} setPage={setPage} />
      </Suspense>
      <Box sx={{ mx: 'auto', maxWidth: '72rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <PageHeader
            title="Settlements"
            description="Review Amazon settlement postings, payout totals, and Plutus processing state."
            variant="accent"
          />
        </Box>

        <SettlementOverviewCards
          summary={data?.summary ?? null}
          page={data?.pagination.page ?? page}
          totalPages={data?.pagination.totalPages ?? 1}
          isLoading={isLoading}
        />

        <Box sx={{ mt: 2, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <Box sx={{ overflow: 'auto' }}>
            <MuiTable sx={{ width: '100%', fontSize: '0.875rem' }}>
              <MuiTableHead
                sx={{
                  bgcolor: 'rgba(245, 245, 245, 0.8)',
                  '[data-mui-color-scheme="dark"] &, .dark &': {
                    bgcolor: 'rgba(255, 255, 255, 0.05)',
                  },
                  '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
                }}
              >
                <MuiTableRow>
                  <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>
                    Settlement
                  </MuiTableCell>
                  <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>
                    Period
                  </MuiTableCell>
                  <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>
                    Settlement Total
                  </MuiTableCell>
                  <MuiTableCell
                    component="th"
                    sx={{ ...thSx, fontWeight: 600, textAlign: 'right' }}
                  >
                    Plutus Processing
                  </MuiTableCell>
                </MuiTableRow>
              </MuiTableHead>
              <MuiTableBody sx={{ '& .MuiTableRow-root:last-child': { borderBottom: 0 } }}>
                {isLoading && (
                  <>
                    {Array.from({ length: 6 }).map((_, idx) => (
                      <MuiTableRow key={idx} sx={rowHoverSx}>
                        <MuiTableCell colSpan={4} sx={{ ...tdSx, py: 2 }}>
                          <Skeleton
                            variant="rectangular"
                            animation="pulse"
                            sx={{
                              height: 40,
                              width: '100%',
                              bgcolor: 'action.hover',
                              borderRadius: 1,
                            }}
                          />
                        </MuiTableCell>
                      </MuiTableRow>
                    ))}
                  </>
                )}

                {!isLoading && error && (
                  <MuiTableRow sx={rowHoverSx}>
                    <MuiTableCell
                      colSpan={4}
                      sx={{
                        ...tdSx,
                        py: 5,
                        textAlign: 'center',
                        fontSize: '0.875rem',
                        color: 'error.main',
                      }}
                    >
                      {error instanceof Error ? error.message : String(error)}
                    </MuiTableCell>
                  </MuiTableRow>
                )}

                {!isLoading && !error && settlements.length === 0 && (
                  <MuiTableRow sx={rowHoverSx}>
                    <MuiTableCell colSpan={4} sx={tdSx}>
                      <EmptyState
                        icon={<SettlementsEmptyIcon />}
                        title="No settlements found"
                        description="QBO has no settlement journals for the selected marketplace."
                      />
                    </MuiTableCell>
                  </MuiTableRow>
                )}

                {!isLoading &&
                  !error &&
                  settlements.map((s) => {
                    const settlementHref = buildParentSettlementHref(s);
                    const rowView = buildSettlementListRowViewModel(s);

                    return (
                      <MuiTableRow
                        key={s.parentId}
                        sx={{
                          ...rowHoverSx,
                          cursor: 'pointer',
                        }}
                        onClick={() => router.push(settlementHref)}
                      >
                        <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top' }}>
                          <Box>
                            <Typography
                              sx={{
                                fontSize: '0.875rem',
                                fontWeight: 500,
                                color: 'text.primary',
                                transition: 'color 0.15s',
                              }}
                            >
                              {rowView.title}
                            </Typography>
                            <Typography
                              sx={{ color: 'text.secondary', fontSize: '0.8125rem', mt: 0.25 }}
                            >
                              {rowView.subtitle}
                            </Typography>
                            {rowView.warningText !== null && (
                              <Typography
                                sx={{
                                  mt: 0.5,
                                  fontSize: '0.75rem',
                                  color: 'warning.dark',
                                  fontWeight: 600,
                                }}
                              >
                                {rowView.warningText}
                              </Typography>
                            )}
                          </Box>
                        </MuiTableCell>
                        <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top', fontSize: '0.875rem' }}>
                          <Box sx={{ fontWeight: 500, color: 'text.primary' }}>
                            {formatPeriod(s.periodStart, s.periodEnd)}
                          </Box>
                          <Box sx={{ mt: 0.25, fontSize: '0.875rem', color: 'text.secondary' }}>
                            Posted{' '}
                            {new Date(`${s.postedDate}T00:00:00Z`).toLocaleDateString('en-US', {
                              timeZone: 'UTC',
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </Box>
                        </MuiTableCell>
                        <MuiTableCell
                          sx={{
                            ...tdSx,
                            verticalAlign: 'top',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            color: 'text.primary',
                          }}
                        >
                          {s.settlementTotal === null
                            ? '—'
                            : formatMoney(s.settlementTotal, s.marketplace.currency)}
                        </MuiTableCell>
                        <MuiTableCell
                          sx={{ ...tdSx, verticalAlign: 'top', textAlign: 'right' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: 1,
                              flexWrap: 'wrap',
                            }}
                          >
                            <QboPill status={s.qboStatus} />
                            <PlutusPill status={rowView.statusText} />
                            <MuiButton
                              variant="contained"
                              disableElevation
                              onClick={() => router.push(settlementHref)}
                              sx={{ ...defaultBtnSx, ...defaultSize }}
                            >
                              Open
                            </MuiButton>
                          </Box>
                        </MuiTableCell>
                      </MuiTableRow>
                    );
                  })}
              </MuiTableBody>
            </MuiTable>
          </Box>

          {data && data.pagination.totalPages > 1 && (
            <Box
              sx={{
                display: 'flex',
                flexDirection: { xs: 'column', sm: 'row' },
                gap: 1.5,
                alignItems: { sm: 'center' },
                justifyContent: { sm: 'space-between' },
                p: 2,
                borderTop: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
              }}
            >
              <Typography
                sx={{
                  fontSize: '0.75rem',
                  color: 'text.secondary',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                Page {data.pagination.page} of {data.pagination.totalPages} &middot;{' '}
                {data.pagination.totalCount} settlements
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <MuiButton
                  variant="outlined"
                  disableElevation
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  sx={{ ...outlineSx, ...smSize, height: 32, width: 32, p: 0, minWidth: 32 }}
                >
                  <ChevronLeftIcon sx={{ fontSize: 16 }} />
                </MuiButton>
                {Array.from({ length: Math.min(data.pagination.totalPages, 5) }).map((_, idx) => {
                  const pageNum = idx + 1;
                  return (
                    <MuiButton
                      key={pageNum}
                      variant={page === pageNum ? 'contained' : 'outlined'}
                      disableElevation
                      onClick={() => setPage(pageNum)}
                      sx={{
                        ...(page === pageNum ? defaultBtnSx : outlineSx),
                        ...smSize,
                        height: 32,
                        width: 32,
                        p: 0,
                        minWidth: 32,
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {pageNum}
                    </MuiButton>
                  );
                })}
                {data.pagination.totalPages > 5 && (
                  <Box
                    component="span"
                    sx={{ px: 0.5, fontSize: '0.75rem', color: 'text.disabled' }}
                  >
                    …
                  </Box>
                )}
                <MuiButton
                  variant="outlined"
                  disableElevation
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                  sx={{ ...outlineSx, ...smSize, height: 32, width: 32, p: 0, minWidth: 32 }}
                >
                  <ChevronRightIcon sx={{ fontSize: 16 }} />
                </MuiButton>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
