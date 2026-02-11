'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Plus,
  RefreshCw,
  Save,
  Search,
  X,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTransactionsStore } from '@/lib/store/transactions';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

type ConnectionStatus = {
  connected: boolean;
  homeCurrency?: string;
  error?: string;
};

type BillComponent =
  | 'manufacturing'
  | 'freight'
  | 'duty'
  | 'mfgAccessories'
  | 'warehousing3pl'
  | 'warehouseAmazonFc'
  | 'warehouseAwd'
  | 'productExpenses';

type BillTrackedLine = {
  lineId: string;
  amount: number;
  description: string;
  account: string;
  accountId: string;
  component: BillComponent;
};

type BillMappingLine = {
  qboLineId: string;
  component: string;
  amountCents: number;
  sku: string | null;
  quantity: number | null;
};

type BillMapping = {
  id: string;
  poNumber: string;
  brandId: string;
  syncedAt: string | null;
  lines: BillMappingLine[];
};

type TransactionLine = {
  id: string;
  amount: number;
  postingType?: 'Debit' | 'Credit';
  description: string | null;
  accountId: string | null;
  accountName: string | null;
  accountFullyQualifiedName: string | null;
  accountType: string | null;
};

type TransactionRow = {
  id: string;
  type: 'JournalEntry' | 'Bill' | 'Purchase';
  txnDate: string;
  docNumber: string;
  memo: string;
  entityName: string;
  totalAmount: number;
  lines: TransactionLine[];
  createdAt?: string;
  updatedAt?: string;
  isTrackedBill?: boolean;
  trackedLines?: BillTrackedLine[];
  mapping?: BillMapping | null;
};

type BrandOption = { id: string; name: string };
type SkuOption = { id: string; sku: string; productName: string | null; brandId: string };

