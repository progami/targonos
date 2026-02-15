'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import MuiButton from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import MuiTable from '@mui/material/Table';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableCell from '@mui/material/TableCell';
import MuiTableHead from '@mui/material/TableHead';
import MuiTableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { SplitButton } from '@/components/ui/split-button';
import { StatCard } from '@/components/ui/stat-card';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { useMarketplaceStore, type Marketplace } from '@/lib/store/marketplace';
import { useSettlementsListStore } from '@/lib/store/settlements';
import { selectAuditInvoiceForSettlement, type AuditInvoiceSummary } from '@/lib/plutus/audit-invoice-matching';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type SettlementRow = {
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
  plutusStatus: 'Pending' | 'Processed' | 'Blocked' | 'RolledBack';
};

type SettlementsResponse = {
  settlements: SettlementRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type ConnectionStatus = { connected: boolean; error?: string };
type AuditDataResponse = { invoices: AuditInvoiceSummary[] };
type AuditMatch = ReturnType<typeof selectAuditInvoiceForSettlement>;

/* ── shared chip styles ── */
const chipBase = { height: 22, fontSize: '0.6875rem', fontWeight: 500, borderRadius: '6px' } as const;

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

function StatusPill({ status }: { status: SettlementRow['lmbStatus'] }) {
  if (status === 'Posted')
    return (
      <Chip
        label="LMB Posted"
        size="small"
        color="success"
        variant="filled"
        sx={{ ...chipBase, bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }}
      />
    );
  return (
    <Chip
      label={`LMB ${status}`}
      size="small"
      color="default"
      variant="filled"
      sx={{ ...chipBase, bgcolor: 'action.hover', color: 'text.secondary' }}
    />
  );
}

function PlutusPill({ status }: { status: SettlementRow['plutusStatus'] }) {
  if (status === 'Processed')
    return (
      <Chip
        label="Plutus Processed"
        size="small"
        color="success"
        variant="filled"
        sx={{ ...chipBase, bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }}
      />
    );
  if (status === 'RolledBack')
    return (
      <Chip
        label="Plutus Rolled Back"
        size="small"
        color="default"
        variant="filled"
        sx={{ ...chipBase, bgcolor: 'action.hover', color: 'text.secondary' }}
      />
    );
  if (status === 'Blocked')
    return (
      <Chip
        label="Plutus Blocked"
        size="small"
        color="error"
        variant="filled"
        sx={{ ...chipBase, bgcolor: 'error.main', color: 'error.contrastText', opacity: 0.9 }}
      />
    );
  return (
    <Chip
      label="Plutus Pending"
      size="small"
      color="error"
      variant="filled"
      sx={{ ...chipBase, bgcolor: 'error.main', color: 'error.contrastText', opacity: 0.9 }}
    />
  );
}

function AuditDataPill({ match }: { match: AuditMatch | undefined }) {
  if (!match) {
    return (
      <Chip
        label="—"
        size="small"
        color="default"
        variant="outlined"
        sx={chipBase}
      />
    );
  }

  if (match.kind === 'match') {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
        <Chip
          label="Audit Ready"
          size="small"
          color="success"
          variant="filled"
          sx={{ ...chipBase, bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }}
        />
        <Box component="span" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>{match.invoiceId}</Box>
      </Box>
    );
  }

  if (match.kind === 'ambiguous') {
    const count = match.candidateInvoiceIds.length;
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
        <Chip
          label={`Multiple (${count})`}
          size="small"
          color="default"
          variant="filled"
          sx={{ ...chipBase, bgcolor: 'rgba(251, 191, 36, 0.1)', color: '#b45309' }}
        />
        <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Select in detail</Box>
      </Box>
    );
  }

  if (match.kind === 'missing_period') {
    return (
      <Chip
        label="Unknown"
        size="small"
        color="default"
        variant="outlined"
        sx={chipBase}
      />
    );
  }

  return (
    <Chip
      label="No Audit"
      size="small"
      color="default"
      variant="outlined"
      sx={chipBase}
    />
  );
}

