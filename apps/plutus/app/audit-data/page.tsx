'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import UploadIcon from '@mui/icons-material/Upload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NotConnectedScreen } from '@/components/not-connected-screen';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; error?: string };

type UploadRecord = {
  id: string;
  filename: string;
  rowCount: number;
  invoiceCount: number;
  uploadedAt: string;
};

type AuditDataResponse = {
  uploads: UploadRecord[];
  invoiceIds: string[];
};

type UploadResult = {
  id: string;
  filename: string;
  rowCount: number;
  invoiceCount: number;
  uploadedAt: string;
  invoiceSummaries: Array<{
    invoiceId: string;
    marketplace: 'amazon.com' | 'amazon.co.uk';
    rowCount: number;
    minDate: string;
    maxDate: string;
    skuCount: number;
  }>;
};

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAuditData(): Promise<AuditDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  return res.json();
}

function UploadSvgIcon() {
  return (
    <Box component="svg" sx={{ width: 40, height: 40 }} viewBox="0 0 48 48" fill="none">
      <rect x="8" y="10" width="32" height="28" rx="4" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--mui-palette-divider, #e2e8f0)' }} />
      <path d="M24 20v12M20 24l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--mui-palette-divider, #e2e8f0)' }} />
    </Box>
  );
}

export default function AuditDataPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['audit-data-uploads'],
    queryFn: fetchAuditData,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 15 * 1000,
  });

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      setUploadResult(null);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.set('file', file);

        const res = await fetch(`${basePath}/api/plutus/audit-data/upload`, {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();

        if (!res.ok) {
          setUploadError(json.error ?? 'Upload failed');
          return;
        }

        setUploadResult(json as UploadResult);
        queryClient.invalidateQueries({ queryKey: ['audit-data-uploads'] });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [queryClient],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleUpload(file);
    },
    [handleUpload],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleUpload(file);
      e.target.value = '';
    },
    [handleUpload],
  );

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Audit Data" error={connection.error} />;
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader
          title="Audit Data"
          description="Upload Link My Books Audit Data (CSV/ZIP). Plutus uses it to compute per-SKU unit movements, COGS, and brand allocation for fees."
          variant="accent"
        />

        {/* Upload Zone */}
        <Card sx={{ mt: 3, borderColor: 'divider' }}>
          <CardContent sx={{ p: 3 }}>
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
                py: 6,
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.zip"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />

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
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>Processing audit data...</Typography>
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
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>
                    Drop your LMB Audit Data file here
                  </Typography>
                  <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                    CSV or ZIP &middot; One file covers all settlements in the date range
                  </Typography>
                  <Box
                    component="button"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
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

            {/* Upload Error */}
            {uploadError !== null && (
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
                {uploadError}
              </Box>
            )}

            {/* Upload Result */}
            {uploadResult !== null && (
              <Box
                sx={{
                  mt: 2,
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  bgcolor: 'rgba(16, 185, 129, 0.06)',
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', fontWeight: 500, color: 'success.dark' }}>
                  <CheckCircleIcon sx={{ fontSize: 16 }} />
                  Uploaded {uploadResult.filename} &mdash; {uploadResult.rowCount.toLocaleString()} rows across{' '}
                  {uploadResult.invoiceCount} settlement{uploadResult.invoiceCount === 1 ? '' : 's'}
                </Box>
                {uploadResult.invoiceSummaries.length > 0 && (
                  <Box sx={{ mt: 1.5, overflowX: 'auto' }}>
                    <Table>
                      <TableHeader>
                        <TableRow sx={{ bgcolor: 'rgba(16, 185, 129, 0.08)' }}>
                          <TableHead sx={{ color: 'success.dark' }}>Invoice</TableHead>
                          <TableHead sx={{ color: 'success.dark' }}>Date Range</TableHead>
                          <TableHead sx={{ color: 'success.dark', textAlign: 'right' }}>Rows</TableHead>
                          <TableHead sx={{ color: 'success.dark', textAlign: 'right' }}>SKUs</TableHead>
                        </TableRow>
                      </TableHeader>
                        <TableBody>
                          {uploadResult.invoiceSummaries.map((s) => (
                          <TableRow key={`${s.marketplace}:${s.invoiceId}`}>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Badge variant="outline" sx={{ fontSize: '10px' }}>
                                  {s.marketplace === 'amazon.com' ? 'US' : 'UK'}
                                </Badge>
                                <Box component="span">{s.invoiceId}</Box>
                              </Box>
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.875rem' }}>
                              {s.minDate} &ndash; {s.maxDate}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                              {s.rowCount.toLocaleString()}
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{s.skuCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}
              </Box>
            )}
          </CardContent>
        </Card>

        {/* Upload History */}
        <Card sx={{ mt: 3, borderColor: 'divider', overflow: 'hidden' }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHeader>
                  <TableRow sx={{ bgcolor: 'rgba(248, 250, 252, 0.8)' }}>
                    <TableHead sx={{ fontWeight: 600 }}>Filename</TableHead>
                    <TableHead sx={{ fontWeight: 600 }}>Uploaded</TableHead>
                    <TableHead sx={{ fontWeight: 600, textAlign: 'right' }}>Settlements</TableHead>
                    <TableHead sx={{ fontWeight: 600, textAlign: 'right' }}>Rows</TableHead>
                    <TableHead sx={{ fontWeight: 600 }}>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <>
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <TableRow key={idx}>
                          <TableCell colSpan={5} sx={{ py: 2 }}>
                            <Skeleton sx={{ height: 32, width: '100%' }} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}

                  {!isLoading && data && data.uploads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <EmptyState
                          icon={<UploadSvgIcon />}
                          title="No audit data uploaded"
                          description="Upload an LMB Audit Data CSV above. One file covers all settlements in the date range."
                        />
                      </TableCell>
                    </TableRow>
                  )}

                  {!isLoading &&
                    data &&
                    data.uploads.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <UploadFileIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                            <Box component="span" sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>{u.filename}</Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
                          {new Date(u.uploadedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{u.invoiceCount}</TableCell>
                        <TableCell sx={{ fontSize: '0.875rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {u.rowCount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="success">Stored</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </Box>
          </CardContent>
        </Card>

        {/* Loaded invoice IDs summary */}
        {data && data.invoiceIds.length > 0 && (
          <Typography sx={{ mt: 2, fontSize: '0.75rem', color: 'text.secondary' }}>
            Audit data available for {data.invoiceIds.length} settlement{data.invoiceIds.length === 1 ? '' : 's'}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
