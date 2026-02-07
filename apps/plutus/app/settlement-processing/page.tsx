'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { NotConnectedScreen } from '@/components/not-connected-screen';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type Marketplace = {
  id: 'amazon.com' | 'amazon.co.uk';
  label: 'Amazon.com' | 'Amazon.co.uk';
  currency: 'USD' | 'GBP';
  region: 'US' | 'UK';
};

type SettlementRow = {
  id: string;
  docNumber: string;
  postedDate: string;
  memo: string;
  marketplace: Marketplace;
  periodStart: string | null;
  periodEnd: string | null;
  settlementTotal: number | null;
  lmbStatus: 'Posted';
  plutusStatus: 'Pending' | 'Processed' | 'Blocked' | 'RolledBack';
};

type SettlementsResponse = {
  settlements: SettlementRow[];
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
};

type StoredAuditDataResponse = {
  uploads: Array<{ id: string; filename: string; rowCount: number; invoiceCount: number; uploadedAt: string }>;
  invoiceIds: string[];
};

type SettlementProcessingPreview = {
  marketplace: string;
  settlementJournalEntryId: string;
  settlementDocNumber: string;
  settlementPostedDate: string;
  invoiceId: string;
  processingHash: string;
  minDate: string;
  maxDate: string;
  blocks: Array<{ code: string; message: string; details?: Record<string, string | number> }>;
  sales: Array<{ orderId: string; sku: string; date: string; quantity: number; principalCents: number }>;
  returns: Array<{ orderId: string; sku: string; date: string; quantity: number; principalCents: number }>;
  cogsJournalEntry: { lines: Array<{ postingType: 'Debit' | 'Credit'; amountCents: number }> };
  pnlJournalEntry: { lines: Array<{ postingType: 'Debit' | 'Credit'; amountCents: number }> };
};

type ConnectionStatus = { connected: boolean };

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchSettlements(): Promise<SettlementsResponse> {
  const res = await fetch(`${basePath}/api/plutus/settlements?pageSize=100`);
  return res.json();
}

async function fetchStoredAuditData(): Promise<StoredAuditDataResponse> {
  const res = await fetch(`${basePath}/api/plutus/audit-data`);
  return res.json();
}

async function fetchPreview(settlementId: string, invoiceId: string): Promise<SettlementProcessingPreview> {
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/preview`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
  });
  return res.json();
}

async function postSettlement(settlementId: string, invoiceId: string) {
  const res = await fetch(`${basePath}/api/plutus/settlements/${settlementId}/process`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ invoiceId }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { ok: false as const, data };
  }
  return { ok: true as const, data };
}

function formatPeriod(start: string | null, end: string | null): string {
  if (start === null || end === null) return '';
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  const sameYear = s.getUTCFullYear() === e.getUTCFullYear();
  const startText = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' });
  const endText = e.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${startText} – ${endText}`;
}