function MarketplaceFlag({ region }: { region: 'US' | 'UK' }) {
  if (region === 'US') {
    return (
      <Box
        component="span"
        title="United States"
        sx={{
          display: 'inline-flex',
          height: 24,
          width: 24,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 99,
          bgcolor: 'rgba(59, 130, 246, 0.05)',
          fontSize: '0.75rem',
        }}
      >
        <svg style={{ height: 14, width: 14 }} viewBox="0 0 16 16" fill="none">
          <rect x="1" y="3" width="14" height="10" rx="1.5" fill="#2563eb" />
          <path d="M1 5h14M1 7h14M1 9h14M1 11h14" stroke="white" strokeWidth="0.6" />
          <rect x="1" y="3" width="6" height="5" fill="#1e40af" />
        </svg>
      </Box>
    );
  }
  return (
    <Box
      component="span"
      title="United Kingdom"
      sx={{
        display: 'inline-flex',
        height: 24,
        width: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 99,
        bgcolor: 'rgba(239, 68, 68, 0.05)',
        fontSize: '0.75rem',
      }}
    >
      <svg style={{ height: 14, width: 14 }} viewBox="0 0 16 16" fill="none">
        <rect x="1" y="3" width="14" height="10" rx="1.5" fill="#1d4ed8" />
        <path d="M1 3l14 10M15 3L1 13" stroke="white" strokeWidth="1.5" />
        <path d="M1 3l14 10M15 3L1 13" stroke="#dc2626" strokeWidth="0.8" />
        <path d="M8 3v10M1 8h14" stroke="white" strokeWidth="2.5" />
        <path d="M8 3v10M1 8h14" stroke="#dc2626" strokeWidth="1.5" />
      </svg>
    </Box>
  );
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAuditData(): Promise<AuditDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function fetchSettlements({
  page,
  search,
  startDate,
  endDate,
  marketplace,
}: {
  page: number;
  search: string;
  startDate: string | null;
  endDate: string | null;
  marketplace: Marketplace;
}): Promise<SettlementsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '25');
  if (search.trim() !== '') params.set('search', search.trim());
  if (startDate !== null && startDate.trim() !== '') params.set('startDate', startDate.trim());
  if (endDate !== null && endDate.trim() !== '') params.set('endDate', endDate.trim());
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

type AutopostCheckResult = {
  processed: Array<{ settlementId: string; docNumber: string; invoiceId: string }>;
  skipped: Array<{ settlementId: string; docNumber: string; reason: string }>;
  errors: Array<{ settlementId: string; docNumber: string; error: string }>;
};

async function runAutopostCheck(): Promise<AutopostCheckResult> {
  const res = await fetch(`${basePath}/api/plutus/autopost/check`, { method: 'POST' });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
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
  bgcolor: '#45B3D4',
  color: '#fff',
  '&:hover': { bgcolor: '#2fa3c7' },
  '&:active': { bgcolor: '#2384a1' },
} as const;

const smSize = { height: 32, px: 1.5, fontSize: '0.75rem' } as const;
const defaultSize = { height: 36, px: 2, fontSize: '0.875rem' } as const;

/* ── shared TextField styles ── */
const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#45B3D4' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
  },
} as const;

const textFieldInputSlotProps = {
  input: { sx: { fontSize: '0.875rem', height: 36 } },
} as const;

