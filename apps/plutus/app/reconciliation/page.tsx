'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import DownloadIcon from '@mui/icons-material/Download';
import FindInPageIcon from '@mui/icons-material/FindInPage';
import UploadIcon from '@mui/icons-material/Upload';
import CancelIcon from '@mui/icons-material/Cancel';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import MuiButton from '@mui/material/Button';
import MuiCard from '@mui/material/Card';
import MuiCardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import FormControl from '@mui/material/FormControl';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import MuiTable from '@mui/material/Table';
import MuiTableHead from '@mui/material/TableHead';
import MuiTableBody from '@mui/material/TableBody';
import MuiTableRow from '@mui/material/TableRow';
import MuiTableCell from '@mui/material/TableCell';

import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { StatCard } from '@/components/ui/stat-card';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ReconciliationRow = {
  orderId: string;
  date: string;
  type: string;
  amazonTotal: number;
  lmbTotal: number;
  status: 'matched' | 'discrepancy' | 'amazon-only' | 'lmb-only';
  difference: number;
};

type ReconciliationResult = {
  summary: {
    totalAmazonTransactions: number;
    totalLmbRows: number;
    matched: number;
    discrepancies: number;
    amazonOnly: number;
    lmbOnly: number;
  };
  rows: ReconciliationRow[];
};

type ConnectionStatus = { connected: boolean; error?: string };

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

function getDefaultMonth(): string {
  const now = new Date();
  // Default to previous month
  now.setMonth(now.getMonth() - 1);
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function currencyForMarketplace(marketplace: 'US' | 'UK'): 'USD' | 'GBP' {
  if (marketplace === 'UK') return 'GBP';
  return 'USD';
}

function formatCurrency(amount: number, currency: 'USD' | 'GBP'): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

function statusBadge(status: ReconciliationRow['status']) {
  switch (status) {
    case 'matched':
      return (
        <Chip
          label="Matched"
          size="small"
          color="success"
          sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 500, borderRadius: '6px', bgcolor: 'rgba(34, 197, 94, 0.1)', color: 'success.dark' }}
        />
      );
    case 'discrepancy':
      return (
        <Chip
          label="Discrepancy"
          size="small"
          color="error"
          sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 500, borderRadius: '6px', bgcolor: 'error.main', color: 'error.contrastText', opacity: 0.9 }}
        />
      );
    case 'amazon-only':
      return (
        <Chip
          label="Amazon Only"
          size="small"
          sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 500, borderRadius: '6px', bgcolor: 'action.hover', color: 'text.secondary' }}
        />
      );
    case 'lmb-only':
      return (
        <Chip
          label="Audit Only"
          size="small"
          sx={{ height: 22, fontSize: '0.6875rem', fontWeight: 500, borderRadius: '6px', bgcolor: 'action.hover', color: 'text.secondary' }}
        />
      );
  }
}

