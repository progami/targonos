'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import UploadIcon from '@mui/icons-material/Upload';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NotConnectedScreen } from '@/components/not-connected-screen';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = { connected: boolean; error?: string };

type MarketplaceId = 'amazon.com' | 'amazon.co.uk';

type AdsUploadRecord = {
  id: string;
  reportType: string;
  marketplace: MarketplaceId;
  filename: string;
  startDate: string;
  endDate: string;
  rowCount: number;
  skuCount: number;
  minDate: string;
  maxDate: string;
  uploadedAt: string;
};

type AdsDataResponse = {
  uploads: AdsUploadRecord[];
};

type UploadResult = AdsUploadRecord & { rawRowCount: number };

type UploadResponse = {
  uploads: UploadResult[];
};

type DetectSuggestion = {
  marketplace: MarketplaceId;
  startDate: string;
  endDate: string;
  rowCount: number;
  skuCount: number;
  rawRowCount: number;
  isRecentEnough: boolean;
};

type DetectResponse = {
  filename: string;
  todayUtc: string;
  maxAllowedDate: string;
  suggestions: DetectSuggestion[];
};

type PendingTarget = DetectSuggestion & {
  selected: boolean;
};

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAdsData(): Promise<AdsDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/ads-data`);
  return res.json();
}

function marketplaceLabel(marketplace: MarketplaceId): 'US' | 'UK' {
  return marketplace === 'amazon.com' ? 'US' : 'UK';
}

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

function readErrorMessage(responseBody: unknown): string {
  if (typeof responseBody !== 'object' || responseBody === null) {
    return 'Upload failed';
  }

  const details = (responseBody as Record<string, unknown>).details;
  if (typeof details === 'string' && details.trim() !== '') {
    return details;
  }

  const error = (responseBody as Record<string, unknown>).error;
  if (typeof error === 'string' && error.trim() !== '') {
    return error;
  }

  return 'Upload failed';
}

export default function AdsDataPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[] | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilename, setPendingFilename] = useState('');
  const [detectTodayUtc, setDetectTodayUtc] = useState('');
  const [detectMaxAllowedDate, setDetectMaxAllowedDate] = useState('');
  const [pendingTargets, setPendingTargets] = useState<PendingTarget[]>([]);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['ads-data-uploads'],
    queryFn: fetchAdsData,
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 15 * 1000,
  });

  const selectedTargets = useMemo(() => pendingTargets.filter((target) => target.selected), [pendingTargets]);

  const hasInvalidSelectedDates = useMemo(() => {
    return selectedTargets.some((target) => {
      const start = target.startDate.trim();
      const end = target.endDate.trim();
      return !isIsoDate(start) || !isIsoDate(end) || start > end;
    });
  }, [selectedTargets]);

  const clearPendingReview = useCallback(() => {
    setReviewOpen(false);
    setPendingFile(null);
    setPendingFilename('');
    setDetectTodayUtc('');
    setDetectMaxAllowedDate('');
    setPendingTargets([]);
  }, []);

  const detectUpload = useCallback(
    async (file: File) => {
      setIsDetecting(true);
      setUploadError(null);
      setUploadResults(null);

      try {
        const formData = new FormData();
        formData.set('file', file);

        const res = await fetch(`${basePath}/api/plutus/ads-data/upload/detect`, {
          method: 'POST',
          body: formData,
        });
        const json = await res.json();

        if (!res.ok) {
          setUploadError(readErrorMessage(json));
          return;
        }

        const parsed = json as DetectResponse;
        setPendingFile(file);
        setPendingFilename(parsed.filename);
        setDetectTodayUtc(parsed.todayUtc);
        setDetectMaxAllowedDate(parsed.maxAllowedDate);
        setPendingTargets(
          parsed.suggestions.map((row) => ({
            ...row,
            selected: row.isRecentEnough,
          })),
        );
        setReviewOpen(true);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Failed to inspect Ads report');
      } finally {
        setIsDetecting(false);
      }
    },
    [],
  );

  const submitDetectedUpload = useCallback(async () => {
    if (pendingFile === null) {
      setUploadError('No file selected');
      return;
    }

    if (selectedTargets.length === 0) {
      setUploadError('Select at least one marketplace to upload');
      return;
    }

    if (hasInvalidSelectedDates) {
      setUploadError('Fix invalid start/end dates before uploading');
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.set('file', pendingFile);
      formData.set(
        'targets',
        JSON.stringify(
          selectedTargets.map((target) => ({
            marketplace: target.marketplace,
            startDate: target.startDate.trim(),
            endDate: target.endDate.trim(),
          })),
        ),
      );

      const res = await fetch(`${basePath}/api/plutus/ads-data/upload`, {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();

      if (!res.ok) {
        setUploadError(readErrorMessage(json));
        return;
      }

      const payload = json as UploadResponse;
      setUploadResults(payload.uploads);
      clearPendingReview();
      queryClient.invalidateQueries({ queryKey: ['ads-data-uploads'] });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [clearPendingReview, hasInvalidSelectedDates, pendingFile, queryClient, selectedTargets]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) {
        void detectUpload(file);
      }
    },
    [detectUpload],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void detectUpload(file);
      }
      e.target.value = '';
    },
    [detectUpload],
  );

  const isBusy = isDetecting || isUploading;
  const busyLabel = isDetecting ? 'Inspecting report...' : 'Uploading report...';

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Ads Data" error={connection.error} />;
  }

  return (
    <Box component="main" sx={{ flex: 1 }}>
      <Box sx={{ mx: 'auto', maxWidth: '80rem', px: { xs: 2, sm: 3, lg: 4 }, py: 4 }}>
        <PageHeader
          title="Ads Data"
          description="Upload Amazon Sponsored Products report exports. Plutus auto-detects marketplace/date range, then you confirm before save."
          variant="accent"
        />

        <Card sx={{ mt: 3, borderColor: 'divider' }}>
          <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box
              sx={{
                borderRadius: 2,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
                px: 2,
                py: 1.5,
                fontSize: '0.75rem',
                color: 'text.secondary',
              }}
            >
              Upload once. Plutus detects US/UK ranges from the file and lets you review in a modal before creating uploads.
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
              <input ref={fileInputRef} type="file" accept=".csv,.zip,.xlsx" onChange={onFileChange} style={{ display: 'none' }} />

              {isBusy ? (
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
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.secondary' }}>{busyLabel}</Typography>
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
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 500, color: 'text.primary' }}>Drop your SP report here</Typography>
                  <Typography sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>CSV, ZIP, or XLSX &middot; Advertised product report</Typography>
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

            {uploadError !== null && (
              <Box
                sx={{
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

            {uploadResults !== null && uploadResults.length > 0 && (
              <Box
                sx={{
                  borderRadius: 2,
                  border: 1,
                  borderColor: 'rgba(16, 185, 129, 0.3)',
                  bgcolor: 'rgba(16, 185, 129, 0.06)',
                  p: 2,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: '0.875rem', fontWeight: 500, color: 'success.dark' }}>
                  <CheckCircleIcon sx={{ fontSize: 16 }} />
                  Uploaded {uploadResults[0]?.filename} for {uploadResults.length} marketplace{uploadResults.length === 1 ? '' : 's'}
                </Box>
                <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: '0.75rem', color: 'success.dark', opacity: 0.8 }}>
                  {uploadResults.map((upload) => (
                    <Box key={upload.id}>
                      {marketplaceLabel(upload.marketplace)} &middot; Declared {upload.startDate}–{upload.endDate} &middot; Parsed {upload.minDate}
                      –{upload.maxDate} &middot; Rows {upload.rowCount.toLocaleString()} &middot; SKUs {upload.skuCount.toLocaleString()}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </CardContent>
        </Card>

        <Dialog
          open={reviewOpen}
          onOpenChange={(open) => {
            if (isUploading) {
              return;
            }
            if (!open) {
              clearPendingReview();
              return;
            }
            setReviewOpen(true);
          }}
          maxWidth="lg"
        >
          <DialogContent sx={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <DialogHeader>
              <DialogTitle>Review detected report details</DialogTitle>
              <DialogDescription>
                {pendingFilename === '' ? 'Detected report details.' : `Detected from ${pendingFilename}. Adjust ranges if needed, then upload.`}
              </DialogDescription>
            </DialogHeader>

            <Box
              sx={{
                borderRadius: 2,
                border: 1,
                borderColor: 'divider',
                bgcolor: 'action.hover',
                px: 1.5,
                py: 1,
                fontSize: '0.75rem',
                color: 'text.secondary',
                mt: 2,
              }}
            >
              Today UTC: {detectTodayUtc || '—'} &middot; Max allowed latest row date: {detectMaxAllowedDate || '—'} (3-day freshness guard)
            </Box>

            <Box sx={{ overflowX: 'auto', mt: 2 }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Include</TableHead>
                    <TableHead>Marketplace</TableHead>
                    <TableHead>Start date</TableHead>
                    <TableHead>End date</TableHead>
                    <TableHead sx={{ textAlign: 'right' }}>Rows</TableHead>
                    <TableHead sx={{ textAlign: 'right' }}>SKUs</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingTargets.map((target, index) => (
                    <TableRow key={target.marketplace}>
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={target.selected}
                          disabled={!target.isRecentEnough || isUploading}
                          onChange={(event) => {
                            const selected = event.target.checked;
                            setPendingTargets((prev) => prev.map((row, rowIdx) => (rowIdx === index ? { ...row, selected } : row)));
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" sx={{ fontSize: '10px' }}>
                          {marketplaceLabel(target.marketplace)} ({target.marketplace})
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={target.startDate}
                          onChange={(event) => {
                            const startDate = event.target.value;
                            setPendingTargets((prev) =>
                              prev.map((row, rowIdx) => (rowIdx === index ? { ...row, startDate } : row)),
                            );
                          }}
                          disabled={!target.selected || isUploading}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          value={target.endDate}
                          onChange={(event) => {
                            const endDate = event.target.value;
                            setPendingTargets((prev) => prev.map((row, rowIdx) => (rowIdx === index ? { ...row, endDate } : row)));
                          }}
                          disabled={!target.selected || isUploading}
                        />
                      </TableCell>
                      <TableCell sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{target.rowCount.toLocaleString()}</TableCell>
                      <TableCell sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{target.skuCount.toLocaleString()}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>
                        {target.isRecentEnough ? (
                          <Box component="span" sx={{ color: 'success.dark' }}>OK</Box>
                        ) : (
                          <Box component="span" sx={{ color: 'error.main' }}>Too recent for 3-day guard</Box>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>

            {selectedTargets.length === 0 && (
              <Box
                sx={{
                  borderRadius: 2,
                  bgcolor: 'rgba(245, 158, 11, 0.06)',
                  px: 1.5,
                  py: 1,
                  fontSize: '0.75rem',
                  color: 'warning.dark',
                  mt: 2,
                }}
              >
                Select at least one marketplace to upload.
              </Box>
            )}

            {hasInvalidSelectedDates && (
              <Box
                sx={{
                  borderRadius: 2,
                  bgcolor: 'rgba(239, 68, 68, 0.06)',
                  px: 1.5,
                  py: 1,
                  fontSize: '0.75rem',
                  color: 'error.main',
                  mt: 2,
                }}
              >
                One or more selected rows has an invalid date range.
              </Box>
            )}
          </DialogContent>

          <DialogFooter>
            <Button variant="outline" onClick={clearPendingReview} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={() => void submitDetectedUpload()} disabled={isUploading || selectedTargets.length === 0 || hasInvalidSelectedDates}>
              {isUploading ? 'Uploading...' : `Upload ${selectedTargets.length} marketplace${selectedTargets.length === 1 ? '' : 's'}`}
            </Button>
          </DialogFooter>
        </Dialog>

        <Card sx={{ mt: 3, borderColor: 'divider' }}>
          <CardContent sx={{ p: 3 }}>
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: 'text.primary' }}>Uploads</Typography>
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Used to weight settlement advertising allocations.</Typography>
              </Box>
            </Box>

            {isLoading && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Skeleton sx={{ height: 20, width: 192 }} />
                <Skeleton sx={{ height: 40, width: '100%' }} />
                <Skeleton sx={{ height: 40, width: '100%' }} />
              </Box>
            )}

            {!isLoading && data?.uploads?.length === 0 && (
              <EmptyState
                title="No uploads yet"
                description="Upload an Amazon Sponsored Products advertised product report above."
              />
            )}

            {!isLoading && data?.uploads?.length ? (
              <Box sx={{ overflowX: 'auto' }}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Declared range</TableHead>
                      <TableHead>Parsed range</TableHead>
                      <TableHead sx={{ textAlign: 'right' }}>Rows</TableHead>
                      <TableHead sx={{ textAlign: 'right' }}>SKUs</TableHead>
                      <TableHead sx={{ textAlign: 'right' }}>Uploaded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.uploads.map((upload) => (
                      <TableRow key={upload.id}>
                        <TableCell sx={{ fontSize: '0.875rem' }}>
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>{upload.reportType}</Box>
                            <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{upload.filename}</Box>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.875rem' }}>
                          <Badge variant="outline" sx={{ fontSize: '10px' }}>
                            {marketplaceLabel(upload.marketplace)}
                          </Badge>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                          {upload.startDate} &ndash; {upload.endDate}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>
                          {upload.minDate} &ndash; {upload.maxDate}
                        </TableCell>
                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{upload.rowCount.toLocaleString()}</TableCell>
                        <TableCell sx={{ textAlign: 'right', fontSize: '0.875rem', fontVariantNumeric: 'tabular-nums' }}>{upload.skuCount.toLocaleString()}</TableCell>
                        <TableCell sx={{ textAlign: 'right', fontSize: '0.75rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                          {new Date(upload.uploadedAt).toLocaleString('en-US')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            ) : null}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}
