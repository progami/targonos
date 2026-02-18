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

/* ================================================================
   Config — add a new entry here to support a new report type.
   ================================================================ */

type DataSourceField = { type: 'marketplace' } | { type: 'dateRange' };

type DataSourceConfig = {
  key: string;
  label: string;
  description: string;
  dropLabel: string;
  accept: string;
  hint: string;
  uploadEndpoint: string;
  listEndpoint: string;
  queryKey: string;
  fields: DataSourceField[];
  mapUpload: (u: any) => { marketplace: string; range: string };
};

const DATA_SOURCES: DataSourceConfig[] = [
  {
    key: 'audit',
    label: 'Audit Data (UK)',
    description: 'Upload Audit Data (CSV or ZIP). For UK, this is the Link My Books Audit Data export. For US, Audit Data is generated automatically when syncing settlements from Amazon.',
    dropLabel: 'Drop your Audit Data file here',
    accept: '.csv,.zip',
    hint: 'CSV or ZIP',
    uploadEndpoint: '/api/plutus/audit-data/upload',
    listEndpoint: '/api/plutus/audit-data',
    queryKey: 'audit-data-uploads',
    fields: [],
    mapUpload: () => ({ marketplace: 'Mixed', range: '—' }),
  },
  {
    key: 'ads',
    label: 'Amazon Ads Report',
    description: 'Upload Sponsored Products advertised product report. Set marketplace and date range before uploading.',
    dropLabel: 'Drop your SP report here',
    accept: '.csv,.zip,.xlsx',
    hint: 'CSV, ZIP, or XLSX',
    uploadEndpoint: '/api/plutus/ads-data/upload',
    listEndpoint: '/api/plutus/ads-data',
    queryKey: 'ads-data-uploads',
    fields: [{ type: 'marketplace' }, { type: 'dateRange' }],
    mapUpload: (u) => ({
      marketplace: u.marketplace === 'amazon.com' ? 'US' : 'UK',
      range: `${u.startDate} – ${u.endDate}`,
    }),
  },
  {
    key: 'awd',
    label: 'AWD Monthly Fee Report',
    description: 'Upload AWD fee report for warehousing cost allocation. Select marketplace before uploading.',
    dropLabel: 'Drop your AWD fee report here',
    accept: '.csv,.zip,.xlsx',
    hint: 'CSV, ZIP, or XLSX',
    uploadEndpoint: '/api/plutus/awd-data/upload',
    listEndpoint: '/api/plutus/awd-data',
    queryKey: 'awd-data-uploads',
    fields: [{ type: 'marketplace' }],
    mapUpload: (u) => ({
      marketplace: u.marketplace === 'amazon.com' ? 'US' : 'UK',
      range: `${u.startDate} – ${u.endDate}`,
    }),
  },
];

/* ================================================================
   Shared helpers
   ================================================================ */

type ConnectionStatus = { connected: boolean; error?: string };
type MarketplaceId = 'amazon.com' | 'amazon.co.uk';

function readApiError(payload: unknown, fallback: string): string {
  if (typeof payload !== 'object' || payload === null) return fallback;
  const details = (payload as Record<string, unknown>).details;
  if (typeof details === 'string' && details.trim() !== '') return details;
  const error = (payload as Record<string, unknown>).error;
  if (typeof error === 'string' && error.trim() !== '') return error;
  return fallback;
}

/* ---- shared table sx ---- */
const thSx = { height: 44, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.secondary' } as const;
const tdSx = { px: 1.5, py: 1.5, color: 'text.primary', fontVariantNumeric: 'tabular-nums' } as const;
const theadSx = { bgcolor: 'rgba(248, 250, 252, 0.8)', '[data-mui-color-scheme="dark"] &, .dark &': { bgcolor: 'rgba(255, 255, 255, 0.05)' }, '& .MuiTableRow-root': { borderBottom: 1, borderColor: 'divider' } } as const;
const tbodySx = { '& .MuiTableRow-root:last-child': { borderBottom: 0 } } as const;
const rowSx = { borderBottom: 1, borderColor: 'divider', transition: 'background-color 0.15s', '&:hover': { bgcolor: 'action.hover' } } as const;
const tableSx = { width: '100%', fontSize: '0.875rem' } as const;

const selectSx = {
  borderRadius: '8px',
  fontSize: '0.875rem',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'divider' },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#45B3D4' },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
} as const;

const dateFieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: '8px',
    '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#45B3D4' },
    '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#00C2B9', borderWidth: 2 },
  },
} as const;

/* ================================================================
   Page
   ================================================================ */

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

