'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { PortalModal } from '@/components/ui/portal-modal'
import { Textarea } from '@/components/ui/textarea'
import { fetchWithCSRF } from '@/lib/fetch-with-csrf'
import { usePageState } from '@/lib/store/page-state'
import { Loader2, Plus, Search, Trash2, Users } from '@/lib/lucide-icons'

const PAGE_KEY = '/config/suppliers'

interface SupplierRow {
  id: string
  name: string
  contactName: string | null
  email: string | null
  phone: string | null
  address: string | null
  notes: string | null
  defaultPaymentTerms: string | null
  defaultIncoterms: string | null
  createdAt: string
  updatedAt: string
}

const INCOTERMS_OPTIONS = [
  'EXW',
  'FOB',
  'FCA',
  'CFR',
  'CIF',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
] as const

interface SuppliersResponse {
  data: SupplierRow[]
  count: number
}

interface SupplierFormState {
  name: string
  contactName: string
  email: string
  phone: string
  address: string
  notes: string
  defaultPaymentTerms: string
  defaultIncoterms: string
}

function buildSupplierFormState(supplier?: SupplierRow | null): SupplierFormState {
  return {
    name: supplier?.name ?? '',
    contactName: supplier?.contactName ?? '',
    email: supplier?.email ?? '',
    phone: supplier?.phone ?? '',
    address: supplier?.address ?? '',
    notes: supplier?.notes ?? '',
    defaultPaymentTerms: supplier?.defaultPaymentTerms ?? '',
    defaultIncoterms: supplier?.defaultIncoterms ?? '',
  }
}

interface SuppliersPanelProps {
  externalModalOpen?: boolean
  onExternalModalClose?: () => void
}

