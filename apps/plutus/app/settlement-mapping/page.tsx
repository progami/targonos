'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSnackbar } from 'notistack';
import CloudDownloadIcon from '@mui/icons-material/CloudDownload';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; error?: string };

type QboAccount = {
  id: string;
  fullyQualifiedName: string;
  acctNum?: string | null;
  type: string;
  active: boolean;
};

type SettlementMappingResponse = {
  usSettlementBankAccountId: string | null;
  usSettlementPaymentAccountId: string | null;
  usSettlementAccountIdByMemo: Record<string, string>;
};

type ImportUsSettlementMappingResponse = {
  success: true;
  bankAccountId: string | null;
  paymentAccountId: string | null;
  memoMappings: Record<string, string>;
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

function accountLabel(account: QboAccount): string {
  return account.acctNum ? `${account.acctNum} · ${account.fullyQualifiedName}` : account.fullyQualifiedName;
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

  const [bankAccountId, setBankAccountId] = useState<string>('');
  const [paymentAccountId, setPaymentAccountId] = useState<string>('');
  const [memoMappings, setMemoMappings] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [newMemo, setNewMemo] = useState('');
  const [newAccountId, setNewAccountId] = useState('');

  useEffect(() => {
    if (!mappingData) return;

    setBankAccountId(mappingData.usSettlementBankAccountId ?? '');
    setPaymentAccountId(mappingData.usSettlementPaymentAccountId ?? '');
    setMemoMappings(mappingData.usSettlementAccountIdByMemo ?? {});
  }, [mappingData]);

  const accounts = useMemo(() => (accountsData ? accountsData.accounts : []), [accountsData]);

  const bankAndCardAccounts = useMemo(() => {
    return accounts.filter((a) => a.type === 'Bank' || a.type === 'Credit Card');
  }, [accounts]);

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
          usSettlementBankAccountId: bankAccountId.trim() === '' ? null : bankAccountId.trim(),
          usSettlementPaymentAccountId: paymentAccountId.trim() === '' ? null : paymentAccountId.trim(),
          usSettlementAccountIdByMemo: memoMappings,
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
    mutationFn: async () => {
      const res = await fetch(`${basePath}/api/setup/settlement-mapping/import/us`, {
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
      return data as ImportUsSettlementMappingResponse;
    },
    onSuccess: (data) => {
      setBankAccountId(data.bankAccountId ?? '');
      setPaymentAccountId(data.paymentAccountId ?? '');
      setMemoMappings(data.memoMappings);
      enqueueSnackbar(`Imported ${Object.keys(data.memoMappings).length} memo mappings from QBO`, { variant: 'success' });
    },
    onError: (error) => {
      enqueueSnackbar(error instanceof Error ? error.message : String(error), { variant: 'error' });
    },
  });

  const onAddMemoMapping = () => {
    const memo = newMemo.trim();
    const accountId = newAccountId.trim();
    if (memo === '' || accountId === '') return;

    if (memoMappings[memo] !== undefined) {
      enqueueSnackbar('Memo already exists in mapping', { variant: 'warning' });
      return;
    }

    setMemoMappings((prev) => ({ ...prev, [memo]: accountId }));
    setNewMemo('');
    setNewAccountId('');
  };

  const onDeleteMemoMapping = (memo: string) => {
    setMemoMappings((prev) => {
      const next = { ...prev };
      delete next[memo];
      return next;
    });
  };

  if (!isCheckingConnection && connectionStatus?.connected === false) {
    return <NotConnectedScreen title="Settlement Mapping" error={connectionStatus.error} />;
  }

  const isLoading = isCheckingConnection || isLoadingAccounts || isLoadingMapping;

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <PageHeader
            title="Settlement Mapping"
            description="Used by the US SP-API settlement sync to post journal entries that exactly match your existing QBO settlement structure."
            variant="accent"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="outlined"
              disableElevation
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || connectionStatus?.connected !== true}
              startIcon={<CloudDownloadIcon sx={{ fontSize: 16 }} />}
              sx={{ borderRadius: 2, textTransform: 'none' }}
            >
              {importMutation.isPending ? 'Importing…' : 'Import from QBO (US)'}
            </Button>
            <Button
              variant="contained"
              disableElevation
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              startIcon={<SaveIcon sx={{ fontSize: 16 }} />}
              sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#45B3D4', '&:hover': { bgcolor: '#2fa3c7' } }}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          </Box>
        </Box>

        <Box sx={{ mt: 3, display: 'grid', gap: 2 }}>
          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                US payout accounts
              </Typography>
              <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                These are used for the settlement payout line on the last segment.
              </Typography>

              <Box sx={{ mt: 2, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#45B3D4' }}>
                    Transfer to Bank
                  </Typography>
                  <FormControl size="small" fullWidth sx={{ mt: 0.75 }}>
                    <Select
                      value={bankAccountId}
                      onChange={(e) => setBankAccountId(e.target.value as string)}
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
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#45B3D4' }}>
                    Payment to Amazon
                  </Typography>
                  <FormControl size="small" fullWidth sx={{ mt: 0.75 }}>
                    <Select
                      value={paymentAccountId}
                      onChange={(e) => setPaymentAccountId(e.target.value as string)}
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
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                    US settlement memo → account mapping
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: '0.875rem', color: 'text.secondary' }}>
                    Every settlement line memo must map to a QBO account. Import from QBO to mirror existing postings, then adjust as needed.
                  </Typography>
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

              <Box sx={{ mt: 2, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr auto' }, alignItems: { md: 'end' } }}>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#45B3D4' }}>
                    Add memo
                  </Typography>
                  <TextField
                    value={newMemo}
                    onChange={(e) => setNewMemo(e.target.value)}
                    placeholder="e.g. Amazon Seller Fees - Commission"
                    size="small"
                    fullWidth
                    sx={{ mt: 0.75 }}
                  />
                </Box>

                <Box>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#45B3D4' }}>
                    Account
                  </Typography>
                  <FormControl size="small" fullWidth sx={{ mt: 0.75 }}>
                    <Select
                      value={newAccountId}
                      onChange={(e) => setNewAccountId(e.target.value as string)}
                      displayEmpty
                      renderValue={(sel) => {
                        if (!sel) return <span style={{ color: '#94a3b8' }}>Select account...</span>;
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
                </Box>

                <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                  <Button
                    variant="outlined"
                    onClick={onAddMemoMapping}
                    disabled={newMemo.trim() === '' || newAccountId.trim() === ''}
                    startIcon={<AddIcon sx={{ fontSize: 16 }} />}
                    sx={{ borderRadius: 2, textTransform: 'none', height: 40 }}
                  >
                    Add
                  </Button>
                </Box>
              </Box>

              <Box sx={{ mt: 2, border: 1, borderColor: 'divider', borderRadius: 2, overflow: 'hidden' }}>
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'rgba(248, 250, 252, 0.8)' }}>
                    <TableRow>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                        Memo
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>
                        QBO account
                      </TableCell>
                      <TableCell sx={{ width: 52 }} />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {isLoading && (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ py: 3, color: 'text.secondary' }}>
                          Loading…
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading && memoRows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} sx={{ py: 3, color: 'text.secondary' }}>
                          No memo mappings found.
                        </TableCell>
                      </TableRow>
                    )}

                    {!isLoading &&
                      memoRows.map(([memo, accountId]) => (
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
                                  setMemoMappings((prev) => ({ ...prev, [memo]: nextAccountId }));
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
                          <TableCell sx={{ textAlign: 'right' }}>
                            <IconButton
                              size="small"
                              onClick={() => onDeleteMemoMapping(memo)}
                              title="Delete"
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 18 }} />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>

          <Card sx={{ border: 1, borderColor: 'divider' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                Notes
              </Typography>
              <Box sx={{ mt: 1, display: 'grid', gap: 0.75, fontSize: '0.875rem', color: 'text.secondary' }}>
                <Box>1) Import while your historical US settlements still exist in QBO.</Box>
                <Box>2) Plutus will fail if a memo is missing from the mapping (to prevent mis-posts).</Box>
                <Box>3) This mapping does not modify QBO tax rates; taxes are handled as explicit settlement lines.</Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </Box>
  );
}

