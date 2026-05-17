'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import FilterListIcon from '@mui/icons-material/FilterList';
import SearchIcon from '@mui/icons-material/Search';
import Checkbox from '@mui/material/Checkbox';
import Box from '@mui/material/Box';
import MuiButton from '@mui/material/Button';
import Card from '@mui/material/Card';
import Chip from '@mui/material/Chip';
import ClickAwayListener from '@mui/material/ClickAwayListener';
import FormControlLabel from '@mui/material/FormControlLabel';
import Popper from '@mui/material/Popper';
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
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { normalizeSettlementMarketplaceQuery } from '@/lib/plutus/settlement-marketplace-query';
import { useMarketplaceStore, type Marketplace } from '@/lib/store/marketplace';
import {
  SETTLEMENT_LIST_STATUSES,
  useSettlementsListStore,
  type SettlementListStatus,
} from '@/lib/store/settlements';
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
  plutusStatus: SettlementListStatus;
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

type SettlementsResponse = {
  settlements: SettlementRow[];
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
  search,
  startDate,
  endDate,
  marketplace,
  status,
  totalMin,
  totalMax,
}: {
  page: number;
  search: string;
  startDate: string | null;
  endDate: string | null;
  marketplace: Marketplace;
  status: SettlementListStatus[];
  totalMin: string;
  totalMax: string;
}): Promise<SettlementsResponse> {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('pageSize', '25');
  if (search.trim() !== '') params.set('search', search.trim());
  if (startDate !== null && startDate.trim() !== '') params.set('startDate', startDate.trim());
  if (endDate !== null && endDate.trim() !== '') params.set('endDate', endDate.trim());
  if (marketplace !== 'all') params.set('marketplace', marketplace);
  if (status.length > 0) params.set('status', status.join(','));
  if (totalMin.trim() !== '') params.set('totalMin', totalMin.trim());
  if (totalMax.trim() !== '') params.set('totalMax', totalMax.trim());

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

/* ── shared TextField styles ── */
const textFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
  },
} as const;

