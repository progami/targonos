'use client';

import { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Check, Pencil, Trash2, Star, ChevronRight } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import { formatDateDisplay } from '@/lib/utils/dates';
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

type Assignee = {
  id: string;
  email: string;
  fullName: string | null;
};

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

type StrategyGroupView = {
  id: string;
  code: string;
  name: string;
  region: 'US' | 'UK';
  strategies: Strategy[];
};

interface SetupStrategyBarProps {
  strategies: Strategy[];
  activeStrategyId?: string | null;
  viewer: {
    id: string | null;
    email: string | null;
    isSuperAdmin: boolean;
  };
}

function normalizeGroupCode(raw: string) {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

export function SetupStrategyBar({
  strategies: initialStrategies,
  activeStrategyId,
  viewer,
}: SetupStrategyBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);

  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [groupRegion, setGroupRegion] = useState<'US' | 'UK'>('US');
  const [groupScenarioName, setGroupScenarioName] = useState('Base case');
  const [groupScenarioDescription, setGroupScenarioDescription] = useState('');
  const [groupAssigneeIds, setGroupAssigneeIds] = useState<string[]>([]);

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

  useEffect(() => {
    setStrategies(initialStrategies);
  }, [initialStrategies]);

  const selectedStrategyId = activeStrategyId ?? searchParams?.get('strategy') ?? null;
  const selectedStrategyName =
    strategies.find((strategy) => strategy.id === selectedStrategyId)?.name ?? null;

  const lastEditedFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
      }),
    [],
  );

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

  const groups = useMemo<StrategyGroupView[]>(() => {
    const grouped = new Map<string, StrategyGroupView>();

    for (const strategy of strategies) {
      const group = strategy.strategyGroup;
      if (!group) continue;

      const existing = grouped.get(group.id);
      if (existing) {
        existing.strategies.push(strategy);
        continue;
      }

      grouped.set(group.id, {
        id: group.id,
        code: group.code,
        name: group.name,
        region: group.region,
        strategies: [strategy],
      });
    }

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        strategies: [...group.strategies].sort((left, right) => {
          if (left.isPrimary !== right.isPrimary) {
            return left.isPrimary ? -1 : 1;
          }
          return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        }),
      }))
      .sort((left, right) => {
        if (left.region !== right.region) {
          return left.region.localeCompare(right.region);
        }
        return left.name.localeCompare(right.name);
      });
  }, [strategies]);

  /* ------------------------------------------------------------------ */
  /*  Derived active state                                               */
  /* ------------------------------------------------------------------ */

  const activeStrategy = strategies.find((s) => s.id === selectedStrategyId);
  const activeRegion = activeStrategy?.region ?? 'US';
  const activeGroupId = activeStrategy?.strategyGroupId ?? null;
  const regionGroups = groups.filter((g) => g.region === activeRegion);
  const activeGroup = regionGroups.find((g) => g.id === activeGroupId) ?? regionGroups[0] ?? null;

  /* ------------------------------------------------------------------ */
  /*  Assignee loading                                                   */
  /* ------------------------------------------------------------------ */

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

  /* ------------------------------------------------------------------ */
  /*  Helpers                                                            */
  /* ------------------------------------------------------------------ */

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

  const getAssigneeShortLabels = (strategy: Strategy): string => {
    const emails =
      Array.isArray(strategy.strategyAssignees) && strategy.strategyAssignees.length > 0
        ? strategy.strategyAssignees.map((entry) => entry.assigneeEmail)
        : strategy.assigneeEmail
          ? [strategy.assigneeEmail]
          : [];

    if (emails.length === 0) return 'Unassigned';
    return emails.map((email) => email.split('@')[0]).join(', ');
  };

  const renderLastEditedLabel = (strategy: Strategy) =>
    formatDateDisplay(strategy.updatedAt, lastEditedFormatter, '\u2014');

  const toggleGroupAssignee = (id: string) => {
    setGroupAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((current) => current !== id) : [...prev, id],
    );
  };

  const toggleScenarioAssignee = (id: string) => {
    setScenarioAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((current) => current !== id) : [...prev, id],
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Region switching                                                   */
  /* ------------------------------------------------------------------ */

  const handleRegionSwitch = (region: 'US' | 'UK') => {
    if (region === activeRegion) return;
    const targetGroups = groups.filter((g) => g.region === region);
    const firstGroup = targetGroups[0];
    if (!firstGroup) return;
    const primary = firstGroup.strategies.find((s) => s.isPrimary) ?? firstGroup.strategies[0];
    if (!primary) return;
    handleSelectStrategy(primary.id, primary.name);
  };

  /* ------------------------------------------------------------------ */
  /*  Group switching                                                    */
  /* ------------------------------------------------------------------ */

  const handleGroupChange = (groupId: string) => {
    if (groupId === activeGroup?.id) return;
    const targetGroup = regionGroups.find((g) => g.id === groupId);
    if (!targetGroup) return;
    const primary = targetGroup.strategies.find((s) => s.isPrimary) ?? targetGroup.strategies[0];
    if (!primary) return;
    handleSelectStrategy(primary.id, primary.name);
  };

  /* ------------------------------------------------------------------ */
  /*  Scenario switching                                                 */
  /* ------------------------------------------------------------------ */

  const handleScenarioChange = (strategyId: string) => {
    if (strategyId === selectedStrategyId) return;
    const target = activeGroup?.strategies.find((s) => s.id === strategyId);
    if (!target) return;
    setPendingSwitch({ id: target.id, name: target.name });
  };

  /* ------------------------------------------------------------------ */
  /*  Dialog openers / closers                                           */
  /* ------------------------------------------------------------------ */

  const openCreateGroupDialog = () => {
    setIsGroupDialogOpen(true);
    setGroupName('');
    setGroupCode('');
    setGroupRegion(activeRegion);
    setGroupScenarioName('Base case');
    setGroupScenarioDescription('');
    setGroupAssigneeIds(viewer.id ? [viewer.id] : []);
  };

  const closeCreateGroupDialog = () => {
    setIsGroupDialogOpen(false);
  };

  const openCreateScenarioDialog = () => {
    if (!activeGroup) return;
    setScenarioDialogMode('create');
    setScenarioGroupId(activeGroup.id);
    setScenarioStrategyId(null);
    setScenarioName('');
    setScenarioDescription('');
    setScenarioAssigneeIds(viewer.id ? [viewer.id] : []);
    setScenarioPrimary(false);
  };

  const openEditScenarioDialog = () => {
    if (!activeStrategy) return;
    setScenarioDialogMode('edit');
    setScenarioGroupId(activeStrategy.strategyGroupId);
    setScenarioStrategyId(activeStrategy.id);
    setScenarioName(activeStrategy.name);
    setScenarioDescription(activeStrategy.description ?? '');
    setScenarioAssigneeIds(strategyAssigneeIds(activeStrategy));
    setScenarioPrimary(activeStrategy.isPrimary);
  };

  const closeScenarioDialog = () => {
    setScenarioDialogMode(null);
    setScenarioGroupId(null);
    setScenarioStrategyId(null);
  };

  /* ------------------------------------------------------------------ */
  /*  CRUD handlers                                                      */
  /* ------------------------------------------------------------------ */

  const handleCreateGroup = async () => {
    const nextGroupName = groupName.trim();
    const normalizedCode = normalizeGroupCode(groupCode);
    const nextScenarioName = groupScenarioName.trim();

    if (!nextGroupName) {
      toast.error('Enter a strategy group name');
      return;
    }
    if (!normalizedCode) {
      toast.error('Enter a strategy group code');
      return;
    }
    if (!nextScenarioName) {
      toast.error('Enter an initial scenario name');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyGroupName: nextGroupName,
          strategyGroupCode: normalizedCode,
          region: groupRegion,
          name: nextScenarioName,
          description: groupScenarioDescription,
          assigneeIds: groupAssigneeIds,
          isPrimary: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        strategy?: Strategy;
        error?: string;
      } | null;

      if (!response.ok || !data?.strategy) {
        throw new Error(data?.error ?? 'Failed to create strategy group');
      }

      const createdStrategy = data.strategy;

      setStrategies((prev) => [
        ...prev,
        {
          ...createdStrategy,
          _count: createdStrategy._count ?? { products: 0, purchaseOrders: 0, salesWeeks: 0 },
        },
      ]);
      closeCreateGroupDialog();
      toast.success('Strategy group created');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to create strategy group');
    } finally {
      setIsSubmitting(false);
    }
  };

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
        prev.map((strategy) => (strategy.id === target.id ? { ...strategy, ...data.strategy } : strategy)),
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

  const handleSetPrimaryScenario = async () => {
    if (!activeStrategy) return;
    if (activeStrategy.isPrimary) return;

    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: activeStrategy.id,
          isPrimary: true,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        strategy?: Strategy;
        error?: string;
      } | null;

      if (!response.ok || !data?.strategy) {
        throw new Error(data?.error ?? 'Failed to set primary scenario');
      }

      setStrategies((prev) =>
        prev.map((item) => {
          if (item.strategyGroupId !== activeStrategy.strategyGroupId) return item;
          if (item.id === activeStrategy.id) {
            return { ...item, ...data.strategy, isPrimary: true };
          }
          return { ...item, isPrimary: false };
        }),
      );

      toast.success(`"${activeStrategy.name}" is now the primary scenario`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to set primary scenario');
    }
  };

  const requestDelete = () => {
    if (!activeStrategy) return;
    setPendingDelete(activeStrategy);
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

  /* ------------------------------------------------------------------ */
  /*  Styling constants                                                  */
  /* ------------------------------------------------------------------ */

  const primaryActionClass =
    'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10';

  const selectClass =
    'h-8 rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  const scenarioDialogTitle = scenarioDialogMode === 'edit' ? 'Edit scenario' : 'New scenario';

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  const hasRegions = (region: 'US' | 'UK') => groups.some((g) => g.region === region);

  return (
    <>
      <div className="border-b bg-muted/40 px-4 py-3">
        {/* Breadcrumb navigation bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Region toggle */}
          <div className="inline-flex overflow-hidden rounded-md border border-input shadow-sm">
            <button
              type="button"
              disabled={!hasRegions('US')}
              onClick={() => handleRegionSwitch('US')}
              className={cn(
                'px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors',
                activeRegion === 'US'
                  ? 'bg-cyan-600 text-white dark:bg-[#00C2B9] dark:text-[#002430]'
                  : 'bg-background text-muted-foreground hover:bg-muted',
                !hasRegions('US') && 'cursor-not-allowed opacity-40',
              )}
            >
              US
            </button>
            <button
              type="button"
              disabled={!hasRegions('UK')}
              onClick={() => handleRegionSwitch('UK')}
              className={cn(
                'px-3 py-1 text-xs font-semibold uppercase tracking-wide transition-colors',
                activeRegion === 'UK'
                  ? 'bg-cyan-600 text-white dark:bg-[#00C2B9] dark:text-[#002430]'
                  : 'bg-background text-muted-foreground hover:bg-muted',
                !hasRegions('UK') && 'cursor-not-allowed opacity-40',
              )}
            >
              UK
            </button>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground" />

          {/* Group dropdown */}
          {activeGroup ? (
            <select
              value={activeGroup.id}
              onChange={(event) => handleGroupChange(event.target.value)}
              className={selectClass}
            >
              {regionGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} [{group.code}]
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-muted-foreground">No groups</span>
          )}

          <ChevronRight className="h-4 w-4 text-muted-foreground" />

          {/* Scenario dropdown */}
          {activeGroup ? (
            <select
              value={selectedStrategyId ?? ''}
              onChange={(event) => handleScenarioChange(event.target.value)}
              className={selectClass}
            >
              {activeGroup.strategies.map((strategy) => (
                <option key={strategy.id} value={strategy.id}>
                  {strategy.name}
                  {strategy.isPrimary ? ' \u2605' : ''}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm text-muted-foreground">No scenarios</span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button type="button" onClick={openCreateGroupDialog} className={primaryActionClass}>
              <span className="inline-flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" />
                New Group
              </span>
            </button>

            <button
              type="button"
              onClick={openCreateScenarioDialog}
              disabled={!activeGroup}
              className={primaryActionClass}
            >
              <span className="inline-flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" />
                Add Scenario
              </span>
            </button>

            {activeStrategy && !activeStrategy.isPrimary ? (
              <button
                type="button"
                onClick={() => void handleSetPrimaryScenario()}
                className="rounded-md p-2 text-muted-foreground transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                title="Set as primary"
              >
                <Star className="h-4 w-4" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={openEditScenarioDialog}
              disabled={!activeStrategy}
              className="rounded-md p-2 text-muted-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              title="Edit scenario"
            >
              <Pencil className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={requestDelete}
              disabled={!activeStrategy}
              className="rounded-md p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
              title="Delete scenario"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Metadata line */}
        {activeStrategy ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {getAssigneeShortLabels(activeStrategy)} &middot; {activeStrategy._count.products} products
            &middot; {activeStrategy._count.purchaseOrders} orders &middot; Edited{' '}
            {renderLastEditedLabel(activeStrategy)}
          </p>
        ) : null}
      </div>

      {/* ---------------------------------------------------------------- */}
      {/*  Create group dialog                                              */}
      {/* ---------------------------------------------------------------- */}
      <Dialog open={isGroupDialogOpen} onOpenChange={(open) => !open && closeCreateGroupDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New strategy group</DialogTitle>
            <DialogDescription>
              Create a region-scoped group with its initial primary scenario.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Group name</label>
              <Input
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="e.g., PDS"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Group code</label>
              <Input
                value={groupCode}
                onChange={(event) => setGroupCode(event.target.value)}
                placeholder="e.g., PDS"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Region</label>
              <select
                value={groupRegion}
                onChange={(event) => setGroupRegion(event.target.value === 'UK' ? 'UK' : 'US')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="US">US</option>
                <option value="UK">UK</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Primary scenario name</label>
              <Input
                value={groupScenarioName}
                onChange={(event) => setGroupScenarioName(event.target.value)}
                placeholder="e.g., Base case"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={groupScenarioDescription}
                onChange={(event) => setGroupScenarioDescription(event.target.value)}
                placeholder="Optional"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assignees</label>
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {directoryConfigured ? 'Loading assignees...' : 'Directory unavailable'}
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background">
                  {assignees.map((assignee) => {
                    const checked = groupAssigneeIds.includes(assignee.id);
                    return (
                      <button
                        key={assignee.id}
                        type="button"
                        onClick={() => toggleGroupAssignee(assignee.id)}
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

          <DialogFooter>
            <Button variant="outline" onClick={closeCreateGroupDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateGroup()} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Create group'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

          <DialogFooter>
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
