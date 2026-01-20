'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { TransactionEditModal } from '@/components/transaction-edit-modal';
import { cn } from '@/lib/utils';
import type { ComplianceStatus } from '@/lib/sop/types';

interface Purchase {
  id: string;
  syncToken: string;
  date: string;
  amount: number;
  paymentType: string;
  reference: string;
  memo: string;
  vendor: string;
  vendorId?: string;
  account: string;
  accountId?: string;
  complianceStatus: ComplianceStatus;
}

interface PurchasesResponse {
  purchases: Purchase[];
  pagination: {
    page: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/plutus';

interface ConnectionStatus {
  connected: boolean;
}

async function fetchConnectionStatus(): Promise<ConnectionStatus> {
  const res = await fetch(`${basePath}/api/qbo/status`);
  return res.json();
}

async function fetchPurchases(page: number = 1): Promise<PurchasesResponse> {
  const res = await fetch(`${basePath}/api/qbo/purchases?page=${page}&pageSize=100`);
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? 'Failed to fetch purchases');
  }
  return res.json();
}

function ComplianceBadge({ status }: { status: ComplianceStatus }) {
  const styles = {
    compliant: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
    'non-compliant': 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
  };

  const labels = {
    compliant: 'Complete',
    partial: 'Partial',
    'non-compliant': 'Needs Attention',
  };

  return (
    <span className={cn('px-2 py-0.5 rounded text-xs font-medium', styles[status])}>
      {labels[status]}
    </span>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'GBP',
  }).format(amount);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function ReconcilePage() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<ComplianceStatus | 'all'>('all');
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: connectionStatus, isLoading: isCheckingConnection } = useQuery({
    queryKey: ['qbo-status'],
    queryFn: fetchConnectionStatus,
    staleTime: 30 * 1000,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['qbo-purchases-reconcile'],
    queryFn: () => fetchPurchases(1),
    staleTime: 2 * 60 * 1000,
    enabled: connectionStatus?.connected === true,
  });

  const purchases = useMemo(() => data?.purchases ?? [], [data?.purchases]);

  const [bulkEditPurchases, setBulkEditPurchases] = useState<Purchase[]>([]);
  const [bulkEditIndex, setBulkEditIndex] = useState<number | null>(null);

  const activePurchase = useMemo(() => {
    if (bulkEditIndex === null) return null;
    return bulkEditPurchases[bulkEditIndex] ?? null;
  }, [bulkEditPurchases, bulkEditIndex]);

  const stopBulkEdit = useCallback(() => {
    setBulkEditPurchases([]);
    setBulkEditIndex(null);
  }, []);

  useEffect(() => {
    if (bulkEditIndex === null) return;
    if (bulkEditIndex < bulkEditPurchases.length) return;
    stopBulkEdit();
  }, [bulkEditIndex, bulkEditPurchases.length, stopBulkEdit]);

  // Group by account
  const accountGroups = useMemo(() => {
    const groups: Record<string, { name: string; purchases: Purchase[] }> = {};

    for (const purchase of purchases) {
      const accountId = purchase.accountId ?? 'unknown';
      const accountName = purchase.account;

      if (!groups[accountId]) {
        groups[accountId] = { name: accountName, purchases: [] };
      }
      groups[accountId].purchases.push(purchase);
    }

    return groups;
  }, [purchases]);

  // Get unique accounts for filter
  const accounts = useMemo(() => {
    return Object.entries(accountGroups).map(([id, { name }]) => ({ id, name }));
  }, [accountGroups]);

  // Filter purchases
  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      const status = p.complianceStatus;
      const matchesFilter = filter === 'all' || status === filter;
      const matchesAccount = !accountFilter || p.accountId === accountFilter;
      return matchesFilter && matchesAccount;
    });
  }, [purchases, filter, accountFilter]);

  // Group filtered purchases by account
  const filteredGroups = useMemo(() => {
    const groups: Record<string, { name: string; purchases: Purchase[] }> = {};

    for (const purchase of filteredPurchases) {
      const accountId = purchase.accountId ?? 'unknown';
      const accountName = purchase.account;

      if (!groups[accountId]) {
        groups[accountId] = { name: accountName, purchases: [] };
      }
      groups[accountId].purchases.push(purchase);
    }

    return groups;
  }, [filteredPurchases]);

  // Stats
  const stats = useMemo(() => {
    const compliant = purchases.filter((p) => p.complianceStatus === 'compliant').length;
    const partial = purchases.filter((p) => p.complianceStatus === 'partial').length;
    const nonCompliant = purchases.filter((p) => p.complianceStatus === 'non-compliant').length;
    return { compliant, partial, nonCompliant, total: purchases.length };
  }, [purchases]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredPurchases.map((p) => p.id)));
  }, [filteredPurchases]);

  const selectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const startBulkEdit = useCallback(() => {
    const selectedPurchases = purchases.filter((p) => selectedIds.has(p.id));
    if (selectedPurchases.length === 0) return;

    setBulkEditPurchases(selectedPurchases);
    setBulkEditIndex(0);
  }, [purchases, selectedIds]);

  const handleEditSave = useCallback(
    (updated: { id: string; reference: string; memo: string; syncToken: string }) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(updated.id);
        return next;
      });

      queryClient.invalidateQueries({ queryKey: ['qbo-purchases-reconcile'] });

      setBulkEditIndex((prev) => {
        if (prev === null) return null;
        return prev + 1;
      });
    },
    [queryClient]
  );

  if (!isCheckingConnection && connectionStatus?.connected === false) {
    return <NotConnectedScreen title="Reconciliation" />;
  }

  if (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to load transactions';
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/50 p-8 text-center">
            <h2 className="text-lg font-semibold text-red-700 dark:text-red-400 mb-2">Error</h2>
            <p className="text-red-600 dark:text-red-300 mb-4">{errorMessage}</p>
            <Button onClick={() => refetch()} variant="outline">
              <RefreshIcon className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              Back
            </Link>
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
              Reconciliation
            </h1>
          </div>
          <Button onClick={() => refetch()} variant="outline" size="sm">
            <RefreshIcon className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-4">
            <div className="text-sm text-slate-500 dark:text-slate-400">Total</div>
            <div className="text-2xl font-semibold text-slate-900 dark:text-white">
              {stats.total}
            </div>
          </div>
          <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/50 p-4">
            <div className="text-sm text-emerald-600 dark:text-emerald-400">Complete</div>
            <div className="text-2xl font-semibold text-emerald-700 dark:text-emerald-300">
              {stats.compliant}
            </div>
          </div>
          <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/50 p-4">
            <div className="text-sm text-amber-600 dark:text-amber-400">Partial</div>
            <div className="text-2xl font-semibold text-amber-700 dark:text-amber-300">
              {stats.partial}
            </div>
          </div>
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/50 p-4">
            <div className="text-sm text-red-600 dark:text-red-400">Needs Attention</div>
            <div className="text-2xl font-semibold text-red-700 dark:text-red-300">
              {stats.nonCompliant}
            </div>
          </div>
        </div>

        {/* Filters and Actions */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as ComplianceStatus | 'all')}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/30 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="all">All Status</option>
              <option value="non-compliant">Needs Attention</option>
              <option value="partial">Partial</option>
              <option value="compliant">Complete</option>
            </select>

            <select
              value={accountFilter ?? ''}
              onChange={(e) => {
                const value = e.target.value;
                setAccountFilter(value === '' ? null : value);
              }}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-teal-500/30 dark:border-white/10 dark:bg-white/5 dark:text-white"
            >
              <option value="">All Accounts</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-center">
            {selectedIds.size > 0 && (
              <>
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedIds.size} selected
                </span>
                <Button variant="outline" size="sm" onClick={selectNone}>
                  Clear
                </Button>
                <Button size="sm" onClick={startBulkEdit}>
                  <CheckIcon className="h-4 w-4 mr-2" />
                  Apply SOP
                </Button>
              </>
            )}
            {selectedIds.size === 0 && (
              <Button variant="outline" size="sm" onClick={selectAll}>
                Select All ({filteredPurchases.length})
              </Button>
            )}
          </div>
        </div>

        {/* Grouped Transactions */}
        <div className="space-y-6">
          {isLoading || isCheckingConnection ? (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-8">
              <div className="flex items-center justify-center gap-2 text-slate-500">
                <RefreshIcon className="h-5 w-5 animate-spin" />
                Loading transactions...
              </div>
            </div>
          ) : Object.keys(filteredGroups).length === 0 ? (
            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-8 text-center">
              <p className="text-slate-500 dark:text-slate-400">
                {filter !== 'all' || accountFilter
                  ? 'No transactions match your filters'
                  : 'No transactions found'}
              </p>
            </div>
          ) : (
            Object.entries(filteredGroups).map(([accountId, group]) => (
              <div
                key={accountId}
                className="rounded-lg border border-slate-200 dark:border-white/10 overflow-hidden"
              >
                {/* Account Header */}
                <div className="px-4 py-3 bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-white/10">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-900 dark:text-white">
                      {group.name}
                    </h3>
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {group.purchases.length} transaction{group.purchases.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Transactions */}
                <div className="divide-y divide-slate-100 dark:divide-white/5 bg-white dark:bg-slate-900">
                  {group.purchases.map((purchase) => {
                    const status = purchase.complianceStatus;
                    const isSelected = selectedIds.has(purchase.id);

                    return (
                      <div
                        key={purchase.id}
                        className={cn(
                          'flex items-center gap-4 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer',
                          isSelected && 'bg-brand-teal-50 dark:bg-brand-teal-900/20'
                        )}
                        onClick={() => toggleSelect(purchase.id)}
                      >
                        {/* Checkbox */}
                        <div
                          className={cn(
                            'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                            isSelected
                              ? 'bg-brand-teal-500 border-brand-teal-500'
                              : 'border-slate-300 dark:border-slate-600'
                          )}
                        >
                          {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
                        </div>

                        {/* Date */}
                        <div className="w-24 text-sm text-slate-600 dark:text-slate-400">
                          {formatDate(purchase.date)}
                        </div>

                        {/* Vendor */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-slate-900 dark:text-white truncate">
                            {purchase.vendor}
                          </div>
                          {purchase.memo && (
                            <div className="text-sm text-slate-500 dark:text-slate-400 truncate">
                              {purchase.memo}
                            </div>
                          )}
                        </div>

                        {/* Reference */}
                        <div className="w-32 text-sm font-mono text-slate-600 dark:text-slate-400 truncate">
                          {purchase.reference === '' ? '—' : purchase.reference}
                        </div>

                        {/* Amount */}
                        <div className="w-24 text-right font-mono text-sm text-slate-900 dark:text-white">
                          {formatCurrency(purchase.amount)}
                        </div>

                        {/* Status */}
                        <div className="w-28 flex justify-end">
                          <ComplianceBadge status={status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-slate-500 dark:text-slate-400 pb-8">
          Transactions from QuickBooks Online
        </div>
      </div>

      {activePurchase && (
        <TransactionEditModal
          key={activePurchase.id}
          purchase={activePurchase}
          onClose={stopBulkEdit}
          onSave={handleEditSave}
        />
      )}
    </div>
  );
}
