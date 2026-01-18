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

interface ProductSetupGridProps {
  strategyId: string;
  products: Array<{ id: string; sku: string; name: string }>;
  className?: string;
}

type ProductRow = {
  id: string;
  sku: string;
  name: string;
};

function normalizeProducts(products: ProductSetupGridProps['products']): ProductRow[] {
  return products
    .map((product) => ({
      id: product.id,
      sku: product.sku ?? '',
      name: product.name ?? '',
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function ProductSetupGrid({ strategyId, products, className }: ProductSetupGridProps) {
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

  useEffect(() => {
    setRows(normalizeProducts(products));
  }, [products]);

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

  const primaryActionClass =
    'rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-900 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-1 enabled:hover:border-cyan-500 enabled:hover:bg-cyan-50 enabled:hover:text-cyan-900 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/15 dark:bg-white/5 dark:text-slate-200 dark:focus:ring-cyan-400/60 dark:focus:ring-offset-slate-900 dark:enabled:hover:border-cyan-300/50 dark:enabled:hover:bg-white/10';

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
                <TableHead className="sticky top-0 z-10 h-10 w-28 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  SKU
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 border-b border-r bg-muted px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Name
                </TableHead>
                <TableHead className="sticky top-0 z-10 h-10 w-24 border-b border-r bg-muted px-3 py-2 text-right text-xs font-semibold uppercase tracking-[0.12em] text-cyan-700 last:border-r-0 dark:text-cyan-300/80">
                  Actions
                </TableHead>
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
                  <TableCell colSpan={3} className="p-8 text-center text-sm text-muted-foreground">
                    No products yet. Click &ldquo;Add&rdquo; to get started.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => {
                  const isEditing = editingId === row.id;
                  const isSaving = savingId === row.id;
                  const isDeleting = deletingId === row.id;

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
    </section>
  );
}
