'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { DataTable, ColumnMeta } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TransactionEditModal } from '@/components/transaction-edit-modal';
import { NotConnectedScreen } from '@/components/not-connected-screen';
import { getComplianceStatus } from '@/lib/sop/config';
import { cn } from '@/lib/utils';

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
  complianceStatus: 'compliant' | 'partial' | 'non-compliant';
  lineItems: Array<{
    id: string;
    amount: number;
    description?: string;
    account?: string;
    accountId?: string;
  }>;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '/plutus';

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'compliant':
      return (
        <Badge variant="success" className="gap-1">
          <CheckIcon className="h-3 w-3" />
          Compliant
        </Badge>
      );
    case 'partial':
      return (
        <Badge variant="default" className="gap-1">
          <PartialIcon className="h-3 w-3" />
          Partial
        </Badge>
      );
    case 'non-compliant':
      return (
        <Badge variant="destructive" className="gap-1">
          <XIcon className="h-3 w-3" />
          Missing
        </Badge>
      );
    default:
      return null;
  }
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PartialIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M12 2a10 10 0 0 1 0 20V2z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
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

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  );
}

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
      />
    </svg>
  );
}

export default function TransactionsPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 50,
    totalCount: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [filter, setFilter] = useState<'all' | 'compliant' | 'partial' | 'non-compliant'>('all');
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

  const checkConnectionAndFetch = useCallback(async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      // First check connection status
      const statusRes = await fetch(`${basePath}/api/qbo/status`);
      const statusData = await statusRes.json();

      if (!statusData.connected) {
        setIsConnected(false);
        setLoading(false);
        return;
      }

      setIsConnected(true);

      // Now fetch purchases
      const res = await fetch(`${basePath}/api/qbo/purchases?page=${page}&pageSize=50`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to fetch purchases');
      }
      const data = await res.json();
      setPurchases(data.purchases);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch purchases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConnectionAndFetch();
  }, [checkConnectionAndFetch]);

  const handlePageChange = (newPage: number) => {
    checkConnectionAndFetch(newPage);
  };

  const handleEdit = (purchase: Purchase) => {
    setSelectedPurchase(purchase);
  };

  const handleCloseModal = () => {
    setSelectedPurchase(null);
  };

  const handleSaveSuccess = (updatedPurchase: { id: string; reference: string; memo: string; syncToken: string }) => {
    setPurchases((prev) =>
      prev.map((p) =>
        p.id === updatedPurchase.id
          ? {
              ...p,
              reference: updatedPurchase.reference,
              memo: updatedPurchase.memo,
              syncToken: updatedPurchase.syncToken,
              complianceStatus: getComplianceStatus(updatedPurchase.reference, updatedPurchase.memo),
            }
          : p
      )
    );
    setSelectedPurchase(null);
  };

  const filteredPurchases = useMemo(() => {
    return purchases.filter((p) => {
      if (filter === 'all') return true;
      return p.complianceStatus === filter;
    });
  }, [purchases, filter]);

  const complianceCounts = useMemo(() => ({
    all: purchases.length,
    compliant: purchases.filter((p) => p.complianceStatus === 'compliant').length,
    partial: purchases.filter((p) => p.complianceStatus === 'partial').length,
    'non-compliant': purchases.filter((p) => p.complianceStatus === 'non-compliant').length,
  }), [purchases]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const columns: ColumnDef<Purchase>[] = useMemo(
    () => [
      {
        accessorKey: 'complianceStatus',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.complianceStatus} />,
        enableSorting: true,
      },
      {
        accessorKey: 'date',
        header: 'Date',
        cell: ({ row }) => (
          <span className="text-slate-700 dark:text-slate-300 whitespace-nowrap">
            {formatDate(row.original.date)}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'vendor',
        header: 'Vendor',
        cell: ({ row }) => (
          <span className="font-medium text-slate-900 dark:text-white truncate max-w-[180px] block">
            {row.original.vendor}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'account',
        header: 'Account',
        cell: ({ row }) => (
          <span className="text-slate-600 dark:text-slate-400 truncate max-w-[150px] block">
            {row.original.account}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'amount',
        header: 'Amount',
        cell: ({ row }) => (
          <span className="font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">
            {formatAmount(row.original.amount)}
          </span>
        ),
        meta: { align: 'right' } as ColumnMeta,
        enableSorting: true,
      },
      {
        accessorKey: 'reference',
        header: 'Reference',
        cell: ({ row }) =>
          row.original.reference ? (
            <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-xs font-mono text-slate-700 dark:text-slate-300">
              {row.original.reference}
            </code>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 italic text-sm">Empty</span>
          ),
        enableSorting: false,
      },
      {
        accessorKey: 'memo',
        header: 'Memo',
        cell: ({ row }) =>
          row.original.memo ? (
            <span className="text-slate-600 dark:text-slate-400 text-sm truncate max-w-[200px] block">
              {row.original.memo}
            </span>
          ) : (
            <span className="text-slate-400 dark:text-slate-500 italic text-sm">Empty</span>
          ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(row.original);
            }}
            className="h-8 w-8 p-0"
          >
            <PencilIcon className="h-4 w-4" />
          </Button>
        ),
        enableSorting: false,
      },
    ],
    []
  );

  if (isConnected === false) {
    return <NotConnectedScreen title="Transactions" />;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto">
          <div className="rounded-xl border border-danger-200 bg-danger-50 dark:border-danger-900 dark:bg-danger-950/50 p-8 text-center">
            <h2 className="text-lg font-semibold text-danger-700 dark:text-danger-400 mb-2">Error</h2>
            <p className="text-danger-600 dark:text-danger-300 mb-4">{error}</p>
            <Button onClick={() => checkConnectionAndFetch()} variant="outline">
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
            <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Transactions</h1>
          </div>
          <Button onClick={() => checkConnectionAndFetch(pagination.page)} variant="outline" size="sm">
            <RefreshIcon className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </header>

        {/* Filter Tabs */}
        <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-white/5 rounded-lg w-fit">
          <FilterTab
            active={filter === 'all'}
            onClick={() => setFilter('all')}
            count={complianceCounts.all}
            label="All"
          />
          <FilterTab
            active={filter === 'non-compliant'}
            onClick={() => setFilter('non-compliant')}
            count={complianceCounts['non-compliant']}
            label="Missing"
            icon={<XIcon className="h-3.5 w-3.5" />}
            variant="destructive"
          />
          <FilterTab
            active={filter === 'partial'}
            onClick={() => setFilter('partial')}
            count={complianceCounts.partial}
            label="Partial"
            icon={<PartialIcon className="h-3.5 w-3.5" />}
            variant="default"
          />
          <FilterTab
            active={filter === 'compliant'}
            onClick={() => setFilter('compliant')}
            count={complianceCounts.compliant}
            label="Compliant"
            icon={<CheckIcon className="h-3.5 w-3.5" />}
            variant="success"
          />
        </div>

        {/* Table */}
        <DataTable
          columns={columns}
          data={filteredPurchases}
          loading={loading}
          skeletonRows={10}
          initialSorting={[{ id: 'date', desc: true }]}
          emptyState={
            <div className="py-8">
              <p className="text-slate-500 dark:text-slate-400">No transactions found matching the filter.</p>
            </div>
          }
        />

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between pt-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Showing {filteredPurchases.length} of {pagination.totalCount} transactions
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                Previous
              </Button>
              <span className="text-sm text-slate-600 dark:text-slate-400 px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {selectedPurchase && (
        <TransactionEditModal
          purchase={selectedPurchase}
          onClose={handleCloseModal}
          onSave={handleSaveSuccess}
        />
      )}
    </div>
  );
}

interface FilterTabProps {
  active: boolean;
  onClick: () => void;
  count: number;
  label: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'success' | 'destructive';
}

function FilterTab({ active, onClick, count, label, icon, variant }: FilterTabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all',
        active
          ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
      )}
    >
      {icon && (
        <span
          className={cn(
            variant === 'success' && 'text-success-600 dark:text-success-400',
            variant === 'destructive' && 'text-danger-600 dark:text-danger-400',
            variant === 'default' && 'text-brand-teal-600 dark:text-brand-cyan'
          )}
        >
          {icon}
        </span>
      )}
      {label}
      <span
        className={cn(
          'ml-1 px-1.5 py-0.5 rounded text-xs',
          active
            ? 'bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300'
            : 'bg-slate-200/50 dark:bg-white/5 text-slate-500 dark:text-slate-500'
        )}
      >
        {count}
      </span>
    </button>
  );
}
