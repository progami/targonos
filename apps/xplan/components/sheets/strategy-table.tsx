'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  ScenarioDialog,
  SwitchDialog,
  DeleteDialog,
  type ScenarioDialogState,
} from '@/components/sheets/strategy-dialogs';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Strategy = {
  id: string;
  name: string;
  description: string | null;
  region: 'US' | 'UK';
  isDefault: boolean;
  isPrimary: boolean;
  strategyGroupId: string;
  strategyGroup: {
    id: string;
    code: string;
    name: string;
    region: 'US' | 'UK';
    createdById: string | null;
    createdByEmail: string | null;
    assigneeId: string | null;
    assigneeEmail: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  createdById?: string | null;
  createdByEmail?: string | null;
  assigneeId?: string | null;
  assigneeEmail?: string | null;
  strategyAssignees?: Array<{
    id: string;
    assigneeId: string;
    assigneeEmail: string;
  }>;
  createdAt: string;
  updatedAt: string;
  _count: {
    products: number;
    purchaseOrders: number;
    salesWeeks: number;
  };
};

type Assignee = {
  id: string;
  email: string;
  fullName: string | null;
};

type RegionFilter = 'ALL' | 'US' | 'UK';

interface StrategyTableProps {
  strategies: Strategy[];
  activeStrategyId: string | null;
  viewer: { id: string | null; email: string | null; isSuperAdmin: boolean };
  keyParametersByStrategyId: Record<string, Array<{ label: string; value: string }>>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days > 7) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return `${days}d ago`;
}

