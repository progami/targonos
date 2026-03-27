'use client';

import { useEffect, useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
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

/* ------------------------------------------------------------------ */
/*  Scenario Create/Edit Dialog                                        */
/* ------------------------------------------------------------------ */

export type ScenarioDialogState = {
  mode: 'create' | 'edit';
  groupId: string;
  strategyId: string | null;
  name: string;
  description: string;
  assigneeIds: string[];
  isPrimary: boolean;
} | null;

interface ScenarioDialogProps {
  state: ScenarioDialogState;
  onClose: () => void;
  onSubmit: (data: {
    mode: 'create' | 'edit';
    groupId: string;
    strategyId: string | null;
    name: string;
    description: string;
    assigneeIds: string[];
    isPrimary: boolean;
  }) => Promise<void>;
  onRequestDelete: (strategyId: string) => void;
  assignees: Assignee[];
  directoryConfigured: boolean;
  isSubmitting: boolean;
}

export function ScenarioDialog({
  state,
  onClose,
  onSubmit,
  onRequestDelete,
  assignees,
  directoryConfigured,
  isSubmitting,
}: ScenarioDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [isPrimary, setIsPrimary] = useState(false);

  // Sync local state when dialog opens or target changes
  const dialogKey = state ? `${state.mode}-${state.strategyId}-${state.groupId}` : null;
  useEffect(() => {
    if (!state) return;
    setName(state.name);
    setDescription(state.description);
    setAssigneeIds(state.assigneeIds);
    setIsPrimary(state.isPrimary);
  }, [dialogKey]); // eslint-disable-line react-hooks/exhaustive-deps -- sync on open/target change only

  const toggleAssignee = (id: string) => {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((current) => current !== id) : [...prev, id],
    );
  };

  const handleSubmit = () => {
    if (!state) return;
    void onSubmit({
      mode: state.mode,
      groupId: state.groupId,
      strategyId: state.strategyId,
      name,
      description,
      assigneeIds,
      isPrimary,
    });
  };

  const title = state?.mode === 'edit' ? 'Edit scenario' : 'New scenario';

  return (
    <Dialog open={state != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {state?.mode === 'edit'
              ? 'Update scenario details.'
              : 'Create a new what-if scenario in this group.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Scenario name</label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Scenario name"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Optional"
            />
          </div>

          {state?.mode === 'create' ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Make primary</label>
              <button
                type="button"
                onClick={() => setIsPrimary((prev) => !prev)}
                className={cn(
                  'flex h-9 w-full items-center rounded-md border px-3 text-sm transition-colors',
                  isPrimary
                    ? 'border-cyan-500 bg-cyan-50 text-cyan-800 dark:border-[#00C2B9] dark:bg-cyan-900/20 dark:text-cyan-200'
                    : 'border-input bg-background text-muted-foreground',
                )}
              >
                {isPrimary ? 'Primary on create' : 'Create as what-if'}
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
                  const checked = assigneeIds.includes(assignee.id);
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
          {state?.mode === 'edit' && state.strategyId ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={isSubmitting}
              onClick={() => {
                onClose();
                onRequestDelete(state.strategyId!);
              }}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              Delete
            </Button>
          ) : (
            <div />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting
                ? state?.mode === 'edit'
                  ? 'Saving...'
                  : 'Creating...'
                : state?.mode === 'edit'
                  ? 'Save'
                  : 'Create'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Switch Confirmation Dialog                                         */
/* ------------------------------------------------------------------ */

interface SwitchDialogProps {
  pending: { id: string; name: string } | null;
  currentName: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SwitchDialog({ pending, currentName, onConfirm, onCancel }: SwitchDialogProps) {
  return (
    <AlertDialog open={pending != null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Switch scenario?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? currentName
                ? `Switch from "${currentName}" to "${pending.name}"? Your data is saved automatically.`
                : `Switch to "${pending.name}"? Your data is saved automatically.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Switch</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Delete Confirmation Dialog                                         */
/* ------------------------------------------------------------------ */

interface DeleteDialogProps {
  pending: Strategy | null;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting: boolean;
}

export function DeleteDialog({ pending, onConfirm, onCancel, isDeleting }: DeleteDialogProps) {
  return (
    <AlertDialog open={pending != null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete scenario?</AlertDialogTitle>
          <AlertDialogDescription>
            {pending
              ? `This will permanently delete "${pending.name}" and all its data (${pending._count.products} products, ${pending._count.purchaseOrders} purchase orders, ${pending._count.salesWeeks} sales weeks). This cannot be undone.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isDeleting}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
            className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
