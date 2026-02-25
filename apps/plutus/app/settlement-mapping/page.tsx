'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import SaveIcon from '@mui/icons-material/Save';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';

import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = {
  connected: boolean;
  error?: string;
  usingSalesTax?: boolean;
  partnerTaxEnabled?: boolean;
};
type Region = 'US' | 'UK';

type QboAccount = {
  id: string;
  fullyQualifiedName: string;
  acctNum?: string | null;
  type: string;
  active: boolean;
};

type QboTaxCode = {
  id: string;
  name: string;
  active: boolean;
  taxable: boolean;
};

type SettlementMappingResponse = {
  usSettlementBankAccountId: string | null;
  usSettlementPaymentAccountId: string | null;
  usSettlementAccountIdByMemo: Record<string, string>;
  usSettlementTaxCodeIdByMemo: Record<string, string | null>;
  ukSettlementBankAccountId: string | null;
  ukSettlementPaymentAccountId: string | null;
  ukSettlementAccountIdByMemo: Record<string, string>;
  ukSettlementTaxCodeIdByMemo: Record<string, string | null>;
};

type ImportSettlementMappingResponse = {
  success: true;
  bankAccountId: string | null;
  paymentAccountId: string | null;
  memoMappings: Record<string, string>;
  taxCodeMappings: Record<string, string | null>;
};

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAccounts(): Promise<{ accounts: QboAccount[] }> {
  const res = await fetch(`${basePath}/api/qbo/accounts`);
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ? data.error : 'Failed to fetch accounts');
  }
  const data = (await res.json()) as { accounts: Array<{ id: string; fullyQualifiedName: string; acctNum?: string | null; type: string; active: boolean }> };
  return { accounts: data.accounts };
}

async function fetchSettlementMapping(): Promise<SettlementMappingResponse> {
  const res = await fetch(`${basePath}/api/setup/settlement-mapping`);
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ? data.error : 'Failed to fetch settlement mapping');
  }
  return res.json();
}

async function fetchTaxCodes(): Promise<{ taxCodes: QboTaxCode[] }> {
  const res = await fetch(`${basePath}/api/qbo/tax-codes`);
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ? data.error : 'Failed to fetch tax codes');
  }
  const data = (await res.json()) as { taxCodes: QboTaxCode[] };
  return { taxCodes: data.taxCodes };
}

function accountLabel(account: QboAccount): string {
  return account.acctNum ? `${account.acctNum} · ${account.fullyQualifiedName}` : account.fullyQualifiedName;
}

function normalizeTaxCodeMappings(input: {
  memoMappings: Record<string, string>;
  taxCodeMappings: Record<string, string | null>;
  taxEngineEnabled: boolean;
}): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const memo of Object.keys(input.memoMappings)) {
    if (!input.taxEngineEnabled) {
      result[memo] = null;
      continue;
    }
    const raw = input.taxCodeMappings[memo];
    if (raw === null || raw === undefined) {
      result[memo] = null;
      continue;
    }
    const trimmed = raw.trim();
    result[memo] = trimmed === '' ? null : trimmed;
  }
  return result;
}

