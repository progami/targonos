'use client';

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ExternalLink,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { EmptyState } from '@/components/ui/empty-state';
import { useBillsStore } from '@/lib/store/bills';
import { cn } from '@/lib/utils';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH;
if (basePath === undefined) {
  throw new Error('NEXT_PUBLIC_BASE_PATH is required');
}

// ── Types ──────────────────────────────────────────────────

type InventoryLine = {
  lineId: string;
  amount: number;
  description: string;
  account: string;
  accountId: string;
  component: 'manufacturing' | 'freight' | 'duty' | 'mfgAccessories' | 'warehousing3pl' | 'warehouseAmazonFc' | 'warehouseAwd';
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

type BrandOption = { id: string; name: string };
type SkuOption = { id: string; sku: string; productName: string | null; brandId: string };
type VendorOption = { id: string; name: string };

type BillsResponse = {
  bills: BillData[];
  realmId: string;
  brands: BrandOption[];
  skus: SkuOption[];
  pagination: { page: number; pageSize: number; totalCount: number; totalPages: number };
};

type ConnectionStatus = { connected: boolean };

type MappingStatus = 'unmapped' | 'saved';

type LineEditState = { sku: string; quantity: string };

type BillEditState = {
  poNumber: string;
  brandId: string;
  lines: Record<string, LineEditState>;
};

type CreateLineState = {
  id: string;
  component: string;
  amount: string;
  sku: string;
  quantity: string;
};

// ── Constants ──────────────────────────────────────────────

const COMPONENT_LABELS: Record<string, string> = {
  manufacturing: 'Manufacturing',
  freight: 'Freight',
  duty: 'Duty',
  mfgAccessories: 'Mfg Accessories',
  warehousing3pl: '3PL',
  warehouseAmazonFc: 'Amazon FC',
  warehouseAwd: 'AWD',
};

const COMPONENT_GROUPS = [
  {
    label: 'Inventory',
    options: [
      { value: 'manufacturing', label: 'Manufacturing' },
      { value: 'freight', label: 'Freight' },
      { value: 'duty', label: 'Duty' },
      { value: 'mfgAccessories', label: 'Mfg Accessories' },
    ],
  },
  {
    label: 'Warehousing',
    options: [
      { value: 'warehousing3pl', label: '3PL' },
      { value: 'warehouseAmazonFc', label: 'Amazon FC' },
      { value: 'warehouseAwd', label: 'AWD' },
    ],
  },
];

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

// ── Helpers ────────────────────────────────────────────────

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

function initLineEditState(bill: BillData): Record<string, LineEditState> {
  const lines: Record<string, LineEditState> = {};
  for (const line of bill.inventoryLines) {
    const ml = bill.mapping?.lines.find((m) => m.qboLineId === line.lineId);
    lines[line.lineId] = {
      sku: ml?.sku ?? '',
      quantity: ml?.quantity != null ? String(ml.quantity) : '',
    };
  }
  return lines;
}

let lineIdCounter = 0;
function nextLineId() {
  lineIdCounter += 1;
  return `line-${lineIdCounter}`;
}

// ── API Calls ──────────────────────────────────────────────

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchBillsList(page: number, startDate?: string, endDate?: string): Promise<BillsResponse> {
  const params = new URLSearchParams({ page: String(page), pageSize: '50' });
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
        const ls = editState.lines[line.lineId];
        return {
          qboLineId: line.lineId,
          component: line.component,
          amountCents: Math.round(line.amount * 100),
          sku: ls?.sku !== '' ? ls?.sku : undefined,
          quantity: ls?.quantity !== '' ? Number(ls?.quantity) : undefined,
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

async function fetchVendors(): Promise<VendorOption[]> {
  const res = await fetch(`${basePath}/api/plutus/bills/vendors`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  const data = await res.json();
  return data.vendors;
}

async function createBillApi(payload: {
  txnDate: string;
  vendorId: string;
  poNumber: string;
  brandId: string;
  lines: Array<{ component: string; amount: number; sku?: string; quantity?: number }>;
}): Promise<unknown> {
  const res = await fetch(`${basePath}/api/plutus/bills/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

// ── Edit Bill Modal ────────────────────────────────────────

function EditBillModal({
  bill,
  brands,
  skus,
  open,
  onOpenChange,
}: {
  bill: BillData;
  brands: BrandOption[];
  skus: SkuOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

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
      onOpenChange(false);
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

  const brandName = brands.find((b) => b.id === bill.mapping?.brandId)?.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{bill.vendor}</DialogTitle>
          <DialogDescription>
            {bill.date} &middot; {formatCurrency(bill.amount)}
            {bill.docNumber ? ` \u00b7 ${bill.docNumber}` : ''}
            {brandName ? ` \u00b7 ${brandName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* PO + Brand */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PO Number</label>
              <Input
                value={editState.poNumber}
                onChange={(e) => setEditState((prev) => ({ ...prev, poNumber: e.target.value }))}
                placeholder="e.g. PO-2026-001"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Brand</label>
              <select
                value={editState.brandId}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/40"
              >
                <option value="">Select brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Line Items
            </h3>
            <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                    <TableHead className="text-xs">Account</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs w-20">Qty</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bill.inventoryLines.map((line) => {
                    const ls = editState.lines[line.lineId];
                    const isMfg = line.component === 'manufacturing';
                    return (
                      <TableRow key={line.lineId}>
                        <TableCell className="text-xs text-slate-600 dark:text-slate-400">{line.account}</TableCell>
                        <TableCell>
                          <select
                            value={ls?.sku ?? ''}
                            onChange={(e) => updateLine(line.lineId, 'sku', e.target.value)}
                            disabled={editState.brandId === ''}
                            className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500 disabled:opacity-50"
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
                          {isMfg ? (
                            <Input
                              type="number"
                              min="1"
                              value={ls?.quantity ?? ''}
                              onChange={(e) => updateLine(line.lineId, 'quantity', e.target.value)}
                              placeholder="Units"
                              className="h-7 w-20 text-xs"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-white/10 dark:text-slate-300">
                            {COMPONENT_LABELS[line.component] ?? line.component}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs font-medium">
                          {formatCurrency(line.amount)}
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
            disabled={!hasValidMapping || saveMutation.isPending}
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

// ── Create Bill Modal ──────────────────────────────────────

function CreateBillModal({
  brands,
  skus,
  open,
  onOpenChange,
}: {
  brands: BrandOption[];
  skus: SkuOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();

  const [vendorId, setVendorId] = useState('');
  const [txnDate, setTxnDate] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [brandId, setBrandId] = useState('');
  const [lines, setLines] = useState<CreateLineState[]>(() => [
    { id: nextLineId(), component: 'manufacturing', amount: '', sku: '', quantity: '' },
  ]);
  const [createError, setCreateError] = useState<string | null>(null);

  const vendorsQuery = useQuery({
    queryKey: ['plutus-vendors'],
    queryFn: fetchVendors,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const apiLines = lines.map((l) => ({
        component: l.component,
        amount: parseFloat(l.amount),
        sku: l.sku !== '' ? l.sku : undefined,
        quantity: l.quantity !== '' ? parseInt(l.quantity, 10) : undefined,
      }));
      return createBillApi({ txnDate, vendorId, poNumber, brandId, lines: apiLines });
    },
    onSuccess: () => {
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ['plutus-bills'] });
      resetForm();
      onOpenChange(false);
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const filteredSkus = useMemo(() => {
    if (brandId === '') return [];
    return skus.filter((s) => s.brandId === brandId);
  }, [skus, brandId]);

  const totalAmount = useMemo(() => {
    return lines.reduce((sum, l) => {
      const val = parseFloat(l.amount);
      return sum + (Number.isFinite(val) ? val : 0);
    }, 0);
  }, [lines]);

  const isValid =
    vendorId !== '' &&
    txnDate !== '' &&
    poNumber.trim() !== '' &&
    brandId !== '' &&
    lines.length > 0 &&
    lines.every((l) => l.component !== '' && parseFloat(l.amount) > 0);

  function resetForm() {
    setVendorId('');
    setTxnDate('');
    setPoNumber('');
    setBrandId('');
    setLines([{ id: nextLineId(), component: 'manufacturing', amount: '', sku: '', quantity: '' }]);
    setCreateError(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }

  function addLine() {
    setLines((prev) => [...prev, { id: nextLineId(), component: 'manufacturing', amount: '', sku: '', quantity: '' }]);
  }

  function removeLine(id: string) {
    setLines((prev) => prev.filter((l) => l.id !== id));
  }

  function updateLineField(id: string, field: keyof CreateLineState, value: string) {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }

  function handleBrandChange(newBrandId: string) {
    setBrandId(newBrandId);
    setLines((prev) => prev.map((l) => ({ ...l, sku: '', quantity: '' })));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Bill</DialogTitle>
          <DialogDescription>
            Create a bill in QuickBooks and save the cost mapping.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vendor + Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Vendor</label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/40"
              >
                <option value="">
                  {vendorsQuery.isLoading ? 'Loading vendors...' : 'Select vendor'}
                </option>
                {(vendorsQuery.data ?? []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
              <Input
                type="date"
                value={txnDate}
                onChange={(e) => setTxnDate(e.target.value)}
              />
            </div>
          </div>

          {/* PO + Brand */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PO Number</label>
              <Input
                value={poNumber}
                onChange={(e) => setPoNumber(e.target.value)}
                placeholder="e.g. PO-2026-001"
                className="font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Brand</label>
              <select
                value={brandId}
                onChange={(e) => handleBrandChange(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/40"
              >
                <option value="">Select brand</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Line Items */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Line Items
            </h3>
            <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                    <TableHead className="text-xs">Component</TableHead>
                    <TableHead className="text-xs">SKU</TableHead>
                    <TableHead className="text-xs w-20">Qty</TableHead>
                    <TableHead className="text-xs w-32">Amount</TableHead>
                    <TableHead className="text-xs w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => {
                    const isMfg = line.component === 'manufacturing';
                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          <select
                            value={line.component}
                            onChange={(e) => updateLineField(line.id, 'component', e.target.value)}
                            className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500"
                          >
                            {COMPONENT_GROUPS.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.options.map((c) => (
                                  <option key={c.value} value={c.value}>{c.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          <select
                            value={line.sku}
                            onChange={(e) => updateLineField(line.id, 'sku', e.target.value)}
                            disabled={brandId === ''}
                            className="h-7 w-full rounded border border-slate-200 bg-white px-1.5 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500 disabled:opacity-50"
                          >
                            <option value="">{brandId === '' ? 'Select brand first' : 'Select SKU'}</option>
                            {filteredSkus.map((s) => (
                              <option key={s.id} value={s.sku}>
                                {s.sku}{s.productName ? ` - ${s.productName}` : ''}
                              </option>
                            ))}
                          </select>
                        </TableCell>
                        <TableCell>
                          {isMfg ? (
                            <Input
                              type="number"
                              min="1"
                              value={line.quantity}
                              onChange={(e) => updateLineField(line.id, 'quantity', e.target.value)}
                              placeholder="Units"
                              className="h-7 w-20 text-xs"
                            />
                          ) : (
                            <span className="text-xs text-slate-400">&mdash;</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.amount}
                            onChange={(e) => updateLineField(line.id, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="h-7 w-full text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell>
                          {lines.length > 1 && (
                            <button
                              onClick={() => removeLine(line.id)}
                              className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-2">
              <Button variant="outline" size="sm" onClick={addLine} className="gap-1 text-xs">
                <Plus className="h-3 w-3" />
                Add Line
              </Button>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                Total: {formatCurrency(totalAmount)}
              </span>
            </div>
          </div>
        </div>

        {createError && (
          <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
            className="gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            {createMutation.isPending ? 'Creating...' : 'Create Bill'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ──────────────────────────────────────────────

export default function BillsPage() {
  const page = useBillsStore((s) => s.page);
  const startDate = useBillsStore((s) => s.startDate);
  const endDate = useBillsStore((s) => s.endDate);
  const setPage = useBillsStore((s) => s.setPage);
  const setStartDate = useBillsStore((s) => s.setStartDate);
  const setEndDate = useBillsStore((s) => s.setEndDate);
  const clearDates = useBillsStore((s) => s.clearDates);

  const [editBill, setEditBill] = useState<BillData | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 5 * 60 * 1000,
  });

  const isConnected = connection !== undefined && connection.connected === true;
  const billsQuery = useQuery({
    queryKey: ['plutus-bills', page, startDate, endDate],
    queryFn: () => {
      const s = startDate === '' ? undefined : startDate;
      const e = endDate === '' ? undefined : endDate;
      return fetchBillsList(page, s, e);
    },
    enabled: isConnected,
    staleTime: 5 * 60 * 1000,
  });

  const bills = useMemo(() => billsQuery.data?.bills ?? [], [billsQuery.data]);
  const realmId = billsQuery.data?.realmId ?? '';
  const brands = useMemo(() => billsQuery.data?.brands ?? [], [billsQuery.data]);
  const skus = useMemo(() => billsQuery.data?.skus ?? [], [billsQuery.data]);

  const counts = useMemo(() => {
    const saved = bills.filter((b) => getStatus(b) === 'saved').length;
    const unmapped = bills.filter((b) => getStatus(b) === 'unmapped').length;
    return { all: bills.length, saved, unmapped };
  }, [bills]);

  const totalPages = billsQuery.data?.pagination.totalPages ?? 1;

  if (!isCheckingConnection && connection?.connected === false) {
    return <NotConnectedScreen title="Bills" />;
  }

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
        <div className="flex items-center justify-between">
          <PageHeader title="Bills" variant="accent" />
          <Button onClick={() => setShowCreate(true)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Bill
          </Button>
        </div>

        <div className="mt-6 space-y-4">
          {/* Summary + Filters */}
          <Card className="p-5 border-slate-200/70 dark:border-white/10">
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-white/5">
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400">
                  Tracked Bills: {counts.all}
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
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Start date</label>
                <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">End date</label>
                <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => clearDates()}>Clear</Button>
                <Button
                  onClick={() => { setPage(1); billsQuery.refetch(); }}
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

          {/* Read-only Bill Table */}
          <Card className="p-0 overflow-hidden border-slate-200/70 dark:border-white/10">
            <div className="overflow-x-auto">
              <Table className="table-striped">
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>PO Number</TableHead>
                    <TableHead>Brand</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <EmptyState
                          title={isCheckingConnection || billsQuery.isFetching ? 'Loading...' : 'No tracked bills found'}
                          description={isCheckingConnection || billsQuery.isFetching ? undefined : 'No bills with tracked accounts were found. Try adjusting your date range.'}
                        />
                      </TableCell>
                    </TableRow>
                  ) : (
                    bills.map((bill) => {
                      const status = getStatus(bill);
                      const brandName = brands.find((b) => b.id === bill.mapping?.brandId)?.name;
                      return (
                        <TableRow
                          key={bill.id}
                          className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors"
                          onClick={() => setEditBill(bill)}
                        >
                          <TableCell className="whitespace-nowrap text-sm">{bill.date}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-900 dark:text-white">{bill.vendor}</TableCell>
                          <TableCell className="font-mono text-sm text-slate-600 dark:text-slate-400">
                            {bill.mapping?.poNumber ?? <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                          </TableCell>
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {brandName ?? <span className="text-slate-300 dark:text-slate-600">&mdash;</span>}
                          </TableCell>
                          <TableCell><StatusBadge status={status} /></TableCell>
                          <TableCell className="text-right tabular-nums text-sm font-medium text-slate-900 dark:text-white">
                            {formatCurrency(bill.amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            {realmId && (
                              <a
                                href={`https://app.qbo.intuit.com/app/bill?txnId=${bill.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center justify-center h-7 w-7 rounded text-slate-400 hover:text-brand-teal-500 hover:bg-brand-teal-50 dark:hover:bg-brand-teal-900/20 transition-colors"
                                title="Open in QuickBooks"
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-white/5">
              <Button variant="outline" size="sm" onClick={() => setPage(page > 1 ? page - 1 : 1)} disabled={page === 1 || billsQuery.isFetching} className="gap-1">
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
              <Button variant="outline" size="sm" onClick={() => setPage(page + 1)} disabled={billsQuery.isFetching || page >= totalPages} className="gap-1">
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        </div>

        {/* Modals */}
        {editBill && (
          <EditBillModal
            bill={editBill}
            brands={brands}
            skus={skus}
            open={true}
            onOpenChange={(open) => { if (!open) setEditBill(null); }}
          />
        )}

        <CreateBillModal
          brands={brands}
          skus={skus}
          open={showCreate}
          onOpenChange={setShowCreate}
        />
      </div>
    </main>
  );
}