const textFieldInputSlotProps = {
  input: { sx: { fontSize: '0.875rem', height: 36 } },
} as const;

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
  const queryClient = useQueryClient();
  const marketplace = useMarketplaceStore((s) => s.marketplace);
  const setMarketplace = useMarketplaceStore((s) => s.setMarketplace);
  const searchInput = useSettlementsListStore((s) => s.searchInput);
  const search = useSettlementsListStore((s) => s.search);
  const page = useSettlementsListStore((s) => s.page);
  const startDate = useSettlementsListStore((s) => s.startDate);
  const endDate = useSettlementsListStore((s) => s.endDate);
  const statusFilter = useSettlementsListStore((s) => s.statusFilter);
  const totalMin = useSettlementsListStore((s) => s.totalMin);
  const totalMax = useSettlementsListStore((s) => s.totalMax);
  const setSearchInput = useSettlementsListStore((s) => s.setSearchInput);
  const setSearch = useSettlementsListStore((s) => s.setSearch);
  const setPage = useSettlementsListStore((s) => s.setPage);
  const setStartDate = useSettlementsListStore((s) => s.setStartDate);
  const setEndDate = useSettlementsListStore((s) => s.setEndDate);
  const setStatusFilter = useSettlementsListStore((s) => s.setStatusFilter);
  const setTotalMin = useSettlementsListStore((s) => s.setTotalMin);
  const setTotalMax = useSettlementsListStore((s) => s.setTotalMax);
  const clear = useSettlementsListStore((s) => s.clear);

  const [statusAnchorEl, setStatusAnchorEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, setPage, setSearch]);

  useEffect(() => {
    const normalized = statusFilter.filter((status) =>
      (SETTLEMENT_LIST_STATUSES as readonly string[]).includes(status),
    ) as SettlementListStatus[];
    if (normalized.length !== statusFilter.length) {
      setStatusFilter(normalized);
    }
  }, [setStatusFilter, statusFilter]);

  const normalizedStartDate = startDate.trim() === '' ? null : startDate.trim();
  const normalizedEndDate = endDate.trim() === '' ? null : endDate.trim();

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: [
      'plutus-settlements',
      page,
      search,
      normalizedStartDate,
      normalizedEndDate,
      marketplace,
      statusFilter,
      totalMin,
      totalMax,
    ],
    queryFn: () =>
      fetchSettlements({
        page,
        search,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        marketplace,
        status: statusFilter,
        totalMin,
        totalMax,
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
            description="Review Amazon settlement postings in QuickBooks and their Plutus processing state."
            variant="accent"
          />
        </Box>

        <Box sx={{ mt: 3, display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-end' }}>
          <Box sx={{ flex: '1 1 22rem', display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#008f87',
              }}
            >
              Search
            </Typography>
            <Box sx={{ position: 'relative' }}>
              <SearchIcon
                sx={{
                  pointerEvents: 'none',
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 16,
                  color: 'text.disabled',
                  zIndex: 1,
                }}
              />
              <TextField
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Amazon settlement ID, posting doc number, memo…"
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

          <Box
            sx={{
              width: { xs: '100%', sm: '10rem' },
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#008f87',
              }}
            >
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

          <Box
            sx={{
              width: { xs: '100%', sm: '10rem' },
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#008f87',
              }}
            >
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

          <Box
            sx={{
              width: { xs: '100%', sm: '14rem' },
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#008f87',
              }}
            >
              Settlement Total
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <TextField
                value={totalMin}
                onChange={(e) => setTotalMin(e.target.value)}
                placeholder="Min"
                size="small"
                variant="outlined"
                fullWidth
                slotProps={textFieldInputSlotProps}
                sx={textFieldSx}
              />
              <TextField
                value={totalMax}
                onChange={(e) => setTotalMax(e.target.value)}
                placeholder="Max"
                size="small"
                variant="outlined"
                fullWidth
                slotProps={textFieldInputSlotProps}
                sx={textFieldSx}
              />
            </Box>
          </Box>

          <Box
            sx={{
              width: { xs: '100%', sm: '12rem' },
              display: 'flex',
              flexDirection: 'column',
              gap: 0.75,
            }}
          >
            <Typography
              sx={{
                fontSize: '0.625rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: '#008f87',
              }}
            >
              Plutus Processing
            </Typography>
            <Box>
              <MuiButton
                variant="outlined"
                disableElevation
                onClick={(e) => setStatusAnchorEl(statusAnchorEl ? null : e.currentTarget)}
                sx={{
                  ...outlineSx,
                  ...defaultSize,
                  width: '100%',
                  justifyContent: 'space-between',
                }}
              >
                <Box
                  component="span"
                  sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                >
                  {statusFilter.length === 0
                    ? 'All States'
                    : statusFilter.map(formatPlutusSettlementStatus).join(', ')}
                </Box>
                <Box component="span" sx={{ fontSize: 10, color: 'text.disabled', ml: 0.5 }}>
                  &#9662;
                </Box>
              </MuiButton>
              <Popper
                open={Boolean(statusAnchorEl)}
                anchorEl={statusAnchorEl}
                placement="bottom-start"
                sx={{ zIndex: 1300 }}
              >
                <ClickAwayListener onClickAway={() => setStatusAnchorEl(null)}>
                  <Card sx={{ border: 1, borderColor: 'divider', mt: 0.5, minWidth: 200, p: 1 }}>
                    {SETTLEMENT_LIST_STATUSES.map((status) => (
                      <FormControlLabel
                        key={status}
                        control={
                          <Checkbox
                            size="small"
                            checked={statusFilter.includes(status)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setStatusFilter([...statusFilter, status]);
                              } else {
                                setStatusFilter(statusFilter.filter((s) => s !== status));
                              }
                              setPage(1);
                            }}
                            sx={{ py: 0.25 }}
                          />
                        }
                        label={
                          <Typography sx={{ fontSize: '0.875rem' }}>
                            {formatPlutusSettlementStatus(status)}
                          </Typography>
                        }
                        sx={{ display: 'flex', mx: 0 }}
                      />
                    ))}
                  </Card>
                </ClickAwayListener>
              </Popper>
            </Box>
          </Box>

          <MuiButton
            variant="contained"
            disableElevation
            onClick={() => {
              setPage(1);
              queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });
            }}
            startIcon={<FilterListIcon sx={{ fontSize: 14 }} />}
            sx={{ ...defaultBtnSx, ...defaultSize }}
          >
            Filter
          </MuiButton>

          <MuiButton
            variant="outlined"
            disableElevation
            onClick={() => {
              clear();
            }}
            disabled={
              searchInput.trim() === '' &&
              startDate.trim() === '' &&
              endDate.trim() === '' &&
              statusFilter.length === 0 &&
              totalMin.trim() === '' &&
              totalMax.trim() === ''
            }
            sx={{ ...outlineSx, ...defaultSize }}
          >
            Clear
          </MuiButton>
        </Box>

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
                        description="No settlements match your current filters. Try adjusting the date range or search terms."
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
                          '& td:first-of-type': { position: 'relative' },
                          '&:hover td:first-of-type::before': {
                            content: '""',
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 3,
                            borderRadius: '0 4px 4px 0',
                            bgcolor: '#00C2B9',
                          },
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
