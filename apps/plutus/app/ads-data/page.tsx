'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Upload } from 'lucide-react';

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
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Ads Data"
          description="Upload Amazon Sponsored Products report exports. Plutus auto-detects marketplace/date range, then you confirm before save."
          variant="accent"
        />

        <Card className="mt-6 border-slate-200/70 dark:border-white/10">
          <CardContent className="p-6 space-y-5">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              Upload once. Plutus detects US/UK ranges from the file and lets you review in a modal before creating uploads.
            </div>

            <div
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
                isDragging
                  ? 'border-brand-teal-500 bg-brand-teal-50/50 dark:border-brand-cyan dark:bg-brand-cyan/5'
                  : 'border-slate-300 hover:border-brand-teal-400 dark:border-slate-700 dark:hover:border-brand-cyan/50'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <input ref={fileInputRef} type="file" accept=".csv,.zip,.xlsx" onChange={onFileChange} className="hidden" />

              {isBusy ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-teal-500 dark:border-slate-700 dark:border-t-brand-cyan" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{busyLabel}</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal-600 dark:bg-brand-teal-950/40 dark:text-brand-cyan">
                    <Upload className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Drop your SP report here</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">CSV, ZIP, or XLSX &middot; Advertised product report</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 rounded-lg bg-brand-teal-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-teal-600 dark:bg-brand-cyan dark:text-slate-900 dark:hover:bg-brand-cyan/90"
                  >
                    Choose File
                  </button>
                </>
              )}
            </div>

            {uploadError !== null && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            {uploadResults !== null && uploadResults.length > 0 && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Uploaded {uploadResults[0]?.filename} for {uploadResults.length} marketplace{uploadResults.length === 1 ? '' : 's'}
                </div>
                <div className="mt-2 space-y-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  {uploadResults.map((upload) => (
                    <div key={upload.id}>
                      {marketplaceLabel(upload.marketplace)} &middot; Declared {upload.startDate}–{upload.endDate} &middot; Parsed {upload.minDate}
                      –{upload.maxDate} &middot; Rows {upload.rowCount.toLocaleString()} &middot; SKUs {upload.skuCount.toLocaleString()}
                    </div>
                  ))}
                </div>
              </div>
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
        >
          <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Review detected report details</DialogTitle>
              <DialogDescription>
                {pendingFilename === '' ? 'Detected report details.' : `Detected from ${pendingFilename}. Adjust ranges if needed, then upload.`}
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
              Today UTC: {detectTodayUtc || '—'} &middot; Max allowed latest row date: {detectMaxAllowedDate || '—'} (3-day freshness guard)
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Include</TableHead>
                    <TableHead>Marketplace</TableHead>
                    <TableHead>Start date</TableHead>
                    <TableHead>End date</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead className="text-right">SKUs</TableHead>
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
                        <Badge variant="outline" className="text-[10px]">
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
                      <TableCell className="text-right tabular-nums">{target.rowCount.toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{target.skuCount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {target.isRecentEnough ? (
                          <span className="text-emerald-700 dark:text-emerald-400">OK</span>
                        ) : (
                          <span className="text-red-700 dark:text-red-400">Too recent for 3-day guard</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {selectedTargets.length === 0 && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Select at least one marketplace to upload.
              </div>
            )}

            {hasInvalidSelectedDates && (
              <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/30 dark:text-red-400">
                One or more selected rows has an invalid date range.
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={clearPendingReview} disabled={isUploading}>
                Cancel
              </Button>
              <Button onClick={() => void submitDetectedUpload()} disabled={isUploading || selectedTargets.length === 0 || hasInvalidSelectedDates}>
                {isUploading ? 'Uploading...' : `Upload ${selectedTargets.length} marketplace${selectedTargets.length === 1 ? '' : 's'}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card className="mt-6 border-slate-200/70 dark:border-white/10">
          <CardContent className="p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">Uploads</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Used to weight settlement advertising allocations.</div>
              </div>
            </div>

            {isLoading && (
              <div className="space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            )}

            {!isLoading && data?.uploads?.length === 0 && (
              <EmptyState
                title="No uploads yet"
                description="Upload an Amazon Sponsored Products advertised product report above."
              />
            )}

            {!isLoading && data?.uploads?.length ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Report</TableHead>
                      <TableHead>Marketplace</TableHead>
                      <TableHead>Declared range</TableHead>
                      <TableHead>Parsed range</TableHead>
                      <TableHead className="text-right">Rows</TableHead>
                      <TableHead className="text-right">SKUs</TableHead>
                      <TableHead className="text-right">Uploaded</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.uploads.map((upload) => (
                      <TableRow key={upload.id}>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900 dark:text-white">{upload.reportType}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{upload.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline" className="text-[10px]">
                            {marketplaceLabel(upload.marketplace)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {upload.startDate} &ndash; {upload.endDate}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {upload.minDate} &ndash; {upload.maxDate}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{upload.rowCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{upload.skuCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {new Date(upload.uploadedAt).toLocaleString('en-US')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

