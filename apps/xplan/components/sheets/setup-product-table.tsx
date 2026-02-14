'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { withAppBasePath } from '@/lib/base-path';
import { ProductSetupAmazonImport } from '@/components/sheets/product-setup-amazon-import';

interface SetupProductTableProps {
  strategyId: string;
  products: Array<{ id: string; sku: string; name: string }>;
  leadStageTemplates: Array<{
    id: string;
    label: string;
    defaultWeeks: number;
    sequence: number;
  }>;
  leadTimeProfiles: Record<
    string,
    {
      productionWeeks: number;
      sourceWeeks: number;
      oceanWeeks: number;
      finalWeeks: number;
    }
  >;
  leadTimeOverrideIds: Array<{
    productId: string;
    stageTemplateId: string;
  }>;
  operationsParameters: Array<{
    id: string;
    label: string;
    value: string;
    type: 'numeric' | 'text';
  }>;
  className?: string;
}

type ProductRow = {
  id: string;
  sku: string;
  name: string;
};

type StageKey = 'productionWeeks' | 'sourceWeeks' | 'oceanWeeks' | 'finalWeeks';

const STAGE_COLUMNS: Array<{ header: string; stageKey: StageKey }> = [
  { header: 'PROD', stageKey: 'productionWeeks' },
  { header: 'SRC', stageKey: 'sourceWeeks' },
  { header: 'OCEAN', stageKey: 'oceanWeeks' },
  { header: 'FINAL', stageKey: 'finalWeeks' },
];

