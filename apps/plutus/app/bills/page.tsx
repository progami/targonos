'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  Save,
  Upload,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { EmptyState } from '@/components/ui/empty-state';
import { useBillsStore } from '@/lib/store/bills';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type InventoryLine = {
  lineId: string;
  amount: number;
  description: string;
  account: string;
  accountId: string;
  component: 'manufacturing' | 'freight' | 'duty' | 'mfgAccessories';
  mappedSku: string | null;
  mappedQuantity: number | null;
};

type BillData = {
  id: string;
  syncToken: string;
  date: string;
  amount: number;
  docNumber: string;
  memo: string;
  vendor: string;
  vendorId?: string;
  inventoryLines: InventoryLine[];
  mapping: {
    id: string;
    poNumber: string;
    syncedAt: string | null;
  } | null;
};

type SkuOption = {
  sku: string;
  productName: string | null;
};

type BillsResponse = {
  bills: BillData[];
  skus: SkuOption[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type ConnectionStatus = { connected: boolean };

type MappingStatus = 'unmapped' | 'mapped' | 'synced';

type LineEditState = {
  sku: string;
  quantity: string;
};

type BillEditState = {
  poNumber: string;
  lines: Record<string, LineEditState>;
};

function getStatus(bill: BillData): MappingStatus {
  if (!bill.mapping) return 'unmapped';
  if (bill.mapping.syncedAt) return 'synced';
  return 'mapped';
}

const COMPONENT_LABELS: Record<string, string> = {
  manufacturing: 'Manufacturing',
  freight: 'Freight',
  duty: 'Duty',
  mfgAccessories: 'Mfg Accessories',
};

function StatusBadge({ status }: { status: MappingStatus }) {
  const config: Record<MappingStatus, { style: string; label: string }> = {
    unmapped: {
      style: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      label: 'Unmapped',
    },
    mapped: {
      style: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
      label: 'Mapped',
    },
    synced: {
      style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
      label: 'Synced',
    },
  };

  const { style, label } = config[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', style)}>
      {status === 'synced' && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </span>
  );
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchBills(page: number, startDate?: string, endDate?: string): Promise<BillsResponse> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: '50',
  });
  if (startDate !== undefined) params.set('startDate', startDate);
  if (endDate !== undefined) params.set('endDate', endDate);

  const res = await fetch(`${basePath}/api/plutus/bills?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function saveBillMapping(bill: BillData, editState: BillEditState): Promise<unknown> {
  const res = await fetch(`${basePath}/api/plutus/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qboBillId: bill.id,
      poNumber: editState.poNumber,
      billDate: bill.date,
      vendorName: bill.vendor,
      totalAmount: bill.amount,
      lines: bill.inventoryLines.map((line) => {
        const lineEdit = editState.lines[line.lineId];
        return {
          qboLineId: line.lineId,
          component: line.component,
          sku: lineEdit?.sku ? lineEdit.sku : null,
          quantity: lineEdit?.quantity ? parseInt(lineEdit.quantity, 10) : null,
          amountCents: Math.round(line.amount * 100),
        };
      }),
    }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function syncBillToQbo(qboBillId: string): Promise<unknown> {
  const res = await fetch(`${basePath}/api/plutus/bills/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qboBillId }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

function BillRow({
  bill,
  skus,
  isExpanded,
  onToggle,
}: {
  bill: BillData;
  skus: SkuOption[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const queryClient = useQueryClient();
  const status = getStatus(bill);

  const [editState, setEditState] = useState<BillEditState>(() => {
    const lines: Record<string, LineEditState> = {};
    for (const line of bill.inventoryLines) {
      lines[line.lineId] = {
        sku: line.mappedSku ? line.mappedSku : '',
        quantity: line.mappedQuantity ? String(line.mappedQuantity) : '',
      };
    }
    return {
      poNumber: bill.mapping?.poNumber ? bill.mapping.poNumber : '',
      lines,
    };
  });

  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => saveBillMapping(bill, editState),
    onSuccess: () => {
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['plutus-bills'] });
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  const syncMutation = useMutation({
    mutationFn: () => syncBillToQbo(bill.id),
    onSuccess: () => {
      setSyncError(null);
      queryClient.invalidateQueries({ queryKey: ['plutus-bills'] });
    },
    onError: (err: Error) => setSyncError(err.message),
  });

  const hasValidMapping = editState.poNumber.trim() !== '' &&
    bill.inventoryLines.every((line) => {
      if (line.component === 'manufacturing') {
        const lineEdit = editState.lines[line.lineId];
        return lineEdit?.sku && lineEdit?.quantity && parseInt(lineEdit.quantity, 10) > 0;
      }
      return true;
    });

  const isMapped = status === 'mapped' || status === 'synced';

  return (
    <Fragment>
      <TableRow className="table-row-hover cursor-row" onClick={onToggle}>
        <TableCell className="w-10">
          {isExpanded
            ? <ChevronDown className="h-4 w-4 text-slate-400" />
            : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">{bill.date}</TableCell>
        <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{bill.vendor}</TableCell>
        <TableCell className="text-sm">
          {bill.mapping?.poNumber
            ? <span className="font-mono text-xs">{bill.mapping.poNumber}</span>
            : <span className="text-slate-400 italic text-xs">(not set)</span>}
        </TableCell>
        <TableCell>
          <StatusBadge status={status} />
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm font-medium text-slate-900 dark:text-white">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(bill.amount)}
        </TableCell>
      </TableRow>

      {isExpanded && (
        <TableRow>
          <TableCell colSpan={6} className="bg-slate-50/50 dark:bg-white/[0.02] p-0">
            <div className="expand-content px-4 py-4 ml-6">
              {/* PO Number input */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap">
                  PO Number
                </label>
                <Input
                  value={editState.poNumber}
                  onChange={(e) => setEditState((prev) => ({ ...prev, poNumber: e.target.value }))}
                  placeholder="e.g. PO-2026-001"
                  className="h-8 w-48 font-mono text-xs"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Line items table */}
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    <th className="text-left pb-2 pr-4">Component</th>
                    <th className="text-left pb-2 pr-4">Account</th>
                    <th className="text-left pb-2 pr-4">SKU</th>
                    <th className="text-left pb-2 pr-4">Qty</th>
                    <th className="text-right pb-2">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {bill.inventoryLines.map((line) => {
                    const lineEdit = editState.lines[line.lineId];
                    return (
                      <tr key={line.lineId}>
                        <td className="py-2 pr-4">
                          <span className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                            line.component === 'manufacturing'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
                          )}>
                            {COMPONENT_LABELS[line.component]}
                          </span>
                        </td>
                        <td className="py-2 pr-4 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {line.account}
                        </td>
                        <td className="py-2 pr-4">
                          <div className="relative">
                            <input
                              type="text"
                              list={`skus-${bill.id}-${line.lineId}`}
                              value={lineEdit?.sku ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setEditState((prev) => ({
                                  ...prev,
                                  lines: {
                                    ...prev.lines,
                                    [line.lineId]: {
                                      ...(prev.lines[line.lineId] ?? { sku: '', quantity: '' }),
                                      sku: value,
                                    },
                                  },
                                }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              placeholder={line.component === 'manufacturing' ? 'Required' : 'Optional'}
                              className="h-7 w-32 rounded-md border border-slate-200 bg-white px-2 text-xs font-mono dark:border-white/10 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-brand-teal-500"
                            />
                            <datalist id={`skus-${bill.id}-${line.lineId}`}>
                              {skus.map((s) => (
                                <option key={s.sku} value={s.sku}>
                                  {s.productName ? s.productName : s.sku}
                                </option>
                              ))}
                            </datalist>
                          </div>
                        </td>
                        <td className="py-2 pr-4">
                          {line.component === 'manufacturing' ? (
                            <Input
                              type="number"
                              min={1}
                              value={lineEdit?.quantity ?? ''}
                              onChange={(e) => {
                                const value = e.target.value;
                                setEditState((prev) => ({
                                  ...prev,
                                  lines: {
                                    ...prev.lines,
                                    [line.lineId]: {
                                      ...(prev.lines[line.lineId] ?? { sku: '', quantity: '' }),
                                      quantity: value,
                                    },
                                  },
                                }));
                              }}
                              onClick={(e) => e.stopPropagation()}
                              placeholder="Units"
                              className="h-7 w-20 text-xs"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-2 text-right tabular-nums font-medium text-slate-700 dark:text-slate-300">
                          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(line.amount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveMutation.mutate();
                  }}
                  disabled={!hasValidMapping || saveMutation.isPending}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  {saveMutation.isPending ? 'Saving...' : 'Save Mapping'}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    syncMutation.mutate();
                  }}
                  disabled={!isMapped || syncMutation.isPending}
                  className="gap-1.5"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {syncMutation.isPending ? 'Syncing...' : 'Sync to QBO'}
                </Button>

                {saveMutation.isSuccess && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>
                )}
                {syncMutation.isSuccess && (
                  <span className="text-xs text-emerald-600 dark:text-emerald-400">Synced</span>
                )}
              </div>

              {saveError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{saveError}</p>
              )}
              {syncError && (
                <p className="mt-2 text-xs text-red-600 dark:text-red-400">{syncError}</p>
              )}

              {bill.mapping?.syncedAt && (
                <p className="mt-2 text-xs text-slate-400">
                  Last synced: {new Date(bill.mapping.syncedAt).toLocaleString()}
                </p>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
}

export default function BillsPage() {
  const tab = useBillsStore((s) => s.tab);
  const page = useBillsStore((s) => s.page);
  const startDate = useBillsStore((s) => s.startDate);
  const endDate = useBillsStore((s) => s.endDate);
  const setTab = useBillsStore((s) => s.setTab);
  const setPage = useBillsStore((s) => s.setPage);
  const setStartDate = useBillsStore((s) => s.setStartDate);
  const setEndDate = useBillsStore((s) => s.setEndDate);
  const clearDates = useBillsStore((s) => s.clearDates);

  const [expandedBills, setExpandedBills] = useState<Set<string>>(new Set());

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 5 * 60 * 1000,
  });

  const editorEnabled = tab === 'editor' && connection !== undefined && connection.connected === true;
  const billsQuery = useQuery({
    queryKey: ['plutus-bills', page, startDate, endDate],
    queryFn: () => {
      const normalizedStartDate = startDate === '' ? undefined : startDate;
      const normalizedEndDate = endDate === '' ? undefined : endDate;
      return fetchBills(page, normalizedStartDate, normalizedEndDate);
    },
    enabled: editorEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const bills = useMemo(() => {
    return billsQuery.data ? billsQuery.data.bills : [];
  }, [billsQuery.data]);

  const skus = useMemo(() => {
    return billsQuery.data ? billsQuery.data.skus : [];
  }, [billsQuery.data]);

  const counts = useMemo(() => {
    const all = bills.length;
    const mapped = bills.filter((b) => getStatus(b) === 'mapped').length;
    const synced = bills.filter((b) => getStatus(b) === 'synced').length;
    const unmapped = bills.filter((b) => getStatus(b) === 'unmapped').length;
    return { all, mapped, synced, unmapped };
  }, [bills]);

  const totalPages = billsQuery.data ? billsQuery.data.pagination.totalPages : 1;

  const toggleBillExpand = (billId: string) => {
    setExpandedBills((prev) => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
      }
      return next;
    });
  };

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Bills" />;
  }

  // Generate page numbers for pagination
  const pageNumbers: number[] = [];
  const maxVisiblePages = 5;
  if (totalPages <= maxVisiblePages) {
    for (let i = 1; i <= totalPages; i++) pageNumbers.push(i);
  } else {
    let start = Math.max(1, page - 2);
    const end = Math.min(totalPages, start + maxVisiblePages - 1);
    if (end - start < maxVisiblePages - 1) start = Math.max(1, end - maxVisiblePages + 1);
    for (let i = start; i <= end; i++) pageNumbers.push(i);
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Bills" variant="accent" />

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'guide' | 'editor')} className="mt-6">
          <TabsList>
            <TabsTrigger value="guide">Bill Guide</TabsTrigger>
            <TabsTrigger value="editor">
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Bill Editor
            </TabsTrigger>
          </TabsList>

          <TabsContent value="guide">
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="p-5 border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-600 dark:bg-brand-teal-950/50 dark:text-brand-teal-400">
                    1
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">PO Memo Rule</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Every Manufacturing/Freight/Duty bill for a PO must use the exact memo format.
                </p>
                <pre className="code-block">{`PO: PO-2026-001`}</pre>
                <ul className="mt-3 text-sm text-slate-600 dark:text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Start with <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono dark:bg-white/10">PO: </code> (including the space)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>No extra text in memo</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Same memo across manufacturing + freight + duty bills</span>
                  </li>
                </ul>
              </Card>

              <Card className="p-5 border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-600 dark:bg-brand-teal-950/50 dark:text-brand-teal-400">
                    2
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Manufacturing Line Description
                  </h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Manufacturing lines must be parseable into SKU + quantity.
                </p>
                <pre className="code-block">{`CS-007 x 500 units\nCS 007 x 500\nCS-010 500 units`}</pre>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Plutus uses these lines to calculate unit costs from bills.
                </p>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="editor">
            <div className="space-y-4">
              {/* Filters + Summary */}
              <Card className="p-5 border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-white/5">
                  <div className="flex flex-wrap gap-2 text-sm">
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                      Inventory Bills: {counts.all}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/60 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" />
                      Synced: {counts.synced}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100/60 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200">
                      Mapped: {counts.mapped}
                    </span>
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/60 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400">
                      Unmapped: {counts.unmapped}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Start date
                    </label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      End date
                    </label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        setEndDate(e.target.value);
                        setPage(1);
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => clearDates()}>
                      Clear
                    </Button>
                    <Button
                      onClick={() => {
                        setPage(1);
                        billsQuery.refetch();
                      }}
                      disabled={billsQuery.isFetching}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', billsQuery.isFetching && 'animate-spin')} />
                      {billsQuery.isFetching ? 'Loading...' : 'Refresh'}
                    </Button>
                  </div>
                </div>
              </Card>

              {billsQuery.error && (
                <Card className="p-5 border-red-200 dark:border-red-900">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {billsQuery.error instanceof Error ? billsQuery.error.message : String(billsQuery.error)}
                  </p>
                </Card>
              )}

              <Card className="p-0 overflow-hidden border-slate-200/70 dark:border-white/10">
                <div className="overflow-x-auto">
                  <Table className="table-striped">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                        <TableHead className="w-10" />
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="p-0">
                            <EmptyState
                              title={isCheckingConnection || billsQuery.isFetching ? 'Loading...' : 'No inventory bills found'}
                              description={isCheckingConnection || billsQuery.isFetching ? undefined : 'No bills with inventory accounts were found. Try adjusting your date range.'}
                            />
                          </TableCell>
                        </TableRow>
                      ) : (
                        bills.map((bill) => (
                          <BillRow
                            key={bill.id}
                            bill={bill}
                            skus={skus}
                            isExpanded={expandedBills.has(bill.id)}
                            onToggle={() => toggleBillExpand(bill.id)}
                          />
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page > 1 ? page - 1 : 1)}
                    disabled={page === 1 || billsQuery.isFetching}
                    className="gap-1"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </Button>
                  <div className="flex items-center gap-1">
                    {pageNumbers.map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        disabled={billsQuery.isFetching}
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors',
                          p === page
                            ? 'bg-brand-teal-500 text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5',
                        )}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage(page + 1)}
                    disabled={billsQuery.isFetching || page >= totalPages}
                    className="gap-1"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
