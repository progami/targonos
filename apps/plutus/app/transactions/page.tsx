'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import DialogActions from '@mui/material/DialogActions';
import FormControl from '@mui/material/FormControl';
import MuiSelect from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';

import { PageHeader } from '@/components/page-header';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { EmptyState } from '@/components/ui/empty-state';
import {
  normalizePurchaseRegion,
  normalizePurchaseSku,
  parsePurchaseAllocationDescription,
} from '@/lib/plutus/purchases/description';
import { cn } from '@/lib/utils';
import { useTransactionsStore } from '@/lib/store/transactions';

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

type BillReferenceType = 'PO' | 'CI' | 'GRN';

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
type VendorOption = { id: string; name: string };

type PurchaseAccountOption = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  type: string;
  subType: string | null;
};

type PurchaseCreateContextResponse = {
  vendors: VendorOption[];
  paymentAccounts: PurchaseAccountOption[];
  lineAccounts: PurchaseAccountOption[];
};

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
  accounts?: PurchaseAccountOption[];
};

type BillCreateAccountOption = {
  id: string;
  name: string;
  fullyQualifiedName: string;
  accountType: string;
  accountSubType: string | null;
  classification: string | null;
  component: BillComponent | null;
};

type BillCreateVendorOption = {
  id: string;
  name: string;
  currencyCode: string | null;
  billAddress: string;
};

type BillCreateTermOption = {
  id: string;
  name: string;
  dueDays: number | null;
  type: string | null;
};

type BillCreateCurrencyOption = {
  code: string;
  name: string | null;
};

type BillCreateContextResponse = {
  vendors: BillCreateVendorOption[];
  accounts: BillCreateAccountOption[];
  terms: BillCreateTermOption[];
  currencies: BillCreateCurrencyOption[];
  brands: BrandOption[];
  skus: SkuOption[];
  preferences: {
    homeCurrency: string | null;
    multiCurrencyEnabled: boolean;
    classTrackingPerTxn: boolean;
    classTrackingPerTxnLine: boolean;
    trackDepartments: boolean;
    poCustomField: {
      enabled: boolean;
      definitionId?: string;
      name?: string;
      type: 'StringType' | 'NumberType' | 'BooleanType';
    };
  };
};

type BillCreateLineState = {
  id: string;
  accountId: string;
  description: string;
  amount: string;
  sku: string;
  quantity: string;
};

type BillRow = TransactionRow & {
  type: 'Bill';
  isTrackedBill: boolean;
  trackedLines: BillTrackedLine[];
  mapping: BillMapping | null;
};

type PurchaseRow = TransactionRow & {
  type: 'Purchase';
};

type MappingStatus = 'unmapped' | 'saved' | 'synced';

type SplitEntryState = {
  id: string;
  sku: string;
  quantity: string;
};

type PurchaseSplitEntryState = {
  id: string;
  sku: string;
  region: string;
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

type CreateBillLineState = {
  id: string;
  accountId: string;
  description: string;
  reference: string;
  amount: string;
  sku: string;
  quantity: string;
  mode: 'single' | 'split';
  splits: SplitEntryState[];
};

type CreateBillState = {
  txnDate: string;
  vendorId: string;
  brandId: string;
  lines: CreateBillLineState[];
};

type CreatePurchaseLineState = {
  id: string;
  accountId: string;
  description: string;
  amount: string;
};

type CreatePurchaseState = {
  txnDate: string;
  vendorId: string;
  paymentAccountId: string;
  memo: string;
  lines: CreatePurchaseLineState[];
};

type PurchaseLineEditState = {
  qboLineId: string;
  accountId: string;
  amountCents: number;
  mode: 'single' | 'split';
  sku: string;
  region: string;
  quantity: string;
  splits: PurchaseSplitEntryState[];
};

type PurchaseEditState = {
  lines: Record<string, PurchaseLineEditState>;
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
const ALL_PURCHASE_ACCOUNTS = '__all_purchase_accounts__';

function referenceTypeForComponent(component: BillComponent | null | undefined): BillReferenceType | null {
  if (component === 'manufacturing') return 'PO';
  if (component === 'freight' || component === 'duty' || component === 'mfgAccessories') return 'CI';
  if (component === 'warehousing3pl' || component === 'warehouseAmazonFc' || component === 'warehouseAwd') return 'GRN';
  return null;
}

function isBillRow(row: TransactionRow): row is BillRow {
  return row.type === 'Bill';
}

function isPurchaseRow(row: TransactionRow): row is PurchaseRow {
  return row.type === 'Purchase';
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
    JournalEntry: { label: 'Journal Entry', sx: { bgcolor: 'rgba(59,130,246,0.08)', color: '#1d4ed8' } },
    Bill: { label: 'Bill', sx: { bgcolor: 'rgba(16,185,129,0.08)', color: '#047857' } },
    Purchase: { label: 'Expense', sx: { bgcolor: 'rgba(245,158,11,0.08)', color: '#b45309' } },
  };

  const { label, sx } = config[type];

  return (
    <Box component="span" sx={{ display: 'inline-flex', borderRadius: 1.5, px: 1, py: 0.25, fontSize: '0.75rem', fontWeight: 500, ...sx }}>
      {label}
    </Box>
  );
}

function getBillStatus(row: BillRow): MappingStatus {
  if (!row.mapping) return 'unmapped';
  if (row.mapping.syncedAt) return 'synced';
  return 'saved';
}

function BillStatusBadge({ status }: { status: MappingStatus }) {
  const config: Record<MappingStatus, { sx: object; label: string }> = {
    unmapped: {
      sx: { bgcolor: 'action.selected', color: 'text.secondary' },
      label: 'Unmapped',
    },
    saved: {
      sx: { bgcolor: 'action.hover', color: 'text.primary' },
      label: 'Saved',
    },
    synced: {
      sx: { bgcolor: 'rgba(16,185,129,0.12)', color: '#047857' },
      label: 'Synced',
    },
  };

  const { sx, label } = config[status];
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, borderRadius: 99, px: 1.25, py: 0.25, fontSize: '0.75rem', fontWeight: 500, ...sx }}>
      {status === 'synced' && <CheckCircleIcon sx={{ fontSize: 12 }} />}
      {label}
    </Box>
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

let purchaseSplitIdCounter = 0;
function nextPurchaseSplitId() {
  purchaseSplitIdCounter += 1;
  return `purchase-split-${purchaseSplitIdCounter}`;
}

function makePurchaseSplitEntry(
  sku: string = '',
  region: string = '',
  quantity: string = '',
): PurchaseSplitEntryState {
  return {
    id: nextPurchaseSplitId(),
    sku,
    region,
    quantity,
  };
}

let createLineIdCounter = 0;
function nextCreateLineId() {
  createLineIdCounter += 1;
  return `create-line-${createLineIdCounter}`;
}

function makeCreateBillLineState(): CreateBillLineState {
  return {
    id: nextCreateLineId(),
    accountId: '',
    description: '',
    reference: '',
    amount: '',
    sku: '',
    quantity: '',
    mode: 'single',
    splits: [makeSplitEntry(), makeSplitEntry()],
  };
}

function makeInitialCreateBillState(): CreateBillState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    txnDate: today,
    vendorId: '',
    brandId: '',
    lines: [makeCreateBillLineState()],
  };
}

let createPurchaseLineIdCounter = 0;
function nextCreatePurchaseLineId() {
  createPurchaseLineIdCounter += 1;
  return `create-purchase-line-${createPurchaseLineIdCounter}`;
}

function makeCreatePurchaseLineState(): CreatePurchaseLineState {
  return {
    id: nextCreatePurchaseLineId(),
    accountId: '',
    description: '',
    amount: '',
  };
}

function makeInitialCreatePurchaseState(): CreatePurchaseState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    txnDate: today,
    vendorId: '',
    paymentAccountId: '',
    memo: '',
    lines: [makeCreatePurchaseLineState()],
  };
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