function normalizeProducts(
  products: Array<{ id: string; sku: string; name: string }>,
): ProductRow[] {
  return products
    .map((product) => ({
      id: product.id,
      sku: product.sku ?? '',
      name: product.name ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function labelToStageKey(label: string): StageKey | null {
  const lower = label.toLowerCase();
  if (lower === 'production time' || lower === 'production') return 'productionWeeks';
  if (lower === 'source prep') return 'sourceWeeks';
  if (lower === 'ocean transit' || lower === 'ocean') return 'oceanWeeks';
  if (lower === 'final mile') return 'finalWeeks';
  return null;
}

function formatWeeks(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const fixed = value.toFixed(2);
  return fixed.replace(/0+$/, '').replace(/\.$/, '');
}

function paramLabelToStageKey(label: string): StageKey | null {
  const lower = label.toLowerCase();
  if (lower === 'production stage default (weeks)') return 'productionWeeks';
  if (lower === 'source stage default (weeks)') return 'sourceWeeks';
  if (lower === 'ocean stage default (weeks)') return 'oceanWeeks';
  if (lower === 'final stage default (weeks)') return 'finalWeeks';
  return null;
}

export function SetupProductTable({
  strategyId,
  products,
  leadStageTemplates,
  leadTimeProfiles,
  leadTimeOverrideIds,
  operationsParameters,
  className,
}: SetupProductTableProps) {
  const initialRows = useMemo(() => normalizeProducts(products), [products]);
  const [rows, setRows] = useState<ProductRow[]>(initialRows);
  const [creatingSku, setCreatingSku] = useState('');
  const [creatingName, setCreatingName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraftSku, setEditDraftSku] = useState('');
  const [editDraftName, setEditDraftName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [profiles, setProfiles] = useState(leadTimeProfiles);
  const [overrideKeys, setOverrideKeys] = useState(
    () => new Set(leadTimeOverrideIds.map((o) => `${o.productId}:${o.stageTemplateId}`)),
  );

  const [editingCell, setEditingCell] = useState<{
    productId: string;
    stageKey: StageKey;
  } | null>(null);
  const [cellDraftValue, setCellDraftValue] = useState('');

  useEffect(() => {
    setRows(normalizeProducts(products));
  }, [products]);

  useEffect(() => {
    setProfiles(leadTimeProfiles);
  }, [leadTimeProfiles]);

  useEffect(() => {
    setOverrideKeys(
      new Set(leadTimeOverrideIds.map((o) => `${o.productId}:${o.stageTemplateId}`)),
    );
  }, [leadTimeOverrideIds]);

  const strategyDefaults = useMemo(() => {
    const defaults: Record<StageKey, number> = {
      productionWeeks: 0,
      sourceWeeks: 0,
      oceanWeeks: 0,
      finalWeeks: 0,
    };
    for (const param of operationsParameters) {
      const key = paramLabelToStageKey(param.label);
      if (key) {
        defaults[key] = parseFloat(param.value);
      }
    }
    return defaults;
  }, [operationsParameters]);

  const stageTemplateMap = useMemo(() => {
    const map: Partial<Record<StageKey, string>> = {};
    for (const template of leadStageTemplates) {
      const key = labelToStageKey(template.label);
      if (key) {
        map[key] = template.id;
      }
    }
    return map;
  }, [leadStageTemplates]);

  const resetCreateForm = () => {
    setCreatingSku('');
    setCreatingName('');
  };

  const handleCreateProduct = async () => {
    const sku = creatingSku.trim();
    const name = creatingName.trim();
    if (!sku || !name) {
      toast.error('Enter both a SKU and product name');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/products'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategyId, sku, name }),
      });
      if (!response.ok) throw new Error('Failed to create product');
      const payload = await response.json();
      const created: ProductRow = {
        id: payload.product.id,
        sku: payload.product.sku ?? '',
        name: payload.product.name ?? '',
      };
      setRows((previous) => normalizeProducts([...previous, created]));
      setProfiles((prev) => ({
        ...prev,
        [created.id]: {
          productionWeeks: strategyDefaults.productionWeeks,
          sourceWeeks: strategyDefaults.sourceWeeks,
          oceanWeeks: strategyDefaults.oceanWeeks,
          finalWeeks: strategyDefaults.finalWeeks,
        },
      }));
      resetCreateForm();
      setIsAdding(false);
      toast.success('Product added');
    } catch (error) {
      console.error(error);
      toast.error('Unable to add product');
    } finally {
      setIsCreating(false);
    }
  };

  const handleCancelCreate = () => {
    if (isCreating) return;
    resetCreateForm();
    setIsAdding(false);
  };

  const handleStartEdit = (row: ProductRow) => {
    setEditingId(row.id);
    setEditDraftSku(row.sku);
    setEditDraftName(row.name);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditDraftSku('');
    setEditDraftName('');
    setSavingId(null);
  };

  const handleSaveEdit = async (row: ProductRow) => {
    const nextSku = editDraftSku.trim();
    const nextName = editDraftName.trim();
    if (!nextSku || !nextName) {
      toast.error('Enter both a SKU and product name');
      return;
    }
    if (nextSku === row.sku && nextName === row.name) {
      handleCancelEdit();
      return;
    }

    setSavingId(row.id);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/products'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ id: row.id, values: { sku: nextSku, name: nextName } }],
        }),
      });
      if (!response.ok) throw new Error('Failed to save product');
      setRows((previous) =>
        normalizeProducts(
          previous.map((item) =>
            item.id === row.id ? { ...item, sku: nextSku, name: nextName } : item,
          ),
        ),
      );
      toast.success('Product updated');
      handleCancelEdit();
    } catch (error) {
      console.error(error);
      toast.error('Unable to update product');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (row: ProductRow) => {
    setDeletingId(row.id);
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/products'), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [row.id] }),
      });
      if (!response.ok) throw new Error('Failed to delete product');
      setRows((previous) => previous.filter((item) => item.id !== row.id));
      toast.success('Product removed');
    } catch (error) {
      console.error(error);
      toast.error('Unable to delete product');
    } finally {
      setDeletingId(null);
    }
  };

  const handleStartCellEdit = (productId: string, stageKey: StageKey) => {
    const profile = profiles[productId];
    const currentValue = profile ? profile[stageKey] : strategyDefaults[stageKey];
    setEditingCell({ productId, stageKey });
    setCellDraftValue(formatWeeks(currentValue));
  };

  const handleCancelCellEdit = () => {
    setEditingCell(null);
    setCellDraftValue('');
  };

  const handleSaveCellEdit = async () => {
    if (!editingCell) return;
    const { productId, stageKey } = editingCell;
    const stageTemplateId = stageTemplateMap[stageKey];
    if (!stageTemplateId) {
      handleCancelCellEdit();
      return;
    }

    const trimmed = cellDraftValue.trim();
    const defaultVal = strategyDefaults[stageKey];

    if (trimmed === '') {
      // Clear override: delete and revert to default
      try {
        const response = await fetch(withAppBasePath('/api/v1/xplan/lead-time-overrides'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, stageTemplateId }),
        });
        if (!response.ok) throw new Error('Failed to remove override');
        setProfiles((prev) => ({
          ...prev,
          [productId]: {
            ...(prev[productId] ?? {
              productionWeeks: strategyDefaults.productionWeeks,
              sourceWeeks: strategyDefaults.sourceWeeks,
              oceanWeeks: strategyDefaults.oceanWeeks,
              finalWeeks: strategyDefaults.finalWeeks,
            }),
            [stageKey]: defaultVal,
          },
        }));
        setOverrideKeys((prev) => {
          const next = new Set(prev);
          next.delete(`${productId}:${stageTemplateId}`);
          return next;
        });
        toast.success('Override removed');
      } catch (error) {
        console.error(error);
        toast.error('Unable to remove override');
      }
      handleCancelCellEdit();
      return;
    }

    const parsed = parseFloat(trimmed);
    if (isNaN(parsed)) {
      toast.error('Enter a valid number');
      return;
    }

    if (parsed === defaultVal) {
      // Value matches strategy default: delete the override
      try {
        const response = await fetch(withAppBasePath('/api/v1/xplan/lead-time-overrides'), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, stageTemplateId }),
        });
        if (!response.ok) throw new Error('Failed to remove override');
        setProfiles((prev) => ({
          ...prev,
          [productId]: {
            ...(prev[productId] ?? {
              productionWeeks: strategyDefaults.productionWeeks,
              sourceWeeks: strategyDefaults.sourceWeeks,
              oceanWeeks: strategyDefaults.oceanWeeks,
              finalWeeks: strategyDefaults.finalWeeks,
            }),
            [stageKey]: defaultVal,
          },
        }));
        setOverrideKeys((prev) => {
          const next = new Set(prev);
          next.delete(`${productId}:${stageTemplateId}`);
          return next;
        });
        toast.success('Override removed');
      } catch (error) {
        console.error(error);
        toast.error('Unable to remove override');
      }
      handleCancelCellEdit();
      return;
    }

    // Save override
    try {
      const response = await fetch(withAppBasePath('/api/v1/xplan/lead-time-overrides'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, stageTemplateId, durationWeeks: parsed }),
      });
      if (!response.ok) throw new Error('Failed to save override');
      setProfiles((prev) => ({
        ...prev,
        [productId]: {
          ...(prev[productId] ?? {
            productionWeeks: strategyDefaults.productionWeeks,
            sourceWeeks: strategyDefaults.sourceWeeks,
            oceanWeeks: strategyDefaults.oceanWeeks,
            finalWeeks: strategyDefaults.finalWeeks,
          }),
          [stageKey]: parsed,
        },
      }));
      setOverrideKeys((prev) => {
        const next = new Set(prev);
        next.add(`${productId}:${stageTemplateId}`);
        return next;
      });
      toast.success('Lead time updated');
    } catch (error) {
      console.error(error);
      toast.error('Unable to update lead time');
    }
    handleCancelCellEdit();
  };

  const primaryActionClass =
    'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10';

  const headClass =
    'sticky top-0 z-10 h-10 border-b border-r bg-muted px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80';

  const totalColumns = 7; // SKU + Name + 4 lead time + Actions

  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {!isAdding ? (
          <button type="button" onClick={() => setIsAdding(true)} className={primaryActionClass}>
            <span className="inline-flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Add product
            </span>
          </button>
        ) : null}

        <ProductSetupAmazonImport
          strategyId={strategyId}
          existingSkus={rows.map((row) => row.sku)}
          buttonClassName={primaryActionClass}
        />
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm dark:border-white/10">
        <div className="overflow-auto">
          <Table className="w-full table-fixed border-collapse">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(headClass, 'w-28 text-left')}>SKU</TableHead>
                <TableHead className={cn(headClass, 'text-left')}>Name</TableHead>
                {STAGE_COLUMNS.map((col) => (
                  <TableHead
                    key={col.stageKey}
                    className={cn(headClass, 'w-20 text-right')}
                  >
                    {col.header}
                  </TableHead>
                ))}
                <TableHead className={cn(headClass, 'w-24 text-right')}>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isAdding && (
                <TableRow className="bg-cyan-50/70 hover:bg-cyan-50/70 dark:bg-cyan-900/20 dark:hover:bg-cyan-900/20">
                  <TableCell className="h-8 border-r px-3 py-2">
                    <Input
                      value={creatingSku}
                      onChange={(event) => setCreatingSku(event.target.value)}
                      placeholder="SKU"
                      autoFocus
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell className="h-8 border-r px-3 py-2">
                    <Input
                      value={creatingName}
                      onChange={(event) => setCreatingName(event.target.value)}
                      placeholder="Name"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') void handleCreateProduct();
                        if (event.key === 'Escape') handleCancelCreate();
                      }}
                      className="h-8"
                    />
                  </TableCell>
                  {STAGE_COLUMNS.map((col) => (
                    <TableCell
                      key={col.stageKey}
                      className="h-8 border-r px-3 py-2 text-right tabular-nums text-sm text-muted-foreground"
                    >
                      {formatWeeks(strategyDefaults[col.stageKey])}
                    </TableCell>
                  ))}
                  <TableCell className="h-8 px-3 py-2">
                    <div className="flex justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() => void handleCreateProduct()}
                        disabled={isCreating}
                        className="rounded p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-200 dark:hover:bg-emerald-900/20"
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelCreate}
                        disabled={isCreating}
                        className="rounded p-1.5 text-muted-foreground transition hover:bg-muted"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {rows.length === 0 && !isAdding ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={totalColumns}
                    className="p-8 text-center text-sm text-muted-foreground"
                  >
                    No products yet. Click &ldquo;Add&rdquo; to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isEditing = editingId === row.id;
                  const isSaving = savingId === row.id;
                  const isDeleting = deletingId === row.id;
                  const profile = profiles[row.id];

                  return (
                    <TableRow key={row.id} className="hover:bg-muted/50">
                      <TableCell className="h-8 border-r px-3 py-2">
                        {isEditing ? (
                          <Input
                            value={editDraftSku}
                            onChange={(event) => setEditDraftSku(event.target.value)}
                            className="h-8"
                          />
                        ) : (
                          <span className="text-sm font-medium">{row.sku}</span>
                        )}
                      </TableCell>
                      <TableCell className="h-8 border-r px-3 py-2">
                        {isEditing ? (
                          <Input
                            value={editDraftName}
                            onChange={(event) => setEditDraftName(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') void handleSaveEdit(row);
                              if (event.key === 'Escape') handleCancelEdit();
                            }}
                            className="h-8"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">{row.name}</span>
                        )}
                      </TableCell>
                      {STAGE_COLUMNS.map((col) => {
                        const value = profile
                          ? profile[col.stageKey]
                          : strategyDefaults[col.stageKey];
                        const templateId = stageTemplateMap[col.stageKey];
                        const isOverride = templateId
                          ? overrideKeys.has(`${row.id}:${templateId}`)
                          : false;
                        const isCellEditing =
                          editingCell?.productId === row.id &&
                          editingCell?.stageKey === col.stageKey;

                        return (
                          <TableCell
                            key={col.stageKey}
                            className="h-8 border-r px-3 py-2 text-right"
                          >
                            {isCellEditing ? (
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={cellDraftValue}
                                onChange={(event) => setCellDraftValue(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter') void handleSaveCellEdit();
                                  if (event.key === 'Escape') handleCancelCellEdit();
                                }}
                                onBlur={() => void handleSaveCellEdit()}
                                autoFocus
                                className="h-7 w-16 text-right text-sm tabular-nums"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStartCellEdit(row.id, col.stageKey)}
                                className={cn(
                                  'w-full cursor-pointer text-right text-sm tabular-nums',
                                  isOverride
                                    ? 'font-semibold text-foreground'
                                    : 'font-normal text-muted-foreground',
                                )}
                              >
                                {formatWeeks(value)}
                              </button>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="h-8 px-3 py-2">
                        <div className="flex justify-end gap-0.5">
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleSaveEdit(row)}
                                disabled={isSaving}
                                className="rounded p-1.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-50 dark:text-emerald-200 dark:hover:bg-emerald-900/20"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={handleCancelEdit}
                                className="rounded p-1.5 text-muted-foreground transition hover:bg-muted"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStartEdit(row)}
                                className="rounded p-1.5 text-muted-foreground transition hover:bg-muted"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(row)}
                                disabled={isDeleting}
                                className="rounded p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-rose-900/20 dark:hover:text-rose-400"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
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

      <p className="text-xs text-muted-foreground mt-2">
        <span className="font-semibold">Bold</span> = product override · Normal = strategy default
      </p>
    </section>
  );
}
