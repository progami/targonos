'use client';

import { useMemo, useCallback, useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import SearchIcon from '@mui/icons-material/Search';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Skeleton from '@mui/material/Skeleton';
import MuiTab from '@mui/material/Tab';
import MuiTable from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import MuiTabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { useChartOfAccountsStore } from '@/lib/store/chart-of-accounts';

interface Account {
  id: string;
  name: string;
  type: string;
  subType?: string;
  fullyQualifiedName?: string;
  acctNum?: string;
  balance: number;
  currency: string;
  classification?: string;
  isSubAccount: boolean;
  parentName: string | null;
  depth: number;
  isFirstInGroup?: boolean;
  source: 'lmb' | 'qbo';
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

interface ConnectionStatus {
  connected: boolean;
  error?: string;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAccounts(): Promise<{ accounts: Account[]; total: number }> {
  const res = await fetch(`${basePath}/api/qbo/accounts`);
  if (!res.ok) {
    const data = await res.json();
    const message = data.error ? data.error : 'Failed to fetch accounts';
    throw new Error(message);
  }
  return res.json();
}

function RefreshSvgIcon({ sx }: { sx?: object }) {
  return (
    <Box
      component="svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      sx={{ width: 16, height: 16, ...sx }}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </Box>
  );
}

function CheckSvgIcon({ sx }: { sx?: object }) {
  return (
    <Box
      component="svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      sx={{ width: 12, height: 12, ...sx }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </Box>
  );
}

function FilterSvgIcon({ sx }: { sx?: object }) {
  return (
    <Box
      component="svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      sx={{ width: 12, height: 12, ...sx }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </Box>
  );
}

function ChevronDownSvgIcon({ sx }: { sx?: object }) {
  return (
    <Box
      component="svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      sx={{ width: 12, height: 12, ...sx }}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </Box>
  );
}

function formatCurrency(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

function ColumnFilterDropdown({
  label,
  options,
  selectedValues,
  onSelectionChange,
  isActive,
}: {
  label: string;
  options: string[];
  selectedValues: Set<string>;
  onSelectionChange: (values: Set<string>) => void;
  isActive: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (option: string) => {
    const newSelection = new Set(selectedValues);
    if (newSelection.has(option)) {
      newSelection.delete(option);
    } else {
      newSelection.add(option);
    }
    onSelectionChange(newSelection);
  };

  const selectAll = () => {
    onSelectionChange(new Set());
  };

  return (
    <Box sx={{ position: 'relative' }} ref={dropdownRef}>
      <Box
        component="button"
        onClick={() => setIsOpen(!isOpen)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.75rem',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          transition: 'color 0.15s',
          border: 'none',
          bgcolor: 'transparent',
          cursor: 'pointer',
          p: 0,
          ...(isActive
            ? { color: '#45B3D4' }
            : { color: 'text.secondary', '&:hover': { color: 'text.primary' } }),
        }}
      >
        {label}
        {isActive ? (
          <FilterSvgIcon />
        ) : (
          <ChevronDownSvgIcon />
        )}
      </Box>

      {isOpen && (
        <Box
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            mt: 1,
            zIndex: 50,
            minWidth: 200,
            maxHeight: 300,
            overflow: 'auto',
            borderRadius: 2,
            border: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            boxShadow: 3,
          }}
        >
          <Box
            sx={{
              position: 'sticky',
              top: 0,
              borderBottom: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              p: 1,
            }}
          >
            <Box
              component="button"
              onClick={selectAll}
              sx={{
                width: '100%',
                textAlign: 'left',
                px: 1,
                py: 0.75,
                fontSize: '0.875rem',
                color: '#45B3D4',
                '&:hover': { bgcolor: 'action.hover' },
                borderRadius: 1,
                border: 'none',
                bgcolor: 'transparent',
                cursor: 'pointer',
              }}
            >
              {selectedValues.size > 0 ? 'Clear filter' : 'All selected'}
            </Box>
          </Box>
          <Box sx={{ p: 0.5 }}>
            {options.map((option) => (
              <Box
                component="button"
                key={option}
                onClick={() => toggleOption(option)}
                sx={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  fontSize: '0.875rem',
                  color: 'text.primary',
                  '&:hover': { bgcolor: 'action.hover' },
                  borderRadius: 1,
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                }}
              >
                <Box
                  component="span"
                  sx={{
                    display: 'flex',
                    height: 16,
                    width: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 0.5,
                    border: 1,
                    ...(selectedValues.has(option)
                      ? { borderColor: '#45B3D4', bgcolor: '#45B3D4', color: '#fff' }
                      : { borderColor: 'divider' }),
                  }}
                >
                  {selectedValues.has(option) && <CheckSvgIcon />}
                </Box>
                <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{option}</Box>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}

export default function ChartOfAccountsPage() {
  const search = useChartOfAccountsStore((s) => s.search);
  const sourceFilter = useChartOfAccountsStore((s) => s.sourceFilter);
  const selectedTypesRaw = useChartOfAccountsStore((s) => s.selectedTypes);
  const selectedDetailTypesRaw = useChartOfAccountsStore((s) => s.selectedDetailTypes);
  const selectedCurrenciesRaw = useChartOfAccountsStore((s) => s.selectedCurrencies);
  const setSearch = useChartOfAccountsStore((s) => s.setSearch);
  const setSourceFilter = useChartOfAccountsStore((s) => s.setSourceFilter);
  const setSelectedTypesRaw = useChartOfAccountsStore((s) => s.setSelectedTypes);
  const setSelectedDetailTypesRaw = useChartOfAccountsStore((s) => s.setSelectedDetailTypes);
  const setSelectedCurrenciesRaw = useChartOfAccountsStore((s) => s.setSelectedCurrencies);
  const clearFilters = useChartOfAccountsStore((s) => s.clearFilters);

  const selectedTypes = useMemo(() => new Set(selectedTypesRaw), [selectedTypesRaw]);
  const selectedDetailTypes = useMemo(() => new Set(selectedDetailTypesRaw), [selectedDetailTypesRaw]);
  const selectedCurrencies = useMemo(() => new Set(selectedCurrenciesRaw), [selectedCurrenciesRaw]);
  const queryClient = useQueryClient();

  const { data: connectionStatus, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ['qbo-accounts-full'],
    queryFn: fetchAccounts,
    staleTime: 5 * 60 * 1000,
    enabled: connectionStatus?.connected === true,
  });

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['qbo-status'] });
    queryClient.invalidateQueries({ queryKey: ['qbo-accounts-full'] });
  }, [queryClient]);

  const accounts = useMemo(() => {
    return data ? data.accounts : [];
  }, [data]);
  const total = useMemo(() => {
    return data ? data.total : 0;
  }, [data]);

  const accountTypes = useMemo(() => {
    const types = new Set(accounts.map((a) => a.type));
    return Array.from(types).sort();
  }, [accounts]);

  const detailTypes = useMemo(() => {
    const types = new Set(accounts.map((a) => a.subType).filter(Boolean) as string[]);
    return Array.from(types).sort();
  }, [accounts]);

  const currencies = useMemo(() => {
    const curr = new Set(accounts.map((a) => a.currency));
    return Array.from(curr).sort();
  }, [accounts]);

  const sourceCounts = useMemo(() => {
    const qbo = accounts.filter((a) => a.source === 'qbo').length;
    const lmb = accounts.filter((a) => a.source === 'lmb').length;
    return { qbo, lmb, all: accounts.length };
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    return accounts.filter((account) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        account.name.toLowerCase().includes(searchLower) ||
        account.acctNum?.toLowerCase().includes(searchLower);
      const matchesSource = sourceFilter === 'all' || account.source === sourceFilter;
      const matchesType = selectedTypes.size === 0 || selectedTypes.has(account.type);
      const matchesDetailType = selectedDetailTypes.size === 0 || (account.subType && selectedDetailTypes.has(account.subType));
      const matchesCurrency = selectedCurrencies.size === 0 || selectedCurrencies.has(account.currency);
      return matchesSearch && matchesSource && matchesType && matchesDetailType && matchesCurrency;
    });
  }, [accounts, search, sourceFilter, selectedTypes, selectedDetailTypes, selectedCurrencies]);

  const activeFiltersCount = (selectedTypes.size > 0 ? 1 : 0) + (selectedDetailTypes.size > 0 ? 1 : 0) + (selectedCurrencies.size > 0 ? 1 : 0);

  if (!isCheckingConnection && connectionStatus?.connected === false) {
    return <NotConnectedScreen title="Chart of Accounts" error={connectionStatus.error} />;
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader
          title="Chart of Accounts"
          variant="accent"
          actions={
            <Button
              onClick={handleRefresh}
              variant="outlined"
              size="small"
              startIcon={
                <RefreshSvgIcon sx={isLoading ? { animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } } : {}} />
              }
              sx={{ borderColor: 'divider', color: 'text.primary' }}
            >
              Refresh
            </Button>
          }
        />

        <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
          {/* Source Tabs */}
          <MuiTabs
            value={sourceFilter}
            onChange={(_, v) => setSourceFilter(v as 'all' | 'qbo' | 'lmb')}
            sx={{
              minHeight: 40,
              bgcolor: 'action.hover',
              borderRadius: 2,
              p: 0.5,
              '& .MuiTabs-indicator': { display: 'none' },
            }}
          >
            <MuiTab
              value="all"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  All
                  <Box component="span" sx={{ ml: 0.75, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', opacity: 0.6 }}>{sourceCounts.all}</Box>
                </Box>
              }
              sx={{
                minHeight: 36,
                borderRadius: 1.5,
                '&.Mui-selected': { bgcolor: 'background.paper', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
              }}
            />
            <MuiTab
              value="qbo"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  QBO Created
                  <Box component="span" sx={{ ml: 0.75, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', opacity: 0.6 }}>{sourceCounts.qbo}</Box>
                </Box>
              }
              sx={{
                minHeight: 36,
                borderRadius: 1.5,
                '&.Mui-selected': { bgcolor: 'background.paper', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
              }}
            />
            <MuiTab
              value="lmb"
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  LMB / Plutus
                  <Box component="span" sx={{ ml: 0.75, fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', opacity: 0.6 }}>{sourceCounts.lmb}</Box>
                </Box>
              }
              sx={{
                minHeight: 36,
                borderRadius: 1.5,
                '&.Mui-selected': { bgcolor: 'background.paper', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' },
              }}
            />
          </MuiTabs>

          {/* Filter Bar */}
          <Card sx={{ borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { md: '1fr auto' }, alignItems: { md: 'end' } }}>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Typography
                    sx={{
                      fontSize: '0.625rem',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#45B3D4',
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
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search by name or number..."
                      size="small"
                      fullWidth
                      sx={{
                        '& .MuiOutlinedInput-root': {
                          '& .MuiOutlinedInput-input': {
                            pl: 4.5,
                          },
                        },
                      }}
                    />
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {/* Count */}
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {filteredAccounts.length === total
                      ? `${total} accounts`
                      : `${filteredAccounts.length} of ${total}`}
                  </Typography>
                  <Button
                    variant="outlined"
                    onClick={() => clearFilters()}
                    disabled={!search && sourceFilter === 'all' && activeFiltersCount === 0}
                    sx={{ borderColor: 'divider', color: 'text.primary' }}
                  >
                    Clear
                  </Button>
                </Box>
              </Box>
            </CardContent>
          </Card>

          {/* Table */}
          <Card sx={{ borderColor: 'divider', overflow: 'hidden' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ overflowX: 'auto' }}>
                <MuiTable>
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'rgba(248, 250, 252, 0.8)' }}>
                      <TableCell sx={{ fontWeight: 600, width: 80 }}>Code</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        <ColumnFilterDropdown
                          label="Type"
                          options={accountTypes}
                          selectedValues={selectedTypes}
                          onSelectionChange={(values) => setSelectedTypesRaw(Array.from(values))}
                          isActive={selectedTypes.size > 0}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        <ColumnFilterDropdown
                          label="Detail Type"
                          options={detailTypes}
                          selectedValues={selectedDetailTypes}
                          onSelectionChange={(values) => setSelectedDetailTypesRaw(Array.from(values))}
                          isActive={selectedDetailTypes.size > 0}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>
                        <ColumnFilterDropdown
                          label="Currency"
                          options={currencies}
                          selectedValues={selectedCurrencies}
                          onSelectionChange={(values) => setSelectedCurrenciesRaw(Array.from(values))}
                          isActive={selectedCurrencies.size > 0}
                        />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Balance</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(isLoading || isCheckingConnection) && (
                      <>
                        {Array.from({ length: 12 }).map((_, idx) => (
                          <TableRow key={idx}>
                            <TableCell colSpan={6} sx={{ py: 2 }}>
                              <Skeleton sx={{ height: 24, width: '100%' }} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}

                    {!isLoading && !isCheckingConnection && error && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ py: 5, textAlign: 'center', fontSize: '0.875rem', color: 'error.main' }}>
                          {error instanceof Error ? error.message : String(error)}
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && !isCheckingConnection && !error && filteredAccounts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <EmptyState
                            title="No accounts found"
                            description={search || activeFiltersCount > 0 ? 'No accounts match your current filters. Try adjusting the search or filters.' : 'No accounts found.'}
                          />
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      !isCheckingConnection &&
                      !error &&
                      filteredAccounts.map((account) => (
                        <TableRow key={account.id} sx={{ transition: 'background-color 0.15s', cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' }, '& td:first-of-type': { position: 'relative' }, '&:hover td:first-of-type::before': { content: '""', position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderRadius: '0 4px 4px 0', bgcolor: '#45B3D4' } }}>
                          {/* Code */}
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem', color: 'text.secondary' }}>
                            {account.acctNum ? account.acctNum : '—'}
                          </TableCell>

                          {/* Name with hierarchy indentation */}
                          <TableCell>
                            <Box
                              sx={{ display: 'flex', alignItems: 'center', minWidth: 0 }}
                              style={{ paddingLeft: `${account.depth * 20}px` }}
                              title={account.fullyQualifiedName ? account.fullyQualifiedName : account.name}
                            >
                              {account.depth > 0 && (
                                <Box
                                  component="span"
                                  sx={{
                                    mr: 0.75,
                                    color: 'divider',
                                    flexShrink: 0,
                                    userSelect: 'none',
                                    fontFamily: 'monospace',
                                    fontSize: '0.75rem',
                                  }}
                                >
                                  └
                                </Box>
                              )}
                              <Box
                                component="span"
                                sx={{
                                  fontWeight: 500,
                                  color: 'text.primary',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  fontSize: '0.875rem',
                                }}
                              >
                                {account.name}
                              </Box>
                              {account.source === 'lmb' && (
                                <Chip
                                  label="LMB"
                                  size="small"
                                  sx={{
                                    ml: 1,
                                    flexShrink: 0,
                                    fontSize: '10px',
                                    bgcolor: 'rgba(139, 92, 246, 0.1)',
                                    color: 'rgb(109, 40, 217)',
                                    border: 0,
                                  }}
                                />
                              )}
                            </Box>
                          </TableCell>

                          {/* Type */}
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {account.type}
                          </TableCell>

                          {/* Detail Type */}
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {account.subType ? account.subType : '—'}
                          </TableCell>

                          {/* Currency */}
                          <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                            {account.currency}
                          </TableCell>

                          {/* Balance */}
                          <TableCell sx={{ textAlign: 'right' }}>
                            <Box
                              component="span"
                              sx={{
                                fontFamily: 'monospace',
                                fontSize: '0.875rem',
                                fontVariantNumeric: 'tabular-nums',
                                ...(account.balance < 0
                                  ? { color: 'error.main' }
                                  : account.balance > 0
                                    ? { color: 'success.main' }
                                    : { color: 'text.disabled' }),
                              }}
                            >
                              {formatCurrency(account.balance, account.currency)}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </MuiTable>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}