export default function SettlementProcessingPage() {
  const queryClient = useQueryClient();

  const [selectedSettlement, setSelectedSettlement] = useState<string>('');
  const [selectedInvoice, setSelectedInvoice] = useState<string>('');
  const [preview, setPreview] = useState<SettlementProcessingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPosting, setIsPosting] = useState(false);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data: settlementsData, isLoading: isLoadingSettlements } = useQuery({
    queryKey: ['plutus-settlements-all'],
    queryFn: fetchSettlements,
    enabled: connection?.connected === true,
    staleTime: 30 * 1000,
  });

  const { data: auditData, isLoading: isLoadingAuditData } = useQuery({
    queryKey: ['plutus-audit-data'],
    queryFn: fetchStoredAuditData,
    staleTime: 60 * 1000,
  });

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Settlement Processing" />;
  }

  const pendingSettlements = (settlementsData?.settlements ?? []).filter((s) => s.plutusStatus === 'Pending');
  const invoiceIds = auditData?.invoiceIds ?? [];
  const hasAuditData = invoiceIds.length > 0;

  async function handlePreview() {
    if (!selectedSettlement || !selectedInvoice) return;

    setPreview(null);
    setError(null);
    setIsPreviewLoading(true);

    try {
      const result = await fetchPreview(selectedSettlement, selectedInvoice);
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPreviewLoading(false);
    }
  }

  async function handlePost() {
    if (!selectedSettlement || !selectedInvoice) return;

    setIsPosting(true);
    setError(null);

    try {
      const result = await postSettlement(selectedSettlement, selectedInvoice);
      if (!result.ok) {
        setPreview(result.data);
        return;
      }

      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements-all'] });
      await queryClient.invalidateQueries({ queryKey: ['plutus-settlements'] });

      setPreview(null);
      setSelectedSettlement('');
      setSelectedInvoice('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsPosting(false);
    }
  }

  const isLoading = isLoadingSettlements || isLoadingAuditData;

  return (
    <main className="flex-1 page-enter">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader
          title="Settlement Processing"
          kicker="Plutus"
          description="Match audit data invoices to pending settlements, preview the results, and post to QuickBooks."
          actions={
            <Link
              href="/audit-data"
              className="text-sm font-medium text-brand-teal-600 hover:text-brand-teal-700 dark:text-brand-cyan dark:hover:text-brand-cyan/80"
            >
              Manage Audit Data
            </Link>
          }
        />

        {isLoading && (
          <Card className="border-slate-200/70 dark:border-white/10 mt-6">
            <CardContent className="p-6 space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        )}

        {!isLoading && !hasAuditData && (
          <Card className="border-slate-200/70 dark:border-white/10 mt-6">
            <CardContent className="p-6">
              <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 dark:border-white/10 dark:bg-white/5">
                <div className="flex flex-col items-center gap-2 text-center">
                  <svg className="h-8 w-8 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9.75m3 0H9.75m0 0v3m0-3v-3m-6-3.375c0-1.036.84-1.875 1.875-1.875H9M3.75 21h16.5M3.75 21V6.375c0-1.036.84-1.875 1.875-1.875h3" />
                  </svg>
                  <div className="text-sm font-medium text-slate-900 dark:text-white">No audit data uploaded yet</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">
                    Upload the LMB Audit Data CSV on the{' '}
                    <Link href="/audit-data" className="font-medium text-brand-teal-600 underline dark:text-brand-cyan">
                      Audit Data
                    </Link>{' '}
                    page first.
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!isLoading && hasAuditData && (
          <>
            <Card className="border-slate-200/70 dark:border-white/10 mt-6">
              <CardContent className="p-6 space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Settlement</div>
                    <Select
                      value={selectedSettlement}
                      onValueChange={(v) => {
                        setSelectedSettlement(v);
                        setPreview(null);
                      }}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-900">
                        <SelectValue placeholder="Select a pending settlement..." />
                      </SelectTrigger>
                      <SelectContent>
                        {pendingSettlements.length === 0 && (
                          <div className="px-3 py-2 text-sm text-slate-500">No pending settlements</div>
                        )}
                        {pendingSettlements.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.docNumber} {formatPeriod(s.periodStart, s.periodEnd) && `(${formatPeriod(s.periodStart, s.periodEnd)})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {pendingSettlements.length} pending settlement{pendingSettlements.length === 1 ? '' : 's'}
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Invoice</div>
                    <Select
                      value={selectedInvoice}
                      onValueChange={(v) => {
                        setSelectedInvoice(v);
                        setPreview(null);
                      }}
                    >
                      <SelectTrigger className="bg-white dark:bg-slate-900">
                        <SelectValue placeholder="Select an invoice..." />
                      </SelectTrigger>
                      <SelectContent>
                        {invoiceIds.map((id) => (
                          <SelectItem key={id} value={id}>
                            {id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      {invoiceIds.length} invoice{invoiceIds.length === 1 ? '' : 's'} from uploaded audit data
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => void handlePreview()}
                  disabled={!selectedSettlement || !selectedInvoice || isPreviewLoading}
                >
                  {isPreviewLoading ? 'Computing preview...' : 'Preview'}
                </Button>
              </CardContent>
            </Card>

            {error && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                {error}
              </div>
            )}

            {preview && (
              <Card className="border-slate-200/70 dark:border-white/10 mt-4">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">
                        Preview &middot; {preview.settlementDocNumber} &middot; Invoice {preview.invoiceId}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        Hash {preview.processingHash.slice(0, 10)} &middot; {preview.minDate} &rarr; {preview.maxDate}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={preview.blocks.length === 0 ? 'success' : 'destructive'}>
                        {preview.blocks.length === 0 ? 'Ready' : 'Blocked'}
                      </Badge>
                      {preview.blocks.length === 0 && (
                        <Button onClick={() => void handlePost()} disabled={isPosting}>
                          {isPosting ? 'Posting...' : 'Post to QBO'}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card className="border-slate-200/70 dark:border-white/10">
                      <CardContent className="p-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Sales</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{preview.sales.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200/70 dark:border-white/10">
                      <CardContent className="p-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">Returns</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">{preview.returns.length}</div>
                      </CardContent>
                    </Card>
                    <Card className="border-slate-200/70 dark:border-white/10">
                      <CardContent className="p-3">
                        <div className="text-xs text-slate-500 dark:text-slate-400">JE Lines</div>
                        <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-white">
                          {preview.cogsJournalEntry.lines.length + preview.pnlJournalEntry.lines.length}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {preview.blocks.length > 0 && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900/50 dark:bg-red-900/20">
                      <div className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">Blocked</div>
                      <ul className="text-sm text-red-700 dark:text-red-200 space-y-1">
                        {preview.blocks.map((b, idx) => (
                          <li key={idx}>
                            <span className="font-mono">{b.code}</span>: {b.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </main>
  );
}
