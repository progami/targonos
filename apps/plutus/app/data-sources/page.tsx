'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import UploadIcon from '@mui/icons-material/Upload';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { EmptyState } from '@/components/ui/empty-state';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { PageHeader } from '@/components/page-header';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; error?: string };
type MarketplaceId = 'amazon.com' | 'amazon.co.uk';

type AuditUpload = {
  id: string;
  filename: string;
  rowCount: number;
  invoiceCount: number;
  uploadedAt: string;
};

type AdsUpload = {
  id: string;
  reportType: string;
  marketplace: MarketplaceId;
  filename: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  skuCount: number;
  uploadedAt: string;
};

type AwdUpload = {
  id: string;
  reportType: string;
  marketplace: MarketplaceId;
  filename: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  skuCount: number;
  uploadedAt: string;
};

/* ---- shared table sx ---- */
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

const theadSx = {
  bgcolor: 'rgba(248, 250, 252, 0.8)',
  '[data-mui-color-scheme="dark"] &, .dark &': {
    bgcolor: 'rgba(255, 255, 255, 0.05)',
  },
  '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' },
} as const;

const tbodySx = {
  '& .MuiTableRow-root:last-child': { borderBottom: 0 },
} as const;

const rowSx = {
  borderBottom: 1,
  borderColor: 'divider',
  transition: 'background-color 0.15s',
  '&:hover': { bgcolor: 'action.hover' },
} as const;

const tableSx = {
  width: '100%',
  fontSize: '0.875rem',
} as const;

function marketplaceLabel(marketplace: MarketplaceId): 'US' | 'UK' {
  return marketplace === 'amazon.com' ? 'US' : 'UK';
}

function readApiError(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) {
    return fallback;
  }
  const details = (payload as Record<string, unknown>).details;
  if (typeof details === 'string' && details.trim() !== '') {
    return details;
  }
  const error = (payload as Record<string, unknown>).error;
  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }
  return fallback;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAuditUploads(): Promise<{ uploads: AuditUpload[] }> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  return res.json();
}

async function fetchAdsUploads(): Promise<{ uploads: AdsUpload[] }> {
  const res = await fetch(`${basePath}/api/plutus/ads-data`);
  return res.json();
}

async function fetchAwdUploads(): Promise<{ uploads: AwdUpload[] }> {
  const res = await fetch(`${basePath}/api/plutus/awd-data`);
  return res.json();
}

/* ---- Spinner used inside upload zones ---- */
function UploadSpinner({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
      <Box
        sx={{
          height: 40,
          width: 40,
          borderRadius: '50%',
          border: 4,
          borderColor: 'divider',
          borderTopColor: '#45B3D4',
          animation: 'spin 1s linear infinite',
          '@keyframes spin': { to: { transform: 'rotate(360deg)' } },
        }}
      />
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>{label}</Typography>
    </Box>
  );
}

/* ---- Upload zone idle state ---- */
function UploadIdle({ label, hint, onChoose }: { label: string; hint: string; onChoose: () => void }) {
  return (
    <>
      <Box
        sx={{
          mb: 2,
          display: 'flex',
          height: 56,
          width: 56,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 3,
          bgcolor: 'rgba(69, 179, 212, 0.08)',
          color: '#45B3D4',
        }}
      >
        <UploadIcon sx={{ fontSize: 28 }} />
      </Box>
      <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{label}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>{hint}</Typography>
      <Box
        component="button"
        type="button"
        onClick={onChoose}
        sx={{
          mt: 2,
          borderRadius: 2,
          bgcolor: '#45B3D4',
          px: 2,
          py: 1,
          fontSize: '0.875rem',
          fontWeight: 500,
          color: '#fff',
          boxShadow: 1,
          transition: 'background-color 0.2s',
          border: 'none',
          cursor: 'pointer',
          '&:hover': { bgcolor: '#2fa3c7' },
        }}
      >
        Choose File
      </Box>
    </>
  );
}

/* ---- Success banner ---- */
function UploadSuccess({ message }: { message: string }) {
  return (
    <Box
      sx={{
        mt: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 2,
        border: 1,
        borderColor: 'rgba(16, 185, 129, 0.3)',
        bgcolor: 'rgba(16, 185, 129, 0.06)',
        px: 2,
        py: 1.5,
        fontSize: '0.875rem',
        fontWeight: 500,
        color: 'success.dark',
      }}
    >
      <CheckCircleIcon sx={{ fontSize: 16, flexShrink: 0 }} />
      {message}
    </Box>
  );
}

