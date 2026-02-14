'use client';

import { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Check, Trash2, Star, CheckCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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

interface StrategyGroupCardProps {
  group: {
    id: string;
    code: string;
    name: string;
    region: 'US' | 'UK';
    strategies: Strategy[];
  };
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
  return `${days}d ago`;
}

const KEY_PARAM_SLOTS: Array<{ match: string; label: string; suffix: string; isAccent: boolean }> = [
  { match: 'production stage default', label: 'Lead Time', suffix: ' weeks', isAccent: false },
  { match: 'ocean stage default', label: 'Ocean Stage', suffix: ' weeks', isAccent: true },
  { match: 'amazon payout delay', label: 'Payout Delay', suffix: ' weeks', isAccent: false },
  { match: 'stockout warning', label: 'Stockout Warn', suffix: ' weeks', isAccent: false },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function StrategyGroupCard({
  group,
  activeStrategyId,
  viewer,
  keyParametersByStrategyId,
}: StrategyGroupCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [strategies, setStrategies] = useState<Strategy[]>(group.strategies);

  useEffect(() => {
    setStrategies(group.strategies);
  }, [group.strategies]);

  /* ---- Dialog state ---- */
  const [scenarioDialogMode, setScenarioDialogMode] = useState<'create' | 'edit' | null>(null);
  const [scenarioGroupId, setScenarioGroupId] = useState<string | null>(null);
  const [scenarioStrategyId, setScenarioStrategyId] = useState<string | null>(null);
  const [scenarioName, setScenarioName] = useState('');
  const [scenarioDescription, setScenarioDescription] = useState('');
  const [scenarioAssigneeIds, setScenarioAssigneeIds] = useState<string[]>([]);
  const [scenarioPrimary, setScenarioPrimary] = useState(false);

  const [pendingSwitch, setPendingSwitch] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Strategy | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [directoryConfigured, setDirectoryConfigured] = useState(true);

  /* ---- Derived state ---- */

  const selectedStrategyId = activeStrategyId ?? searchParams?.get('strategy') ?? null;

  const displayStrategy = useMemo(() => {
    const matchActive = strategies.find((s) => s.id === selectedStrategyId);
    if (matchActive) return matchActive;
    const primary = strategies.find((s) => s.isPrimary);
    if (primary) return primary;
    return strategies[0] ?? null;
  }, [strategies, selectedStrategyId]);

  const selectedStrategyName =
    strategies.find((s) => s.id === selectedStrategyId)?.name ?? null;

  const canAssignByStrategyId = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const strategy of strategies) {
      const canAssign =
        viewer.isSuperAdmin ||
        (viewer.id != null && strategy.createdById === viewer.id) ||
        (viewer.email != null && strategy.createdByEmail?.toLowerCase() === viewer.email);
      map.set(strategy.id, canAssign);
    }
    return map;
  }, [strategies, viewer.email, viewer.id, viewer.isSuperAdmin]);

  const sortedStrategies = useMemo(() => {
    return [...strategies].sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1;
      }
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }, [strategies]);

  const keyParameters = useMemo(() => {
    const raw = displayStrategy ? keyParametersByStrategyId[displayStrategy.id] : undefined;
    if (!raw?.length) return [];
    const slots = KEY_PARAM_SLOTS.map((slot) => {
      const found = raw.find((p) => p.label.toLowerCase().includes(slot.match));
      return {
        label: slot.label,
        value: found ? found.value + slot.suffix : '\u2014',
        isAccent: slot.isAccent,
      };
    });
    const hasAny = slots.some((s) => s.value !== '\u2014');
    return hasAny ? slots : [];
  }, [displayStrategy, keyParametersByStrategyId]);

  /* ---- Assignee loading ---- */

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

        if (!response.ok) {
          const message = data?.error ?? 'Failed to load assignees';
          throw new Error(message);
        }

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

    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- Helpers ---- */

  const strategyAssigneeIds = (strategy: Strategy) =>
    Array.isArray(strategy.strategyAssignees) && strategy.strategyAssignees.length > 0
      ? strategy.strategyAssignees.map((entry) => entry.assigneeId)
      : strategy.assigneeId
        ? [strategy.assigneeId]
        : [];

  const hasSameAssignees = (left: string[], right: string[]) => {
    if (left.length !== right.length) return false;
    const leftSorted = [...left].sort();
    const rightSorted = [...right].sort();
    return leftSorted.every((value, index) => value === rightSorted[index]);
  };

  const toggleScenarioAssignee = (id: string) => {
    setScenarioAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((current) => current !== id) : [...prev, id],
    );
  };

  /* ---- Strategy selection ---- */

  const handleSelectStrategy = (id: string, name: string) => {
    if (id === selectedStrategyId) return;
    setPendingSwitch({ id, name });
  };

  const confirmSelectStrategy = () => {
    if (!pendingSwitch) return;
    const nextParams = new URLSearchParams(searchParams?.toString() ?? '');
    nextParams.set('strategy', pendingSwitch.id);
    setPendingSwitch(null);
    router.push(`?${nextParams.toString()}`);
    toast.success(`Switched to "${pendingSwitch.name}"`);
  };

  /* ---- Dialog openers / closers ---- */

  const openCreateScenarioDialog = () => {
    setScenarioDialogMode('create');
    setScenarioGroupId(group.id);
    setScenarioStrategyId(null);
    setScenarioName('');
    setScenarioDescription('');
    setScenarioAssigneeIds(viewer.id ? [viewer.id] : []);
    setScenarioPrimary(false);
  };

  const openEditScenarioDialog = () => {
    if (!displayStrategy) return;
    setScenarioDialogMode('edit');
    setScenarioGroupId(displayStrategy.strategyGroupId);
    setScenarioStrategyId(displayStrategy.id);
    setScenarioName(displayStrategy.name);
    setScenarioDescription(displayStrategy.description ?? '');
    setScenarioAssigneeIds(strategyAssigneeIds(displayStrategy));
    setScenarioPrimary(displayStrategy.isPrimary);
  };

  const closeScenarioDialog = () => {
    setScenarioDialogMode(null);
    setScenarioGroupId(null);
    setScenarioStrategyId(null);
  };

  /* ---- CRUD handlers ---- */

  const handleCreateScenario = async () => {
    const nextName = scenarioName.trim();
    if (!scenarioGroupId) return;
    if (!nextName) {
      toast.error('Enter a scenario name');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyGroupId: scenarioGroupId,
          name: nextName,
          description: scenarioDescription,
          assigneeIds: scenarioAssigneeIds,
          isPrimary: scenarioPrimary,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        strategy?: Strategy;
        error?: string;
      } | null;

      if (!response.ok || !data?.strategy) {
        throw new Error(data?.error ?? 'Failed to create scenario');
      }

      const createdStrategy = data.strategy;

      setStrategies((prev) => {
        const next = prev.map((strategy) =>
          createdStrategy.isPrimary && strategy.strategyGroupId === createdStrategy.strategyGroupId
            ? { ...strategy, isPrimary: false }
            : strategy,
        );

        next.push({
          ...createdStrategy,
          _count: createdStrategy._count ?? { products: 0, purchaseOrders: 0, salesWeeks: 0 },
        });

        return next;
      });

      closeScenarioDialog();
      toast.success('Scenario created');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to create scenario');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateScenario = async () => {
    if (!scenarioStrategyId) return;

    const target = strategies.find((strategy) => strategy.id === scenarioStrategyId);
    if (!target) return;

    const nextName = scenarioName.trim();
    if (!nextName) {
      toast.error('Enter a scenario name');
      return;
    }

    setIsSubmitting(true);

    try {
      const canAssign = Boolean(canAssignByStrategyId.get(target.id));
      const currentAssigneeIds = strategyAssigneeIds(target);
      const assigneeChanged = !hasSameAssignees(scenarioAssigneeIds, currentAssigneeIds);

      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: target.id,
          name: nextName,
          description: scenarioDescription,
          ...(canAssign && assigneeChanged ? { assigneeIds: scenarioAssigneeIds } : {}),
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        strategy?: Strategy;
        error?: string;
      } | null;

      if (!response.ok || !data?.strategy) {
        throw new Error(data?.error ?? 'Failed to update scenario');
      }

      setStrategies((prev) =>
        prev.map((strategy) =>
          strategy.id === target.id ? { ...strategy, ...data.strategy } : strategy,
        ),
      );

      closeScenarioDialog();
      toast.success('Scenario updated');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to update scenario');
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestDelete = (strategy: Strategy) => {
    setPendingDelete(strategy);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;

    setIsDeleting(true);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      const data = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (!response.ok) {
        const message = typeof data?.error === 'string' ? data.error : null;
        if (message) {
          throw new Error(message);
        }
        throw new Error('Failed to delete scenario');
      }

      setStrategies((prev) => prev.filter((scenario) => scenario.id !== id));
      setPendingDelete(null);
      toast.success('Scenario deleted');
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete scenario');
    } finally {
      setIsDeleting(false);
    }
  };

  /* ---- Render ---- */

  const scenarioDialogTitle = scenarioDialogMode === 'edit' ? 'Edit scenario' : 'New scenario';

  const isActiveInGroup = (strategyId: string) => strategyId === (displayStrategy?.id ?? null);

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow dark:border-[#0b3a52] dark:bg-[#0c2a40]">
        {/* ---- Header bar ---- */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4 dark:border-[#0b3a52] dark:bg-[#081f33]">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              {group.name}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {group.code}
            </p>
          </div>
          <button
            type="button"
            onClick={openEditScenarioDialog}
            className="text-sm font-medium text-cyan-600 transition hover:text-cyan-700 hover:underline dark:text-[#00C2B9] dark:hover:text-[#00d4cb]"
          >
            Edit Group
          </button>
        </div>

        {/* ---- Strategies section ---- */}
        <div className="p-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Strategies
          </p>

          <div className="flex flex-wrap gap-4 mb-6">
            {sortedStrategies.map((strategy) => {
              const isActive = isActiveInGroup(strategy.id);

              if (isActive) {
                /* Active / primary strategy card (larger) */
                return (
                  <button
                    key={strategy.id}
                    type="button"
                    onClick={() => handleSelectStrategy(strategy.id, strategy.name)}
                    className={cn(
                      'relative flex min-w-[200px] flex-1 flex-col rounded-lg border-2 p-4 text-left shadow-sm transition hover:shadow-md',
                      'border-slate-800 bg-sky-50 dark:border-[#00C2B9] dark:bg-cyan-900/20',
                    )}
                  >
                    {/* Check circle icon */}
                    <CheckCircle className="absolute right-2 top-2 h-5 w-5 text-cyan-600 dark:text-[#00C2B9]" />

                    <span className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1">
                      {strategy.name}
                      {strategy.isPrimary ? (
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                      ) : null}
                    </span>

                    {strategy.description ? (
                      <p className="mt-1 mb-3 line-clamp-2 text-xs text-muted-foreground">
                        {strategy.description}
                      </p>
                    ) : null}

                    <div className="mt-auto flex items-center gap-2 pt-2">
                      <span className="rounded bg-cyan-500 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm dark:bg-[#00C2B9] dark:text-[#002430]">
                        Active
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Last updated {timeAgo(strategy.updatedAt)}
                      </span>
                    </div>
                  </button>
                );
              }

              /* Scenario card (smaller) */
              return (
                <button
                  key={strategy.id}
                  type="button"
                  onClick={() => handleSelectStrategy(strategy.id, strategy.name)}
                  className={cn(
                    'flex w-32 shrink-0 flex-col justify-between rounded-lg border p-3 text-left transition hover:border-cyan-500 hover:bg-cyan-50/50 dark:hover:border-[#00C2B9]/50 dark:hover:bg-cyan-900/10',
                    'border-slate-200 bg-white dark:border-[#0b3a52] dark:bg-[#06182b]',
                  )}
                >
                  <span className="text-xs font-medium text-muted-foreground">
                    Scenario
                  </span>
                  <span className="mt-2 text-sm font-semibold leading-tight text-slate-900 dark:text-white">
                    {strategy.name}
                    {strategy.isPrimary ? (
                      <Star className="ml-1 inline-block h-3 w-3 fill-amber-400 text-amber-400" />
                    ) : null}
                  </span>
                </button>
              );
            })}

            {/* Add scenario button */}
            <button
              type="button"
              onClick={openCreateScenarioDialog}
              className="flex w-32 shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 p-3 text-muted-foreground transition hover:border-cyan-500 hover:text-cyan-600 hover:bg-cyan-50/50 dark:border-[#0b3a52] dark:hover:border-[#00C2B9] dark:hover:text-[#00C2B9] dark:hover:bg-cyan-900/10"
            >
              <Plus className="h-5 w-5" />
              <span className="text-xs">Add Scenario</span>
            </button>
          </div>

          {/* ---- Key Parameters section ---- */}
          {keyParameters.length > 0 ? <div className="border-t border-slate-200 pt-4 dark:border-[#0b3a52]">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Key Parameters
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {keyParameters.map((param) => (
                <div
                  key={param.label}
                  className="rounded border border-slate-200 bg-slate-50 p-3 dark:border-[#0b3a52] dark:bg-[#081f33]"
                >
                  <span className="text-xs text-muted-foreground">{param.label}</span>
                  <p
                    className={cn(
                      'mt-1 font-mono font-semibold',
                      param.isAccent
                        ? 'text-cyan-600 dark:text-[#00C2B9]'
                        : 'text-slate-900 dark:text-white',
                    )}
                  >
                    {param.value}
                  </p>
                </div>
              ))}
            </div>
          </div> : null}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/*  Create / edit scenario dialog                                    */}
      {/* ---------------------------------------------------------------- */}
      <Dialog open={scenarioDialogMode != null} onOpenChange={(open) => !open && closeScenarioDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{scenarioDialogTitle}</DialogTitle>
            <DialogDescription>
              {scenarioDialogMode === 'edit'
                ? 'Update scenario details.'
                : 'Create a new what-if scenario in this group.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Scenario name</label>
              <Input
                value={scenarioName}
                onChange={(event) => setScenarioName(event.target.value)}
                placeholder="Scenario name"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={scenarioDescription}
                onChange={(event) => setScenarioDescription(event.target.value)}
                placeholder="Optional"
              />
            </div>

            {scenarioDialogMode === 'create' ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Make primary</label>
                <button
                  type="button"
                  onClick={() => setScenarioPrimary((prev) => !prev)}
                  className={cn(
                    'flex h-9 w-full items-center rounded-md border px-3 text-sm transition-colors',
                    scenarioPrimary
                      ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:border-[#00C2B9] dark:bg-cyan-900/20 dark:text-cyan-200'
                      : 'border-input bg-background text-muted-foreground',
                  )}
                >
                  {scenarioPrimary ? 'Primary on create' : 'Create as what-if'}
                </button>
              </div>
            ) : null}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assignees</label>
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {directoryConfigured ? 'Loading assignees...' : 'Directory unavailable'}
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background">
                  {assignees.map((assignee) => {
                    const checked = scenarioAssigneeIds.includes(assignee.id);
                    return (
                      <button
                        key={assignee.id}
                        type="button"
                        onClick={() => toggleScenarioAssignee(assignee.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-muted/50',
                          checked && 'bg-cyan-50 dark:bg-cyan-900/20',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-colors',
                            checked
                              ? 'border-cyan-600 bg-cyan-600 text-white dark:border-[#00C2B9] dark:bg-[#00C2B9] dark:text-slate-900'
                              : 'border-input',
                          )}
                        >
                          {checked ? <Check className="h-3 w-3" /> : null}
                        </span>
                        <span className="truncate">{assignee.email}</span>
                        {assignee.fullName ? (
                          <span className="truncate text-muted-foreground">({assignee.fullName})</span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            {scenarioDialogMode === 'edit' && scenarioStrategyId ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={isSubmitting}
                onClick={() => {
                  const target = strategies.find((s) => s.id === scenarioStrategyId);
                  if (target) {
                    closeScenarioDialog();
                    requestDelete(target);
                  }
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete
              </Button>
            ) : (
              <div />
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeScenarioDialog} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                onClick={() =>
                  void (scenarioDialogMode === 'edit' ? handleUpdateScenario() : handleCreateScenario())
                }
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? scenarioDialogMode === 'edit'
                    ? 'Saving...'
                    : 'Creating...'
                  : scenarioDialogMode === 'edit'
                    ? 'Save'
                    : 'Create'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------------------------------------------------------------- */}
      {/*  Switch confirmation dialog                                       */}
      {/* ---------------------------------------------------------------- */}
      <AlertDialog
        open={pendingSwitch != null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSwitch
                ? selectedStrategyName
                  ? `Switch from "${selectedStrategyName}" to "${pendingSwitch.name}"? Your data is saved automatically.`
                  : `Switch to "${pendingSwitch.name}"? Your data is saved automatically.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSelectStrategy}>Switch</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------------------------------------------------------------- */}
      {/*  Delete confirmation dialog                                       */}
      {/* ---------------------------------------------------------------- */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete scenario?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `This will permanently delete "${pendingDelete.name}" and all its data (${pendingDelete._count.products} products, ${pendingDelete._count.purchaseOrders} purchase orders, ${pendingDelete._count.salesWeeks} sales weeks). This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
              className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
