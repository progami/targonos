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
};

type MappingLine = {
  qboLineId: string;
  component: string;
  amountCents: number;
  sku: string | null;
  quantity: number | null;
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
    brandId: string;
    syncedAt: string | null;
    lines: MappingLine[];
  } | null;
};

type BrandOption = {
  id: string;
  name: string;
};

type SkuOption = {
  id: string;
  sku: string;
  productName: string | null;
  brandId: string;
};

type BillsResponse = {
  bills: BillData[];
  brands: BrandOption[];
  skus: SkuOption[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
};

type ConnectionStatus = { connected: boolean };

type MappingStatus = 'unmapped' | 'saved';

type LineEditState = {
  sku: string;
  quantity: string;
};

type BillEditState = {
  poNumber: string;
  brandId: string;
  lines: Record<string, LineEditState>;
};

const COMPONENT_LABELS: Record<string, string> = {
  manufacturing: 'Manufacturing',
  freight: 'Freight',
  duty: 'Duty',
  mfgAccessories: 'Mfg Accessories',
};

function getStatus(bill: BillData): MappingStatus {
  if (!bill.mapping) return 'unmapped';
  return 'saved';
}

function StatusBadge({ status }: { status: MappingStatus }) {
  const config: Record<MappingStatus, { style: string; label: string }> = {
    unmapped: {
      style: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      label: 'Unmapped',
    },
    saved: {
      style: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
      label: 'Saved',
    },
  };

  const { style, label } = config[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium', style)}>
      {status === 'saved' && <CheckCircle2 className="h-3 w-3" />}
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
      brandId: editState.brandId,
      billDate: bill.date,
      vendorName: bill.vendor,
      totalAmount: bill.amount,
      lines: bill.inventoryLines.map((line) => {
        const lineState = editState.lines[line.lineId];
        return {
          qboLineId: line.lineId,
          component: line.component,
          amountCents: Math.round(line.amount * 100),
          sku: lineState?.sku !== '' ? lineState?.sku : undefined,
          quantity: lineState?.quantity !== '' ? Number(lineState?.quantity) : undefined,
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

function initLineEditState(bill: BillData): Record<string, LineEditState> {
  const lines: Record<string, LineEditState> = {};
  for (const line of bill.inventoryLines) {
    const mappingLine = bill.mapping?.lines.find((ml) => ml.qboLineId === line.lineId);
    lines[line.lineId] = {
      sku: mappingLine?.sku ?? '',
      quantity: mappingLine?.quantity != null ? String(mappingLine.quantity) : '',
    };
  }
  return lines;
}

function BillRow({
  bill,
  brands,
  skus,
}: {
  bill: BillData;
  brands: BrandOption[];
  skus: SkuOption[];
}) {
  const queryClient = useQueryClient();
  const status = getStatus(bill);
  const [expanded, setExpanded] = useState(false);

  const [editState, setEditState] = useState<BillEditState>(() => ({
    poNumber: bill.mapping?.poNumber ?? '',
    brandId: bill.mapping?.brandId ?? '',
    lines: initLineEditState(bill),
  }));

  const [saveError, setSaveError] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => saveBillMapping(bill, editState),
    onSuccess: () => {
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['plutus-bills'] });
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  const filteredSkus = useMemo(() => {
    if (editState.brandId === '') return [];
    return skus.filter((s) => s.brandId === editState.brandId);
  }, [skus, editState.brandId]);

  const hasValidMapping = editState.poNumber.trim() !== '' && editState.brandId !== '';

  const handleBrandChange = (newBrandId: string) => {
    const clearedLines: Record<string, LineEditState> = {};
    for (const [lineId, lineState] of Object.entries(editState.lines)) {
      clearedLines[lineId] = { ...lineState, sku: '', quantity: '' };
    }
    setEditState((prev) => ({ ...prev, brandId: newBrandId, lines: clearedLines }));
  };

  const updateLine = (lineId: string, field: keyof LineEditState, value: string) => {
    setEditState((prev) => ({
      ...prev,
      lines: {
        ...prev.lines,
        [lineId]: { ...prev.lines[lineId]!, [field]: value },
      },
    }));
  };

  return (
    <Fragment>
      <TableRow className="table-row-hover">
        <TableCell className="w-8">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-200 dark:hover:bg-white/5 transition-colors"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </TableCell>
        <TableCell className="whitespace-nowrap text-sm">{bill.date}</TableCell>
        <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{bill.vendor}</TableCell>
        <TableCell>
          <Input
            value={editState.poNumber}
            onChange={(e) => setEditState((prev) => ({ ...prev, poNumber: e.target.value }))}
            placeholder="e.g. PO-2026-001"
            className="h-8 w-40 font-mono text-xs"
          />
        </TableCell>
        <TableCell>
          <select
            value={editState.brandId}
            onChange={(e) => handleBrandChange(e.target.value)}
            className="h-8 w-36 rounded-md border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500"
          >
            <option value="">Select brand</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </TableCell>
        <TableCell>
          <StatusBadge status={status} />
        </TableCell>
        <TableCell className="text-right tabular-nums text-sm font-medium text-slate-900 dark:text-white">
          {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(bill.amount)}
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => saveMutation.mutate()}
              disabled={!hasValidMapping || saveMutation.isPending}
              className="gap-1 h-7 text-xs px-2"
            >
              <Save className="h-3 w-3" />
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>

            {saveMutation.isSuccess && (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            )}
          </div>

          {saveError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{saveError}</p>
          )}
        </TableCell>
      </TableRow>

      {expanded && bill.inventoryLines.map((line) => {
        const lineState = editState.lines[line.lineId];
        const isManufacturing = line.component === 'manufacturing';
        return (
          <TableRow key={line.lineId} className="bg-slate-50/50 dark:bg-slate-800/30">
            <TableCell />
            <TableCell colSpan={2} className="text-xs text-slate-600 dark:text-slate-400">
              {line.account}
            </TableCell>
            <TableCell>
              <select
                value={lineState?.sku ?? ''}
                onChange={(e) => updateLine(line.lineId, 'sku', e.target.value)}
                disabled={editState.brandId === ''}
                className="h-7 w-40 rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500 disabled:opacity-50"
              >
                <option value="">{editState.brandId === '' ? 'Select brand first' : 'Select SKU'}</option>
                {filteredSkus.map((s) => (
                  <option key={s.id} value={s.sku}>
                    {s.sku}{s.productName ? ` - ${s.productName}` : ''}
                  </option>
                ))}
              </select>
            </TableCell>
            <TableCell>
              {isManufacturing ? (
                <Input
                  type="number"
                  min="1"
                  value={lineState?.quantity ?? ''}
                  onChange={(e) => updateLine(line.lineId, 'quantity', e.target.value)}
                  placeholder="Units"
                  className="h-7 w-20 text-xs"
                />
              ) : (
                <span className="text-xs text-slate-400">-</span>
              )}
            </TableCell>
            <TableCell>
              <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                {COMPONENT_LABELS[line.component] ?? line.component}
              </span>
            </TableCell>
            <TableCell className="text-right tabular-nums text-xs font-medium text-slate-700 dark:text-slate-300">
              {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(line.amount)}
            </TableCell>
            <TableCell />
          </TableRow>
        );
      })}
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

  const brands = useMemo(() => {
    return billsQuery.data ? billsQuery.data.brands : [];
  }, [billsQuery.data]);

  const skus = useMemo(() => {
    return billsQuery.data ? billsQuery.data.skus : [];
  }, [billsQuery.data]);

  const counts = useMemo(() => {
    const all = bills.length;
    const saved = bills.filter((b) => getStatus(b) === 'saved').length;
    const unmapped = bills.filter((b) => getStatus(b) === 'unmapped').length;
    return { all, saved, unmapped };
  }, [bills]);

  const totalPages = billsQuery.data ? billsQuery.data.pagination.totalPages : 1;

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
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Assign Brand, PO & SKUs</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Each inventory bill needs a brand, PO number, and per-line SKU assignments.
                </p>
                <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Select the brand from the dropdown</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Enter the PO number (e.g. <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono dark:bg-white/10">PO-2026-001</code>)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Expand the row to assign SKUs and quantities to each line</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>Click <strong>Save</strong> to store the mapping and sync to QBO</span>
                  </li>
                </ul>
              </Card>

              <Card className="p-5 border-slate-200/70 dark:border-white/10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-teal-50 text-xs font-bold text-brand-teal-600 dark:bg-brand-teal-950/50 dark:text-brand-teal-400">
                    2
                  </div>
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">What happens on Save</h2>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Saving stores the mapping in Plutus and pushes the PO number to the bill memo in QuickBooks.
                </p>
                <pre className="code-block">{`Memo: PO: PO-2026-001`}</pre>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                  Plutus uses PO numbers to group manufacturing, freight, and duty bills for cost allocation.
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
                      Saved: {counts.saved}
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
                        <TableHead className="w-8" />
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Brand</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bills.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="p-0">
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
                            brands={brands}
                            skus={skus}
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