/* ---- Error banner ---- */
function UploadError({ message }: { message: string }) {
  return (
    <Box
      sx={{
        mt: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 2,
        bgcolor: 'rgba(239, 68, 68, 0.06)',
        px: 2,
        py: 1.5,
        fontSize: '0.875rem',
        color: 'error.main',
      }}
    >
      <ErrorOutlineIcon sx={{ fontSize: 16, flexShrink: 0 }} />
      {message}
    </Box>
  );
}

export default function DataSourcesPage() {
  const queryClient = useQueryClient();
  const auditInputRef = useRef<HTMLInputElement>(null);
  const adsInputRef = useRef<HTMLInputElement>(null);
  const awdInputRef = useRef<HTMLInputElement>(null);

  const [isUploadingAudit, setIsUploadingAudit] = useState(false);
  const [isUploadingAds, setIsUploadingAds] = useState(false);
  const [isUploadingAwd, setIsUploadingAwd] = useState(false);

  const [auditSuccess, setAuditSuccess] = useState<string | null>(null);
  const [adsSuccess, setAdsSuccess] = useState<string | null>(null);
  const [awdSuccess, setAwdSuccess] = useState<string | null>(null);

  const [auditError, setAuditError] = useState<string | null>(null);
  const [adsError, setAdsError] = useState<string | null>(null);
  const [awdError, setAwdError] = useState<string | null>(null);

  const [auditDragging, setAuditDragging] = useState(false);
  const [adsDragging, setAdsDragging] = useState(false);
  const [awdDragging, setAwdDragging] = useState(false);

  const [adsMarketplace, setAdsMarketplace] = useState<MarketplaceId>('amazon.com');
  const [adsStartDate, setAdsStartDate] = useState('');
  const [adsEndDate, setAdsEndDate] = useState('');
  const [awdMarketplace, setAwdMarketplace] = useState<MarketplaceId>('amazon.com');

  const { data: connection, isLoading: connectionLoading } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data: auditData, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-data-uploads'],
    queryFn: fetchAuditUploads,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 10 * 1000,
  });

  const { data: adsData, isLoading: adsLoading } = useQuery({
    queryKey: ['ads-data-uploads'],
    queryFn: fetchAdsUploads,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 10 * 1000,
  });

  const { data: awdData, isLoading: awdLoading } = useQuery({
    queryKey: ['awd-data-uploads'],
    queryFn: fetchAwdUploads,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 10 * 1000,
  });

  const handleAuditUpload = useCallback(
    async (file: File) => {
      setIsUploadingAudit(true);
      setAuditSuccess(null);
      setAuditError(null);
      try {
        const formData = new FormData();
        formData.set('file', file);
        const res = await fetch(`${basePath}/api/plutus/audit-data/upload`, { method: 'POST', body: formData });
        const payload = await res.json();
        if (!res.ok) {
          setAuditError(readApiError(payload, 'Audit upload failed.'));
          return;
        }
        setAuditSuccess(`Uploaded ${file.name} — ${(payload.rowCount ?? 0).toLocaleString()} rows`);
        queryClient.invalidateQueries({ queryKey: ['audit-data-uploads'] });
      } catch (err) {
        setAuditError(err instanceof Error ? err.message : 'Audit upload failed.');
      } finally {
        setIsUploadingAudit(false);
      }
    },
    [queryClient],
  );

  const handleAdsUpload = useCallback(
    async (file: File) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(adsStartDate) || !/^\d{4}-\d{2}-\d{2}$/.test(adsEndDate) || adsStartDate > adsEndDate) {
        setAdsError('Set valid start/end dates (YYYY-MM-DD) before uploading.');
        return;
      }
      setIsUploadingAds(true);
      setAdsSuccess(null);
      setAdsError(null);
      try {
        const formData = new FormData();
        formData.set('file', file);
        formData.set('marketplace', adsMarketplace);
        formData.set('startDate', adsStartDate);
        formData.set('endDate', adsEndDate);
        const res = await fetch(`${basePath}/api/plutus/ads-data/upload`, { method: 'POST', body: formData });
        const payload = await res.json();
        if (!res.ok) {
          setAdsError(readApiError(payload, 'Ads upload failed.'));
          return;
        }
        setAdsSuccess(`Uploaded ${file.name} for ${marketplaceLabel(adsMarketplace)}`);
        queryClient.invalidateQueries({ queryKey: ['ads-data-uploads'] });
      } catch (err) {
        setAdsError(err instanceof Error ? err.message : 'Ads upload failed.');
      } finally {
        setIsUploadingAds(false);
      }
    },
    [queryClient, adsMarketplace, adsStartDate, adsEndDate],
  );

  const handleAwdUpload = useCallback(
    async (file: File) => {
      setIsUploadingAwd(true);
      setAwdSuccess(null);
      setAwdError(null);
      try {
        const formData = new FormData();
        formData.set('file', file);
        formData.set('marketplace', awdMarketplace);
        const res = await fetch(`${basePath}/api/plutus/awd-data/upload`, { method: 'POST', body: formData });
        const payload = await res.json();
        if (!res.ok) {
          setAwdError(readApiError(payload, 'AWD upload failed.'));
          return;
        }
        setAwdSuccess(`Uploaded ${file.name} for ${marketplaceLabel(awdMarketplace)}`);
        queryClient.invalidateQueries({ queryKey: ['awd-data-uploads'] });
      } catch (err) {
        setAwdError(err instanceof Error ? err.message : 'AWD upload failed.');
      } finally {
        setIsUploadingAwd(false);
      }
    },
    [queryClient, awdMarketplace],
  );

  function makeDragHandlers(
    setDragging: (v: boolean) => void,
    handler: (file: File) => Promise<void>,
  ) {
    return {
      onDragOver: (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
      },
      onDragLeave: () => setDragging(false),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) void handler(file);
      },
    };
  }

  function makeFileChangeHandler(handler: (file: File) => Promise<void>) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handler(file);
      e.target.value = '';
    };
  }

  if (connectionLoading) {
    return (
      <Box component="main" sx={{ flex: 1 }}>
        <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
          <Skeleton variant="rectangular" animation="pulse" sx={{ height: 40, width: 200, bgcolor: 'action.hover', borderRadius: 1 }} />
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 3 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" animation="pulse" sx={{ height: 200, width: '100%', bgcolor: 'action.hover', borderRadius: 2 }} />
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  if (connection?.connected === false) {
    return <NotConnectedScreen title="Data Sources" error={connection.error} />;
  }

  const allUploads = [
    ...(auditData?.uploads ?? []).slice(0, 5).map((u) => ({ ...u, type: 'Audit' as const, marketplace: 'Mixed' as const, range: '—' })),
    ...(adsData?.uploads ?? []).slice(0, 5).map((u) => ({ ...u, type: 'Ads' as const, marketplace: marketplaceLabel(u.marketplace), range: `${u.startDate} – ${u.endDate}` })),
    ...(awdData?.uploads ?? []).slice(0, 5).map((u) => ({ ...u, type: 'AWD' as const, marketplace: marketplaceLabel(u.marketplace), range: `${u.startDate} – ${u.endDate}` })),
  ];

  const isTableLoading = auditLoading || adsLoading || awdLoading;

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader
          title="Data Sources"
          description="Upload settlement source reports in one place. Fee allocations use uploaded report data, not unit-based splits."
          variant="accent"
        />

        <Box sx={{ display: 'grid', gap: 3, mt: 3 }}>
          {/* ---- Audit Data ---- */}
          <Card sx={{ borderColor: 'divider' }}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>LMB Audit Data</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
                  Upload Link My Books Audit Data (CSV or ZIP). One file covers all settlements in the date range.
                </Typography>
              </Box>

              <Box
                sx={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                  border: 2,
                  borderStyle: 'dashed',
                  px: 3,
                  py: 5,
                  transition: 'all 0.2s',
                  ...(auditDragging
                    ? { borderColor: '#45B3D4', bgcolor: 'rgba(69, 179, 212, 0.05)' }
                    : { borderColor: 'divider', '&:hover': { borderColor: '#45B3D4' } }),
                }}
                {...makeDragHandlers(setAuditDragging, handleAuditUpload)}
              >
                <input ref={auditInputRef} type="file" accept=".csv,.zip" onChange={makeFileChangeHandler(handleAuditUpload)} style={{ display: 'none' }} />
                {isUploadingAudit ? (
                  <UploadSpinner label="Processing audit data..." />
                ) : (
                  <UploadIdle label="Drop your LMB Audit Data file here" hint="CSV or ZIP" onChoose={() => auditInputRef.current?.click()} />
                )}
              </Box>

              {auditError !== null && <UploadError message={auditError} />}
              {auditSuccess !== null && <UploadSuccess message={auditSuccess} />}

              <Typography sx={{ mt: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                {auditLoading ? 'Loading...' : `${auditData?.uploads.length ?? 0} upload${(auditData?.uploads.length ?? 0) === 1 ? '' : 's'} stored`}
              </Typography>
            </CardContent>
          </Card>

          {/* ---- Ads Data ---- */}
          <Card sx={{ borderColor: 'divider' }}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Amazon Ads Report</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
                  Upload Sponsored Products advertised product report. Set marketplace and date range before uploading.
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px 1fr 1fr' }, gap: 1.5, mb: 2 }}>
                <FormControl size="small">
                  <InputLabel>Marketplace</InputLabel>
                  <Select
                    label="Marketplace"
                    value={adsMarketplace}
                    onChange={(e) => setAdsMarketplace(e.target.value as MarketplaceId)}
                    sx={{
                      borderRadius: '8px',
                      fontSize: '0.875rem',
                      '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#45B3D4' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
                    }}
                  >
                    <MenuItem value="amazon.com">US</MenuItem>
                    <MenuItem value="amazon.co.uk">UK</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  size="small"
                  label="Start Date"
                  type="date"
                  value={adsStartDate}
                  onChange={(e) => setAdsStartDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontSize: '0.875rem', height: 40 } } }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#45B3D4' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
                    },
                  }}
                />
                <TextField
                  size="small"
                  label="End Date"
                  type="date"
                  value={adsEndDate}
                  onChange={(e) => setAdsEndDate(e.target.value)}
                  slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontSize: '0.875rem', height: 40 } } }}
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      borderRadius: '8px',
                      '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#45B3D4' },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
                    },
                  }}
                />
              </Box>

              <Box
                sx={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                  border: 2,
                  borderStyle: 'dashed',
                  px: 3,
                  py: 5,
                  transition: 'all 0.2s',
                  ...(adsDragging
                    ? { borderColor: '#45B3D4', bgcolor: 'rgba(69, 179, 212, 0.05)' }
                    : { borderColor: 'divider', '&:hover': { borderColor: '#45B3D4' } }),
                }}
                {...makeDragHandlers(setAdsDragging, handleAdsUpload)}
              >
                <input ref={adsInputRef} type="file" accept=".csv,.zip,.xlsx" onChange={makeFileChangeHandler(handleAdsUpload)} style={{ display: 'none' }} />
                {isUploadingAds ? (
                  <UploadSpinner label="Uploading ads report..." />
                ) : (
                  <UploadIdle label="Drop your SP report here" hint="CSV, ZIP, or XLSX" onChoose={() => adsInputRef.current?.click()} />
                )}
              </Box>

              {adsError !== null && <UploadError message={adsError} />}
              {adsSuccess !== null && <UploadSuccess message={adsSuccess} />}

              <Typography sx={{ mt: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                {adsLoading ? 'Loading...' : `${adsData?.uploads.length ?? 0} upload${(adsData?.uploads.length ?? 0) === 1 ? '' : 's'} stored`}
              </Typography>
            </CardContent>
          </Card>

          {/* ---- AWD Data ---- */}
          <Card sx={{ borderColor: 'divider' }}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              <Box sx={{ mb: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>AWD Monthly Fee Report</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
                  Upload AWD fee report for warehousing cost allocation. Select marketplace before uploading.
                </Typography>
              </Box>

              <FormControl size="small" sx={{ mb: 2, minWidth: 180 }}>
                <InputLabel>Marketplace</InputLabel>
                <Select
                  label="Marketplace"
                  value={awdMarketplace}
                  onChange={(e) => setAwdMarketplace(e.target.value as MarketplaceId)}
                  sx={{
                    borderRadius: '8px',
                    fontSize: '0.875rem',
                    '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
                    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#45B3D4' },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
                  }}
                >
                  <MenuItem value="amazon.com">US</MenuItem>
                  <MenuItem value="amazon.co.uk">UK</MenuItem>
                </Select>
              </FormControl>

              <Box
                sx={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 3,
                  border: 2,
                  borderStyle: 'dashed',
                  px: 3,
                  py: 5,
                  transition: 'all 0.2s',
                  ...(awdDragging
                    ? { borderColor: '#45B3D4', bgcolor: 'rgba(69, 179, 212, 0.05)' }
                    : { borderColor: 'divider', '&:hover': { borderColor: '#45B3D4' } }),
                }}
                {...makeDragHandlers(setAwdDragging, handleAwdUpload)}
              >
                <input ref={awdInputRef} type="file" accept=".csv,.zip,.xlsx" onChange={makeFileChangeHandler(handleAwdUpload)} style={{ display: 'none' }} />
                {isUploadingAwd ? (
                  <UploadSpinner label="Uploading AWD report..." />
                ) : (
                  <UploadIdle label="Drop your AWD fee report here" hint="CSV, ZIP, or XLSX" onChoose={() => awdInputRef.current?.click()} />
                )}
              </Box>

              {awdError !== null && <UploadError message={awdError} />}
              {awdSuccess !== null && <UploadSuccess message={awdSuccess} />}

              <Typography sx={{ mt: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
                {awdLoading ? 'Loading...' : `${awdData?.uploads.length ?? 0} upload${(awdData?.uploads.length ?? 0) === 1 ? '' : 's'} stored`}
              </Typography>
            </CardContent>
          </Card>

          {/* ---- Recent Uploads ---- */}
          <Card sx={{ borderColor: 'divider', overflow: 'hidden' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ px: 3, pt: 3, pb: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Recent Uploads</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>
                  Latest uploads across all data sources.
                </Typography>
              </Box>

              <Box sx={{ overflowX: 'auto' }}>
                <Table sx={tableSx}>
                  <TableHead sx={theadSx}>
                    <TableRow sx={rowSx}>
                      <TableCell component="th" sx={thSx}>Type</TableCell>
                      <TableCell component="th" sx={thSx}>Marketplace</TableCell>
                      <TableCell component="th" sx={thSx}>File</TableCell>
                      <TableCell component="th" sx={thSx}>Range</TableCell>
                      <TableCell component="th" sx={{ ...thSx, textAlign: 'right' }}>Rows</TableCell>
                      <TableCell component="th" sx={thSx}>Uploaded</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody sx={tbodySx}>
                    {isTableLoading && (
                      <>
                        {Array.from({ length: 3 }).map((_, idx) => (
                          <TableRow key={idx} sx={rowSx}>
                            <TableCell colSpan={6} sx={{ ...tdSx, py: 2 }}>
                              <Skeleton variant="rectangular" animation="pulse" sx={{ height: 32, width: '100%', bgcolor: 'action.hover', borderRadius: 1 }} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    )}

                    {!isTableLoading && allUploads.length === 0 && (
                      <TableRow sx={rowSx}>
                        <TableCell colSpan={6} sx={tdSx}>
                          <EmptyState
                            title="No uploads yet"
                            description="Upload Audit, Ads, or AWD reports above to start deterministic fee allocations."
                          />
                        </TableCell>
                      </TableRow>
                    )}

                    {!isTableLoading &&
                      allUploads.map((upload) => (
                        <TableRow key={upload.id} sx={rowSx}>
                          <TableCell sx={tdSx}>
                            <Chip
                              label={upload.type}
                              size="small"
                              variant="outlined"
                              sx={{
                                height: 22,
                                fontSize: '10px',
                                fontWeight: 500,
                                borderRadius: '6px',
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.875rem' }}>{upload.marketplace}</TableCell>
                          <TableCell sx={tdSx}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <UploadFileIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                              <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{upload.filename}</Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{upload.range}</TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                            {upload.rowCount.toLocaleString()}
                          </TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.75rem', color: 'text.secondary' }}>
                            {new Date(upload.uploadedAt).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </TableCell>
                        </TableRow>
                      ))}
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
