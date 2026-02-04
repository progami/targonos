'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Check, X, Pencil, Trash2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { withAppBasePath } from '@/lib/base-path';
import { isProtectedStrategyId } from '@/lib/protected-strategies';
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
  const [isAdding, setIsAdding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newRegion, setNewRegion] = useState<'US' | 'UK'>('US');
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRegion, setEditRegion] = useState<'US' | 'UK'>('US');
  const [editAssigneeId, setEditAssigneeId] = useState<string>('');
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

  useEffect(() => {
    if (!isAdding) return;
    if (!newAssigneeId && viewer.id) {
      setNewAssigneeId(viewer.id);
    }
  }, [isAdding, newAssigneeId, viewer.id]);

  const renderAssigneeLabel = (strategy: Strategy) => {
    if (strategy.assigneeEmail) return strategy.assigneeEmail;
    return 'Unassigned';
  };

  const renderLastEditedLabel = (strategy: Strategy) => {
    return formatDateDisplay(strategy.updatedAt, lastEditedFormatter, '—');
  };

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('Enter a strategy name');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          description: newDescription,
          region: newRegion,
          ...(newAssigneeId ? { assigneeId: newAssigneeId } : {}),
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
      setNewName('');
      setNewDescription('');
      setNewRegion('US');
      setNewAssigneeId(viewer.id ?? '');
      setIsAdding(false);
      toast.success('Strategy created');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to create strategy');
    } finally {
      setIsCreating(false);
    }
  };

  const handleUpdate = async (id: string) => {
    const strategy = strategies.find((s) => s.id === id);

    if (!editName.trim()) {
      toast.error('Enter a strategy name');
      return;
    }

    try {
      const canAssign = Boolean(canAssignByStrategyId.get(id));
      const currentAssigneeId = strategy?.assigneeId ?? '';
      const assigneeChanged = editAssigneeId !== currentAssigneeId && editAssigneeId !== '';

      const response = await fetch(withAppBasePath('/api/v1/xplan/strategies'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          name: editName,
          description: editDescription,
          region: editRegion,
          ...(canAssign && assigneeChanged ? { assigneeId: editAssigneeId } : {}),
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
      setEditingId(null);
      toast.success('Strategy updated');
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : 'Failed to update strategy');
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

  const startEdit = (strategy: Strategy) => {
    setEditingId(strategy.id);
    setEditName(strategy.name);
    setEditDescription(strategy.description ?? '');
    setEditRegion(strategy.region ?? 'US');
    setEditAssigneeId(strategy.assigneeId ?? '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditDescription('');
    setEditRegion('US');
    setEditAssigneeId('');
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
        {!isAdding ? (
          <button type="button" onClick={() => setIsAdding(true)} className={primaryActionClass}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              New strategy
            </span>
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10">
        <div className="max-h-[440px] overflow-auto">
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
              {isAdding ? (
                <TableRow className="bg-cyan-50/70 hover:bg-cyan-50/70 dark:bg-cyan-900/20 dark:hover:bg-cyan-900/20">
                  <TableCell className="border-r px-3 py-2 align-top">
                    <div className="space-y-2">
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Strategy name (e.g., Q4 2025 Planning)"
                        autoFocus
                        className="h-8"
                      />
                      <Input
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Description (optional)"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void handleCreate();
                          if (e.key === 'Escape') setIsAdding(false);
                        }}
                        className="h-8"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="border-r px-3 py-2 align-top">
                    <select
                      value={newRegion}
                      onChange={(e) => setNewRegion(e.target.value === 'UK' ? 'UK' : 'US')}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="US">US</option>
                      <option value="UK">UK</option>
                    </select>
                  </TableCell>
                  <TableCell className="border-r px-3 py-2 align-top">
                    <select
                      value={newAssigneeId}
                      onChange={(e) => setNewAssigneeId(e.target.value)}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      disabled={assignees.length === 0}
                    >
                      <option value="" disabled>
                        {assignees.length === 0
                          ? directoryConfigured
                            ? 'Loading assignees...'
                            : 'Directory unavailable'
                          : directoryConfigured
                            ? 'Select assignee'
                            : 'Directory unavailable (limited list)'}
                      </option>
                      {assignees.map((assignee) => (
                        <option key={assignee.id} value={assignee.id}>
                          {assignee.email}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell className="border-r px-3 py-2 text-right text-xs text-muted-foreground">
                    —
                  </TableCell>
                  <TableCell className="border-r px-3 py-2 text-center text-sm text-muted-foreground">
                    -
                  </TableCell>
                  <TableCell className="border-r px-3 py-2 text-center text-sm text-muted-foreground">
                    -
                  </TableCell>
                  <TableCell className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void handleCreate()}
                        disabled={isCreating}
                        className="rounded p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-200 dark:hover:bg-emerald-900/20"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsAdding(false)}
                        disabled={isCreating}
                        className="rounded p-1.5 text-muted-foreground transition hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : null}

              {strategies.length === 0 && !isAdding ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                    No strategies yet. Create your first planning strategy to get started.
                  </TableCell>
                </TableRow>
              ) : (
                strategies.map((strategy) => {
                  const isActive = selectedStrategyId === strategy.id;
                  const isEditing = editingId === strategy.id;
                  const canAssign = Boolean(canAssignByStrategyId.get(strategy.id));

                  return (
                    <TableRow
                      key={strategy.id}
                      onClick={() => !isEditing && handleSelectStrategy(strategy.id, strategy.name)}
                      className={cn(
                        'cursor-pointer',
                        isActive
                          ? 'border-l-4 border-l-cyan-500 bg-cyan-50/70 hover:bg-cyan-50/70 dark:border-l-[#00C2B9] dark:bg-cyan-900/20 dark:hover:bg-cyan-900/20'
                          : 'hover:bg-muted/50',
                      )}
                    >
                      <TableCell className="border-r px-3 py-2">
                        {isEditing ? (
                          <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="h-8"
                            />
                            <Input
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              placeholder="Description"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleUpdate(strategy.id);
                                if (e.key === 'Escape') cancelEdit();
                              }}
                              className="h-8"
                            />
                          </div>
                        ) : (
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
                                  <Badge className="bg-cyan-600 text-white hover:bg-cyan-600 dark:bg-[#00C2B9] dark:text-slate-900 dark:hover:bg-[#00C2B9]">
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
                        )}
                      </TableCell>
                      <TableCell className="border-r px-3 py-2 text-center">
                        {isEditing ? (
                          <select
                            value={editRegion}
                            onChange={(e) => setEditRegion(e.target.value === 'UK' ? 'UK' : 'US')}
                            onClick={(e) => e.stopPropagation()}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          >
                            <option value="US">US</option>
                            <option value="UK">UK</option>
                          </select>
                        ) : (
                          <Badge variant="secondary" className="uppercase">
                            {strategy.region}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className="border-r px-3 py-2"
                        onClick={(event) => {
                          if (isEditing || canAssign) {
                            event.stopPropagation();
                            if (!isEditing) startEdit(strategy);
                          }
                        }}
                      >
                        {isEditing ? (
                          <select
                            value={editAssigneeId}
                            onChange={(e) => setEditAssigneeId(e.target.value)}
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            disabled={!canAssign || assignees.length === 0}
                          >
                            <option value="" disabled>
                              {assignees.length === 0
                                ? directoryConfigured
                                  ? 'Loading assignees...'
                                  : 'Directory unavailable'
                                : directoryConfigured
                                  ? 'Select assignee'
                                  : 'Directory unavailable (limited list)'}
                            </option>
                            {assignees.map((assignee) => (
                              <option key={assignee.id} value={assignee.id}>
                                {assignee.email}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-foreground">
                              {renderAssigneeLabel(strategy)}
                            </span>
                            {!canAssign && strategy.createdByEmail ? (
                              <span className="text-xs text-muted-foreground">
                                Creator: {strategy.createdByEmail}
                              </span>
                            ) : null}
                          </div>
                        )}
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
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                              <button
                                type="button"
                                onClick={() => void handleUpdate(strategy.id)}
                                className="rounded p-1.5 text-emerald-600 transition hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-900/20"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded p-1.5 text-muted-foreground transition hover:bg-muted"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(strategy)}
                                className="rounded p-1.5 text-muted-foreground transition hover:bg-muted"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {isProtectedStrategyId(strategy.id) ? null : (
                                <button
                                  type="button"
                                  onClick={() => requestDelete(strategy.id)}
                                  className="rounded p-1.5 text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              )}
                            </>
                          )}
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