function exportToCsv(rows: ReconciliationRow[], month: string, marketplace: string) {
  const header = ['Order ID', 'Date', 'Type', 'Amazon Amount', 'Audit Amount', 'Status', 'Difference'];
  const csvRows = rows.map((r) => [
    r.orderId,
    r.date,
    r.type,
    r.amazonTotal.toFixed(2),
    r.lmbTotal.toFixed(2),
    r.status,
    r.difference.toFixed(2),
  ]);

  const csv = [header, ...csvRows].map((row) => row.map((cell) => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reconciliation-${marketplace}-${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReconciliationPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ReconciliationResult | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [month, setMonth] = useState(getDefaultMonth);
  const [marketplace, setMarketplace] = useState<'US' | 'UK'>('US');

  const currency = currencyForMarketplace(marketplace);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const handleReconcile = useCallback(async () => {
    if (!selectedFile) return;

    setIsReconciling(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.set('file', selectedFile);
    formData.set('month', month);
    formData.set('marketplace', marketplace);

    const res = await fetch(`${basePath}/api/plutus/reconciliation`, {
      method: 'POST',
      body: formData,
    });

    const json = await res.json();

    if (!res.ok) {
      setError(json.error);
      setIsReconciling(false);
      return;
    }

    setResult(json as ReconciliationResult);
    setIsReconciling(false);
  }, [selectedFile, month, marketplace]);

  const onFileSelected = useCallback((file: File) => {
    setSelectedFile(file);
    setResult(null);
    setError(null);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) onFileSelected(file);
    },
    [onFileSelected],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) onFileSelected(file);
      e.target.value = '';
    },
    [onFileSelected],
  );

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Reconciliation" error={connection.error} />;
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader
          title="Reconciliation"
          description="Optional: compare an Amazon Seller Central Date Range Transaction Report against stored audit data"
          variant="accent"
        />

        {/* Instructions */}
        <MuiCard sx={{ mt: 3, borderColor: 'rgba(203,213,225,0.7)' }}>
          <MuiCardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>How it works</Typography>
            <Box sx={{ mt: 2, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' } }}>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box sx={{ display: 'flex', height: 28, width: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 99, bgcolor: 'rgba(69, 179, 212, 0.08)', fontSize: '0.75rem', fontWeight: 700, color: '#2384a1' }}>
                  1
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Download your report</Typography>
                  <Typography sx={{ mt: 0.25, fontSize: '0.75rem', color: 'text.secondary' }}>
                    Export the Date Range Transaction Report from Amazon Seller Central (this is not required for settlement processing)
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box sx={{ display: 'flex', height: 28, width: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 99, bgcolor: 'rgba(69, 179, 212, 0.08)', fontSize: '0.75rem', fontWeight: 700, color: '#2384a1' }}>
                  2
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Select month and marketplace</Typography>
                  <Typography sx={{ mt: 0.25, fontSize: '0.75rem', color: 'text.secondary' }}>
                    Choose the period and marketplace to reconcile
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Box sx={{ display: 'flex', height: 28, width: 28, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 99, bgcolor: 'rgba(69, 179, 212, 0.08)', fontSize: '0.75rem', fontWeight: 700, color: '#2384a1' }}>
                  3
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Upload and reconcile</Typography>
                  <Typography sx={{ mt: 0.25, fontSize: '0.75rem', color: 'text.secondary' }}>
                    Compare Amazon order totals against your stored audit data
                  </Typography>
                </Box>
              </Box>
            </Box>
          </MuiCardContent>
        </MuiCard>

        {/* Upload Form */}
        <MuiCard sx={{ mt: 3, borderColor: 'rgba(203,213,225,0.7)' }}>
          <MuiCardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' } }}>
              <Box>
                <Box component="label" htmlFor="month-input" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
                  Month
                </Box>
                <TextField
                  id="month-input"
                  type="month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  size="small"
                  variant="outlined"
                  fullWidth
                  slotProps={{
                    input: {
                      sx: {
                        fontSize: '0.875rem',
                        height: 36,
                      },
                    },
                  }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#45B3D4',
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#00C2B9',
                        borderWidth: 2,
                      },
                    },
                  }}
                />
              </Box>
              <Box>
                <Box component="label" sx={{ display: 'block', mb: 0.75, fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Marketplace</Box>
                <FormControl size="small" fullWidth>
                  <MuiSelect
                    value={marketplace}
                    onChange={(e) => setMarketplace(e.target.value as 'US' | 'UK')}
                    displayEmpty
                    renderValue={(selected) => {
                      if (!selected) return <span style={{ color: '#94a3b8' }}>Select</span>;
                      return selected;
                    }}
                    sx={{
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: 'divider',
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#45B3D4',
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: '#00C2B9',
                        borderWidth: 2,
                      },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          borderRadius: 3,
                          border: 1,
                          borderColor: 'divider',
                          boxShadow: '0 4px 16px -4px rgba(0, 0, 0, 0.12), 0 8px 24px -8px rgba(0, 0, 0, 0.08)',
                          mt: 0.5,
                        },
                      },
                    }}
                  >
                    <MenuItem value="US" sx={{ borderRadius: 2, mx: 0.5, fontSize: '0.875rem' }}>US - Amazon.com</MenuItem>
                    <MenuItem value="UK" sx={{ borderRadius: 2, mx: 0.5, fontSize: '0.875rem' }}>UK - Amazon.co.uk</MenuItem>
                  </MuiSelect>
                </FormControl>
              </Box>
            </Box>

            {/* Drop Zone */}
            <Box
              sx={{
                position: 'relative',
                mt: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 3,
                border: '2px dashed',
                borderColor: isDragging ? '#45B3D4' : 'divider',
                bgcolor: isDragging ? 'rgba(69, 179, 212, 0.04)' : 'transparent',
                px: 3,
                py: 5,
                transition: 'all 0.2s',
                '&:hover': {
                  borderColor: '#45B3D4',
                },
              }}
              onDragOver={(e: React.DragEvent) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <input ref={fileInputRef} type="file" accept=".csv" onChange={onFileChange} style={{ display: 'none' }} />

              {selectedFile ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ display: 'flex', height: 48, width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 3, bgcolor: 'rgba(16, 185, 129, 0.08)', color: '#059669' }}>
                    <CheckCircleOutlineIcon sx={{ fontSize: 24 }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{selectedFile.name}</Typography>
                  <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{(selectedFile.size / 1024).toFixed(1)} KB</Typography>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    sx={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 500, color: '#2384a1', '&:hover': { color: '#1a6b82' } }}
                  >
                    Choose a different file
                  </Box>
                </Box>
              ) : (
                <>
                  <Box sx={{ mb: 1.5, display: 'flex', height: 48, width: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 3, bgcolor: 'rgba(69, 179, 212, 0.08)', color: '#2384a1' }}>
                    <UploadIcon sx={{ fontSize: 24 }} />
                  </Box>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
                    Drop your Amazon Transaction Report here
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                    CSV format, Date Range Transaction Report from Seller Central
                  </Typography>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    sx={{
                      mt: 1.5,
                      borderRadius: 2,
                      bgcolor: '#45B3D4',
                      px: 2,
                      py: 1,
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: '#fff',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: 1,
                      transition: 'background-color 0.2s',
                      '&:hover': { bgcolor: '#2fa3c7' },
                    }}
                  >
                    Choose File
                  </Box>
                </>
              )}
            </Box>

            {/* Reconcile Button */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <MuiButton
                variant="contained"
                disableElevation
                onClick={handleReconcile}
                disabled={!selectedFile || isReconciling}
                sx={{
                  borderRadius: '8px',
                  textTransform: 'none',
                  fontWeight: 500,
                  gap: 1,
                  whiteSpace: 'nowrap',
                  height: 36,
                  px: 2,
                  fontSize: '0.875rem',
                  bgcolor: '#45B3D4',
                  color: '#fff',
                  '&:hover': { bgcolor: '#2fa3c7' },
                  '&:active': { bgcolor: '#2384a1' },
                  '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'none' },
                }}
              >
                {isReconciling ? (
                  <>
                    <Box sx={{ height: 16, width: 16, borderRadius: 99, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />
                    Reconciling...
                  </>
                ) : (
                  <>
                    <FindInPageIcon sx={{ fontSize: 16 }} />
                    Reconcile
                  </>
                )}
              </MuiButton>
            </Box>

            {/* Error */}
            {error !== null && (
              <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, bgcolor: 'rgba(239,68,68,0.06)', px: 2, py: 1.5, fontSize: '0.875rem', color: '#b91c1c' }}>
                <ErrorOutlineIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                {error}
              </Box>
            )}
          </MuiCardContent>
        </MuiCard>

        {/* Results */}
        {result !== null && (
          <>
            {/* Summary Stats */}
            <Box sx={{ mt: 3, display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(4, 1fr)' } }}>
              <StatCard
                label="Amazon Transactions"
                value={result.summary.totalAmazonTransactions.toLocaleString()}
                icon={<VerticalAlignBottomIcon sx={{ fontSize: 20 }} />}
              />
              <StatCard
                label="Matched"
                value={result.summary.matched.toLocaleString()}
                icon={<CheckCircleOutlineIcon sx={{ fontSize: 20 }} />}
                dotColor="bg-emerald-500"
              />
              <StatCard
                label="Discrepancies"
                value={result.summary.discrepancies.toLocaleString()}
                icon={<ErrorOutlineIcon sx={{ fontSize: 20 }} />}
                dotColor="bg-red-500"
              />
              <StatCard
                label="Unmatched"
                value={(result.summary.amazonOnly + result.summary.lmbOnly).toLocaleString()}
                icon={<CancelIcon sx={{ fontSize: 20 }} />}
                dotColor="bg-amber-500"
              />
            </Box>

            {/* Detail Breakdown */}
            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.75rem', color: 'text.secondary', px: 0.5 }}>
              <Box component="span">Audit rows: {result.summary.totalLmbRows.toLocaleString()}</Box>
              <Box component="span">&middot;</Box>
              <Box component="span">Amazon only: {result.summary.amazonOnly.toLocaleString()}</Box>
              <Box component="span">&middot;</Box>
              <Box component="span">Audit only: {result.summary.lmbOnly.toLocaleString()}</Box>
            </Box>

            {/* Results Table */}
            <MuiCard sx={{ mt: 2, borderColor: 'rgba(203,213,225,0.7)', overflow: 'hidden' }}>
              <MuiCardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: 1, borderColor: 'rgba(203,213,225,0.7)', px: 2, py: 1.5 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>
                    Reconciliation Details
                    <Box component="span" sx={{ ml: 1, fontSize: '0.75rem', fontWeight: 400, color: 'text.secondary' }}>
                      ({result.rows.length.toLocaleString()} orders)
                    </Box>
                  </Typography>
                  <MuiButton
                    variant="outlined"
                    disableElevation
                    size="small"
                    onClick={() => exportToCsv(result.rows, month, marketplace)}
                    sx={{
                      borderRadius: '8px',
                      textTransform: 'none',
                      fontWeight: 500,
                      gap: 1,
                      whiteSpace: 'nowrap',
                      height: 32,
                      px: 1.5,
                      fontSize: '0.75rem',
                      borderColor: 'divider',
                      color: 'text.primary',
                      bgcolor: 'background.paper',
                      '&:hover': { bgcolor: 'action.hover', borderColor: 'divider' },
                      '&.Mui-disabled': { opacity: 0.4, pointerEvents: 'none' },
                    }}
                  >
                    <DownloadIcon sx={{ fontSize: 14 }} />
                    Export CSV
                  </MuiButton>
                </Box>
                <Box sx={{ overflowX: 'auto' }}>
                  <MuiTable sx={{ width: '100%', fontSize: '0.875rem' }}>
                    <MuiTableHead
                      sx={{
                        bgcolor: 'rgba(248, 250, 252, 0.8)',
                        '[data-mui-color-scheme="dark"] &, .dark &': {
                          bgcolor: 'rgba(255, 255, 255, 0.05)',
                        },
                        '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
                      }}
                    >
                      <MuiTableRow
                        sx={{
                          borderBottom: 1,
                          borderColor: 'divider',
                          bgcolor: 'rgba(248,250,252,0.8)',
                        }}
                      >
                        <MuiTableCell component="th" sx={{ height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Order ID</MuiTableCell>
                        <MuiTableCell component="th" sx={{ height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Date</MuiTableCell>
                        <MuiTableCell component="th" sx={{ height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Type</MuiTableCell>
                        <MuiTableCell component="th" sx={{ height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', textAlign: 'right' }}>Amazon</MuiTableCell>
                        <MuiTableCell component="th" sx={{ height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', textAlign: 'right' }}>Audit</MuiTableCell>
                        <MuiTableCell component="th" sx={{ height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary', textAlign: 'right' }}>Difference</MuiTableCell>
                        <MuiTableCell component="th" sx={{ height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' }}>Status</MuiTableCell>
                      </MuiTableRow>
                    </MuiTableHead>
                    <MuiTableBody
                      sx={{
                        '& .MuiTableRow-root:last-child': { borderBottom: 0 },
                      }}
                    >
                      {result.rows.length === 0 && (
                        <MuiTableRow
                          sx={{
                            borderBottom: 1,
                            borderColor: 'divider',
                            transition: 'background-color 0.15s',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <MuiTableCell colSpan={7} sx={{ px: 1.5, py: 4, color: 'text.primary', textAlign: 'center', fontSize: '0.875rem' }}>
                            No matching orders found for this period
                          </MuiTableCell>
                        </MuiTableRow>
                      )}
                      {result.rows.map((row) => (
                        <MuiTableRow
                          key={row.orderId}
                          sx={{
                            borderBottom: 1,
                            borderColor: 'divider',
                            transition: 'background-color 0.15s',
                            '&:hover': { bgcolor: 'action.hover' },
                          }}
                        >
                          <MuiTableCell sx={{ px: 1.5, py: 1.5, color: 'text.primary', fontFamily: 'monospace', fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums' }}>{row.orderId}</MuiTableCell>
                          <MuiTableCell sx={{ px: 1.5, py: 1.5, color: 'text.secondary', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{row.date}</MuiTableCell>
                          <MuiTableCell sx={{ px: 1.5, py: 1.5, color: 'text.secondary', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{row.type}</MuiTableCell>
                          <MuiTableCell sx={{ px: 1.5, py: 1.5, color: 'text.primary', fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.amazonTotal !== 0 ? formatCurrency(row.amazonTotal, currency) : '\u2014'}
                          </MuiTableCell>
                          <MuiTableCell sx={{ px: 1.5, py: 1.5, color: 'text.primary', fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {row.lmbTotal !== 0 ? formatCurrency(row.lmbTotal, currency) : '\u2014'}
                          </MuiTableCell>
                          <MuiTableCell
                            sx={{
                              px: 1.5,
                              py: 1.5,
                              fontSize: '0.875rem',
                              textAlign: 'right',
                              fontVariantNumeric: 'tabular-nums',
                              ...(row.difference !== 0
                                ? row.difference > 0
                                  ? { color: '#dc2626' }
                                  : { color: '#d97706' }
                                : { color: 'text.disabled' }),
                            }}
                          >
                            {row.difference !== 0
                              ? `${row.difference > 0 ? '+' : ''}${formatCurrency(row.difference, currency)}`
                              : '\u2014'}
                          </MuiTableCell>
                          <MuiTableCell sx={{ px: 1.5, py: 1.5, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>{statusBadge(row.status)}</MuiTableCell>
                        </MuiTableRow>
                      ))}
                    </MuiTableBody>
                  </MuiTable>
                </Box>
              </MuiCardContent>
            </MuiCard>
          </>
        )}
      </Box>
    </Box>
  );
}
