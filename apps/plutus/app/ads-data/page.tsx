'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Upload } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
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

type AdsUploadRecord = {
  id: string;
  reportType: string;
  marketplace: 'amazon.com' | 'amazon.co.uk';
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

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchAdsData(): Promise<AdsDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/ads-data`);
  return res.json();
}

export default function AdsDataPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [marketplace, setMarketplace] = useState<'amazon.com' | 'amazon.co.uk'>('amazon.com');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

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

  const canUpload = useMemo(() => {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(startDate.trim()) &&
      /^\d{4}-\d{2}-\d{2}$/.test(endDate.trim()) &&
      startDate.trim() <= endDate.trim()
    );
  }, [endDate, startDate]);

  const handleUpload = useCallback(
    async (file: File) => {
      if (!canUpload) {
        setUploadError('Set a valid report start + end date first.');
        return;
      }

      setIsUploading(true);
      setUploadResult(null);
      setUploadError(null);

      try {
        const formData = new FormData();
        formData.set('file', file);
        formData.set('marketplace', marketplace);
        formData.set('startDate', startDate.trim());
        formData.set('endDate', endDate.trim());

        const res = await fetch(`${basePath}/api/plutus/ads-data/upload`, {
          method: 'POST',
          body: formData,
        });

        const json = await res.json();

        if (!res.ok) {
          setUploadError(json.error ?? 'Upload failed');
          return;
        }

        setUploadResult(json as UploadResult);
        queryClient.invalidateQueries({ queryKey: ['ads-data-uploads'] });
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [canUpload, endDate, marketplace, queryClient, startDate],
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
    return <NotConnectedScreen title="Ads Data" error={connection.error} />;
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Ads Data"
          description="Upload Amazon Sponsored Products report exports. Plutus uses the spend-by-SKU weights to allocate the settlement’s lump advertising cost across SKUs."
          variant="accent"
        />

        <Card className="mt-6 border-slate-200/70 dark:border-white/10">
          <CardContent className="p-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                  Marketplace
                </div>
                <select
                  value={marketplace}
                  onChange={(event) => setMarketplace(event.target.value as 'amazon.com' | 'amazon.co.uk')}
                  className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500"
                >
                  <option value="amazon.com">US (amazon.com)</option>
                  <option value="amazon.co.uk">UK (amazon.co.uk)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                  Report start date
                </div>
                <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </div>

              <div className="space-y-1.5">
                <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                  Report end date
                </div>
                <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </div>
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
              <input ref={fileInputRef} type="file" accept=".csv,.zip" onChange={onFileChange} className="hidden" />

              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-teal-500 dark:border-slate-700 dark:border-t-brand-cyan" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Processing ads report...</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal-600 dark:bg-brand-teal-950/40 dark:text-brand-cyan">
                    <Upload className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Drop your SP report here</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">CSV or ZIP &middot; Advertised product report</p>
                  <button
                    type="button"
                    disabled={!canUpload}
                    onClick={() => fileInputRef.current?.click()}
                    className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                      canUpload
                        ? 'bg-brand-teal-500 text-white hover:bg-brand-teal-600 dark:bg-brand-cyan dark:text-slate-900 dark:hover:bg-brand-cyan/90'
                        : 'bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-500 cursor-not-allowed'
                    }`}
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

            {uploadResult !== null && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Uploaded {uploadResult.filename} &mdash; stored {uploadResult.rowCount.toLocaleString()} rows across{' '}
                  {uploadResult.skuCount.toLocaleString()} SKU{uploadResult.skuCount === 1 ? '' : 's'} (raw {uploadResult.rawRowCount.toLocaleString()} rows)
                </div>
                <div className="mt-2 text-xs text-emerald-700/80 dark:text-emerald-400/80">
                  Declared range: {uploadResult.startDate} &ndash; {uploadResult.endDate} &middot; Parsed range:{' '}
                  {uploadResult.minDate} &ndash; {uploadResult.maxDate}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
                    {data.uploads.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900 dark:text-white">{u.reportType}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{u.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant="outline" className="text-[10px]">
                            {u.marketplace === 'amazon.com' ? 'US' : 'UK'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {u.startDate} &ndash; {u.endDate}
                        </TableCell>
                        <TableCell className="text-sm tabular-nums">
                          {u.minDate} &ndash; {u.maxDate}
                        </TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{u.rowCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{u.skuCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {new Date(u.uploadedAt).toLocaleString('en-US')}
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