const REGION_TABS: Array<{ id: RegionFilter; label: string }> = [
  { id: 'ALL', label: 'All' },
  { id: 'US', label: '\u{1F1FA}\u{1F1F8} US' },
  { id: 'UK', label: '\u{1F1EC}\u{1F1E7} UK' },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StrategyTable({
  strategies: initialStrategies,
  activeStrategyId,
  viewer,
}: StrategyTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('ALL');

  useEffect(() => {
    setStrategies(initialStrategies);
  }, [initialStrategies]);

  /* ---- Dialog state ---- */
  const [scenarioDialog, setScenarioDialog] = useState<ScenarioDialogState>(null);
  const [pendingSwitch, setPendingSwitch] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Strategy | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  /* ---- Assignees ---- */
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [directoryConfigured, setDirectoryConfigured] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadAssignees() {
      try {
        const response = await fetch(withAppBasePath('/api/v1/xplan/assignees'));
        const data = (await response.json().catch(() => null)) as {
          assignees?: Assignee[];
          directoryConfigured?: boolean;
          error?: string;
        } | null;
        if (!response.ok) throw new Error(data?.error ?? 'Failed to load assignees');
        if (cancelled) return;
        setAssignees(Array.isArray(data?.assignees) ? data.assignees : []);
        setDirectoryConfigured(Boolean(data?.directoryConfigured));
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setAssignees([]);
          setDirectoryConfigured(false);
        }
      }
    }
    void loadAssignees();
    return () => { cancelled = true; };
  }, []);

  /* ---- Derived ---- */

  const selectedStrategyId = activeStrategyId ?? searchParams?.get('strategy') ?? null;
  const selectedStrategyName = strategies.find((s) => s.id === selectedStrategyId)?.name ?? null;

  const filteredStrategies = useMemo(() => {
    const filtered = regionFilter === 'ALL'
      ? strategies
      : strategies.filter((s) => s.region === regionFilter);

    return [...filtered].sort((a, b) => {
      // Active first
      if (a.id === selectedStrategyId && b.id !== selectedStrategyId) return -1;
      if (b.id === selectedStrategyId && a.id !== selectedStrategyId) return 1;
      // Then by group name
      const groupCmp = a.strategyGroup!.name.localeCompare(b.strategyGroup!.name);
      if (groupCmp !== 0) return groupCmp;
      // Primary first within group
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      // Then by updated
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [strategies, regionFilter, selectedStrategyId]);

  const strategyAssigneeIds = (strategy: Strategy) =>
    Array.isArray(strategy.strategyAssignees) && strategy.strategyAssignees.length > 0
      ? strategy.strategyAssignees.map((entry) => entry.assigneeId)
      : strategy.assigneeId
        ? [strategy.assigneeId]
        : [];

  /* ---- Groups for "New Scenario" selector ---- */
  const groups = useMemo(() => {
    const map = new Map<string, { id: string; code: string; name: string; region: 'US' | 'UK' }>();
    for (const s of strategies) {
      if (s.strategyGroup && !map.has(s.strategyGroup.id)) {
        map.set(s.strategyGroup.id, {
          id: s.strategyGroup.id,
          code: s.strategyGroup.code,
          name: s.strategyGroup.name,
          region: s.strategyGroup.region,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [strategies]);

  /* ---- Handlers ---- */

  const handleRowClick = useCallback((strategy: Strategy) => {
    if (strategy.id === selectedStrategyId) return;
    setPendingSwitch({ id: strategy.id, name: strategy.name });
  }, [selectedStrategyId]);

  const confirmSwitch = useCallback(() => {
    if (!pendingSwitch) return;
    const nextParams = new URLSearchParams(searchParams?.toString() ?? '');
    nextParams.set('strategy', pendingSwitch.id);
    setPendingSwitch(null);
    router.push(`?${nextParams.toString()}`);
    toast.success(`Switched to "${pendingSwitch.name}"`);
  }, [pendingSwitch, searchParams, router]);

  const openCreateDialog = useCallback((groupId: string) => {
    setScenarioDialog({
      mode: 'create',
      groupId,
      strategyId: null,
      name: '',
      description: '',
      assigneeIds: viewer.id ? [viewer.id] : [],
      isPrimary: false,
    });
  }, [viewer.id]);

  const openEditDialog = useCallback((strategy: Strategy) => {
    setScenarioDialog({
      mode: 'edit',
      groupId: strategy.strategyGroupId,
      strategyId: strategy.id,
      name: strategy.name,
      description: strategy.description ?? '',
      assigneeIds: strategyAssigneeIds(strategy),
      isPrimary: strategy.isPrimary,
    });
  }, []);

  const handleScenarioSubmit = useCallback(async (data: {
    mode: 'create' | 'edit';
    groupId: string;
    strategyId: string | null;
    name: string;
    description: string;
    assigneeIds: string[];
    isPrimary: boolean;
  }) => {
    const trimmedName = data.name.trim();
    if (!trimmedName) {
      toast.error('Enter a scenario name');
      return;
    }

    setIsSubmitting(true);
    try {
      if (data.mode === 'create') {
        const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategyGroupId: data.groupId,
            name: trimmedName,
            description: data.description,
            assigneeIds: data.assigneeIds,
            isPrimary: data.isPrimary,
          }),
        });
        const result = (await response.json().catch(() => null)) as {
          strategy?: Strategy;
          error?: string;
        } | null;
        if (!response.ok || !result?.strategy) {
          throw new Error(result?.error ?? 'Failed to create scenario');
        }
        const created = result.strategy;
        setStrategies((prev) => {
          const next = prev.map((s) =>
            created.isPrimary && s.strategyGroupId === created.strategyGroupId
              ? { ...s, isPrimary: false }
              : s,
          );
          next.push(created);
          return next;
        });
        toast.success('Scenario created');
      } else {
        const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: data.strategyId,
            name: trimmedName,
            description: data.description,
            assigneeIds: data.assigneeIds,
          }),
        });
        const result = (await response.json().catch(() => null)) as {
          strategy?: Strategy;
          error?: string;
        } | null;
        if (!response.ok || !result?.strategy) {
          throw new Error(result?.error ?? 'Failed to update scenario');
        }
        setStrategies((prev) =>
          prev.map((s) => (s.id === data.strategyId ? { ...s, ...result.strategy } : s)),
        );
        toast.success('Scenario updated');
      }
      setScenarioDialog(null);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Operation failed');
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pendingDelete.id }),
      });
      const data = (await response.json().catch(() => null)) as { error?: unknown } | null;
      if (!response.ok) {
        const message = typeof data?.error === 'string' ? data.error : 'Failed to delete scenario';
        throw new Error(message);
      }
      setStrategies((prev) => prev.filter((s) => s.id !== pendingDelete.id));
      setPendingDelete(null);
      toast.success('Scenario deleted');
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete scenario');
    } finally {
      setIsDeleting(false);
    }
  }, [pendingDelete, router]);

  /* ---- Render ---- */

  const availableGroups = regionFilter === 'ALL'
    ? groups
    : groups.filter((group) => group.region === regionFilter);

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-[20px] border border-slate-200/80 bg-white/88 p-3 shadow-[0_18px_35px_-30px_rgba(15,23,42,0.35)] dark:border-[#153a54] dark:bg-[#081a2b]/84 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                Scenario Roster
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                Switch the workbook between active planning scenarios without leaving setup.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {REGION_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setRegionFilter(tab.id)}
                  className={cn(
                    'rounded-xl px-3 py-1.5 text-sm font-semibold transition-colors',
                    regionFilter === tab.id
                      ? 'bg-slate-950 text-white shadow-sm dark:bg-[#00C2B9] dark:text-slate-950'
                      : 'border border-transparent bg-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900/60',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {filteredStrategies.length} scenario{filteredStrategies.length === 1 ? '' : 's'}
            </span>
            {availableGroups.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openCreateDialog(availableGroups[0].id)}
                className="gap-1.5 rounded-xl border-slate-300 bg-white/90 px-3.5 text-slate-900 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                New Scenario
              </Button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white/92 shadow-[0_22px_48px_-34px_rgba(15,23,42,0.42)] dark:border-[#153a54] dark:bg-[#081a2b]/90">
          <Table>
            <TableHeader className="bg-slate-50/90 dark:bg-[#0a2237]/92">
              <TableRow className="border-slate-200/80 hover:bg-transparent dark:border-[#17364d]">
                <TableHead className="h-11 w-[280px] px-4 text-[11px] font-semibold uppercase tracking-[0.14em]">Strategy</TableHead>
                <TableHead className="px-4 text-[11px] font-semibold uppercase tracking-[0.14em]">Group</TableHead>
                <TableHead className="w-[88px] px-4 text-[11px] font-semibold uppercase tracking-[0.14em]">Region</TableHead>
                <TableHead className="w-[90px] px-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em]">Products</TableHead>
                <TableHead className="w-[120px] px-4 text-[11px] font-semibold uppercase tracking-[0.14em]">Updated</TableHead>
                <TableHead className="w-[60px]" />
              </TableRow>
            </TableHeader>
            <TableBody className="[&_tr:last-child]:border-b-0">
              {filteredStrategies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No strategies found.
                  </TableCell>
                </TableRow>
              ) : (
                filteredStrategies.map((strategy) => {
                  const isActive = strategy.id === selectedStrategyId;
                  return (
                    <TableRow
                      key={strategy.id}
                      onClick={() => handleRowClick(strategy)}
                      className={cn(
                        'cursor-pointer border-slate-200/80 hover:bg-slate-50/80 dark:border-[#17364d] dark:hover:bg-[#0d2438]/88',
                        isActive && 'bg-cyan-50/70 ring-1 ring-inset ring-cyan-200/70 dark:bg-[#082f3a]/70 dark:ring-cyan-900/50',
                      )}
                    >
                      <TableCell className="px-4 py-3.5 font-medium">
                        <div className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-slate-900 dark:text-white">
                            {strategy.name}
                          </span>
                          {strategy.isPrimary && (
                            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                          )}
                          {isActive && (
                            <span className="rounded-full border border-cyan-200 bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-900 dark:border-cyan-900/50 dark:bg-cyan-950/50 dark:text-cyan-100">
                              Live
                            </span>
                          )}
                        </div>
                        {strategy.description && (
                          <p className="mt-1 max-w-[32rem] text-xs text-muted-foreground line-clamp-1">
                            {strategy.description}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {strategy.strategyGroup?.name ?? '\u2014'}
                          </span>
                          {strategy.strategyGroup?.code && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                              {strategy.strategyGroup.code}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {strategy.region === 'US' ? '\u{1F1FA}\u{1F1F8}' : '\u{1F1EC}\u{1F1E7}'} {strategy.region}
                        </span>
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-right font-mono text-sm tabular-nums">
                        {strategy._count.products}
                      </TableCell>
                      <TableCell className="px-4 py-3.5 text-xs font-medium text-muted-foreground">
                        {timeAgo(strategy.updatedAt)}
                      </TableCell>
                      <TableCell className="px-4 py-3.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 rounded-xl p-0 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(strategy);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialogs */}
      <ScenarioDialog
        state={scenarioDialog}
        onClose={() => setScenarioDialog(null)}
        onSubmit={handleScenarioSubmit}
        onRequestDelete={(id) => {
          const target = strategies.find((s) => s.id === id);
          if (target) setPendingDelete(target);
        }}
        assignees={assignees}
        directoryConfigured={directoryConfigured}
        isSubmitting={isSubmitting}
      />
      <SwitchDialog
        pending={pendingSwitch}
        currentName={selectedStrategyName}
        onConfirm={confirmSwitch}
        onCancel={() => setPendingSwitch(null)}
      />
      <DeleteDialog
        pending={pendingDelete}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
        isDeleting={isDeleting}
      />
    </>
  );
}