function initPurchaseEditState(purchase: PurchaseRow): PurchaseEditState {
  const lines: Record<string, PurchaseLineEditState> = {};

  for (const line of purchase.lines) {
    if (!line.accountId) {
      continue;
    }

    const amountCents = Math.round(line.amount * 100);
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      continue;
    }

    const parsedDescription = line.description ? parsePurchaseAllocationDescription(line.description) : null;
    const sku = parsedDescription ? parsedDescription.sku : '';
    const region = parsedDescription ? parsedDescription.region : '';
    const quantity = parsedDescription ? String(parsedDescription.quantity) : '';

    lines[line.id] = {
      qboLineId: line.id,
      accountId: line.accountId,
      amountCents,
      mode: 'single',
      sku,
      region,
      quantity,
      splits: [makePurchaseSplitEntry(sku, region, quantity), makePurchaseSplitEntry()],
    };
  }

  return { lines };
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
  accountId: string | null;
}): Promise<TransactionsResponse> {
  const params = new URLSearchParams();
  params.set('type', input.type);
  params.set('page', String(input.page));
  params.set('pageSize', String(input.pageSize));
  if (input.search.trim() !== '') params.set('search', input.search.trim());
  if (input.startDate !== null && input.startDate.trim() !== '') params.set('startDate', input.startDate.trim());
  if (input.endDate !== null && input.endDate.trim() !== '') params.set('endDate', input.endDate.trim());
  if (input.accountId !== null && input.accountId.trim() !== '') params.set('accountId', input.accountId.trim());

  const res = await fetch(`${basePath}/api/plutus/transactions?${params.toString()}`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function fetchBillCreateContext(): Promise<BillCreateContextResponse> {
  const res = await fetch(`${basePath}/api/plutus/bills/create`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ? data.error : 'Failed to load bill create context');
  }
  return res.json();
}

async function createBillFromBuilder(input: {
  txnDate: string;
  vendorId: string;
  docNumber?: string;
  termId?: string;
  dueDate?: string;
  poNumber?: string;
  memo?: string;
  currencyCode?: string;
  exchangeRate?: number;
  brandId?: string;
  files?: File[];
  lines: Array<{
    accountId: string;
    description?: string;
    amount: number;
    sku?: string;
    quantity?: number;
  }>;
}): Promise<{ bill: { Id: string }; mapping: unknown; attachments?: Array<{ fileName: string; attachableId: string }> }> {
  let res: Response;
  if (Array.isArray(input.files) && input.files.length > 0) {
    const { files, ...payload } = input;
    const formData = new FormData();
    formData.set('payload', JSON.stringify(payload));
    for (const file of files) {
      formData.append('files', file);
    }
    res = await fetch(`${basePath}/api/plutus/bills/create`, {
      method: 'POST',
      body: formData,
    });
  } else {
    const { files, ...payload } = input;
    res = await fetch(`${basePath}/api/plutus/bills/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ? data.error : 'Failed to create bill');
  }
  return res.json();
}

async function fetchPurchaseCreateContext(): Promise<PurchaseCreateContextResponse> {
  const res = await fetch(`${basePath}/api/plutus/purchases/create`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }
  return res.json();
}

async function createPurchaseFromTransactions(input: { state: CreatePurchaseState }): Promise<unknown> {
  const payloadLines = input.state.lines.map((line) => {
    const amount = Number(line.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Each line must have a positive amount');
    }

    return {
      accountId: line.accountId,
      amount,
      description: line.description.trim() !== '' ? line.description.trim() : undefined,
    };
  });

  const normalizedVendorId = input.state.vendorId.trim();
  const normalizedMemo = input.state.memo.trim();

  const res = await fetch(`${basePath}/api/plutus/purchases/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      txnDate: input.state.txnDate,
      paymentAccountId: input.state.paymentAccountId,
      vendorId: normalizedVendorId === '' ? undefined : normalizedVendorId,
      memo: normalizedMemo === '' ? undefined : normalizedMemo,
      lines: payloadLines,
    }),
  });

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

async function savePurchaseMapping(input: {
  purchase: PurchaseRow;
  editState: PurchaseEditState;
}): Promise<unknown> {
  const payloadLines = Object.values(input.editState.lines).map((lineState) => {
    if (lineState.mode === 'split') {
      const splits = lineState.splits.map((split) => {
        const quantity = parsePositiveInteger(split.quantity);
        if (quantity === null) {
          throw new Error('Split quantity must be a positive integer');
        }
        return {
          sku: normalizePurchaseSku(split.sku),
          region: normalizePurchaseRegion(split.region),
          quantity,
        };
      });

      return {
        qboLineId: lineState.qboLineId,
        accountId: lineState.accountId,
        amountCents: lineState.amountCents,
        splits,
      };
    }

    const quantity = parsePositiveInteger(lineState.quantity);
    if (quantity === null) {
      throw new Error('Line quantity must be a positive integer');
    }

    const normalizedSku = normalizePurchaseSku(lineState.sku);
    if (normalizedSku === '') {
      throw new Error('Line sku is required');
    }

    const normalizedRegion = normalizePurchaseRegion(lineState.region);
    if (normalizedRegion === '') {
      throw new Error('Line region is required');
    }

    return {
      qboLineId: lineState.qboLineId,
      accountId: lineState.accountId,
      amountCents: lineState.amountCents,
      sku: normalizedSku,
      region: normalizedRegion,
      quantity,
    };
  });

  const res = await fetch(`${basePath}/api/plutus/purchases/map`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      qboPurchaseId: input.purchase.id,
      lines: payloadLines,
    }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error);
  }

  return res.json();
}