export default function SettlementMappingPage() {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { data: connectionStatus, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data: accountsData, isLoading: isLoadingAccounts } = useQuery({
    queryKey: ['qbo-accounts'],
    queryFn: fetchAccounts,
    enabled: connectionStatus?.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const { data: mappingData, isLoading: isLoadingMapping } = useQuery({
    queryKey: ['setup-settlement-mapping'],
    queryFn: fetchSettlementMapping,
    staleTime: 30 * 1000,
  });

  const taxEngineEnabled =
    connectionStatus?.usingSalesTax === true ? true : connectionStatus?.partnerTaxEnabled === true;

  const { data: taxCodesData, isLoading: isLoadingTaxCodes } = useQuery({
    queryKey: ['qbo-tax-codes'],
    queryFn: fetchTaxCodes,
    enabled: connectionStatus?.connected === true && taxEngineEnabled,
    staleTime: 5 * 60 * 1000,
  });

  type RegionState = {
    bankAccountId: string;
    paymentAccountId: string;
    memoMappings: Record<string, string>;
    taxCodeMappings: Record<string, string | null>;
  };
  const [region, setRegion] = useState<Region>('US');
  const [byRegion, setByRegion] = useState<Record<Region, RegionState>>({
    US: { bankAccountId: '', paymentAccountId: '', memoMappings: {}, taxCodeMappings: {} },
    UK: { bankAccountId: '', paymentAccountId: '', memoMappings: {}, taxCodeMappings: {} },
  });
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!mappingData) return;

    setByRegion({
      US: {
        bankAccountId: mappingData.usSettlementBankAccountId ?? '',
        paymentAccountId: mappingData.usSettlementPaymentAccountId ?? '',
        memoMappings: mappingData.usSettlementAccountIdByMemo ?? {},
        taxCodeMappings: mappingData.usSettlementTaxCodeIdByMemo ?? {},
      },
      UK: {
        bankAccountId: mappingData.ukSettlementBankAccountId ?? '',
        paymentAccountId: mappingData.ukSettlementPaymentAccountId ?? '',
        memoMappings: mappingData.ukSettlementAccountIdByMemo ?? {},
        taxCodeMappings: mappingData.ukSettlementTaxCodeIdByMemo ?? {},
      },
    });
  }, [mappingData]);

  const accounts = useMemo(() => (accountsData ? accountsData.accounts : []), [accountsData]);
  const taxCodes = useMemo(() => (taxCodesData ? taxCodesData.taxCodes : []), [taxCodesData]);

  const bankAndCardAccounts = useMemo(() => {
    return accounts.filter((a) => a.type === 'Bank' || a.type === 'Credit Card');
  }, [accounts]);

  const activeTaxCodes = useMemo(() => taxCodes.filter((taxCode) => taxCode.active), [taxCodes]);

  const active = byRegion[region];
  const bankAccountId = active.bankAccountId;
  const paymentAccountId = active.paymentAccountId;
  const memoMappings = active.memoMappings;
  const taxCodeMappings = active.taxCodeMappings;

  const memoRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return Object.entries(memoMappings)
      .filter(([memo]) => (q === '' ? true : memo.toLowerCase().includes(q)))
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [memoMappings, search]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${basePath}/api/setup/settlement-mapping`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          usSettlementBankAccountId: byRegion.US.bankAccountId.trim() === '' ? null : byRegion.US.bankAccountId.trim(),
          usSettlementPaymentAccountId: byRegion.US.paymentAccountId.trim() === '' ? null : byRegion.US.paymentAccountId.trim(),
          usSettlementAccountIdByMemo: byRegion.US.memoMappings,
          usSettlementTaxCodeIdByMemo: normalizeTaxCodeMappings({
            memoMappings: byRegion.US.memoMappings,
            taxCodeMappings: byRegion.US.taxCodeMappings,
            taxEngineEnabled,
          }),
          ukSettlementBankAccountId: byRegion.UK.bankAccountId.trim() === '' ? null : byRegion.UK.bankAccountId.trim(),
          ukSettlementPaymentAccountId: byRegion.UK.paymentAccountId.trim() === '' ? null : byRegion.UK.paymentAccountId.trim(),
          ukSettlementAccountIdByMemo: byRegion.UK.memoMappings,
          ukSettlementTaxCodeIdByMemo: normalizeTaxCodeMappings({
            memoMappings: byRegion.UK.memoMappings,
            taxCodeMappings: byRegion.UK.taxCodeMappings,
            taxEngineEnabled,
          }),
        }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data && typeof (data as any).error === 'string'
            ? (data as any).error
            : 'Failed to save settlement mapping';
        throw new Error(message);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['setup-settlement-mapping'] });
      enqueueSnackbar('Saved settlement mapping', { variant: 'success' });
    },
    onError: (error) => {
      enqueueSnackbar(error instanceof Error ? error.message : String(error), { variant: 'error' });
    },
  });

  const importMutation = useMutation({
    mutationFn: async (region: Region) => {
      const endpoint = region === 'US' ? 'us' : 'uk';
      const res = await fetch(`${basePath}/api/setup/settlement-mapping/import/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        const message =
          typeof data === 'object' && data !== null && 'error' in data && typeof (data as any).error === 'string'
            ? (data as any).error
            : 'Failed to import mapping from QBO';
        throw new Error(message);
      }
      return data as ImportSettlementMappingResponse;
    },
    onSuccess: (data, importedRegion) => {
      setByRegion((prev) => ({
        ...prev,
        [importedRegion]: {
          ...prev[importedRegion],
          bankAccountId: data.bankAccountId ?? '',
          paymentAccountId: data.paymentAccountId ?? '',
          memoMappings: data.memoMappings,
          taxCodeMappings: data.taxCodeMappings,
        },
      }));
      const memoCount = Object.keys(data.memoMappings).length;
      const taxCount = Object.keys(data.taxCodeMappings).length;
      const message = taxEngineEnabled
        ? `Imported ${memoCount} memo mappings + ${taxCount} tax mappings from QBO`
        : `Imported ${memoCount} memo mappings from QBO`;
      enqueueSnackbar(message, { variant: 'success' });
    },
    onError: (error) => {
      enqueueSnackbar(error instanceof Error ? error.message : String(error), { variant: 'error' });
    },
  });

  if (!isCheckingConnection && connectionStatus?.connected === false) {
    return <NotConnectedScreen title="Settlement Mapping" error={connectionStatus.error} />;
  }

  const isLoading =
    isCheckingConnection ||
    isLoadingAccounts ||
    isLoadingMapping ||
    (taxEngineEnabled && isLoadingTaxCodes);

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PageHeader
              title="Settlement Mapping"
              variant="accent"
            />
            <Tooltip
              title={
                <>
                  <div>1) Import while your historical US settlements still exist in QBO.</div>
                  <div style={{ marginTop: 4 }}>2) Plutus will fail if a memo is missing from the mapping (to prevent mis-posts).</div>
                  <div style={{ marginTop: 4 }}>
                    {taxEngineEnabled
                      ? '3) Tax code mapping mirrors TaxCodeRef used on historical settlement JEs (import first, then edit if needed).'
                      : '3) QBO sales tax is disabled, so settlement postings omit TaxCodeRef and tax mapping stays hidden.'}
                  </div>
                </>
              }
              arrow
            >
              <InfoOutlinedIcon sx={{ fontSize: 18, color: 'text.secondary', cursor: 'help' }} />
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <Select
                value={region}
                onChange={(e) => setRegion(e.target.value as Region)}
                sx={{ borderRadius: 2 }}
              >
                <MenuItem value="US">US</MenuItem>
                <MenuItem value="UK">UK</MenuItem>
              </Select>
            </FormControl>
            <Tooltip
              title={
                taxEngineEnabled
                  ? 'QBO sales tax is enabled. Settlement tax code mapping is available below and uses tax code names.'
                  : 'QBO sales tax is disabled for this company. Plutus posts net settlement amounts and does not apply TaxCodeRef on settlement journal lines.'
              }
              arrow
            >
              <Chip
                label={taxEngineEnabled ? 'Tax: On' : 'Tax: Off'}
                size="small"
                sx={{
                  fontWeight: 600,
                  bgcolor: taxEngineEnabled ? 'rgba(0, 194, 185, 0.1)' : 'rgba(0, 0, 0, 0.06)',
                  color: taxEngineEnabled ? '#00C2B9' : 'text.secondary',
                }}
              />
            </Tooltip>
            <Button
              variant="outlined"
              disableElevation
              onClick={() => importMutation.mutate(region)}
              disabled={importMutation.isPending || connectionStatus?.connected !== true}
              startIcon={<CloudDownloadIcon sx={{ fontSize: 16 }} />}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              {importMutation.isPending ? 'Importing…' : `Import from QBO (${region})`}
            </Button>
            <Button
              variant="contained"
              disableElevation
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
              sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#00C2B9', '&:hover': { bgcolor: '#00a89f' } }}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                {region} payout accounts
              </Typography>

              <Box sx={{ mt: 2, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#00C2B9' }}>
                      Transfer to Bank
                    </Typography>
                    <Tooltip title="The bank account that receives the settlement payout on the last segment of the journal entry." arrow>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary', cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                  <FormControl size="small" fullWidth sx={{ mt: 0.75 }}>
                    <Select
                      value={bankAccountId}
                      onChange={(e) =>
                        setByRegion((prev) => ({
                          ...prev,
                          [region]: { ...prev[region], bankAccountId: e.target.value as string },
                        }))
                      }
                      displayEmpty
                      renderValue={(sel) => {
                        if (!sel) return <span style={{ color: '#94a3b8' }}>Select bank account...</span>;
                        const found = bankAndCardAccounts.find((a) => a.id === sel);
                        return found ? accountLabel(found) : (sel as string);
                      }}
                    >
                      {bankAndCardAccounts.map((a) => (
                        <MenuItem key={a.id} value={a.id}>
                          {accountLabel(a)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>

                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#00C2B9' }}>
                      Payment to Amazon
                    </Typography>
                    <Tooltip title="The account used when Amazon deducts payment from your settlement balance." arrow>
                      <InfoOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary', cursor: 'help' }} />
                    </Tooltip>
                  </Box>
                  <FormControl size="small" fullWidth sx={{ mt: 0.75 }}>
                    <Select
                      value={paymentAccountId}
                      onChange={(e) =>
                        setByRegion((prev) => ({
                          ...prev,
                          [region]: { ...prev[region], paymentAccountId: e.target.value as string },
                        }))
                      }
                      displayEmpty
                      renderValue={(sel) => {
                        if (!sel) return <span style={{ color: '#94a3b8' }}>Select payment account...</span>;
                        const found = bankAndCardAccounts.find((a) => a.id === sel);
                        return found ? accountLabel(found) : (sel as string);
                      }}
                    >
                      {bankAndCardAccounts.map((a) => (
                        <MenuItem key={a.id} value={a.id}>
                          {accountLabel(a)}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Box>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                    {region} settlement memo → account mapping
                  </Typography>
                  <Tooltip title="Every settlement line memo must map to a QBO account. Import from QBO to mirror existing postings, then review/update existing rows if needed." arrow>
                    <InfoOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary', cursor: 'help' }} />
                  </Tooltip>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TextField
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search memos…"
                    size="small"
                    sx={{ width: 220 }}
                  />
                </Box>
              </Box>

              <Box sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'rgba(245, 245, 245, 0.8)' }}>
                    <TableRow>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                        Memo
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                        QBO account
                      </TableCell>
                      {taxEngineEnabled && (
                        <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                          Tax code
                        </TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={taxEngineEnabled ? 3 : 2} sx={{ py: 3, color: 'text.secondary' }}>
                          Loading…
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && memoRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={taxEngineEnabled ? 3 : 2} sx={{ py: 3, color: 'text.secondary' }}>
                          No memo mappings found.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      memoRows.map(([memo, accountId]) => {
                        const taxCodeId = taxCodeMappings[memo] ?? null;

                        return (
                          <TableRow key={memo} sx={{ '&:hover': { bgcolor: 'action.hover' } }}>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'text.primary' }}>
                              {memo}
                            </TableCell>
                            <TableCell>
                              <FormControl size="small" fullWidth>
                                <Select
                                  value={accountId}
                                  onChange={(e) => {
                                    const nextAccountId = e.target.value as string;
                                    setByRegion((prev) => ({
                                      ...prev,
                                      [region]: {
                                        ...prev[region],
                                        memoMappings: { ...prev[region].memoMappings, [memo]: nextAccountId },
                                      },
                                    }));
                                  }}
                                  renderValue={(sel) => {
                                    const found = accounts.find((a) => a.id === sel);
                                    return found ? accountLabel(found) : (sel as string);
                                  }}
                                >
                                  {accounts.map((a) => (
                                    <MenuItem key={a.id} value={a.id}>
                                      {accountLabel(a)}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </TableCell>
                            {taxEngineEnabled && (
                              <TableCell>
                                <FormControl size="small" fullWidth>
                                  <Select
                                    value={taxCodeId ?? ''}
                                    onChange={(e) => {
                                      const nextTaxCodeId = e.target.value as string;
                                      setByRegion((prev) => ({
                                        ...prev,
                                        [region]: {
                                          ...prev[region],
                                          taxCodeMappings: {
                                            ...prev[region].taxCodeMappings,
                                            [memo]: nextTaxCodeId === '' ? null : nextTaxCodeId,
                                          },
                                        },
                                      }));
                                    }}
                                    displayEmpty
                                    renderValue={(sel) => {
                                      if (!sel) return <span style={{ color: '#94a3b8' }}>No tax code</span>;
                                      const found = activeTaxCodes.find((taxCode) => taxCode.id === sel);
                                      return found ? found.name : (sel as string);
                                    }}
                                  >
                                    <MenuItem value="">No tax code</MenuItem>
                                    {activeTaxCodes.map((taxCode) => (
                                      <MenuItem key={taxCode.id} value={taxCode.id}>
                                        {taxCode.name}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>

        </Box>
      </Box>
    </Box>
  );
}