export default function SuppliersPanel({
  externalModalOpen,
  onExternalModalClose,
}: SuppliersPanelProps) {
  const pageState = usePageState(PAGE_KEY)
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([])
  const [loading, setLoading] = useState(false)
  const searchTerm = pageState.search ?? ''
  const setSearchTerm = pageState.setSearch

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null)
  const [formState, setFormState] = useState<SupplierFormState>(() => buildSupplierFormState())

  const [confirmDelete, setConfirmDelete] = useState<SupplierRow | null>(null)

  // Handle external modal open trigger
  useEffect(() => {
    if (externalModalOpen) {
      setEditingSupplier(null)
      setFormState(buildSupplierFormState())
      setIsModalOpen(true)
    }
  }, [externalModalOpen])

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams()
    if (searchTerm.trim()) params.set('search', searchTerm.trim())
    return params.toString()
  }, [searchTerm])

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/suppliers?${buildQuery()}`, { credentials: 'include' })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to load suppliers')
      }

      const payload = (await response.json()) as SuppliersResponse
      setSuppliers(Array.isArray(payload?.data) ? payload.data : [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    fetchSuppliers()
  }, [fetchSuppliers])

  const filteredSuppliers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return suppliers.filter(supplier => {
      if (!term) return true
      return (
        supplier.name.toLowerCase().includes(term) ||
        (supplier.contactName ?? '').toLowerCase().includes(term) ||
        (supplier.email ?? '').toLowerCase().includes(term)
      )
    })
  }, [searchTerm, suppliers])

  const openCreate = () => {
    setEditingSupplier(null)
    setFormState(buildSupplierFormState())
    setIsModalOpen(true)
  }

  const openEdit = (supplier: SupplierRow) => {
    setEditingSupplier(supplier)
    setFormState(buildSupplierFormState(supplier))
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (isSubmitting) return
    setIsModalOpen(false)
    setEditingSupplier(null)
    setFormState(buildSupplierFormState())
    onExternalModalClose?.()
  }

  const submitSupplier = async (event: React.FormEvent) => {
    event.preventDefault()
    if (isSubmitting) return

    if (!formState.name.trim()) {
      toast.error('Supplier name is required')
      return
    }
    if (!formState.contactName.trim()) {
      toast.error('Contact name is required')
      return
    }
    if (!formState.email.trim()) {
      toast.error('Email is required')
      return
    }
    if (!formState.phone.trim()) {
      toast.error('Phone is required')
      return
    }
    if (!formState.address.trim()) {
      toast.error('Address is required')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = {
        name: formState.name.trim(),
        contactName: formState.contactName.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        address: formState.address.trim(),
        notes: formState.notes.trim() ? formState.notes.trim() : null,
        defaultPaymentTerms: formState.defaultPaymentTerms.trim()
          ? formState.defaultPaymentTerms.trim()
          : null,
        defaultIncoterms: formState.defaultIncoterms.trim()
          ? formState.defaultIncoterms.trim()
          : null,
      }

      const endpoint = editingSupplier
        ? `/api/suppliers?id=${encodeURIComponent(editingSupplier.id)}`
        : '/api/suppliers'
      const method = editingSupplier ? 'PATCH' : 'POST'
      const response = await fetchWithCSRF(endpoint, {
        method,
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? 'Failed to save supplier')
      }

      toast.success(editingSupplier ? 'Supplier updated' : 'Supplier created')
      closeModal()
      await fetchSuppliers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save supplier')
    } finally {
      setIsSubmitting(false)
    }
  }

  const deleteSupplier = async (supplier: SupplierRow) => {
    try {
      const response = await fetchWithCSRF(`/api/suppliers?id=${encodeURIComponent(supplier.id)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.error ?? 'Failed to delete supplier')
      }

      toast.success('Supplier deleted')
      await fetchSuppliers()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete supplier')
    } finally {
      setConfirmDelete(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-700 px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
              <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Supplier Directory</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">Manage supplier information and contacts</p>
          </div>
          <Badge className="bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 font-medium">
            {suppliers.length} suppliers
          </Badge>
        </div>

        <div className="flex flex-col gap-3 px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 md:max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                placeholder="Search suppliers..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 pl-10 pr-4 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400 dark:text-slate-500" />
          </div>
        ) : filteredSuppliers.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <Users className="h-10 w-10 text-slate-300 dark:text-slate-600" />
            <div>
              <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {searchTerm ? 'No suppliers found' : 'No suppliers yet'}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {searchTerm
                  ? 'Clear your search or create a new supplier.'
                  : 'Create suppliers for consistent SKU defaults and purchase orders.'}
              </p>
            </div>
            {!searchTerm && (
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                New Supplier
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Name</th>
                  <th className="px-4 py-3 text-left font-semibold">Contact</th>
                  <th className="px-4 py-3 text-left font-semibold">Email</th>
                  <th className="px-4 py-3 text-left font-semibold">Phone</th>
                  <th className="px-4 py-3 text-left font-semibold">Default Terms</th>
                  <th className="px-4 py-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filteredSuppliers.map(supplier => (
                  <tr key={supplier.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(supplier)}
                        className="text-left hover:text-cyan-600 dark:hover:text-cyan-400 hover:underline transition-colors"
                      >
                        {supplier.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      {supplier.contactName ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {supplier.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {supplier.phone ?? '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {supplier.defaultPaymentTerms || supplier.defaultIncoterms ? (
                        <div className="flex flex-wrap gap-1">
                          {supplier.defaultIncoterms && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                            >
                              {supplier.defaultIncoterms}
                            </Badge>
                          )}
                          {supplier.defaultPaymentTerms && (
                            <Badge
                              variant="outline"
                              className="text-xs bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800"
                            >
                              {supplier.defaultPaymentTerms.length > 20
                                ? `${supplier.defaultPaymentTerms.slice(0, 20)}…`
                                : supplier.defaultPaymentTerms}
                            </Badge>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Not set</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfirmDelete(supplier)}
                          className="border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-800 dark:hover:text-red-300"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PortalModal open={isModalOpen} className="items-center">
        <div className="flex w-full max-w-2xl max-h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-lg bg-white dark:bg-slate-800 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-6 py-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {editingSupplier ? 'Edit Supplier' : 'New Supplier'}
            </h2>
            <Button variant="ghost" onClick={closeModal} disabled={isSubmitting}>
              Close
            </Button>
          </div>

          <form onSubmit={submitSupplier} className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="supplier-name">Name</Label>
                  <input
                    id="supplier-name"
                    value={formState.name}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, name: event.target.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="supplier-contact">Contact Name</Label>
                  <input
                    id="supplier-contact"
                    value={formState.contactName}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, contactName: event.target.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="supplier-email">Email</Label>
                  <input
                    id="supplier-email"
                    type="email"
                    value={formState.email}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, email: event.target.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="supplier-phone">Phone</Label>
                  <input
                    id="supplier-phone"
                    value={formState.phone}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, phone: event.target.value }))
                    }
                    required
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="supplier-address">Address</Label>
                  <Textarea
                    id="supplier-address"
                    value={formState.address}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, address: event.target.value }))
                    }
                    required
                    rows={2}
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label htmlFor="supplier-notes">Notes</Label>
                  <Textarea
                    id="supplier-notes"
                    value={formState.notes}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, notes: event.target.value }))
                    }
                    placeholder="Optional"
                    rows={3}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="supplier-payment-terms">Default Payment Terms</Label>
                  <input
                    id="supplier-payment-terms"
                    value={formState.defaultPaymentTerms}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, defaultPaymentTerms: event.target.value }))
                    }
                    placeholder="e.g., Net 30, 50% deposit"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">Auto-filled when creating new POs</p>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="supplier-incoterms">Default Incoterms</Label>
                  <select
                    id="supplier-incoterms"
                    value={formState.defaultIncoterms}
                    onChange={event =>
                      setFormState(prev => ({ ...prev, defaultIncoterms: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 dark:focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-100 dark:focus:ring-cyan-900 transition-shadow"
                  >
                    <option value="">None (select on PO)</option>
                    {INCOTERMS_OPTIONS.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Auto-filled when creating new POs</p>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t px-6 py-4">
              <div />

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    'Save'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </PortalModal>

      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return
          void deleteSupplier(confirmDelete)
        }}
        title="Delete supplier?"
        message={
          confirmDelete
            ? `Delete ${confirmDelete.name}? This is permanent and only allowed when there is no related history.`
            : ''
        }
        confirmText="Delete"
        type="danger"
      />
    </div>
  )
}