function addDays(baseDate: string, days: number): string {
  const date = new Date(`${baseDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return baseDate;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

let billCreateLineCounter = 0;
function nextBillCreateLineId(): string {
  billCreateLineCounter += 1;
  return `bill-line-${billCreateLineCounter}`;
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

function CreateBillModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [openNonce, setOpenNonce] = useState(0);
  const [vendorId, setVendorId] = useState('');
  const [txnDate, setTxnDate] = useState(todayIsoDate());
  const [dueDate, setDueDate] = useState('');
  const [termId, setTermId] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [memo, setMemo] = useState('');
  const [brandId, setBrandId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [exchangeRate, setExchangeRate] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [lines, setLines] = useState<BillCreateLineState[]>([
    { id: nextBillCreateLineId(), accountId: '', description: '', amount: '', sku: '', quantity: '' },
  ]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setOpenNonce((prev) => prev + 1);
    }
  }, [open]);

  const { data: context, isLoading: isContextLoading, error: contextError } = useQuery({
    queryKey: ['plutus-bill-create-context'],
    queryFn: fetchBillCreateContext,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: createBillFromBuilder,
    onSuccess: () => {
      setFormError(null);
      onCreated();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      setFormError(error.message);
    },
  });

  useEffect(() => {
    if (!open || !context) return;

    const homeCurrency = context.preferences.homeCurrency ? context.preferences.homeCurrency : 'USD';
    setVendorId('');
    setTxnDate(todayIsoDate());
    setDueDate('');
    setTermId('');
    setDocNumber('');
    setPoNumber('');
    setMemo('');
    setBrandId('');
    setCurrencyCode(homeCurrency);
    setExchangeRate('');
    setAttachments([]);
    setLines([{ id: nextBillCreateLineId(), accountId: '', description: '', amount: '', sku: '', quantity: '' }]);
    setFormError(null);
  }, [context, open, openNonce]);

  const selectedVendor = useMemo(
    () => context?.vendors.find((vendor) => vendor.id === vendorId) ?? null,
    [context?.vendors, vendorId],
  );

  const accountsById = useMemo(() => {
    const map = new Map<string, BillCreateAccountOption>();
    for (const account of context?.accounts ?? []) {
      map.set(account.id, account);
    }
    return map;
  }, [context?.accounts]);

  const homeCurrency = context?.preferences.homeCurrency ? context.preferences.homeCurrency : 'USD';
  const multiCurrencyEnabled = context?.preferences.multiCurrencyEnabled === true;

  useEffect(() => {
    if (!context || !selectedVendor || !multiCurrencyEnabled) return;
    if (!selectedVendor.currencyCode) return;
    setCurrencyCode((previous) => {
      if (previous === '' || previous === homeCurrency) {
        return selectedVendor.currencyCode ? selectedVendor.currencyCode : previous;
      }
      return previous;
    });
  }, [context, selectedVendor, multiCurrencyEnabled, homeCurrency]);

  const accountOptions = context?.accounts ?? [];
  const brandOptions = context?.brands ?? [];
  const termOptions = context?.terms ?? [];

  const trackedLineCount = useMemo(() => {
    let count = 0;
    for (const line of lines) {
      const component = line.accountId !== '' ? accountsById.get(line.accountId)?.component : null;
      if (component) count += 1;
    }
    return count;
  }, [accountsById, lines]);

  const filteredSkus = useMemo(() => {
    const skuOptions = context?.skus ?? [];
    if (brandId === '') return [];
    return skuOptions.filter((sku) => sku.brandId === brandId);
  }, [brandId, context?.skus]);

  const transactionCurrency = multiCurrencyEnabled ? (currencyCode !== '' ? currencyCode : homeCurrency) : homeCurrency;

  const transactionTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const amount = Number.parseFloat(line.amount);
      if (!Number.isFinite(amount) || amount <= 0) return sum;
      return sum + amount;
    }, 0);
  }, [lines]);

  const exchangeRateValue = Number.parseFloat(exchangeRate);
  const canConvertToHome = transactionCurrency === homeCurrency || (Number.isFinite(exchangeRateValue) && exchangeRateValue > 0);
  const homeTotal = transactionCurrency === homeCurrency
    ? transactionTotal
    : canConvertToHome
      ? transactionTotal * exchangeRateValue
      : null;

  const formatMoneySafe = (amount: number, currency: string): string => {
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
    } catch {
      return `${currency} ${amount.toFixed(2)}`;
    }
  };

  const poLabel = context?.preferences.poCustomField.enabled
    ? `PO number${context.preferences.poCustomField.name ? ` (${context.preferences.poCustomField.name})` : ''}`
    : 'PO number (stored in memo)';

  const addLine = () => {
    setLines((prev) => [...prev, { id: nextBillCreateLineId(), accountId: '', description: '', amount: '', sku: '', quantity: '' }]);
  };

  const removeLine = (lineId: string) => {
    setLines((prev) => {
      const next = prev.filter((line) => line.id !== lineId);
      if (next.length === 0) {
        return [{ id: nextBillCreateLineId(), accountId: '', description: '', amount: '', sku: '', quantity: '' }];
      }
      return next;
    });
  };

  const updateLine = (lineId: string, patch: Partial<BillCreateLineState>) => {
    setLines((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const handleTermChange = (nextTermId: string) => {
    setTermId(nextTermId);
    const selectedTerm = termOptions.find((term) => term.id === nextTermId);
    if (!selectedTerm || selectedTerm.dueDays === null) return;
    setDueDate(addDays(txnDate, selectedTerm.dueDays));
  };

  const handleSubmit = () => {
    if (!context) return;

    if (vendorId === '') {
      setFormError('Vendor is required.');
      return;
    }

    const payloadLines: Array<{
      accountId: string;
      description?: string;
      amount: number;
      sku?: string;
      quantity?: number;
    }> = [];

    for (const line of lines) {
      const hasAnyValue = line.accountId !== '' || line.description.trim() !== '' || line.amount.trim() !== '' || line.sku.trim() !== '' || line.quantity.trim() !== '';
      if (!hasAnyValue) continue;

      if (line.accountId === '') {
        setFormError('Each line must include a category account.');
        return;
      }

      const amount = Number.parseFloat(line.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setFormError('Each line amount must be a positive number.');
        return;
      }

      const account = accountsById.get(line.accountId);
      const component = account?.component ?? null;
      const sku = line.sku.trim();
      const quantity = line.quantity.trim();

      let parsedQuantity: number | undefined;
      if (quantity !== '') {
        const numericQuantity = Number.parseInt(quantity, 10);
        if (!Number.isInteger(numericQuantity) || numericQuantity <= 0) {
          setFormError('Line quantity must be a positive integer.');
          return;
        }
        parsedQuantity = numericQuantity;
      }

      if (component === 'manufacturing') {
        if (sku === '' || parsedQuantity === undefined) {
          setFormError('Manufacturing lines require SKU and quantity.');
          return;
        }
      }

      payloadLines.push({
        accountId: line.accountId,
        description: line.description.trim() !== '' ? line.description.trim() : undefined,
        amount,
        sku: sku !== '' ? sku : undefined,
        quantity: parsedQuantity,
      });
    }

    if (payloadLines.length === 0) {
      setFormError('Add at least one valid bill line.');
      return;
    }

    if (attachments.length > 20) {
      setFormError('Maximum 20 attachments allowed.');
      return;
    }
    for (const file of attachments) {
      if (file.size > 20 * 1024 * 1024) {
        setFormError(`Attachment too large: ${file.name} (max 20MB).`);
        return;
      }
    }

    if (trackedLineCount > 0 && poNumber.trim() === '') {
      setFormError('PO number is required for tracked/COGS lines.');
      return;
    }

    if (trackedLineCount > 0 && brandId === '') {
      setFormError('Brand is required for tracked/COGS lines.');
      return;
    }

    let parsedExchangeRate: number | undefined;
    if (multiCurrencyEnabled && transactionCurrency !== homeCurrency) {
      parsedExchangeRate = Number.parseFloat(exchangeRate);
      if (!Number.isFinite(parsedExchangeRate) || parsedExchangeRate <= 0) {
        setFormError('Exchange rate is required for non-home currency bills.');
        return;
      }
    }

    setFormError(null);
    createMutation.mutate({
      txnDate,
      vendorId,
      docNumber: docNumber.trim() !== '' ? docNumber.trim() : undefined,
      termId: termId !== '' ? termId : undefined,
      dueDate: dueDate.trim() !== '' ? dueDate.trim() : undefined,
      poNumber: poNumber.trim() !== '' ? poNumber.trim() : undefined,
      memo: memo.trim() !== '' ? memo.trim() : undefined,
      currencyCode: multiCurrencyEnabled ? transactionCurrency : undefined,
      exchangeRate: parsedExchangeRate,
      brandId: brandId !== '' ? brandId : undefined,
      files: attachments,
      lines: payloadLines,
    });
  };

  const selectedTerm = termOptions.find((term) => term.id === termId) ?? null;

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} maxWidth="xl" fullWidth slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}>
      <DialogContent sx={{ maxWidth: 1280, maxHeight: '95vh', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle sx={{ p: 0 }}>Create Bill</DialogTitle>
          <IconButton onClick={() => onOpenChange(false)} size="small"><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Mirrors QBO bill builder fields supported via API. Category lines can be tracked for PO/brand/SKU allocation.
        </Typography>

        {isContextLoading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Skeleton variant="rectangular" height={40} width="100%" />
            <Skeleton variant="rectangular" height={40} width="100%" />
            <Skeleton variant="rectangular" height={40} width="100%" />
          </Box>
        )}

        {!isContextLoading && contextError && (
          <Typography sx={{ fontSize: '0.875rem', color: 'error.main' }}>
            {contextError instanceof Error ? contextError.message : String(contextError)}
          </Typography>
        )}

        {!isContextLoading && !contextError && context && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { lg: '2fr 1fr' } }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Vendor</Box>
                <select
                  style={{ width: '100%', borderRadius: 6, border: '1px solid', borderColor: 'var(--mui-palette-divider)', backgroundColor: 'var(--mui-palette-background-paper)', padding: '8px 12px', fontSize: '0.875rem' }}
                  value={vendorId}
                  onChange={(event) => setVendorId(event.target.value)}
                >
                  <option value="">Select vendor</option>
                  {context.vendors.map((vendor) => (
                    <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                  ))}
                </select>
              </Box>

              <Box sx={{ borderRadius: 1.5, border: 1, borderColor: 'divider', p: 1.5 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Balance due</Box>
                <Box sx={{ mt: 0.5, fontSize: '1.5rem', fontWeight: 600, color: 'text.primary' }}>
                  {formatMoneySafe(transactionTotal, transactionCurrency)}
                </Box>
                <Box sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                  Home total: {homeTotal === null ? 'Add exchange rate' : formatMoneySafe(homeTotal, homeCurrency)}
                </Box>
              </Box>
            </Box>

            <Box sx={{ borderRadius: 1.5, border: 1, borderColor: 'divider', p: 1.5, fontSize: '0.875rem', color: 'text.secondary', whiteSpace: 'pre-line', minHeight: 64 }}>
              {selectedVendor?.billAddress && selectedVendor.billAddress.trim() !== ''
                ? selectedVendor.billAddress
                : 'Mailing address unavailable'}
            </Box>

            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' } }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Terms</Box>
                <select
                  style={{ width: '100%', borderRadius: 6, border: '1px solid', borderColor: 'var(--mui-palette-divider)', backgroundColor: 'var(--mui-palette-background-paper)', padding: '8px 12px', fontSize: '0.875rem' }}
                  value={termId}
                  onChange={(event) => handleTermChange(event.target.value)}
                >
                  <option value="">Select terms</option>
                  {termOptions.map((term) => (
                    <option key={term.id} value={term.id}>{term.name}</option>
                  ))}
                </select>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Bill date</Box>
                <TextField
                  type="date"
                  size="small"
                  fullWidth
                  value={txnDate}
                  onChange={(event) => {
                    const nextDate = event.target.value;
                    setTxnDate(nextDate);
                    if (selectedTerm?.dueDays !== null && selectedTerm?.dueDays !== undefined) {
                      setDueDate(addDays(nextDate, selectedTerm.dueDays));
                    }
                  }}
                />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Due date</Box>
                <TextField type="date" size="small" fullWidth value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Bill no.</Box>
                <TextField size="small" fullWidth value={docNumber} onChange={(event) => setDocNumber(event.target.value)} placeholder="Vendor invoice no." />
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { md: 'repeat(2, 1fr)', xl: 'repeat(4, 1fr)' } }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>{poLabel}</Box>
                <TextField size="small" fullWidth value={poNumber} onChange={(event) => setPoNumber(event.target.value)} placeholder="PO-..." />
              </Box>

              {trackedLineCount > 0 && (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                  <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Brand (tracked lines)</Box>
                  <select
                    style={{ width: '100%', borderRadius: 6, border: '1px solid', borderColor: 'var(--mui-palette-divider)', backgroundColor: 'var(--mui-palette-background-paper)', padding: '8px 12px', fontSize: '0.875rem' }}
                    value={brandId}
                    onChange={(event) => setBrandId(event.target.value)}
                  >
                    <option value="">Select brand</option>
                    {brandOptions.map((brand) => (
                      <option key={brand.id} value={brand.id}>{brand.name}</option>
                    ))}
                  </select>
                </Box>
              )}

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Currency</Box>
                <select
                  style={{ width: '100%', borderRadius: 6, border: '1px solid', borderColor: 'var(--mui-palette-divider)', backgroundColor: 'var(--mui-palette-background-paper)', padding: '8px 12px', fontSize: '0.875rem', ...(!multiCurrencyEnabled ? { opacity: 0.6 } : {}) }}
                  value={transactionCurrency}
                  disabled={!multiCurrencyEnabled}
                  onChange={(event) => setCurrencyCode(event.target.value)}
                >
                  {!multiCurrencyEnabled && <option value={homeCurrency}>{homeCurrency}</option>}
                  {multiCurrencyEnabled && context.currencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code}{currency.name ? ` - ${currency.name}` : ''}
                    </option>
                  ))}
                </select>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                <Box sx={{ fontSize: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--brand-teal-600)' }}>Exchange rate</Box>
                <TextField
                  type="number"
                  size="small"
                  fullWidth
                  slotProps={{ htmlInput: { step: '0.000001', min: '0' } }}
                  value={exchangeRate}
                  disabled={transactionCurrency === homeCurrency}
                  onChange={(event) => setExchangeRate(event.target.value)}
                  placeholder={transactionCurrency === homeCurrency ? '1.000000' : `1 ${transactionCurrency} = ? ${homeCurrency}`}
                />
              </Box>
            </Box>

            <div className="rounded-md border border-slate-200 dark:border-white/10">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-white/[0.03]">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Category</th>
                      <th className="px-3 py-2 text-left font-semibold">Description</th>
                      <th className="px-3 py-2 text-left font-semibold">Amount ({transactionCurrency})</th>
                      <th className="px-3 py-2 text-left font-semibold">SKU</th>
                      <th className="px-3 py-2 text-left font-semibold">Qty</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const account = line.accountId !== '' ? accountsById.get(line.accountId) : undefined;
                      const isManufacturing = account?.component === 'manufacturing';

                      return (
                        <tr key={line.id} className="border-t border-slate-200 dark:border-white/10">
                          <td className="px-3 py-2 align-top">
                            <select
                              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-white/10 dark:bg-white/5"
                              value={line.accountId}
                              onChange={(event) => {
                                const nextAccountId = event.target.value;
                                const nextAccount = nextAccountId !== '' ? accountsById.get(nextAccountId) : undefined;
                                const nextDescription = line.description.trim() === ''
                                  ? (nextAccount?.fullyQualifiedName ? nextAccount.fullyQualifiedName : '')
                                  : line.description;
                                updateLine(line.id, {
                                  accountId: nextAccountId,
                                  description: nextDescription,
                                  ...(nextAccount?.component === 'manufacturing' ? {} : { sku: '', quantity: '' }),
                                });
                              }}
                            >
                              <option value="">Select account</option>
                              {accountOptions.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.fullyQualifiedName}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="px-3 py-2 align-top">
                            <TextField
                              size="small"
                              fullWidth
                              value={line.description}
                              onChange={(event) => updateLine(line.id, { description: event.target.value })}
                              placeholder="Line description"
                            />
                          </td>

                          <td className="px-3 py-2 align-top">
                            <TextField
                              type="number"
                              size="small"
                              fullWidth
                              slotProps={{ htmlInput: { min: '0', step: '0.01' } }}
                              value={line.amount}
                              onChange={(event) => updateLine(line.id, { amount: event.target.value })}
                              placeholder="0.00"
                            />
                          </td>

                          <td className="px-3 py-2 align-top">
                            {isManufacturing ? (
                              <select
                                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm disabled:opacity-60 dark:border-white/10 dark:bg-white/5"
                                value={line.sku}
                                disabled={brandId === ''}
                                onChange={(event) => updateLine(line.id, { sku: event.target.value })}
                              >
                                <option value="">{brandId === '' ? 'Select brand first' : 'Select SKU'}</option>
                                {filteredSkus.map((sku) => (
                                  <option key={sku.id} value={sku.sku}>
                                    {sku.sku}{sku.productName ? ` - ${sku.productName}` : ''}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <TextField size="small" fullWidth value="" disabled placeholder="Manufacturing only" />
                            )}
                          </td>

                          <td className="px-3 py-2 align-top">
                            {isManufacturing ? (
                              <TextField
                                type="number"
                                size="small"
                                fullWidth
                                slotProps={{ htmlInput: { min: '1', step: '1' } }}
                                value={line.quantity}
                                onChange={(event) => updateLine(line.id, { quantity: event.target.value })}
                                placeholder="Units"
                              />
                            ) : (
                              <TextField size="small" fullWidth value="" disabled placeholder="-" />
                            )}
                          </td>

                          <td className="px-3 py-2 align-top text-right">
                            <IconButton
                              size="small"
                              onClick={() => removeLine(line.id)}
                            >
                              <CloseIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-slate-200 p-3 dark:border-white/10">
                <Button type="button" variant="outlined" size="small" onClick={addLine} sx={{ borderColor: 'divider', color: 'text.primary', gap: 0.75 }}>
                  <AddIcon sx={{ fontSize: 14 }} />
                  Add lines
                </Button>
                <div className="text-right text-sm">
                  <div className="font-medium text-slate-900 dark:text-white">
                    Total ({transactionCurrency}): {formatMoneySafe(transactionTotal, transactionCurrency)}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Total ({homeCurrency}): {homeTotal === null ? 'Add exchange rate' : formatMoneySafe(homeTotal, homeCurrency)}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">Memo</div>
              <textarea
                className="w-full min-h-[96px] rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                placeholder="Optional memo"
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">Attachments</div>
              <input
                type="file"
                multiple
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  if (files.length === 0) return;
                  setAttachments((prev) => [...prev, ...files]);
                  event.currentTarget.value = '';
                }}
                className="block w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5"
              />
              <div className="text-xs text-slate-500 dark:text-slate-400">Max 20 files, 20MB each.</div>
              {attachments.length > 0 && (
                <div className="rounded-md border border-slate-200 dark:border-white/10">
                  <ul className="divide-y divide-slate-200 dark:divide-white/10">
                    {attachments.map((file, index) => (
                      <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="truncate text-slate-700 dark:text-slate-300">
                          {file.name} ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                        <Button
                          type="button"
                          variant="text"
                          size="small"
                          onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== index))}
                          sx={{ color: 'text.secondary' }}
                        >
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {formError && (
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            )}
          </Box>
        )}

        <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
          <Button variant="outlined" onClick={() => onOpenChange(false)} sx={{ borderColor: 'divider', color: 'text.primary' }}>Cancel</Button>
          <Button
            onClick={handleSubmit}
            disabled={isContextLoading || !!contextError || createMutation.isPending}
            variant="contained"
            sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' }, gap: 0.75 }}
          >
            <SaveIcon sx={{ fontSize: 14 }} />
            {createMutation.isPending ? 'Creating...' : 'Save bill'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function CreatePurchaseModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [createState, setCreateState] = useState<CreatePurchaseState>(() => makeInitialCreatePurchaseState());
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCreateState(makeInitialCreatePurchaseState());
    setCreateError(null);
  }, [open]);

  const { data: createContext, isLoading: createContextLoading } = useQuery({
    queryKey: ['plutus-purchase-create-context'],
    queryFn: fetchPurchaseCreateContext,
    enabled: open,
    staleTime: 5 * 60 * 1000,
  });

  const lineAccountById = useMemo(() => {
    const map = new Map<string, PurchaseAccountOption>();
    for (const account of createContext?.lineAccounts ?? []) {
      map.set(account.id, account);
    }
    return map;
  }, [createContext]);

  const createMutation = useMutation({
    mutationFn: () => createPurchaseFromTransactions({ state: createState }),
    onSuccess: () => {
      setCreateError(null);
      queryClient.invalidateQueries({ queryKey: ['plutus-transactions'] });
      onOpenChange(false);
    },
    onError: (error: Error) => {
      setCreateError(error.message);
    },
  });

  const canSave = useMemo(() => {
    if (
      createState.txnDate.trim() === '' ||
      createState.paymentAccountId === '' ||
      createState.lines.length === 0
    ) {
      return false;
    }

    for (const line of createState.lines) {
      if (!lineAccountById.has(line.accountId)) {
        return false;
      }

      const amount = Number(line.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return false;
      }
    }

    return true;
  }, [createState, lineAccountById]);

  const updateLine = (lineId: string, patch: Partial<CreatePurchaseLineState>) => {
    setCreateState((prev) => ({
      ...prev,
      lines: prev.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    }));
  };

  const addLine = () => {
    setCreateState((prev) => ({
      ...prev,
      lines: [...prev.lines, makeCreatePurchaseLineState()],
    }));
  };

  const removeLine = (lineId: string) => {
    setCreateState((prev) => {
      if (prev.lines.length <= 1) return prev;
      return {
        ...prev,
        lines: prev.lines.filter((line) => line.id !== lineId),
      };
    });
  };

  const vendors = createContext?.vendors ?? [];
  const paymentAccounts = createContext?.paymentAccounts ?? [];
  const lineAccounts = createContext?.lineAccounts ?? [];

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} maxWidth="lg" fullWidth slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}>
      <DialogContent sx={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle sx={{ p: 0 }}>Create Expense</DialogTitle>
          <IconButton onClick={() => onOpenChange(false)} size="small"><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>Create a new QBO purchase transaction for card/bank spend.</Typography>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Date</label>
              <TextField
                type="date"
                size="small"
                fullWidth
                value={createState.txnDate}
                onChange={(event) => setCreateState((prev) => ({ ...prev, txnDate: event.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Payment Account</label>
              <select
                value={createState.paymentAccountId}
                onChange={(event) => setCreateState((prev) => ({ ...prev, paymentAccountId: event.target.value }))}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/40"
              >
                <option value="">{createContextLoading ? 'Loading accounts…' : 'Select payment account'}</option>
                {paymentAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.fullyQualifiedName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Payee (optional)</label>
              <select
                value={createState.vendorId}
                onChange={(event) => setCreateState((prev) => ({ ...prev, vendorId: event.target.value }))}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/40"
              >
                <option value="">{createContextLoading ? 'Loading vendors…' : 'No payee'}</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Memo (optional)</label>
              <TextField
                size="small"
                fullWidth
                value={createState.memo}
                onChange={(event) => setCreateState((prev) => ({ ...prev, memo: event.target.value }))}
                placeholder="Internal note"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontSize: '0.75rem' }}>Account</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>Description</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', width: 112 }}>Amount</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', width: 80 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {createState.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell>
                      <select
                        value={line.accountId}
                        onChange={(event) => {
                          const nextAccountId = event.target.value;
                          const nextAccount = lineAccountById.get(nextAccountId);
                          updateLine(line.id, {
                            accountId: nextAccountId,
                            description: nextAccount ? nextAccount.fullyQualifiedName : '',
                          });
                        }}
                        className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500"
                      >
                        <option value="">{createContextLoading ? 'Loading accounts…' : 'Select account'}</option>
                        {lineAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.fullyQualifiedName}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      <TextField
                        size="small"
                        fullWidth
                        value={line.description}
                        onChange={(event) => updateLine(line.id, { description: event.target.value })}
                        placeholder="Line description"
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', height: 32, py: 0 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        fullWidth
                        slotProps={{ htmlInput: { min: '0', step: '0.01' } }}
                        value={line.amount}
                        onChange={(event) => updateLine(line.id, { amount: event.target.value })}
                        placeholder="0.00"
                        sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', height: 32, py: 0 } }}
                      />
                    </TableCell>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => removeLine(line.id)}
                        disabled={createState.lines.length <= 1}
                      >
                        <DeleteIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outlined" size="small" onClick={addLine} sx={{ borderColor: 'divider', color: 'text.primary', gap: 0.75 }}>
              <AddIcon sx={{ fontSize: 14 }} />
              Add Line
            </Button>
          </div>
        </div>

        {createError && (
          <p className="text-sm text-red-600 dark:text-red-400">{createError}</p>
        )}

        <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
          <Button variant="outlined" onClick={() => onOpenChange(false)} sx={{ borderColor: 'divider', color: 'text.primary' }}>Cancel</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!canSave || createMutation.isPending || createContextLoading}
            variant="contained"
            sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' }, gap: 0.75 }}
          >
            <SaveIcon sx={{ fontSize: 14 }} />
            {createMutation.isPending ? 'Creating...' : 'Create Expense'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
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
  const requiresManufacturingPo = useMemo(
    () => bill.trackedLines.some((line) => line.component === 'manufacturing'),
    [bill.trackedLines],
  );

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
    if (editState.brandId === '') {
      return false;
    }
    if (requiresManufacturingPo && editState.poNumber.trim() === '') {
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
  }, [bill.trackedLines, editState, requiresManufacturingPo]);

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
    <Dialog open={open} onClose={() => onOpenChange(false)} maxWidth="md" fullWidth slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}>
      <DialogContent sx={{ maxHeight: '85vh', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle sx={{ p: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flex: 1 }}>
            <span className="truncate">{bill.entityName}</span>
            <a
              href={qboTransactionUrl(bill)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-brand-teal-600 hover:bg-brand-teal-50 dark:text-slate-400 dark:hover:text-brand-teal-300 dark:hover:bg-brand-teal-900/20 transition-colors"
              title="Open in QuickBooks"
            >
              <OpenInNewIcon sx={{ fontSize: 14 }} />
              QuickBooks
            </a>
          </DialogTitle>
          <IconButton onClick={() => onOpenChange(false)} size="small"><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {bill.txnDate} &middot; {formatCurrency(bill.totalAmount)}
          {bill.docNumber.trim() !== '' ? ` \u00b7 ${bill.docNumber}` : ''}
          {mappedBrandName ? ` \u00b7 ${mappedBrandName}` : ''}
        </Typography>

        <div className="space-y-4">
          <div className={cn('grid gap-3', requiresManufacturingPo ? 'grid-cols-2' : 'grid-cols-1')}>
            {requiresManufacturingPo && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">PO Number</label>
                <TextField
                  size="small"
                  fullWidth
                  value={editState.poNumber}
                  onChange={(event) => setEditState((prev) => ({ ...prev, poNumber: event.target.value }))}
                  placeholder="e.g. PO-2026-001"
                  sx={{ '& .MuiInputBase-input': { fontFamily: 'monospace', fontSize: '0.875rem' } }}
                />
              </div>
            )}
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
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell sx={{ fontSize: '0.75rem' }}>Account</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>SKU / Split</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', width: 96 }}>Qty</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>Type</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', textAlign: 'right' }}>Amount</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', width: 96 }}>Action</TableCell>
                  </TableRow>
                </TableHead>
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
                                  <TextField
                                    type="number"
                                    size="small"
                                    slotProps={{ htmlInput: { min: '1', step: '1' } }}
                                    value={split.quantity}
                                    onChange={(event) => updateSplit(trackedLine.lineId, split.id, { quantity: event.target.value })}
                                    placeholder="Qty"
                                    sx={{ width: 80, '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
                                  />
                                  {lineState.splits.length > 2 && (
                                    <button
                                      onClick={() => removeSplit(trackedLine.lineId, split.id)}
                                      className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    >
                                      <CloseIcon sx={{ fontSize: 14 }} />
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
                              <TextField
                                type="number"
                                size="small"
                                slotProps={{ htmlInput: { min: '1', step: '1' } }}
                                value={lineState.quantity}
                                onChange={(event) => updateLine(trackedLine.lineId, { quantity: event.target.value })}
                                placeholder="Units"
                                sx={{ width: 80, '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
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
                                variant="outlined"
                                size="small"
                                onClick={() => toggleSplitMode(trackedLine.lineId)}
                                sx={{ borderColor: 'divider', color: 'text.primary', height: 28, px: 1, fontSize: '0.75rem', minWidth: 0 }}
                              >
                                {lineState.mode === 'split' ? 'Single' : 'Split'}
                              </Button>
                              {lineState.mode === 'split' && (
                                <IconButton
                                  size="small"
                                  onClick={() => addSplit(trackedLine.lineId)}
                                >
                                  <AddIcon sx={{ fontSize: 12 }} />
                                </IconButton>
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

        <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
          <Button variant="outlined" onClick={() => onOpenChange(false)} sx={{ borderColor: 'divider', color: 'text.primary' }}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            variant="contained"
            sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' }, gap: 0.75 }}
          >
            <SaveIcon sx={{ fontSize: 14 }} />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

function EditPurchaseModal({
  purchase,
  skus,
  accounts,
  open,
  onOpenChange,
}: {
  purchase: PurchaseRow;
  skus: SkuOption[];
  accounts: PurchaseAccountOption[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [editState, setEditState] = useState<PurchaseEditState>(() => initPurchaseEditState(purchase));
  const [saveError, setSaveError] = useState<string | null>(null);

  const accountById = useMemo(() => {
    const map = new Map<string, PurchaseAccountOption>();
    for (const account of accounts) {
      map.set(account.id, account);
    }
    return map;
  }, [accounts]);

  const editableLines = useMemo(() => {
    const states: PurchaseLineEditState[] = [];
    for (const line of purchase.lines) {
      const lineState = editState.lines[line.id];
      if (!lineState) {
        continue;
      }
      states.push(lineState);
    }
    return states;
  }, [editState.lines, purchase.lines]);

  const saveMutation = useMutation({
    mutationFn: () => savePurchaseMapping({ purchase, editState }),
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
    if (editableLines.length === 0) {
      return false;
    }

    for (const line of editableLines) {
      if (line.accountId === '') {
        return false;
      }
      if (!accountById.has(line.accountId)) {
        return false;
      }

      if (line.mode === 'single') {
        if (normalizePurchaseSku(line.sku) === '') {
          return false;
        }
        if (normalizePurchaseRegion(line.region) === '') {
          return false;
        }
        if (parsePositiveInteger(line.quantity) === null) {
          return false;
        }
        continue;
      }

      if (line.splits.length < 2) {
        return false;
      }
      const seen = new Set<string>();
      for (const split of line.splits) {
        const sku = normalizePurchaseSku(split.sku);
        if (sku === '') {
          return false;
        }
        const region = normalizePurchaseRegion(split.region);
        if (region === '') {
          return false;
        }
        if (parsePositiveInteger(split.quantity) === null) {
          return false;
        }
        const splitKey = `${sku}::${region}`;
        if (seen.has(splitKey)) {
          return false;
        }
        seen.add(splitKey);
      }
    }

    return true;
  }, [accountById, editableLines]);

  const updateLine = (lineId: string, patch: Partial<PurchaseLineEditState>) => {
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

  const updateSplit = (lineId: string, splitId: string, patch: Partial<PurchaseSplitEntryState>) => {
    const lineState = editState.lines[lineId];
    if (!lineState) return;
    const splits = lineState.splits.map((split) => (split.id === splitId ? { ...split, ...patch } : split));
    updateLine(lineId, { splits });
  };

  const addSplit = (lineId: string) => {
    const lineState = editState.lines[lineId];
    if (!lineState) return;
    updateLine(lineId, { splits: [...lineState.splits, makePurchaseSplitEntry()] });
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
      updateLine(lineId, {
        mode: 'split',
        splits: [makePurchaseSplitEntry(lineState.sku, lineState.region, lineState.quantity), makePurchaseSplitEntry()],
      });
      return;
    }

    const primary = lineState.splits[0];
    updateLine(lineId, {
      mode: 'single',
      sku: primary ? primary.sku : '',
      region: primary ? primary.region : '',
      quantity: primary ? primary.quantity : '',
      splits: [makePurchaseSplitEntry(), makePurchaseSplitEntry()],
    });
  };

  return (
    <Dialog open={open} onClose={() => onOpenChange(false)} maxWidth="lg" fullWidth slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)' } } }}>
      <DialogContent sx={{ maxHeight: '88vh', overflowY: 'auto' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <DialogTitle sx={{ p: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flex: 1 }}>
            <span className="truncate">{purchase.entityName.trim() === '' ? 'Purchase' : purchase.entityName}</span>
            <a
              href={qboTransactionUrl(purchase)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-brand-teal-600 hover:bg-brand-teal-50 dark:text-slate-400 dark:hover:text-brand-teal-300 dark:hover:bg-brand-teal-900/20 transition-colors"
              title="Open in QuickBooks"
            >
              <OpenInNewIcon sx={{ fontSize: 14 }} />
              QuickBooks
            </a>
          </DialogTitle>
          <IconButton onClick={() => onOpenChange(false)} size="small"><CloseIcon fontSize="small" /></IconButton>
        </Box>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {purchase.txnDate} &middot; {formatCurrency(purchase.totalAmount)}
          {purchase.docNumber.trim() !== '' ? ` \u00b7 ${purchase.docNumber}` : ''}
        </Typography>

        <div>
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            Purchase Lines
          </h3>
          <div className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontSize: '0.75rem' }}>Account</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>SKU / Split</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem' }}>Region</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', width: 96 }}>Qty</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', textAlign: 'right' }}>Amount</TableCell>
                  <TableCell sx={{ fontSize: '0.75rem', width: 112 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {editableLines.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} sx={{ py: 4, textAlign: 'center', fontSize: '0.875rem', color: 'text.secondary' }}>
                      This purchase has no editable account-based lines.
                    </TableCell>
                  </TableRow>
                )}

                {editableLines.map((lineState) => (
                  <TableRow key={lineState.qboLineId}>
                    <TableCell>
                      <select
                        value={lineState.accountId}
                        onChange={(event) => updateLine(lineState.qboLineId, { accountId: event.target.value })}
                        className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-xs dark:border-white/10 dark:bg-slate-900 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-brand-teal-500"
                      >
                        <option value="">Select account</option>
                        {accounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.fullyQualifiedName}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell>
                      {lineState.mode === 'split' ? (
                        <div className="space-y-1">
                          {lineState.splits.map((split) => (
                            <div key={split.id} className="flex items-center gap-2">
                              <TextField
                                size="small"
                                fullWidth
                                value={split.sku}
                                onChange={(event) => updateSplit(lineState.qboLineId, split.id, { sku: event.target.value })}
                                placeholder="SKU"
                                slotProps={{ htmlInput: { list: `purchase-skus-${purchase.id}` } }}
                                sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
                              />
                              <TextField
                                size="small"
                                value={split.region}
                                onChange={(event) => updateSplit(lineState.qboLineId, split.id, { region: event.target.value })}
                                placeholder="Region"
                                sx={{ width: 112, '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
                              />
                              <TextField
                                type="number"
                                size="small"
                                slotProps={{ htmlInput: { min: '1', step: '1' } }}
                                value={split.quantity}
                                onChange={(event) => updateSplit(lineState.qboLineId, split.id, { quantity: event.target.value })}
                                placeholder="Qty"
                                sx={{ width: 80, '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
                              />
                              {lineState.splits.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeSplit(lineState.qboLineId, split.id)}
                                  className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                >
                                  <CloseIcon sx={{ fontSize: 14 }} />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <TextField
                          size="small"
                          fullWidth
                          value={lineState.sku}
                          onChange={(event) => updateLine(lineState.qboLineId, { sku: event.target.value })}
                          placeholder="SKU"
                          slotProps={{ htmlInput: { list: `purchase-skus-${purchase.id}` } }}
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {lineState.mode === 'split' ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Split rows include region</span>
                      ) : (
                        <TextField
                          size="small"
                          fullWidth
                          value={lineState.region}
                          onChange={(event) => updateLine(lineState.qboLineId, { region: event.target.value })}
                          placeholder="Region"
                          sx={{ '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {lineState.mode === 'split' ? (
                        <span className="text-xs text-slate-500 dark:text-slate-400">Split by rows</span>
                      ) : (
                        <TextField
                          type="number"
                          size="small"
                          slotProps={{ htmlInput: { min: '1', step: '1' } }}
                          value={lineState.quantity}
                          onChange={(event) => updateLine(lineState.qboLineId, { quantity: event.target.value })}
                          placeholder="Qty"
                          sx={{ width: 80, '& .MuiInputBase-input': { fontSize: '0.75rem', height: 28, py: 0 } }}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-xs font-medium">
                      {formatCurrency(lineState.amountCents / 100)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outlined"
                          size="small"
                          onClick={() => toggleSplitMode(lineState.qboLineId)}
                          sx={{ borderColor: 'divider', color: 'text.primary', height: 28, px: 1, fontSize: '0.75rem', minWidth: 0 }}
                        >
                          {lineState.mode === 'split' ? 'Single' : 'Split'}
                        </Button>
                        {lineState.mode === 'split' && (
                          <IconButton
                            size="small"
                            onClick={() => addSplit(lineState.qboLineId)}
                          >
                            <AddIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <datalist id={`purchase-skus-${purchase.id}`}>
          {skus.map((sku) => (
            <option key={sku.id} value={sku.sku}>
              {sku.productName ? `${sku.sku} - ${sku.productName}` : sku.sku}
            </option>
          ))}
        </datalist>

        {saveError && (
          <p className="text-sm text-red-600 dark:text-red-400">{saveError}</p>
        )}

        <DialogActions sx={{ px: 3, pb: 3, pt: 0 }}>
          <Button variant="outlined" onClick={() => onOpenChange(false)} sx={{ borderColor: 'divider', color: 'text.primary' }}>Cancel</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave || saveMutation.isPending}
            variant="contained"
            sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' }, gap: 0.75 }}
          >
            <SaveIcon sx={{ fontSize: 14 }} />
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

export default function TransactionsPage() {
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
  const [editPurchase, setEditPurchase] = useState<PurchaseRow | null>(null);
  const [createBillOpen, setCreateBillOpen] = useState(false);
  const [createPurchaseOpen, setCreatePurchaseOpen] = useState(false);
  const [purchaseAccountId, setPurchaseAccountId] = useState('');
  const [bulkSyncError, setBulkSyncError] = useState<string | null>(null);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get('tab');
    if (requestedTab === 'bill' && tab !== 'bill') {
      setTab('bill');
      setPage(1);
    }
  }, [setPage, setTab, tab]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [searchInput, setPage, setSearch]);

  const normalizedStartDate = startDate.trim() === '' ? null : startDate.trim();
  const normalizedEndDate = endDate.trim() === '' ? null : endDate.trim();
  const normalizedAccountId = tab === 'purchase' && purchaseAccountId.trim() !== '' ? purchaseAccountId.trim() : null;

  const { data: connection, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const apiType = tab;
  const { data, isLoading, error } = useQuery({
    queryKey: ['plutus-transactions', apiType, page, pageSize, search, normalizedStartDate, normalizedEndDate, normalizedAccountId],
    queryFn: () =>
      fetchTransactions({
        type: apiType,
        page,
        pageSize,
        search,
        startDate: normalizedStartDate,
        endDate: normalizedEndDate,
        accountId: normalizedAccountId,
      }),
    enabled: connection !== undefined && connection.connected === true,
    staleTime: 5 * 60 * 1000,
  });

  const currency = connection?.homeCurrency ? connection.homeCurrency : 'USD';
  const rows = useMemo(() => (data ? data.transactions : []), [data]);

  const billRows = useMemo(() => rows.filter(isBillRow).map((row) => ({
    ...row,
    isTrackedBill: row.isTrackedBill === true,
    trackedLines: row.trackedLines ? row.trackedLines : [],
    mapping: row.mapping ? row.mapping : null,
  })), [rows]);
  const purchaseRows = useMemo(() => rows.filter(isPurchaseRow), [rows]);
  const visibleRows = tab === 'purchase' ? purchaseRows : rows;

  const brands = useMemo(() => (data?.brands ? data.brands : []), [data]);
  const skus = useMemo(() => (data?.skus ? data.skus : []), [data]);
  const purchaseAccounts = useMemo(() => (data?.accounts ? data.accounts : []), [data]);
  const purchasePaymentAccounts = useMemo(
    () =>
      purchaseAccounts.filter(
        (account) => account.type === 'Bank' || account.type === 'Credit Card',
      ),
    [purchaseAccounts],
  );

  const brandNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const brand of brands) {
      map.set(brand.id, brand.name);
    }
    return map;
  }, [brands]);

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
            onChange={(_, value) => {
              setTab(value as typeof tab);
              setExpanded({});
              setPage(1);
            }}
            sx={{ minHeight: 40, bgcolor: 'action.hover', borderRadius: 2, p: 0.5, '& .MuiTabs-indicator': { display: 'none' } }}
          >
            <Tab value="journalEntry" label="Journal entries" sx={{ minHeight: 36, borderRadius: 1.5, '&.Mui-selected': { bgcolor: 'background.paper', color: 'text.primary', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' } }} />
            <Tab value="bill" label="Bills" sx={{ minHeight: 36, borderRadius: 1.5, '&.Mui-selected': { bgcolor: 'background.paper', color: 'text.primary', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' } }} />
            <Tab value="purchase" label="Purchases" sx={{ minHeight: 36, borderRadius: 1.5, '&.Mui-selected': { bgcolor: 'background.paper', color: 'text.primary', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)' } }} />
          </Tabs>

          <Card sx={{ borderColor: 'divider' }}>
            <CardContent sx={{ p: 2 }}>
              <div className={cn(
                'grid gap-3 md:items-end',
                tab === 'purchase'
                  ? 'md:grid-cols-[1.15fr,0.52fr,0.52fr,0.7fr,0.42fr,auto]'
                  : 'md:grid-cols-[1.25fr,0.55fr,0.55fr,0.45fr,auto]',
              )}>
                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    Search
                  </div>
                  <div className="relative">
                    <SearchIcon sx={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'text.disabled', pointerEvents: 'none' }} />
                    <TextField
                      size="small"
                      fullWidth
                      value={searchInput}
                      onChange={(event) => setSearchInput(event.target.value)}
                      placeholder="Doc number..."
                      sx={{ '& .MuiInputBase-input': { pl: 4.5 } }}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                    Start date
                  </div>
                  <TextField
                    type="date"
                    size="small"
                    fullWidth
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
                  <TextField
                    type="date"
                    size="small"
                    fullWidth
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
                  <FormControl size="small" fullWidth>
                    <MuiSelect
                      value={String(pageSize)}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value as string));
                        setExpanded({});
                        setPage(1);
                      }}
                      displayEmpty
                    >
                      <MenuItem value="50">50</MenuItem>
                      <MenuItem value="100">100</MenuItem>
                      <MenuItem value="250">250</MenuItem>
                      <MenuItem value="500">500</MenuItem>
                    </MuiSelect>
                  </FormControl>
                </div>

                {tab === 'purchase' && (
                  <div className="space-y-1.5">
                    <div className="text-2xs font-semibold uppercase tracking-wider text-brand-teal-600 dark:text-brand-teal-400">
                      Payment account
                    </div>
                    <FormControl size="small" fullWidth>
                      <MuiSelect
                        value={purchaseAccountId === '' ? ALL_PURCHASE_ACCOUNTS : purchaseAccountId}
                        onChange={(e) => {
                          const value = e.target.value as string;
                          setPurchaseAccountId(value === ALL_PURCHASE_ACCOUNTS ? '' : value);
                          setPage(1);
                        }}
                        displayEmpty
                      >
                        <MenuItem value={ALL_PURCHASE_ACCOUNTS}>All accounts</MenuItem>
                        {purchasePaymentAccounts.map((account) => (
                          <MenuItem key={account.id} value={account.id}>
                            {account.fullyQualifiedName}
                          </MenuItem>
                        ))}
                      </MuiSelect>
                    </FormControl>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {tab === 'bill' && (
                    <Button
                      onClick={() => setCreateBillOpen(true)}
                      variant="contained"
                      sx={{ bgcolor: '#45B3D4', color: '#fff', '&:hover': { bgcolor: '#2fa3c7' }, gap: 0.75 }}
                    >
                      <AddIcon sx={{ fontSize: 14 }} />
                      New Bill
                    </Button>
                  )}
                  {tab === 'purchase' && (
                    <Button
                      variant="outlined"
                      onClick={() => setCreatePurchaseOpen(true)}
                      sx={{ borderColor: 'divider', color: 'text.primary', gap: 0.75 }}
                    >
                      <AddIcon sx={{ fontSize: 14 }} />
                      New Expense
                    </Button>
                  )}
                  <Button
                    variant="outlined"
                    onClick={() => {
                      clear();
                      setPurchaseAccountId('');
                    }}
                    disabled={searchInput.trim() === '' && startDate.trim() === '' && endDate.trim() === '' && purchaseAccountId.trim() === ''}
                    sx={{ borderColor: 'divider', color: 'text.primary' }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card sx={{ borderColor: 'divider', overflow: 'hidden' }}>
            <CardContent sx={{ p: 0 }}>
              {tab === 'bill' ? (
                <div className="overflow-x-auto">
                  <Table size="small" className="table-striped" sx={{ '& th': { height: 32, px: 1 }, '& td': { px: 1, py: 0.75 }, fontSize: '0.75rem' }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Vendor</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>PO</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Brand</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                        <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Amount</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Account Summary</TableCell>
                        <TableCell sx={{ fontWeight: 600, textAlign: 'right', width: 40 }}>QBO</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {isLoading && (
                        <>
                          {Array.from({ length: 8 }).map((_, index) => (
                            <TableRow key={index}>
                              <TableCell colSpan={8} className="py-3">
                                <Skeleton variant="rectangular" height={40} width="100%" />
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
                                <OpenInNewIcon sx={{ fontSize: 14 }} />
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
                  <Table size="small" className="table-striped" sx={{ '& th': { height: 32, px: 1 }, '& td': { px: 1, py: 0.75 }, fontSize: '0.75rem' }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.hover' }}>
                        <TableCell sx={{ width: 40 }}> </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Date</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Type</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>No.</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Payee</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Memo</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
                        <TableCell sx={{ fontWeight: 600, textAlign: 'right' }}>Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {isLoading && (
                        <>
                          {Array.from({ length: 8 }).map((_, index) => (
                            <TableRow key={index}>
                              <TableCell colSpan={8} className="py-3">
                                <Skeleton variant="rectangular" height={40} width="100%" />
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

                      {!isLoading && !error && visibleRows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8}>
                            <EmptyState
                              title="No transactions found"
                              description="No transactions match your current filters."
                            />
                          </TableCell>
                        </TableRow>
                      )}

                      {!isLoading && !error && visibleRows.map((row) => {
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
                                  <ExpandMoreIcon
                                    sx={{
                                      fontSize: 14,
                                      transition: 'transform 200ms',
                                      transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                                    }}
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
                                  {isPurchaseRow(row) && (
                                    <Button
                                      variant="text"
                                      size="small"
                                      onClick={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setEditPurchase(row);
                                      }}
                                      sx={{ color: 'text.secondary', height: 28, px: 1, fontSize: '0.625rem', opacity: 0, transition: 'opacity 200ms', '.group:hover &': { opacity: 1 } }}
                                      className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                                    >
                                      Map
                                    </Button>
                                  )}
                                  <a
                                    href={qboTransactionUrl(row)}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Open in QuickBooks"
                                    title="Open in QuickBooks"
                                    className="inline-flex items-center justify-center h-7 w-7 -mt-0.5 rounded opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 text-slate-400 hover:text-brand-teal-500 hover:bg-brand-teal-50 dark:hover:bg-brand-teal-900/20"
                                  >
                                    <OpenInNewIcon sx={{ fontSize: 16 }} />
                                  </a>
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
                                        <Table size="small" sx={{ '& th': { height: 32, px: 1 }, '& td': { px: 1, py: 0.75 }, fontSize: '0.75rem' }}>
                                          <TableHead>
                                            <TableRow>
                                              <TableCell>Account</TableCell>
                                              <TableCell>Description</TableCell>
                                              <TableCell>Type</TableCell>
                                              <TableCell>Posting</TableCell>
                                              <TableCell sx={{ textAlign: 'right' }}>Amount</TableCell>
                                            </TableRow>
                                          </TableHead>
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
                    <IconButton size="small" disabled={page <= 1} onClick={() => setPage(page - 1)} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 32, height: 32 }}>
                      <ChevronLeftIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      disabled={page >= data.pagination.totalPages}
                      onClick={() => setPage(page + 1)}
                      sx={{ border: 1, borderColor: 'divider', borderRadius: 1, width: 32, height: 32 }}
                    >
                      <ChevronRightIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <CreatePurchaseModal
          open={createPurchaseOpen}
          onOpenChange={setCreatePurchaseOpen}
        />

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

        {editPurchase && (
          <EditPurchaseModal
            key={editPurchase.id}
            purchase={editPurchase}
            skus={skus}
            accounts={purchaseAccounts}
            open={true}
            onOpenChange={(open) => {
              if (!open) {
                setEditPurchase(null);
              }
            }}
          />
        )}

        <CreateBillModal
          open={createBillOpen}
          onOpenChange={setCreateBillOpen}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['plutus-transactions'] });
          }}
        />
      </div>
    </main>
  );
}
