'use client';

import { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Check, Pencil, Trash2, Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import { formatDateDisplay } from '@/lib/utils/dates';
import { Badge } from '@/components/ui/badge';
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

interface StrategiesWorkspaceProps {
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

export function StrategiesWorkspace({
  strategies: initialStrategies,
  activeStrategyId,
  viewer,
}: StrategiesWorkspaceProps) {
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

  const renderAssigneeLabel = (strategy: Strategy) => {
    const assigneeEmails =
      Array.isArray(strategy.strategyAssignees) && strategy.strategyAssignees.length > 0
        ? strategy.strategyAssignees.map((entry) => entry.assigneeEmail)
        : strategy.assigneeEmail
          ? [strategy.assigneeEmail]
          : [];

    if (assigneeEmails.length > 0) return assigneeEmails.join(', ');
    return 'Unassigned';
  };

  const renderLastEditedLabel = (strategy: Strategy) =>
    formatDateDisplay(strategy.updatedAt, lastEditedFormatter, '—');

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

  const openCreateGroupDialog = () => {
    setIsGroupDialogOpen(true);
    setGroupName('');
    setGroupCode('');
    setGroupRegion('US');
    setGroupScenarioName('Base case');
    setGroupScenarioDescription('');
    setGroupAssigneeIds(viewer.id ? [viewer.id] : []);
  };

  const closeCreateGroupDialog = () => {
    setIsGroupDialogOpen(false);
  };

  const openCreateScenarioDialog = (groupId: string) => {
    setScenarioDialogMode('create');
    setScenarioGroupId(groupId);
    setScenarioStrategyId(null);
    setScenarioName('');
    setScenarioDescription('');
    setScenarioAssigneeIds(viewer.id ? [viewer.id] : []);
    setScenarioPrimary(false);
  };

  const openEditScenarioDialog = (strategy: Strategy) => {
    setScenarioDialogMode('edit');
    setScenarioGroupId(strategy.strategyGroupId);
    setScenarioStrategyId(strategy.id);
    setScenarioName(strategy.name);
    setScenarioDescription(strategy.description ?? '');
    setScenarioAssigneeIds(strategyAssigneeIds(strategy));
    setScenarioPrimary(strategy.isPrimary);
  };

  const closeScenarioDialog = () => {
    setScenarioDialogMode(null);
    setScenarioGroupId(null);
    setScenarioStrategyId(null);
  };

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

  const handleSetPrimaryScenario = async (strategy: Strategy) => {
    if (strategy.isPrimary) return;

    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: strategy.id,
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
          if (item.strategyGroupId !== strategy.strategyGroupId) return item;
          if (item.id === strategy.id) {
            return { ...item, ...data.strategy, isPrimary: true };
          }
          return { ...item, isPrimary: false };
        }),
      );

      toast.success(`"${strategy.name}" is now the primary scenario`);
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to set primary scenario');
    }
  };

  const requestDelete = (id: string) => {
    const strategy = strategies.find((item) => item.id === id);
    if (!strategy) return;
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

  const primaryActionClass =
    'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10';

  const scenarioDialogTitle = scenarioDialogMode === 'edit' ? 'Edit scenario' : 'New scenario';

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
            Strategy Groups
          </h2>
          <p className="text-sm text-muted-foreground">
            Each group has one primary scenario and optional what-if scenarios.
          </p>
        </div>
        <button type="button" onClick={openCreateGroupDialog} className={primaryActionClass}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            New group
          </span>
        </button>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm dark:border-white/10">
          No strategy groups yet. Create your first group to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <article
              key={group.id}
              className="overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-sm font-semibold text-foreground">{group.name}</span>
                  <Badge variant="secondary" className="uppercase">
                    {group.region}
                  </Badge>
                  <Badge variant="outline" className="font-mono">
                    {group.code}
                  </Badge>
                </div>
                <button
                  type="button"
                  onClick={() => openCreateScenarioDialog(group.id)}
                  className={primaryActionClass}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add scenario
                  </span>
                </button>
              </header>

              <div className="divide-y">
                {group.strategies.map((strategy) => {
                  const isActive = selectedStrategyId === strategy.id;
                  return (
                    <div
                      key={strategy.id}
                      className={cn(
                        'flex cursor-pointer flex-wrap items-start justify-between gap-3 px-4 py-3 transition',
                        isActive
                          ? 'bg-cyan-50/70 dark:bg-cyan-900/20'
                          : 'hover:bg-muted/40 dark:hover:bg-white/5',
                      )}
                      onClick={() => handleSelectStrategy(strategy.id, strategy.name)}
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{strategy.name}</span>
                          {strategy.isPrimary ? (
                            <Badge className="bg-amber-500 text-white hover:bg-amber-500 dark:bg-amber-400 dark:text-slate-900 dark:hover:bg-amber-400">
                              Primary
                            </Badge>
                          ) : null}
                          {isActive ? (
                            <Badge className="bg-cyan-600 text-white hover:bg-cyan-600 dark:bg-[#00C2B9] dark:text-slate-900 dark:hover:bg-[#00C2B9]">
                              Active
                            </Badge>
                          ) : null}
                        </div>
                        {strategy.description ? (
                          <p className="text-xs text-muted-foreground">{strategy.description}</p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          {renderAssigneeLabel(strategy)} · {strategy._count.products} products ·{' '}
                          {strategy._count.purchaseOrders} orders · Edited{' '}
                          {renderLastEditedLabel(strategy)}
                        </p>
                      </div>

                      <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                        {!strategy.isPrimary ? (
                          <button
                            type="button"
                            onClick={() => void handleSetPrimaryScenario(strategy)}
                            className="rounded-md p-2 text-muted-foreground transition hover:bg-amber-50 hover:text-amber-600 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
                            title="Set as primary"
                          >
                            <Star className="h-4 w-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openEditScenarioDialog(strategy)}
                          className="rounded-md p-2 text-muted-foreground transition hover:bg-muted"
                          title="Edit scenario"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => requestDelete(strategy.id)}
                          className="rounded-md p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                          title="Delete scenario"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      )}

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
    </section>
  );
}