export default function SettlementsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const marketplace = useMarketplaceStore((s) => s.marketplace);
  const searchInput = useSettlementsListStore((s) => s.searchInput);
  const search = useSettlementsListStore((s) => s.search);
  const page = useSettlementsListStore((s) => s.page);
  const startDate = useSettlementsListStore((s) => s.startDate);
  const endDate = useSettlementsListStore((s) => s.endDate);
  const setSearchInput = useSettlementsListStore((s) => s.setSearchInput);
  const setSearch = useSettlementsListStore((s) => s.setSearch);
  const setPage = useSettlementsListStore((s) => s.setPage);
  const setStartDate = useSettlementsListStore((s) => s.setStartDate);
  const setEndDate = useSettlementsListStore((s) => s.setEndDate);
  const clear = useSettlementsListStore((s) => s.clear);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, setPage, setSearch]);

  const normalizedStartDate = startDate.trim() === '' ? null : startDate.trim();
  const normalizedEndDate = endDate.trim() === '' ? null : endDate.trim();

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data: auditData } = useQuery({
    queryKey: ['plutus-audit-data'],
    queryFn: fetchAuditData,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 60 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-settlements', page, search, normalizedStartDate, normalizedEndDate, marketplace],
    queryFn: () => fetchSettlements({ page, search, startDate: normalizedStartDate, endDate: normalizedEndDate, marketplace }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const settlements = useMemo(() => {
    if (!data) return [];
    return data.settlements;
  }, [data]);

  const auditInvoices = useMemo(() => auditData?.invoices ?? [], [auditData?.invoices]);

  const auditMatchBySettlementId = useMemo(() => {
    const map = new Map<string, ReturnType<typeof selectAuditInvoiceForSettlement>>();
    for (const settlement of settlements) {
      map.set(
        settlement.id,
        selectAuditInvoiceForSettlement({
          settlementMarketplace: settlement.marketplace.id,
          settlementPeriodStart: settlement.periodStart,
          settlementPeriodEnd: settlement.periodEnd,
          invoices: auditInvoices,
        }),
      );
    }
    return map;
  }, [auditInvoices, settlements]);

  // Compute KPI stats from loaded data
  const stats = useMemo(() => {
    const total = data?.pagination.totalCount ?? 0;
    const processed = settlements.filter((s) => s.plutusStatus === 'Processed').length;
    const pending = settlements.filter((s) => s.plutusStatus === 'Pending').length;
    const hasAnyTotal = settlements.some((s) => s.settlementTotal !== null);
    const totalAmount = settlements.reduce((sum, s) => sum + (s.settlementTotal ?? 0), 0);
    const primaryCurrency = settlements[0]?.marketplace.currency ?? 'USD';
    return { total, processed, pending, hasAnyTotal, totalAmount, primaryCurrency };
  }, [data, settlements]);

  const autoprocessMutation = useMutation({
    mutationFn: runAutopostCheck,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
      const processedCount = result.processed.length;
      const skippedCount = result.skipped.length;
      const errorCount = result.errors.length;

      if (processedCount > 0) {
        enqueueSnackbar(`Auto-processed ${processedCount} settlement${processedCount === 1 ? '' : 's'}`, { variant: 'success' });
      } else if (errorCount > 0) {
        enqueueSnackbar(`${errorCount} error${errorCount === 1 ? '' : 's'} during auto-processing`, { variant: 'error' });
      } else {
        enqueueSnackbar(`No settlements to auto-process (${skippedCount} skipped)`, { variant: 'info' });
      }
    },
    onError: (err) => {
      enqueueSnackbar(err instanceof Error ? err.message : 'Auto-process failed', { variant: 'error' });
    },
  });

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlements" error={connection.error} />;
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <PageHeader
            title="Settlements"
            description="Process LMB-posted settlements from QBO. Prereqs: upload Audit Data and map Bills so Plutus can compute COGS + allocate fees by brand."
            variant="accent"
          />
          <MuiButton
            variant="outlined"
            disableElevation
            onClick={() => autoprocessMutation.mutate()}
            disabled={autoprocessMutation.isPending}
            startIcon={<PlayArrowIcon sx={{ fontSize: 14 }} />}
            sx={{ ...outlineSx, ...defaultSize }}
          >
            {autoprocessMutation.isPending ? 'Processing…' : 'Auto-process'}
          </MuiButton>
        </Box>

        {/* KPI Strip */}
        {!isLoading && data && (
          <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}>
            <StatCard
              label="Total"
              value={stats.total}
              icon={
                <svg style={{ height: 20, width: 20 }} viewBox="0 0 20 20" fill="none">
                  <rect x="3" y="2" width="14" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M7 6h6M7 10h4M7 14h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              }
            />
            <StatCard
              label="Settlement Value"
              value={stats.hasAnyTotal ? formatMoney(stats.totalAmount, stats.primaryCurrency) : 'No data'}
            />
            <StatCard
              label="Processed"
              value={stats.processed}
              dotColor="bg-emerald-500"
            />
            <StatCard
              label="Pending"
              value={stats.pending}
              dotColor="bg-amber-500"
            />
          </Box>
        )}

        <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
          {/* Filter Bar */}
          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { md: '1.4fr 0.55fr 0.55fr auto' }, alignItems: { md: 'end' } }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2384a1' }}>
                    Search
                  </Typography>
                  <Box sx={{ position: 'relative' }}>
                    <SearchIcon sx={{ pointerEvents: 'none', position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'text.disabled', zIndex: 1 }} />
                    <TextField
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      placeholder="Doc number, memo…"
                      size="small"
                      variant="outlined"
                      fullWidth
                      slotProps={textFieldInputSlotProps}
                      sx={{
                        ...textFieldSx,
                        '& .MuiOutlinedInput-root': {
                          ...textFieldSx['& .MuiOutlinedInput-root'],
                          '& input': { pl: 4.5 },
                        },
                      }}
                    />
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2384a1' }}>
                    Start date
                  </Typography>
                  <TextField
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      setStartDate(value);
                      setPage(1);
                    }}
                    size="small"
                    variant="outlined"
                    fullWidth
                    slotProps={textFieldInputSlotProps}
                    sx={textFieldSx}
                  />
                </Box>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#2384a1' }}>
                    End date
                  </Typography>
                  <TextField
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      const value = e.target.value.trim();
                      setEndDate(value);
                      setPage(1);
                    }}
                    size="small"
                    variant="outlined"
                    fullWidth
                    slotProps={textFieldInputSlotProps}
                    sx={textFieldSx}
                  />
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <MuiButton
                    variant="outlined"
                    disableElevation
                    onClick={() => {
                      clear();
                    }}
                    disabled={searchInput.trim() === '' && startDate.trim() === '' && endDate.trim() === ''}
                    sx={{ ...outlineSx, ...defaultSize }}
                  >
                    Clear
                  </MuiButton>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Table */}
          <Card sx={{ border: 1, borderColor: 'divider', overflow: 'hidden' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ overflow: 'auto' }}>
                <MuiTable sx={{ width: '100%', fontSize: '0.875rem' }}>
                  <MuiTableHead
                    sx={{
                      bgcolor: 'rgba(248, 250, 252, 0.8)',
                      '[data-mui-color-scheme="dark"] &, .dark &': { bgcolor: 'rgba(255, 255, 255, 0.05)' },
                      '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
                    }}
                  >
                    <MuiTableRow sx={{ bgcolor: 'rgba(248, 250, 252, 0.8)' }}>
                      <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>Marketplace</MuiTableCell>
                      <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>Period</MuiTableCell>
                      <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>Settlement Total</MuiTableCell>
                      <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>LMB</MuiTableCell>
                      <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600 }}>Audit Data</MuiTableCell>
                      <MuiTableCell component="th" sx={{ ...thSx, fontWeight: 600, textAlign: 'right' }}>Plutus</MuiTableCell>
                    </MuiTableRow>
                  </MuiTableHead>
                  <MuiTableBody sx={{ '& .MuiTableRow-root:last-child': { borderBottom: 0 } }}>
                    {isLoading && (
                      <>
                        {Array.from({ length: 6 }).map((_, idx) => (
                          <MuiTableRow key={idx} sx={rowHoverSx}>
                            <MuiTableCell colSpan={6} sx={{ ...tdSx, py: 2 }}>
                              <Skeleton variant="rectangular" animation="pulse" sx={{ height: 40, width: '100%', bgcolor: 'action.hover', borderRadius: 1 }} />
                            </MuiTableCell>
                          </MuiTableRow>
                        ))}
                      </>
                    )}

                    {!isLoading && error && (
                      <MuiTableRow sx={rowHoverSx}>
                        <MuiTableCell colSpan={6} sx={{ ...tdSx, py: 5, textAlign: 'center', fontSize: '0.875rem', color: 'error.main' }}>
                          {error instanceof Error ? error.message : String(error)}
                        </MuiTableCell>
                      </MuiTableRow>
                    )}

                    {!isLoading && !error && settlements.length === 0 && (
                      <MuiTableRow sx={rowHoverSx}>
                        <MuiTableCell colSpan={6} sx={tdSx}>
                          <EmptyState
                            icon={<SettlementsEmptyIcon />}
                            title="No settlements found"
                            description="No settlements match your current filters. Try adjusting the date range or search terms."
                          />
                        </MuiTableCell>
                      </MuiTableRow>
                    )}

                    {!isLoading &&
                      !error &&
                      settlements.map((s) => (
                        <MuiTableRow
                          key={s.id}
                          sx={{ ...rowHoverSx, cursor: 'pointer', '& td:first-of-type': { position: 'relative' }, '&:hover td:first-of-type::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '0 4px 4px 0', bgcolor: '#45B3D4' } }}
                          onClick={() => router.push(`/settlements/${s.id}`)}
                        >
                          <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                              <MarketplaceFlag region={s.marketplace.region} />
                              <Box sx={{ minWidth: 0 }}>
                                <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.875rem', fontWeight: 500, color: 'text.primary', transition: 'color 0.15s' }}>
                                  {s.marketplace.label}
                                </Box>
                                <Box sx={{ mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
                                  {s.docNumber}
                                </Box>
                              </Box>
                            </Box>
                          </MuiTableCell>
                          <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top', fontSize: '0.875rem' }}>
                            <Box sx={{ fontWeight: 500, color: 'text.primary' }}>
                              {formatPeriod(s.periodStart, s.periodEnd)}
                            </Box>
                            <Box sx={{ mt: 0.25, fontSize: '0.875rem', color: 'text.secondary' }}>
                              Posted {new Date(`${s.postedDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                            </Box>
                          </MuiTableCell>
                          <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top', fontSize: '0.875rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'text.primary' }}>
                            {s.settlementTotal === null ? '—' : formatMoney(s.settlementTotal, s.marketplace.currency)}
                          </MuiTableCell>
                          <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top' }}>
                            <Box
                              component="a"
                              href={`https://app.qbo.intuit.com/app/journal?txnId=${s.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e: React.MouseEvent) => e.stopPropagation()}
                              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, textDecoration: 'none' }}
                            >
                              <StatusPill status={s.lmbStatus} />
                              <OpenInNewIcon sx={{ fontSize: 12, color: 'text.disabled', transition: 'color 0.15s', '&:hover': { color: 'text.secondary' } }} />
                            </Box>
                          </MuiTableCell>
                          <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top' }}>
                            <AuditDataPill match={auditMatchBySettlementId.get(s.id)} />
                          </MuiTableCell>
                          <MuiTableCell sx={{ ...tdSx, verticalAlign: 'top', textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
                              <PlutusPill status={s.plutusStatus} />
                              <SplitButton
                                onClick={() => router.push(`/settlements/${s.id}`)}
                                dropdownItems={[
                                  { label: 'LMB Settlement', onClick: () => router.push(`/settlements/${s.id}?tab=lmb-settlement`) },
                                  { label: 'Plutus Settlement', onClick: () => router.push(`/settlements/${s.id}?tab=plutus-settlement`) },
                                  { label: 'Open in QBO', onClick: () => window.open(`https://app.qbo.intuit.com/app/journal?txnId=${s.id}`, '_blank') },
                                ]}
                              >
                                Action
                              </SplitButton>
                            </Box>
                          </MuiTableCell>
                        </MuiTableRow>
                      ))}
                  </MuiTableBody>
                </MuiTable>
              </Box>

              {data && data.pagination.totalPages > 1 && (
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'center' }, justifyContent: { sm: 'space-between' }, p: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'rgba(248, 250, 252, 0.5)' }}>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    Page {data.pagination.page} of {data.pagination.totalPages} &middot; {data.pagination.totalCount} settlements
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
                    {/* Page number buttons */}
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
                      <Box component="span" sx={{ px: 0.5, fontSize: '0.75rem', color: 'text.disabled' }}>…</Box>
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
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
