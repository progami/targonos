'use client';

import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileUp, Upload, CheckCircle2, AlertCircle } from 'lucide-react';

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

type ConnectionStatus = { connected: boolean };

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

function UploadIcon() {
  return (
    <svg className="h-10 w-10" viewBox="0 0 48 48" fill="none">
      <rect x="8" y="10" width="32" height="28" rx="4" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" />
      <path d="M24 20v12M20 24l4-4 4 4" className="stroke-slate-300 dark:stroke-slate-600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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

      const formData = new FormData();
      formData.set('file', file);

      const res = await fetch(`${basePath}/api/plutus/audit-data/upload`, {
        method: 'POST',
        body: formData,
      });

      const json = await res.json();

      if (!res.ok) {
        setUploadError(json.error ?? 'Upload failed');
        setIsUploading(false);
        return;
      }

      setUploadResult(json as UploadResult);
      setIsUploading(false);
      queryClient.invalidateQueries({ queryKey: ['audit-data-uploads'] });
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
    return <NotConnectedScreen title="Audit Data" />;
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Audit Data" variant="accent" />

        {/* Upload Zone */}
        <Card className="mt-6 border-slate-200/70 dark:border-white/10">
          <CardContent className="p-6">
            <div
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.zip"
                onChange={onFileChange}
                className="hidden"
              />

              {isUploading ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-teal-500 dark:border-slate-700 dark:border-t-brand-cyan" />
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Processing audit data...</p>
                </div>
              ) : (
                <>
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-teal-50 text-brand-teal-600 dark:bg-brand-teal-950/40 dark:text-brand-cyan">
                    <Upload className="h-7 w-7" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Drop your LMB Audit Data file here
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    CSV or ZIP &middot; One file covers all settlements in the date range
                  </p>
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

            {/* Upload Error */}
            {uploadError !== null && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {uploadError}
              </div>
            )}

            {/* Upload Result */}
            {uploadResult !== null && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Uploaded {uploadResult.filename} &mdash; {uploadResult.rowCount.toLocaleString()} rows across{' '}
                  {uploadResult.invoiceCount} settlement{uploadResult.invoiceCount === 1 ? '' : 's'}
                </div>
                {uploadResult.invoiceSummaries.length > 0 && (
                  <div className="mt-3 overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-emerald-100/50 dark:bg-emerald-950/30">
                          <TableHead className="text-emerald-700 dark:text-emerald-400">Invoice</TableHead>
                          <TableHead className="text-emerald-700 dark:text-emerald-400">Date Range</TableHead>
                          <TableHead className="text-emerald-700 dark:text-emerald-400 text-right">Rows</TableHead>
                          <TableHead className="text-emerald-700 dark:text-emerald-400 text-right">SKUs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {uploadResult.invoiceSummaries.map((s) => (
                          <TableRow key={s.invoiceId}>
                            <TableCell className="font-mono text-sm">{s.invoiceId}</TableCell>
                            <TableCell className="text-sm">
                              {s.minDate} &ndash; {s.maxDate}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">
                              {s.rowCount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm text-right tabular-nums">{s.skuCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upload History */}
        <Card className="mt-6 border-slate-200/70 dark:border-white/10 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table className="table-striped">
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-white/[0.03]">
                    <TableHead className="font-semibold">Filename</TableHead>
                    <TableHead className="font-semibold">Uploaded</TableHead>
                    <TableHead className="font-semibold text-right">Settlements</TableHead>
                    <TableHead className="font-semibold text-right">Rows</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && (
                    <>
                      {Array.from({ length: 3 }).map((_, idx) => (
                        <TableRow key={idx}>
                          <TableCell colSpan={5} className="py-4">
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </>
                  )}

                  {!isLoading && data && data.uploads.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5}>
                        <EmptyState
                          icon={<UploadIcon />}
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
                          <div className="flex items-center gap-2">
                            <FileUp className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{u.filename}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                          {new Date(u.uploadedAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </TableCell>
                        <TableCell className="text-sm text-right tabular-nums">{u.invoiceCount}</TableCell>
                        <TableCell className="text-sm text-right tabular-nums">
                          {u.rowCount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="success">Stored</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Loaded invoice IDs summary */}
        {data && data.invoiceIds.length > 0 && (
          <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
            Audit data available for {data.invoiceIds.length} settlement{data.invoiceIds.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </main>
  );
}