export default function DataSourcesPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  /* ---- connection ---- */
  const { data: connection, isLoading: connectionLoading } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const connected = connection !== undefined && connection.connected === true;

  /* ---- selected report type ---- */
  const [selectedKey, setSelectedKey] = useState(DATA_SOURCES[0].key);
  const config = DATA_SOURCES.find((s) => s.key === selectedKey)!;

  /* ---- upload state ---- */
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ---- field state ---- */
  const [marketplace, setMarketplace] = useState<MarketplaceId>('amazon.com');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const hasMarketplace = config.fields.some((f) => f.type === 'marketplace');
  const hasDateRange = config.fields.some((f) => f.type === 'dateRange');

  /* ---- Fetch all source lists for history table ---- */
  const sourceQueries = DATA_SOURCES.map((src) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useQuery({
      queryKey: [src.queryKey],
      queryFn: async () => {
        const res = await fetch(`${basePath}${src.listEndpoint}`);
        return res.json() as Promise<{ uploads: any[] }>;
      },
      enabled: connected,
      staleTime: 10 * 1000,
    }),
  );

  /* ---- upload handler ---- */
  const handleUpload = useCallback(
    async (file: File) => {
      if (hasDateRange) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
          setError('Set valid start/end dates before uploading.');
          return;
        }
      }

      setIsUploading(true);
      setSuccess(null);
      setError(null);

      try {
        const formData = new FormData();
        formData.set('file', file);
        if (hasMarketplace) formData.set('marketplace', marketplace);
        if (hasDateRange) {
          formData.set('startDate', startDate);
          formData.set('endDate', endDate);
        }

        const res = await fetch(`${basePath}${config.uploadEndpoint}`, { method: 'POST', body: formData });
        const payload = await res.json();

        if (!res.ok) {
          setError(readApiError(payload, `${config.label} upload failed.`));
          return;
        }

        const extra = hasMarketplace ? ` for ${marketplace === 'amazon.com' ? 'US' : 'UK'}` : '';
        setSuccess(`Uploaded ${file.name}${extra}`);
        queryClient.invalidateQueries({ queryKey: [config.queryKey] });
      } catch (err) {
        setError(err instanceof Error ? err.message : `${config.label} upload failed.`);
      } finally {
        setIsUploading(false);
      }
    },
    [config, hasMarketplace, hasDateRange, marketplace, startDate, endDate, queryClient],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) void handleUpload(file);
      e.target.value = '';
    },
    [handleUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) void handleUpload(file);
    },
    [handleUpload],
  );

  /* ---- reset banners when switching report type ---- */
  const handleReportChange = useCallback((key: string) => {
    setSelectedKey(key);
    setSuccess(null);
    setError(null);
  }, []);

  /* ---- loading ---- */
  if (connectionLoading) {
    return (
      <Box component="main" sx={{ flex: 1 }}>
        <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
          <Skeleton variant="rectangular" animation="pulse" sx={{ height: 40, width: 200, bgcolor: 'action.hover', borderRadius: 1 }} />
          <Skeleton variant="rectangular" animation="pulse" sx={{ height: 320, width: '100%', bgcolor: 'action.hover', borderRadius: 2, mt: 3 }} />
        </Box>
      </Box>
    );
  }

  if (connection?.connected === false) {
    return <NotConnectedScreen title="Data Sources" error={connection.error} />;
  }

  /* ---- history table data ---- */
  const isTableLoading = sourceQueries.some((q) => q.isLoading);
  const allUploads = DATA_SOURCES.flatMap((src, idx) => {
    const uploads = sourceQueries[idx]?.data?.uploads ?? [];
    return uploads.slice(0, 5).map((u: any) => ({
      id: u.id as string,
      type: src.label,
      filename: u.filename as string,
      rowCount: u.rowCount as number,
      uploadedAt: u.uploadedAt as string,
      ...src.mapUpload(u),
    }));
  });

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader
          title="Data Sources"
          description="Upload settlement source reports in one place. Fee allocations use uploaded report data, not unit-based splits."
          variant="accent"
        />

        <Box sx={{ display: 'grid', gap: 3, mt: 3 }}>
          {/* ---- Upload Card ---- */}
          <Card sx={{ borderColor: 'divider' }}>
            <CardContent sx={{ p: 3, '&:last-child': { pb: 3 } }}>
              {/* Report type selector */}
              <Box sx={{ mb: 2 }}>
                <FormControl size="small" sx={{ minWidth: 240 }}>
                  <InputLabel>Report Type</InputLabel>
                  <Select
                    label="Report Type"
                    value={selectedKey}
                    onChange={(e) => handleReportChange(e.target.value)}
                    sx={selectSx}
                  >
                    {DATA_SOURCES.map((src) => (
                      <MenuItem key={src.key} value={src.key}>{src.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Box>

              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mb: 2 }}>{config.description}</Typography>

              {/* Dynamic fields based on selected report */}
              {config.fields.length > 0 && (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: {
                      xs: '1fr',
                      md: hasDateRange ? '180px 1fr 1fr' : '180px',
                    },
                    gap: 1.5,
                    mb: 2,
                  }}
                >
                  {hasMarketplace && (
                    <FormControl size="small">
                      <InputLabel>Marketplace</InputLabel>
                      <Select label="Marketplace" value={marketplace} onChange={(e) => setMarketplace(e.target.value as MarketplaceId)} sx={selectSx}>
                        <MenuItem value="amazon.com">US</MenuItem>
                        <MenuItem value="amazon.co.uk">UK</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  {hasDateRange && (
                    <>
                      <TextField
                        size="small"
                        label="Start Date"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontSize: '0.875rem', height: 40 } } }}
                        sx={dateFieldSx}
                      />
                      <TextField
                        size="small"
                        label="End Date"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true }, input: { sx: { fontSize: '0.875rem', height: 40 } } }}
                        sx={dateFieldSx}
                      />
                    </>
                  )}
                </Box>
              )}

              {/* Drop zone */}
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
                  ...(isDragging
                    ? { borderColor: '#45B3D4', bgcolor: 'rgba(69, 179, 212, 0.05)' }
                    : { borderColor: 'divider', '&:hover': { borderColor: '#45B3D4' } }),
                }}
                onDragOver={(e: React.DragEvent) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
              >
                <input ref={inputRef} type="file" accept={config.accept} onChange={onFileChange} style={{ display: 'none' }} />
                {isUploading ? (
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
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Uploading...</Typography>
                  </Box>
                ) : (
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
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{config.dropLabel}</Typography>
                    <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>{config.hint}</Typography>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => inputRef.current?.click()}
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
                )}
              </Box>

              {error !== null && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, bgcolor: 'rgba(239, 68, 68, 0.06)', px: 2, py: 1.5, fontSize: '0.875rem', color: 'error.main' }}>
                  <ErrorOutlineIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                  {error}
                </Box>
              )}
              {success !== null && (
                <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1, borderRadius: 2, border: 1, borderColor: 'rgba(16, 185, 129, 0.3)', bgcolor: 'rgba(16, 185, 129, 0.06)', px: 2, py: 1.5, fontSize: '0.875rem', fontWeight: 500, color: 'success.dark' }}>
                  <CheckCircleIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                  {success}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* ---- Recent Uploads ---- */}
          <Card sx={{ borderColor: 'divider', overflow: 'hidden' }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{ px: 3, pt: 3, pb: 2 }}>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Recent Uploads</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', mt: 0.25 }}>Latest uploads across all data sources.</Typography>
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
                    {isTableLoading &&
                      Array.from({ length: 3 }).map((_, idx) => (
                        <TableRow key={idx} sx={rowSx}>
                          <TableCell colSpan={6} sx={{ ...tdSx, py: 2 }}>
                            <Skeleton variant="rectangular" animation="pulse" sx={{ height: 32, width: '100%', bgcolor: 'action.hover', borderRadius: 1 }} />
                          </TableCell>
                        </TableRow>
                      ))}

                    {!isTableLoading && allUploads.length === 0 && (
                      <TableRow sx={rowSx}>
                        <TableCell colSpan={6} sx={tdSx}>
                          <EmptyState title="No uploads yet" description="Upload reports above to start deterministic fee allocations." />
                        </TableCell>
                      </TableRow>
                    )}

                    {!isTableLoading &&
                      allUploads.map((upload) => (
                        <TableRow key={upload.id} sx={rowSx}>
                          <TableCell sx={tdSx}>
                            <Chip label={upload.type} size="small" variant="outlined" sx={{ height: 22, fontSize: '10px', fontWeight: 500, borderRadius: '6px' }} />
                          </TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.875rem' }}>{upload.marketplace}</TableCell>
                          <TableCell sx={tdSx}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <UploadFileIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                              <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{upload.filename}</Box>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{upload.range}</TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{upload.rowCount.toLocaleString()}</TableCell>
                          <TableCell sx={{ ...tdSx, fontSize: '0.75rem', color: 'text.secondary' }}>
                            {new Date(upload.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
