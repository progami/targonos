'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { ContractorsApi, type Contractor, type ContractorStatus } from '@/lib/api-client'
import { BriefcaseIcon, PlusIcon, TrashIcon, PencilIcon, EnvelopeIcon, PhoneIcon, MapPinIcon } from '@/components/ui/Icons'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { DataTable } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { FormField, SelectField, TextareaField, FormActions, FormSection } from '@/components/ui/FormField'
import { cn } from '@/lib/utils'

const STATUS_OPTIONS: { value: ContractorStatus; label: string; color: string }[] = [
  { value: 'ACTIVE', label: 'Active', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  { value: 'ON_HOLD', label: 'On Hold', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { value: 'COMPLETED', label: 'Completed', color: 'bg-sky-500/10 text-sky-600 border-sky-500/20' },
  { value: 'TERMINATED', label: 'Terminated', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
]

function getStatusConfig(status: ContractorStatus) {
  return STATUS_OPTIONS.find(s => s.value === status) ?? STATUS_OPTIONS[0]
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatCurrency(amount: number | null | undefined, currency: string) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

type ContractorFormData = {
  name: string
  company: string
  email: string
  phone: string
  role: string
  department: string
  hourlyRate: string
  currency: string
  contractStart: string
  contractEnd: string
  status: ContractorStatus
  address: string
  city: string
  country: string
  notes: string
}

const defaultFormData: ContractorFormData = {
  name: '',
  company: '',
  email: '',
  phone: '',
  role: '',
  department: '',
  hourlyRate: '',
  currency: 'USD',
  contractStart: '',
  contractEnd: '',
  status: 'ACTIVE',
  address: '',
  city: '',
  country: '',
  notes: '',
}

export default function ContractorsPage() {
  const [items, setItems] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<ContractorFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await ContractorsApi.list()
      setItems(data.items)
    } catch (e) {
      console.error('Failed to load contractors', e)
      setItems([])
      setError(e instanceof Error ? e.message : 'Failed to load contractors')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreateModal = () => {
    setEditingId(null)
    setFormData(defaultFormData)
    setModalOpen(true)
  }

  const openEditModal = (contractor: Contractor) => {
    setEditingId(contractor.id)
    setFormData({
      name: contractor.name,
      company: contractor.company ?? '',
      email: contractor.email ?? '',
      phone: contractor.phone ?? '',
      role: contractor.role ?? '',
      department: contractor.department ?? '',
      hourlyRate: contractor.hourlyRate?.toString() ?? '',
      currency: contractor.currency,
      contractStart: contractor.contractStart ? contractor.contractStart.split('T')[0] : '',
      contractEnd: contractor.contractEnd ? contractor.contractEnd.split('T')[0] : '',
      status: contractor.status,
      address: contractor.address ?? '',
      city: contractor.city ?? '',
      country: contractor.country ?? '',
      notes: contractor.notes ?? '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        name: formData.name,
        company: formData.company || null,
        email: formData.email || null,
        phone: formData.phone || null,
        role: formData.role || null,
        department: formData.department || null,
        hourlyRate: formData.hourlyRate ? parseFloat(formData.hourlyRate) : null,
        currency: formData.currency,
        contractStart: formData.contractStart || null,
        contractEnd: formData.contractEnd || null,
        status: formData.status,
        address: formData.address || null,
        city: formData.city || null,
        country: formData.country || null,
        notes: formData.notes || null,
      }

      if (editingId) {
        await ContractorsApi.update(editingId, payload)
      } else {
        await ContractorsApi.create(payload)
      }
      setModalOpen(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save contractor')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await ContractorsApi.delete(deleteId)
      setDeleteId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete contractor')
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo<ColumnDef<Contractor>[]>(
    () => [
      {
        accessorKey: 'name',
        header: 'Contractor',
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
              {row.original.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-foreground">{row.original.name}</p>
              {row.original.company && (
                <p className="text-xs text-muted-foreground mt-0.5">{row.original.company}</p>
              )}
            </div>
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <div>
            <p className="text-foreground">{row.original.role || '—'}</p>
            {row.original.department && (
              <p className="text-xs text-muted-foreground mt-0.5">{row.original.department}</p>
            )}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'hourlyRate',
        header: 'Rate',
        cell: ({ row }) => (
          <span className="font-mono text-sm">
            {formatCurrency(row.original.hourlyRate, row.original.currency)}/hr
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const config = getStatusConfig(row.original.status)
          return (
            <Badge variant="outline" className={cn("font-medium", config.color)}>
              {config.label}
            </Badge>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'contractEnd',
        header: 'Contract End',
        cell: ({ row }) => (
          <span className="text-muted-foreground text-sm">
            {formatDate(row.original.contractEnd)}
          </span>
        ),
        enableSorting: true,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => openEditModal(row.original)}
              className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Edit"
            >
              <PencilIcon className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteId(row.original.id)}
              className="p-2 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="Delete"
            >
              <TrashIcon className="h-4 w-4 text-red-500" />
            </button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    []
  )

  const contractorToDelete = items.find(c => c.id === deleteId)

  return (
    <>
      <ListPageHeader
        title="Contractors"
        description="Contractor information and management"
        icon={<BriefcaseIcon className="h-6 w-6 text-white" />}
        action={
          <Button onClick={openCreateModal} icon={<PlusIcon className="h-4 w-4" />}>
            Add Contractor
          </Button>
        }
      />

      <div className="space-y-6">
        {error ? (
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <ResultsCount count={items.length} singular="contractor" plural="contractors" loading={loading} />

        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          skeletonRows={6}
          onRowClick={openEditModal}
          addRow={{ label: 'Add Contractor', onClick: openCreateModal }}
          emptyState={
            <TableEmptyContent
              icon={<BriefcaseIcon className="h-10 w-10" />}
              title="No contractors yet"
              description="Add your first contractor to get started."
              action={{ label: 'Add Contractor', onClick: openCreateModal }}
            />
          }
        />
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Contractor' : 'Add Contractor'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the contractor details below.' : 'Enter the details for the new contractor.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <FormSection title="Basic Information">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Full Name"
                  name="name"
                  required
                  placeholder="e.g., John Smith"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
                <FormField
                  label="Company"
                  name="company"
                  placeholder="e.g., Smith Consulting"
                  value={formData.company}
                  onChange={(e) => setFormData(prev => ({ ...prev, company: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Email"
                  name="email"
                  type="email"
                  placeholder="john@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                />
                <FormField
                  label="Phone"
                  name="phone"
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={formData.phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                />
              </div>
            </FormSection>

            <FormSection title="Work Details">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Role"
                  name="role"
                  placeholder="e.g., Senior Developer"
                  value={formData.role}
                  onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value }))}
                />
                <FormField
                  label="Department"
                  name="department"
                  placeholder="e.g., Engineering"
                  value={formData.department}
                  onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  label="Hourly Rate"
                  name="hourlyRate"
                  type="number"
                  placeholder="0.00"
                  value={formData.hourlyRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, hourlyRate: e.target.value }))}
                />
                <SelectField
                  label="Currency"
                  name="currency"
                  value={formData.currency}
                  onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
                  options={[
                    { value: 'USD', label: 'USD ($)' },
                    { value: 'EUR', label: 'EUR (\u20ac)' },
                    { value: 'GBP', label: 'GBP (\u00a3)' },
                    { value: 'AED', label: 'AED' },
                    { value: 'PKR', label: 'PKR' },
                  ]}
                />
                <SelectField
                  label="Status"
                  name="status"
                  value={formData.status}
                  onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as ContractorStatus }))}
                  options={STATUS_OPTIONS.map(s => ({ value: s.value, label: s.label }))}
                />
              </div>
            </FormSection>

            <FormSection title="Contract Period">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="Start Date"
                  name="contractStart"
                  type="date"
                  value={formData.contractStart}
                  onChange={(e) => setFormData(prev => ({ ...prev, contractStart: e.target.value }))}
                />
                <FormField
                  label="End Date"
                  name="contractEnd"
                  type="date"
                  value={formData.contractEnd}
                  onChange={(e) => setFormData(prev => ({ ...prev, contractEnd: e.target.value }))}
                />
              </div>
            </FormSection>

            <FormSection title="Location">
              <FormField
                label="Address"
                name="address"
                placeholder="Street address"
                value={formData.address}
                onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  label="City"
                  name="city"
                  placeholder="City"
                  value={formData.city}
                  onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                />
                <FormField
                  label="Country"
                  name="country"
                  placeholder="Country"
                  value={formData.country}
                  onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                />
              </div>
            </FormSection>

            <TextareaField
              label="Notes"
              name="notes"
              placeholder="Additional notes about this contractor..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />

            <FormActions>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? 'Save Changes' : 'Add Contractor'}
              </Button>
            </FormActions>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Contractor</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{contractorToDelete?.name}"</strong>? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="mt-6">
            <Button type="button" variant="secondary" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={handleDelete} loading={deleting}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
