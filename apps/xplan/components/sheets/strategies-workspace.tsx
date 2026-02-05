'use client';

import { useMemo, useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Plus, Check, Pencil, Trash2 } from 'lucide-react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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

interface StrategiesWorkspaceProps {
  strategies: Strategy[];
  activeStrategyId?: string | null;
  viewer: {
    id: string | null;
    email: string | null;
    isSuperAdmin: boolean;
  };
}

export function StrategiesWorkspace({
  strategies: initialStrategies,
  activeStrategyId,
  viewer,
}: StrategiesWorkspaceProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [strategies, setStrategies] = useState<Strategy[]>(initialStrategies);

  const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
  const [dialogStrategyId, setDialogStrategyId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formRegion, setFormRegion] = useState<'US' | 'UK'>('US');
  const [formAssigneeIds, setFormAssigneeIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingSwitch, setPendingSwitch] = useState<{ id: string; name: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Strategy | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [directoryConfigured, setDirectoryConfigured] = useState(true);

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
          const message = data?.error || 'Failed to load assignees';
          throw new Error(message);
        }

        if (cancelled) return;
        setAssignees(Array.isArray(data?.assignees) ? data!.assignees : []);
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

  const renderLastEditedLabel = (strategy: Strategy) => {
    return formatDateDisplay(strategy.updatedAt, lastEditedFormatter, '—');
  };

  /* ---- Dialog helpers ---- */

  const openCreateDialog = () => {
    setDialogMode('create');
    setDialogStrategyId(null);
    setFormName('');
    setFormDescription('');
    setFormRegion('US');
    setFormAssigneeIds(viewer.id ? [viewer.id] : []);
  };

  const openEditDialog = (strategy: Strategy) => {
    setDialogMode('edit');
    setDialogStrategyId(strategy.id);
    setFormName(strategy.name);
    setFormDescription(strategy.description ?? '');
    setFormRegion(strategy.region ?? 'US');
    setFormAssigneeIds(strategyAssigneeIds(strategy));
  };

  const closeDialog = () => {
    setDialogMode(null);
    setDialogStrategyId(null);
  };

  const toggleAssignee = (id: string) => {
    setFormAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  /* ---- Create / Update ---- */

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error('Enter a strategy name');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formName,
          description: formDescription,
          region: formRegion,
          assigneeIds: formAssigneeIds,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = (data as any)?.error || 'Failed to create strategy';
        throw new Error(message);
      }
      setStrategies((prev) => [
        ...prev,
        {
          ...(data as any).strategy,
          _count: { products: 0, purchaseOrders: 0, salesWeeks: 0 },
        },
      ]);
      closeDialog();
      toast.success('Strategy created');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to create strategy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!dialogStrategyId) return;
    const id = dialogStrategyId;
    const strategy = strategies.find((s) => s.id === id);

    if (!formName.trim()) {
      toast.error('Enter a strategy name');
      return;
    }

    setIsSubmitting(true);
    try {
      const canAssign = Boolean(canAssignByStrategyId.get(id));
      const currentAssigneeIds = strategy ? strategyAssigneeIds(strategy) : [];
      const assigneeChanged = !hasSameAssignees(formAssigneeIds, currentAssigneeIds);

      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: formName,
          description: formDescription,
          region: formRegion,
          ...(canAssign && assigneeChanged ? { assigneeIds: formAssigneeIds } : {}),
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const message = (data as any)?.error || 'Failed to update strategy';
        throw new Error(message);
      }
      setStrategies((prev) =>
        prev.map((s) => (s.id === id ? { ...s, ...(data as any).strategy } : s)),
      );
      closeDialog();
      toast.success('Strategy updated');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to update strategy');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = () => {
    if (dialogMode === 'create') void handleCreate();
    if (dialogMode === 'edit') void handleUpdate();
  };

  /* ---- Other actions ---- */

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
        throw new Error('Failed to delete strategy');
      }

      setStrategies((prev) => prev.filter((s) => s.id !== id));
      setPendingDelete(null);
      toast.success('Strategy deleted');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete strategy');
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

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h2 className="text-xs font-bold uppercase tracking-[0.28em] text-cyan-700 dark:text-cyan-300/80">
            Planning Strategies
          </h2>
          <p className="text-sm text-muted-foreground">
            Click a row to switch strategies. Each strategy has its own products, orders, and
            forecasts.
          </p>
        </div>
        <button type="button" onClick={openCreateDialog} className={primaryActionClass}>
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-4 w-4" />
            New strategy
          </span>
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10">
        <div className="max-h-[min(440px,calc(100vh-320px))] overflow-auto">
          <Table className="table-fixed border-collapse">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky top-0 z-10 h-10 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Strategy
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 w-24 border-b border-r bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Region
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 w-56 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Assignee
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 w-44 border-b border-r bg-muted px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Last edited
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 w-24 border-b border-r bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Products
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 w-24 border-b border-r bg-muted px-3 py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Orders
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 w-28 border-b border-r bg-muted px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {strategies.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    No strategies yet. Create your first planning strategy to get started.
                  </TableCell>
                </TableRow>
              ) : (
                strategies.map((strategy) => {
                  const isActive = selectedStrategyId === strategy.id;

                  return (
                    <TableRow
                      key={strategy.id}
                      onClick={() => handleSelectStrategy(strategy.id, strategy.name)}
                      className={cn(
                        'cursor-pointer',
                        isActive
                          ? 'border-l-4 border-l-cyan-500 bg-cyan-50/70 hover:bg-cyan-50/70 dark:border-l-[#00C2B9] dark:bg-cyan-900/20 dark:hover:bg-cyan-900/20'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <TableCell className="border-r px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'text-sm font-medium',
                                  isActive
                                    ? 'text-cyan-900 dark:text-cyan-100'
                                    : 'text-foreground',
                                )}
                              >
                                {strategy.name}
                              </span>
                              {isActive ? (
                                <Badge className="ring-2 ring-cyan-300/40 dark:ring-[#00C2B9]/30 px-2.5 py-0.5 text-xs font-bold shadow-sm bg-cyan-600 text-white hover:bg-cyan-600 dark:bg-[#00C2B9] dark:text-slate-900 dark:hover:bg-[#00C2B9]">
                                  Active
                                </Badge>
                              ) : null}
                            </div>
                            {strategy.description ? (
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                {strategy.description}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="border-r px-3 py-2 text-center">
                        <Badge variant="secondary" className="uppercase">
                          {strategy.region}
                        </Badge>
                      </TableCell>
                      <TableCell className="border-r px-3 py-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm text-foreground">
                            {renderAssigneeLabel(strategy)}
                          </span>
                          {!Boolean(canAssignByStrategyId.get(strategy.id)) && strategy.createdByEmail ? (
                            <span className="text-xs text-muted-foreground">
                              Creator: {strategy.createdByEmail}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="border-r px-3 py-2 text-right">
                        <span
                          className={cn(
                            'text-xs tabular-nums',
                            isActive
                              ? 'font-semibold text-cyan-700 dark:text-cyan-300'
                              : 'text-muted-foreground',
                          )}
                        >
                          {renderLastEditedLabel(strategy)}
                        </span>
                      </TableCell>
                      <TableCell className="border-r px-3 py-2 text-center">
                        <span
                          className={cn(
                            'text-sm tabular-nums',
                            isActive
                              ? 'font-semibold text-cyan-700 dark:text-cyan-300'
                              : 'text-muted-foreground',
                          )}
                        >
                          {strategy._count.products}
                        </span>
                      </TableCell>
                      <TableCell className="border-r px-3 py-2 text-center">
                        <span
                          className={cn(
                            'text-sm tabular-nums',
                            isActive
                              ? 'font-semibold text-cyan-700 dark:text-cyan-300'
                              : 'text-muted-foreground',
                          )}
                        >
                          {strategy._count.purchaseOrders}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditDialog(strategy)}
                            className="rounded-md p-2 text-muted-foreground transition hover:bg-muted"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDelete(strategy.id)}
                            className="rounded-md p-2 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Create / Edit Strategy Dialog */}
      <Dialog open={dialogMode != null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'edit' ? 'Edit Strategy' : 'New Strategy'}
            </DialogTitle>
            <DialogDescription>
              {dialogMode === 'edit'
                ? 'Update strategy details.'
                : 'Create a new planning strategy.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Strategy name (e.g., Q4 2025 Planning)"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Description</label>
              <Input
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Optional"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSubmit();
                }}
              />
            </div>

            {/* Region */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Region</label>
              <select
                value={formRegion}
                onChange={(e) => setFormRegion(e.target.value === 'UK' ? 'UK' : 'US')}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="US">US</option>
                <option value="UK">UK</option>
              </select>
            </div>

            {/* Assignees — checkbox list */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Assignees</label>
              {assignees.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {directoryConfigured ? 'Loading assignees...' : 'Directory unavailable'}
                </p>
              ) : (
                <div className="max-h-40 overflow-y-auto rounded-md border border-input bg-background">
                  {assignees.map((assignee) => {
                    const checked = formAssigneeIds.includes(assignee.id);
                    return (
                      <button
                        key={assignee.id}
                        type="button"
                        onClick={() => toggleAssignee(assignee.id)}
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
                          <span className="truncate text-muted-foreground">
                            ({assignee.fullName})
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting
                ? dialogMode === 'edit'
                  ? 'Saving...'
                  : 'Creating...'
                : dialogMode === 'edit'
                  ? 'Save'
                  : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Switch strategy confirmation */}
      <AlertDialog
        open={pendingSwitch != null}
        onOpenChange={(open) => {
          if (!open) setPendingSwitch(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch strategy?</AlertDialogTitle>
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

      {/* Delete strategy confirmation */}
      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete strategy?</AlertDialogTitle>
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