type TransactionsResponse = {
  transactions: TransactionRow[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
  brands?: BrandOption[];
  skus?: SkuOption[];
};

type BillRow = TransactionRow & {
  type: 'Bill';
  isTrackedBill: boolean;
  trackedLines: BillTrackedLine[];
  mapping: BillMapping | null;
};

type MappingStatus = 'unmapped' | 'saved' | 'synced';

type SplitEntryState = {
  id: string;
  sku: string;
  quantity: string;
};

type LineEditState = {
  mode: 'single' | 'split';
  sku: string;
  quantity: string;
  splits: SplitEntryState[];
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
  warehousing3pl: '3PL',
  warehouseAmazonFc: 'Amazon FC',
  warehouseAwd: 'AWD',
  productExpenses: 'Product Expenses',
};

function isBillRow(row: TransactionRow): row is BillRow {
  return row.type === 'Bill';
}

function normalizeSku(raw: string): string {
  return raw.trim().replace(/\s+/g, '-').toUpperCase();
}

function parsePositiveInteger(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function qboTransactionUrl(row: TransactionRow): string {
  const qboBaseUrl = 'https://app.qbo.intuit.com/app';

  switch (row.type) {
    case 'JournalEntry':
      return `${qboBaseUrl}/journal?txnId=${encodeURIComponent(row.id)}`;
    case 'Bill':
      return `${qboBaseUrl}/bill?txnId=${encodeURIComponent(row.id)}`;
    case 'Purchase':
      return `${qboBaseUrl}/expense?txnId=${encodeURIComponent(row.id)}`;
    default: {
      const exhaustiveCheck: never = row.type;
      throw new Error(`Unsupported transaction type: ${exhaustiveCheck}`);
    }
  }
}

function formatMoney(amount: number, currency: string): string {
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(Math.abs(amount));

  if (amount < 0) return `(${formatted})`;
  return formatted;
}

function TypeBadge({ type }: { type: TransactionRow['type'] }) {
  const config = {
    JournalEntry: { label: 'Journal Entry', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' },
    Bill: { label: 'Bill', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    Purchase: { label: 'Expense', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' },
  };

  const { label, className } = config[type];

  return (
    <span className={cn('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', className)}>
      {label}
    </span>
  );
}

function getBillStatus(row: BillRow): MappingStatus {
  if (!row.mapping) return 'unmapped';
  if (row.mapping.syncedAt) return 'synced';
  return 'saved';
}

function BillStatusBadge({ status }: { status: MappingStatus }) {
  const config: Record<MappingStatus, { style: string; label: string }> = {
    unmapped: {
      style: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      label: 'Unmapped',
    },
    saved: {
      style: 'bg-slate-100/70 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300',
      label: 'Saved',
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

function buildBillAccountSummary(row: BillRow): string {
  const trackedAccounts = Array.from(new Set(row.trackedLines.map((line) => line.account.trim()).filter((name) => name !== '')));
  if (trackedAccounts.length === 1) {
    return trackedAccounts[0] as string;
  }
  if (trackedAccounts.length > 1) {
    return `Split (${trackedAccounts.length})`;
  }

  const allAccounts = Array.from(
    new Set(
      row.lines
        .map((line) => {
          if (line.accountFullyQualifiedName) return line.accountFullyQualifiedName;
          if (line.accountName) return line.accountName;
          return '';
        })
        .map((name) => name.trim())
        .filter((name) => name !== ''),
    ),
  );

  if (allAccounts.length === 0) return 'Non-tracked';
  if (allAccounts.length === 1) return allAccounts[0] as string;
  return `Split (${allAccounts.length})`;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

let splitIdCounter = 0;
function nextSplitId() {
  splitIdCounter += 1;
  return `split-${splitIdCounter}`;
}

function makeSplitEntry(sku: string = '', quantity: string = ''): SplitEntryState {
  return { id: nextSplitId(), sku, quantity };
}

function initBillEditState(bill: BillRow): BillEditState {
  const lines: Record<string, LineEditState> = {};
  for (const trackedLine of bill.trackedLines) {
    const mappedLine = bill.mapping?.lines.find((line) => line.qboLineId === trackedLine.lineId);
    const sku = mappedLine?.sku ? mappedLine.sku : '';
    const quantity = mappedLine?.quantity !== null && mappedLine?.quantity !== undefined ? String(mappedLine.quantity) : '';
    lines[trackedLine.lineId] = {
      mode: 'single',
      sku,
      quantity,
      splits: [makeSplitEntry(sku, quantity), makeSplitEntry()],
    };
  }

  return {
    poNumber: bill.mapping?.poNumber ? bill.mapping.poNumber : '',
    brandId: bill.mapping?.brandId ? bill.mapping.brandId : '',
    lines,
  };
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchTransactions(input: {
  type: 'journalEntry' | 'bill' | 'purchase';
  page: number;
  pageSize: number;
  search: string;
  startDate: string | null;
  endDate: string | null;
}): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  params.set('type', input.type);
  params.set('page', String(input.page));
  params.set('pageSize', String(input.pageSize));
  if (input.search.trim() !== '') params.set('search', input.search.trim());
  if (input.startDate !== null && input.startDate.trim() !== '') params.set('startDate', input.startDate.trim());
  if (input.endDate !== null && input.endDate.trim() !== '') params.set('endDate', input.endDate.trim());

  const res = await fetch(`${basePath}/api/plutus/transactions?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function saveBillMapping(input: {
  bill: BillRow;
  editState: BillEditState;
}): Promise<unknown> {
  const payloadLines = input.bill.trackedLines.map((trackedLine) => {
    const lineState = input.editState.lines[trackedLine.lineId];
    if (!lineState) {
      throw new Error(`Missing line state: ${trackedLine.lineId}`);
    }

    if (trackedLine.component === 'manufacturing' && lineState.mode === 'split') {
      const splits = lineState.splits.map((split) => {
        const quantity = parsePositiveInteger(split.quantity);
        if (quantity === null) {
          throw new Error('Split quantity must be a positive integer');
        }
        return {
          sku: split.sku.trim(),
          quantity,
        };
      });

      return {
        qboLineId: trackedLine.lineId,
        component: trackedLine.component,
        amountCents: Math.round(trackedLine.amount * 100),
        splits,
      };
    }

    const quantity = parsePositiveInteger(lineState.quantity);

    return {
      qboLineId: trackedLine.lineId,
      component: trackedLine.component,
      amountCents: Math.round(trackedLine.amount * 100),
      sku: lineState.sku !== '' ? lineState.sku : undefined,
      quantity: quantity !== null ? quantity : undefined,
    };
  });

  const res = await fetch(`${basePath}/api/plutus/bills`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qboBillId: input.bill.id,
      poNumber: input.editState.poNumber,
      brandId: input.editState.brandId,
      billDate: input.bill.txnDate,
      vendorName: input.bill.entityName,
      totalAmount: input.bill.totalAmount,
      lines: payloadLines,
    }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }

  return res.json();
}

async function syncMappedBillsBulk(qboBillIds: string[]): Promise<{ successCount: number; failureCount: number; failures: Array<{ qboBillId: string; error: string }> }> {
  const res = await fetch(`${basePath}/api/plutus/bills/sync-bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qboBillIds }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }

  return res.json();
}

function EditBillModal({
  bill,
  brands,
  skus,
  open,
  onOpenChange,
}: {
  bill: BillRow;
  brands: BrandOption[];
  skus: SkuOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<BillEditState>(() => initBillEditState(bill));
  const [saveError, setSaveError] = useState<string | null>(null);

  const filteredSkus = useMemo(() => {
    if (editState.brandId === '') return [];
    return skus.filter((sku) => sku.brandId === editState.brandId);
  }, [editState.brandId, skus]);

  const saveMutation = useMutation({
    mutationFn: () => saveBillMapping({ bill, editState }),
    onSuccess: () => {
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['plutus-transactions'] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      setSaveError(error.message);
    },
  });

  const canSave = useMemo(() => {
    if (editState.poNumber.trim() === '' || editState.brandId === '') {
      return false;
    }

    for (const trackedLine of bill.trackedLines) {
      if (trackedLine.component !== 'manufacturing') {
        continue;
      }

      const lineState = editState.lines[trackedLine.lineId];
      if (!lineState) {
        return false;
      }

      if (lineState.mode === 'single') {
        if (lineState.sku.trim() === '') {
          return false;
        }
        if (parsePositiveInteger(lineState.quantity) === null) {
          return false;
        }
        continue;
      }

      if (lineState.splits.length < 2) {
        return false;
      }

      const seenSkus = new Set<string>();
      for (const split of lineState.splits) {
        const normalizedSku = normalizeSku(split.sku);
        if (normalizedSku === '') {
          return false;
        }
        if (seenSkus.has(normalizedSku)) {
          return false;
        }
        seenSkus.add(normalizedSku);

        if (parsePositiveInteger(split.quantity) === null) {
          return false;
        }
      }
    }

    return true;
  }, [bill.trackedLines, editState]);

  const updateLine = (lineId: string, patch: Partial<LineEditState>) => {
    setEditState((prev) => ({
      ...prev,
      lines: {
        ...prev.lines,
        [lineId]: {
          ...prev.lines[lineId],
          ...patch,
        },
      },
    }));
  };

  const updateSplit = (lineId: string, splitId: string, patch: Partial<SplitEntryState>) => {
    const lineState = editState.lines[lineId];
    if (!lineState) return;
    const splits = lineState.splits.map((split) => (split.id === splitId ? { ...split, ...patch } : split));
    updateLine(lineId, { splits });
  };

  const addSplit = (lineId: string) => {
    const lineState = editState.lines[lineId];
    if (!lineState) return;
    updateLine(lineId, { splits: [...lineState.splits, makeSplitEntry()] });
  };

  const removeSplit = (lineId: string, splitId: string) => {
    const lineState = editState.lines[lineId];
    if (!lineState || lineState.splits.length <= 2) return;
    updateLine(lineId, { splits: lineState.splits.filter((split) => split.id !== splitId) });
  };

  const toggleSplitMode = (lineId: string) => {
    const lineState = editState.lines[lineId];
    if (!lineState) return;

    if (lineState.mode === 'single') {
      const first = makeSplitEntry(lineState.sku, lineState.quantity);
      const second = makeSplitEntry();
      updateLine(lineId, { mode: 'split', splits: [first, second] });
      return;
    }

    const primary = lineState.splits[0];
    updateLine(lineId, {
      mode: 'single',
      sku: primary ? primary.sku : '',
      quantity: primary ? primary.quantity : '',
      splits: [makeSplitEntry(), makeSplitEntry()],
    });
  };

  const handleBrandChange = (brandId: string) => {
    const clearedLines: Record<string, LineEditState> = {};
    for (const [lineId, lineState] of Object.entries(editState.lines)) {
      clearedLines[lineId] = {
        ...lineState,
        sku: '',
        quantity: '',
        splits: [makeSplitEntry(), makeSplitEntry()],
      };
    }
    setEditState((prev) => ({ ...prev, brandId, lines: clearedLines }));
  };

  const mappedBrandName = brands.find((brand) => brand.id === bill.mapping?.brandId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{bill.entityName}</span>
            <a
              href={qboTransactionUrl(bill)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-brand-teal-600 hover:bg-brand-teal-50 dark:text-slate-400 dark:hover:text-brand-teal-300 dark:hover:bg-brand-teal-900/20 transition-colors"
              title="Open in QuickBooks"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              QuickBooks
            </a>
          </DialogTitle>
          <DialogDescription>
            {bill.txnDate} &middot; {formatCurrency(bill.totalAmount)}
            {bill.docNumber.trim() !== '' ? ` \u00b7 ${bill.docNumber}` : ''}
            {mappedBrandName ? ` \u00b7 ${mappedBrandName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PO Number</label>
              <Input
                value={editState.poNumber}
                onChange={(event) => setEditState((prev) => ({ ...prev, poNumber: event.target.value }))}
                placeholder="e.g. PO-2026-001"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Brand</label>
              <select
                value={editState.brandId}
                onChange={(event) => handleBrandChange(event.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/40"
              >
                <option value="">Select brand</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Tracked Lines
            </h3>
            <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                    <TableHead className="text-xs">Account</TableHead>
                    <TableHead className="text-xs">SKU / Split</TableHead>
                    <TableHead className="text-xs w-24">Qty</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                    <TableHead className="text-xs w-24">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.trackedLines.map((trackedLine) => {
                    const lineState = editState.lines[trackedLine.lineId];
                    const isManufacturing = trackedLine.component === 'manufacturing';
                    if (!lineState) {
                      return null;
                    }

                    return (
                      <TableRow key={trackedLine.lineId}>
                        <TableCell className="text-xs text-slate-600 dark:text-slate-400">{trackedLine.account}</TableCell>
                        <TableCell>
                          {isManufacturing && lineState.mode === 'split' ? (
                            <div className="space-y-1">
                              {lineState.splits.map((split) => (
                                <div key={split.id} className="flex items-center gap-2">
                                  <select
                                    value={split.sku}
                                    onChange={(event) => updateSplit(trackedLine.lineId, split.id, { sku: event.target.value })}
                                    disabled={editState.brandId === ''}
                                    className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500 disabled:opacity-50"
                                  >
                                    <option value="">{editState.brandId === '' ? 'Select brand first' : 'Select SKU'}</option>
                                    {filteredSkus.map((sku) => (
                                      <option key={sku.id} value={sku.sku}>
                                        {sku.sku}{sku.productName ? ` - ${sku.productName}` : ''}
                                      </option>
                                    ))}
                                  </select>
                                  <Input
                                    type="number"
                                    min="1"
                                    step="1"
                                    value={split.quantity}
                                    onChange={(event) => updateSplit(trackedLine.lineId, split.id, { quantity: event.target.value })}
                                    placeholder="Qty"
                                    className="h-7 w-20 text-xs"
                                  />
                                  {lineState.splits.length > 2 && (
                                    <button
                                      onClick={() => removeSplit(trackedLine.lineId, split.id)}
                                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <select
                              value={lineState.sku}
                              onChange={(event) => updateLine(trackedLine.lineId, { sku: event.target.value })}
                              disabled={editState.brandId === ''}
                              className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500 disabled:opacity-50"
                            >
                              <option value="">{editState.brandId === '' ? 'Select brand first' : 'Select SKU'}</option>
                              {filteredSkus.map((sku) => (
                                <option key={sku.id} value={sku.sku}>
                                  {sku.sku}{sku.productName ? ` - ${sku.productName}` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </TableCell>
                        <TableCell>
                          {isManufacturing ? (
                            lineState.mode === 'split' ? (
                              <span className="text-xs text-slate-500 dark:text-slate-400">Split by rows</span>
                            ) : (
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={lineState.quantity}
                                onChange={(event) => updateLine(trackedLine.lineId, { quantity: event.target.value })}
                                placeholder="Units"
                                className="h-7 w-20 text-xs"
                              />
                            )
                          ) : (
                            <span className="text-xs text-slate-400">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {COMPONENT_LABELS[trackedLine.component] ? COMPONENT_LABELS[trackedLine.component] : trackedLine.component}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">
                          {formatCurrency(trackedLine.amount)}
                        </TableCell>
                        <TableCell>
                          {isManufacturing && (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => toggleSplitMode(trackedLine.lineId)}
                                className="h-7 px-2 text-xs"
                              >
                                {lineState.mode === 'split' ? 'Single' : 'Split'}
                              </Button>
                              {lineState.mode === 'split' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => addSplit(trackedLine.lineId)}
                                  className="h-7 px-2 text-xs"
                                >
                                  <Plus className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {saveError && (
          <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            className="gap-1.5"
          >
            <Save className="h-3.5 w-3.5" />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TransactionsPage() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  const tab = useTransactionsStore((s) => s.tab);
  const searchInput = useTransactionsStore((s) => s.searchInput);
  const search = useTransactionsStore((s) => s.search);
  const startDate = useTransactionsStore((s) => s.startDate);
  const endDate = useTransactionsStore((s) => s.endDate);
  const page = useTransactionsStore((s) => s.page);
  const pageSize = useTransactionsStore((s) => s.pageSize);
  const setTab = useTransactionsStore((s) => s.setTab);
  const setSearchInput = useTransactionsStore((s) => s.setSearchInput);
  const setSearch = useTransactionsStore((s) => s.setSearch);
  const setStartDate = useTransactionsStore((s) => s.setStartDate);
  const setEndDate = useTransactionsStore((s) => s.setEndDate);
  const setPage = useTransactionsStore((s) => s.setPage);
  const setPageSize = useTransactionsStore((s) => s.setPageSize);
  const clear = useTransactionsStore((s) => s.clear);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editBill, setEditBill] = useState<BillRow | null>(null);
  const [bulkSyncError, setBulkSyncError] = useState<string | null>(null);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab === 'bill' && tab !== 'bill') {
      setTab('bill');
      setPage(1);
    }
  }, [searchParams, setPage, setTab, tab]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, setPage, setSearch]);

  const normalizedStartDate = startDate.trim() === '' ? null : startDate.trim();
  const normalizedEndDate = endDate.trim() === '' ? null : endDate.trim();

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const apiType = tab;
  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-transactions', apiType, page, pageSize, search, normalizedStartDate, normalizedEndDate],
    queryFn: () =>
      fetchTransactions({
        type: apiType,
        page,
        pageSize,
        search,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
      }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const syncMappedMutation = useMutation({
    mutationFn: (qboBillIds: string[]) => syncMappedBillsBulk(qboBillIds),
    onSuccess: (result) => {
      setBulkSyncError(null);
      queryClient.invalidateQueries({ queryKey: ['plutus-transactions'] });
      if (result.failureCount > 0) {
        const sample = result.failures.slice(0, 3).map((failure) => `${failure.qboBillId}: ${failure.error}`).join(' | ');
        setBulkSyncError(`Synced ${result.successCount}. Failed ${result.failureCount}. ${sample}`);
      }
    },
    onError: (mutationError: Error) => {
      setBulkSyncError(mutationError.message);
    },
  });

  const currency = connection?.homeCurrency ? connection.homeCurrency : 'USD';
  const rows = useMemo(() => (data ? data.transactions : []), [data]);

  const billRows = useMemo(() => rows.filter(isBillRow).map((row) => ({
    ...row,
    isTrackedBill: row.isTrackedBill === true,
    trackedLines: row.trackedLines ? row.trackedLines : [],
    mapping: row.mapping ? row.mapping : null,
  })), [rows]);

  const brands = useMemo(() => (data?.brands ? data.brands : []), [data]);
  const skus = useMemo(() => (data?.skus ? data.skus : []), [data]);

  const brandNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const brand of brands) {
      map.set(brand.id, brand.name);
    }
    return map;
  }, [brands]);

  const mappedBillIds = useMemo(
    () => billRows.filter((row) => row.isTrackedBill && row.mapping !== null).map((row) => row.id),
    [billRows],
  );

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Transactions" error={connection.error} />;
  }

  return (
    <main className="flex-1 page-enter">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <PageHeader title="Transactions" variant="accent" />

        <div className="mt-6 grid gap-4">
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value as typeof tab);
              setExpanded({});
              setPage(1);
            }}
          >
            <TabsList>
              <TabsTrigger value="journalEntry">Journal entries</TabsTrigger>
              <TabsTrigger value="bill">Bills</TabsTrigger>
              <TabsTrigger value="purchase">Purchases</TabsTrigger>
            </TabsList>
          </Tabs>

          <Card className="border-slate-200/70 dark:border-white/10">
            <CardContent className="p-4">
              <div className="grid gap-3 md:grid-cols-[1.25fr,0.55fr,0.55fr,0.45fr,auto] md:items-end">
                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    Search
                  </div>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Doc number…"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    Start date
                  </div>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      setStartDate(value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    End date
                  </div>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      setEndDate(value);
                      setPage(1);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    Rows
                  </div>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setExpanded({});
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="bg-white dark:bg-white/5">
                      <SelectValue placeholder="Rows…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="250">250</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  {tab === 'bill' && (
                    <Button
                      variant="outline"
                      onClick={() => syncMappedMutation.mutate(mappedBillIds)}
                      disabled={mappedBillIds.length === 0 || syncMappedMutation.isPending}
                      className="gap-1.5"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', syncMappedMutation.isPending && 'animate-spin')} />
                      {syncMappedMutation.isPending ? 'Syncing...' : 'Sync Mapped Bills'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => clear()}
                    disabled={searchInput.trim() === '' && startDate.trim() === '' && endDate.trim() === ''}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {bulkSyncError && (
            <Card className="p-4 border-red-200 dark:border-red-900">
              <p className="text-sm text-red-700 dark:text-red-300">{bulkSyncError}</p>
            </Card>
          )}

          <Card className="border-slate-200/70 dark:border-white/10 overflow-hidden">
            <CardContent className="p-0">
              {tab === 'bill' ? (
                <div className="overflow-x-auto">
                  <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5 table-striped">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-white/[0.03]">
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Vendor</TableHead>
                        <TableHead className="font-semibold">PO</TableHead>
                        <TableHead className="font-semibold">Brand</TableHead>
                        <TableHead className="font-semibold">Status</TableHead>
                        <TableHead className="text-right font-semibold">Amount</TableHead>
                        <TableHead className="font-semibold">Account Summary</TableHead>
                        <TableHead className="w-10 text-right font-semibold">QBO</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading && (
                        <>
                          {Array.from({ length: 8 }).map((_, index) => (
                            <TableRow key={index}>
                              <TableCell colSpan={8} className="py-3">
                                <Skeleton className="h-10 w-full" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      )}

                      {!isLoading && error && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-danger-700 dark:text-danger-400">
                            {error instanceof Error ? error.message : String(error)}
                          </TableCell>
                        </TableRow>
                      )}

                      {!isLoading && !error && billRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <EmptyState
                              title="No bills found"
                              description="No bills match your current filters."
                            />
                          </TableCell>
                        </TableRow>
                      )}

                      {!isLoading && !error && billRows.map((row) => {
                        const status = getBillStatus(row);
                        const brandName = row.mapping ? brandNameById.get(row.mapping.brandId) : undefined;
                        const accountSummary = buildBillAccountSummary(row);

                        return (
                          <TableRow
                            key={row.id}
                            className={cn(
                              'transition-colors',
                              row.isTrackedBill
                                ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02]'
                                : 'opacity-90',
                            )}
                            onClick={() => {
                              if (row.isTrackedBill) {
                                setEditBill(row);
                              }
                            }}
                          >
                            <TableCell className="whitespace-nowrap text-sm">{row.txnDate}</TableCell>
                            <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{row.entityName.trim() === '' ? '—' : row.entityName}</TableCell>
                            <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-400">
                              {row.mapping && row.mapping.poNumber.trim() !== '' ? row.mapping.poNumber : <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                              {brandName ? brandName : <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                            </TableCell>
                            <TableCell><BillStatusBadge status={status} /></TableCell>
                            <TableCell className="text-right tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                              {formatMoney(row.totalAmount, currency)}
                            </TableCell>
                            <TableCell className="text-sm text-slate-600 dark:text-slate-400">{accountSummary}</TableCell>
                            <TableCell className="text-center">
                              <a
                                href={qboTransactionUrl(row)}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                className="inline-flex items-center justify-center h-7 w-7 rounded text-slate-400 hover:text-brand-teal-500 hover:bg-brand-teal-50 dark:hover:bg-brand-teal-900/20 transition-colors"
                                title="Open in QuickBooks"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5 table-striped">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-white/[0.03]">
                        <TableHead className="w-10"> </TableHead>
                        <TableHead className="font-semibold">Date</TableHead>
                        <TableHead className="font-semibold">Type</TableHead>
                        <TableHead className="font-semibold">No.</TableHead>
                        <TableHead className="font-semibold">Payee</TableHead>
                        <TableHead className="font-semibold">Memo</TableHead>
                        <TableHead className="font-semibold">Account</TableHead>
                        <TableHead className="text-right font-semibold">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading && (
                        <>
                          {Array.from({ length: 8 }).map((_, index) => (
                            <TableRow key={index}>
                              <TableCell colSpan={8} className="py-3">
                                <Skeleton className="h-10 w-full" />
                              </TableCell>
                            </TableRow>
                          ))}
                        </>
                      )}

                      {!isLoading && error && (
                        <TableRow>
                          <TableCell colSpan={8} className="py-10 text-center text-sm text-danger-700 dark:text-danger-400">
                            {error instanceof Error ? error.message : String(error)}
                          </TableCell>
                        </TableRow>
                      )}

                      {!isLoading && !error && rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <EmptyState
                              title="No transactions found"
                              description="No transactions match your current filters."
                            />
                          </TableCell>
                        </TableRow>
                      )}

                      {!isLoading && !error && rows.map((row) => {
                        const isExpanded = expanded[row.id] === true;
                        const docNumber = row.docNumber.trim() === '' ? '—' : row.docNumber;
                        const memo = row.memo.trim() === '' ? '—' : row.memo;

                        const uniqueAccounts = Array.from(
                          new Set(
                            row.lines
                              .map((line) => {
                                if (line.accountFullyQualifiedName) return line.accountFullyQualifiedName;
                                if (line.accountName) return line.accountName;
                                return '';
                              })
                              .map((name) => name.trim())
                              .filter((name) => name !== ''),
                          ),
                        );

                        let accountLabel = '—';
                        if (uniqueAccounts.length === 1) {
                          accountLabel = uniqueAccounts[0] as string;
                        } else if (uniqueAccounts.length > 1) {
                          accountLabel = `Split (${uniqueAccounts.length})`;
                        }

                        return (
                          <Fragment key={row.id}>
                            <TableRow className="table-row-hover group">
                              <TableCell className="align-top">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpanded((prev) => ({
                                      ...prev,
                                      [row.id]: !(prev[row.id] === true),
                                    }))
                                  }
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:shadow dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-300 dark:hover:bg-white/5"
                                  aria-expanded={isExpanded}
                                >
                                  <ChevronDown
                                    className={cn(
                                      'h-3.5 w-3.5 transition-transform duration-200',
                                      isExpanded ? 'rotate-180' : 'rotate-0',
                                    )}
                                  />
                                </button>
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700 dark:text-slate-200">
                                {new Date(`${row.txnDate}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC' })}
                              </TableCell>
                              <TableCell className="align-top">
                                <TypeBadge type={row.type} />
                              </TableCell>
                              <TableCell className="align-top">
                                <div className="flex items-start gap-2">
                                  <div className="font-mono text-xs text-slate-700 dark:text-slate-200">{docNumber}</div>
                                  <Button
                                    asChild
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 -mt-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100"
                                  >
                                    <a
                                      href={qboTransactionUrl(row)}
                                      target="_blank"
                                      rel="noreferrer"
                                      aria-label="Open in QuickBooks"
                                      title="Open in QuickBooks"
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell className="align-top text-xs text-slate-700 dark:text-slate-200">
                                {row.entityName.trim() === '' ? '—' : row.entityName}
                              </TableCell>
                              <TableCell
                                className="align-top text-xs text-slate-700 dark:text-slate-200 max-w-[200px] truncate"
                                title={memo === '—' ? undefined : memo}
                              >
                                {memo}
                              </TableCell>
                              <TableCell
                                className="align-top text-xs text-slate-700 dark:text-slate-200 max-w-[200px] truncate"
                                title={accountLabel === '—' ? undefined : accountLabel}
                              >
                                {accountLabel}
                              </TableCell>
                              <TableCell className="align-top text-right text-xs font-semibold tabular-nums text-slate-900 dark:text-white">
                                {formatMoney(row.totalAmount, currency)}
                              </TableCell>
                            </TableRow>

                            {isExpanded && (
                              <TableRow className="bg-slate-50/50 dark:bg-white/[0.03]">
                                <TableCell colSpan={8} className="p-0">
                                  <div className="expand-content p-4">
                                    <div className="rounded-xl border border-slate-200/70 bg-white dark:border-white/10 dark:bg-slate-950/40 overflow-hidden shadow-sm">
                                      <div className="px-4 py-3 border-b border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
                                        <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                          Line items
                                        </div>
                                      </div>
                                      <div className="overflow-x-auto">
                                        <Table className="text-xs [&_th]:h-8 [&_th]:px-2 [&_td]:px-2 [&_td]:py-1.5">
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead>Account</TableHead>
                                              <TableHead>Description</TableHead>
                                              <TableHead>Type</TableHead>
                                              <TableHead>Posting</TableHead>
                                              <TableHead className="text-right">Amount</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {row.lines.length === 0 && (
                                              <TableRow>
                                                <TableCell
                                                  colSpan={5}
                                                  className="py-8 text-center text-sm text-slate-500 dark:text-slate-400"
                                                >
                                                  No line items found for this transaction.
                                                </TableCell>
                                              </TableRow>
                                            )}

                                            {row.lines.map((line) => {
                                              const lineAccountLabel = line.accountFullyQualifiedName
                                                ? line.accountFullyQualifiedName
                                                : line.accountName
                                                  ? line.accountName
                                                  : 'Uncategorized';

                                              const signedAmount = line.postingType === 'Credit' ? -line.amount : line.amount;

                                              return (
                                                <TableRow key={line.id}>
                                                  <TableCell className="min-w-[340px]">
                                                    <div className="text-xs font-medium text-slate-900 dark:text-white line-clamp-1" title={lineAccountLabel}>
                                                      {lineAccountLabel}
                                                    </div>
                                                  </TableCell>
                                                  <TableCell
                                                    className="min-w-[280px] text-xs text-slate-700 dark:text-slate-200 line-clamp-1"
                                                    title={line.description && line.description.trim() !== '' ? line.description : undefined}
                                                  >
                                                    {line.description && line.description.trim() !== '' ? line.description : '—'}
                                                  </TableCell>
                                                  <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                                                    {line.accountType ? line.accountType : '—'}
                                                  </TableCell>
                                                  <TableCell className="text-xs">
                                                    {line.postingType ? (
                                                      <span className={cn(
                                                        'font-medium',
                                                        line.postingType === 'Debit' ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400',
                                                      )}>
                                                        {line.postingType}
                                                      </span>
                                                    ) : '—'}
                                                  </TableCell>
                                                  <TableCell className={cn(
                                                    'text-right text-xs font-semibold tabular-nums',
                                                    signedAmount >= 0 ? 'text-slate-900 dark:text-white' : 'text-red-600 dark:text-red-400',
                                                  )}>
                                                    {formatMoney(signedAmount, currency)}
                                                  </TableCell>
                                                </TableRow>
                                              );
                                            })}
                                          </TableBody>
                                        </Table>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {data && data.pagination.totalCount > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border-t border-slate-200/70 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.03]">
                  <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    Showing {(data.pagination.page - 1) * data.pagination.pageSize + 1}–{Math.min(data.pagination.page * data.pagination.pageSize, data.pagination.totalCount)} of {data.pagination.totalCount}
                  </p>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)} className="h-8 w-8 p-0">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= data.pagination.totalPages}
                      onClick={() => setPage(page + 1)}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {editBill && (
          <EditBillModal
            key={editBill.id}
            bill={editBill}
            brands={brands}
            skus={skus}
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                setEditBill(null);
              }
            }}
          />
        )}
      </div>
    </main>
  );
}
