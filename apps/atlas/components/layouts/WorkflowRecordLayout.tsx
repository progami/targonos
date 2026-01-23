'use client';

import { useMemo, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/ui/BackButton';
import { WorkflowTimeline } from '@/components/workflow/WorkflowTimeline';
import {
  ActionInputModal,
  actionNeedsInput,
  type ActionInput,
} from '@/components/workflow/ActionInputModal';
import type { ActionId } from '@/lib/contracts/action-ids';
import type { WorkflowRecordDTO, WorkflowTone } from '@/lib/contracts/workflow-record';
import type { WorkflowActionVariant } from '@/lib/contracts/workflow-record';

type WorkflowRecordLayoutProps = {
  backHref?: string;
  data: WorkflowRecordDTO;
  onAction?: (actionId: ActionId, input?: ActionInput) => void | Promise<void>;
  headerActions?: React.ReactNode;
  children?: React.ReactNode;
};

function toDisplayText(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function toneToBadgeVariant(
  tone: WorkflowTone,
): 'default' | 'info' | 'success' | 'warning' | 'error' {
  switch (tone) {
    case 'success':
      return 'success';
    case 'warning':
      return 'warning';
    case 'danger':
      return 'error';
    case 'info':
      return 'info';
    case 'neutral':
    default:
      return 'default';
  }
}

function actionVariantToButtonVariant(
  variant: WorkflowActionVariant,
): 'primary' | 'secondary' | 'ghost' | 'danger' {
  switch (variant) {
    case 'danger':
      return 'danger';
    case 'secondary':
      return 'secondary';
    case 'ghost':
      return 'ghost';
    case 'primary':
    default:
      return 'primary';
  }
}

export function WorkflowRecordLayout({
  backHref,
  data,
  onAction,
  headerActions,
  children,
}: WorkflowRecordLayoutProps) {
  const [modalActionId, setModalActionId] = useState<ActionId | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const safeData = (data ?? {}) as Partial<WorkflowRecordDTO>;
  const identity = safeData.identity ?? { title: 'Record', recordId: '', href: '/hub' };
  const subject = safeData.subject ?? { displayName: '—' };
  const workflow = safeData.workflow ?? {
    currentStageId: 'unknown',
    currentStageLabel: 'Unknown',
    stages: [],
  };
  const access = safeData.access ?? { canView: true };
  const actions = safeData.actions ?? { primary: null, secondary: [], more: [] };
  const summary = Array.isArray(safeData.summary) ? safeData.summary : [];
  const timeline = Array.isArray(safeData.timeline) ? safeData.timeline : [];
  const disabledHint = useMemo(() => {
    if (actions.primary?.disabled && actions.primary.disabledReason) return actions.primary.disabledReason;
    const secondaryHint = actions.secondary.find((a) => a.disabled && a.disabledReason)?.disabledReason;
    if (secondaryHint) return secondaryHint;
    const moreHint = actions.more.find((a) => a.disabled && a.disabledReason)?.disabledReason;
    return moreHint ?? null;
  }, [actions.more, actions.primary, actions.secondary]);

  // Handle action click - show modal if input needed, otherwise execute directly
  const handleActionClick = useCallback(
    (actionId: ActionId) => {
      if (actionNeedsInput(actionId)) {
        setModalActionId(actionId);
      } else if (onAction) {
        void onAction(actionId);
      }
    },
    [onAction],
  );

  // Handle modal confirmation
  const handleModalConfirm = useCallback(
    async (actionId: ActionId, input: ActionInput) => {
      if (!onAction) return;
      setActionLoading(true);
      try {
        await onAction(actionId, input);
      } finally {
        setActionLoading(false);
        setModalActionId(null);
      }
    },
    [onAction],
  );

  const headerBadges = useMemo(() => {
    const badges: Array<{ label: string; tone: WorkflowTone }> = [];
    if (workflow.statusBadge?.label) {
      badges.push({
        label: toDisplayText(workflow.statusBadge.label, 'Status'),
        tone: workflow.statusBadge.tone,
      });
    }
    if (workflow.severity?.label) {
      badges.push({
        label: toDisplayText(workflow.severity.label, 'Severity'),
        tone: workflow.severity.tone,
      });
    }
    if (subject.statusChip?.label) {
      badges.push({
        label: toDisplayText(subject.statusChip.label, 'Status'),
        tone: subject.statusChip.tone,
      });
    }

    if (workflow.sla) {
      if (workflow.sla.isOverdue && workflow.sla.overdueLabel) {
        badges.push({
          label: toDisplayText(workflow.sla.overdueLabel, 'Overdue'),
          tone: workflow.sla.tone === 'danger' ? 'danger' : 'warning',
        });
      } else if (workflow.sla.dueAt) {
        const due = new Date(workflow.sla.dueAt).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
        badges.push({ label: `Due ${due}`, tone: 'neutral' });
      }
    }

    return badges.filter((b) => typeof b.label === 'string' && b.label.trim());
  }, [subject.statusChip, workflow.severity, workflow.sla, workflow.statusBadge]);

  if (!access.canView) {
    return (
      <Card padding="lg">
        <h1 className="text-lg font-semibold text-foreground">No access</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {access.noAccessReason ?? "You don't have access to this record."}
        </p>
        <div className="mt-4">
          {backHref ? <BackButton href={backHref} /> : <BackButton />}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-30 bg-card border-b border-border">
        <div className="py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex items-start gap-4">
              {backHref ? (
                <BackButton href={backHref} className="shrink-0" />
              ) : (
                <BackButton className="shrink-0" />
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-foreground truncate">
                  {toDisplayText(identity.title, 'Record')}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">
                  {toDisplayText(subject.displayName, '—')}
                  {subject.employeeId ? ` • ${toDisplayText(subject.employeeId, '')}` : ''}
                  {subject.subtitle ? ` • ${toDisplayText(subject.subtitle, '')}` : ''}
                </p>
                {headerBadges.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {headerBadges.map((b) => (
                      <Badge key={`${b.label}-${b.tone}`} variant={toneToBadgeVariant(b.tone)}>
                        {b.label}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-2">
              <div className="flex flex-wrap items-start justify-end gap-2">
                {headerActions ?? null}
                {actions.primary ? (
                  <Button
                    variant={actionVariantToButtonVariant(actions.primary.variant)}
                    disabled={actions.primary.disabled}
                    title={actions.primary.disabled ? actions.primary.disabledReason : undefined}
                    onClick={() => handleActionClick(actions.primary!.id)}
                  >
                    {actions.primary.label}
                  </Button>
                ) : null}

                {actions.secondary.map((action) => (
                  <Button
                    key={action.id}
                    variant={actionVariantToButtonVariant(action.variant)}
                    disabled={action.disabled}
                    title={action.disabled ? action.disabledReason : undefined}
                    onClick={() => handleActionClick(action.id)}
                  >
                    {action.label}
                  </Button>
                ))}

                {actions.more.length ? (
                  <details className="relative">
                    <summary className="list-none">
                      <Button variant="secondary">More</Button>
                    </summary>
                    <div className="absolute right-0 mt-2 w-56 rounded-lg border border-border bg-card shadow-lg p-2 z-10">
                      {actions.more.map((action) => (
                        <Button
                          key={action.id}
                          variant={action.variant === 'danger' ? 'danger' : 'ghost'}
                          size="sm"
                          className="w-full justify-start"
                          disabled={action.disabled}
                          title={action.disabled ? action.disabledReason : undefined}
                          onClick={() => {
                            if (action.disabled) return;
                            handleActionClick(action.id);
                          }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  </details>
                ) : null}
              </div>

              {disabledHint ? (
                <p className="max-w-[360px] text-xs text-muted-foreground text-right leading-snug">
                  {disabledHint}
                </p>
              ) : null}
            </div>
          </div>

        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card padding="md">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {summary.map((row, idx) => (
                <div key={`${toDisplayText(row.label, 'Field')}-${idx}`}>
                  <p className="text-xs font-medium text-muted-foreground">
                    {toDisplayText(row.label, 'Field')}
                  </p>
                  <p className="text-sm font-medium text-foreground mt-0.5">
                    {toDisplayText(row.value, '—')}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          {children ? children : null}
        </div>

        <div className="space-y-6">
          <Card padding="md">
            <h3 className="text-sm font-semibold text-foreground mb-3">Timeline</h3>
            <WorkflowTimeline items={timeline} />
          </Card>
        </div>
      </div>

      <ActionInputModal
        open={modalActionId !== null}
        actionId={modalActionId}
        onClose={() => setModalActionId(null)}
        onConfirm={handleModalConfirm}
        loading={actionLoading}
      />
    </div>
  );
}
