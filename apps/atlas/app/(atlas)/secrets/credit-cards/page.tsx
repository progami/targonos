'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import {
  CreditCardsApi,
  type CreditCard,
  type CreditCardBrand,
  type PasswordDepartment,
} from '@/lib/api-client'
import { LockClosedIcon, PlusIcon, ExternalLinkIcon, TrashIcon, PencilIcon, ClipboardIcon, EyeIcon, EyeSlashIcon } from '@/components/ui/Icons'
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
import { FormField, SelectField, TextareaField, FormActions } from '@/components/ui/FormField'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const DEPARTMENT_OPTIONS: { value: PasswordDepartment; label: string; color: string }[] = [
  { value: 'OPS', label: 'Ops', color: 'bg-sky-500/10 text-sky-600 border-sky-500/20' },
  { value: 'SALES_MARKETING', label: 'Sales/Marketing', color: 'bg-pink-500/10 text-pink-600 border-pink-500/20' },
  { value: 'LEGAL', label: 'Legal', color: 'bg-violet-500/10 text-violet-600 border-violet-500/20' },
  { value: 'HR', label: 'HR', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { value: 'FINANCE', label: 'Finance', color: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
]

function getDepartmentConfig(department: PasswordDepartment) {
  return DEPARTMENT_OPTIONS.find(d => d.value === department) ?? DEPARTMENT_OPTIONS[0]
}

const BRAND_OPTIONS: { value: CreditCardBrand; label: string }[] = [
  { value: 'VISA', label: 'Visa' },
  { value: 'MASTERCARD', label: 'Mastercard' },
  { value: 'AMEX', label: 'Amex' },
  { value: 'DISCOVER', label: 'Discover' },
  { value: 'OTHER', label: 'Other' },
]

function getBrandLabel(brand: CreditCardBrand) {
  return BRAND_OPTIONS.find((b) => b.value === brand)?.label ?? brand
}

function CardNumberCell({ cardNumber, last4 }: { cardNumber?: string | null; last4: string }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)
  const raw = cardNumber?.replace(/\s+/g, '')

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(raw ?? last4)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const display = raw
    ? (visible ? raw : '•'.repeat(raw.length - 4) + raw.slice(-4))
    : `•••• ${last4}`

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <code className={cn(
        "px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs",
        !visible && "tracking-wider"
      )}>
        {display}
      </code>
      {raw ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setVisible(!visible) }}
          className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          title={visible ? 'Hide number' : 'Show number'}
        >
          {visible ? (
            <EyeSlashIcon className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <EyeIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      ) : null}
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={copied ? 'Copied!' : 'Copy number'}
      >
        <ClipboardIcon className={cn(
          "h-3.5 w-3.5 transition-colors",
          copied ? "text-emerald-500" : "text-muted-foreground"
        )} />
      </button>
    </div>
  )
}

function CvcCell({ cvv }: { cvv?: string | null }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!cvv) return <span className="text-muted-foreground">—</span>

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(cvv)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      <code className="px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs">
        {visible ? cvv : '•••'}
      </code>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setVisible(!visible) }}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={visible ? 'Hide CVC' : 'Show CVC'}
      >
        {visible ? (
          <EyeSlashIcon className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <EyeIcon className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={copied ? 'Copied!' : 'Copy CVC'}
      >
        <ClipboardIcon className={cn(
          "h-3.5 w-3.5 transition-colors",
          copied ? "text-emerald-500" : "text-muted-foreground"
        )} />
      </button>
    </div>
  )
}

type CreditCardFormData = {
  title: string
  cardholderName: string
  brand: CreditCardBrand
  cardNumber: string
  cvv: string
  expMonth: number
  expYear: number
  department: PasswordDepartment
  url: string
  notes: string
}

const defaultFormData: CreditCardFormData = {
  title: '',
  cardholderName: '',
  brand: 'VISA',
  cardNumber: '',
  cvv: '',
  expMonth: 1,
  expYear: new Date().getFullYear(),
  department: 'FINANCE',
  url: '',
  notes: '',
}

export default function CreditCardsPage() {
  const [items, setItems] = useState<CreditCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allowedDepartments, setAllowedDepartments] = useState<PasswordDepartment[]>([])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<CreditCardFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await CreditCardsApi.list()
      setItems(data.items)
      setAllowedDepartments(data.allowedDepartments)
    } catch (e) {
      console.error('Failed to load credit cards', e)
      setItems([])
      setError(e instanceof Error ? e.message : 'Failed to load credit cards')
      setAllowedDepartments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 15 }, (_, i) => currentYear + i)
  }, [])

  const monthOptions = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), [])

  const openCreateModal = () => {
    if (!allowedDepartments.length) {
      setError('No department access configured')
      return
    }
    const defaultDepartment = allowedDepartments.includes('FINANCE') ? 'FINANCE' : allowedDepartments[0]
    setEditingId(null)
    setFormData({
      ...defaultFormData,
      department: defaultDepartment,
      expYear: new Date().getFullYear(),
    })
    setModalOpen(true)
  }

  const openEditModal = (card: CreditCard) => {
    if (!allowedDepartments.includes(card.department)) {
      setError('You no longer have access to edit this card')
      return
    }
    setEditingId(card.id)
    setFormData({
      title: card.title,
      cardholderName: card.cardholderName ?? '',
      brand: card.brand,
      cardNumber: card.cardNumber ?? '',
      cvv: card.cvv ?? '',
      expMonth: card.expMonth,
      expYear: card.expYear,
      department: card.department,
      url: card.url ?? '',
      notes: card.notes ?? '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const cardholderName = formData.cardholderName.trim() ? formData.cardholderName : null
      const cardNumber = formData.cardNumber.trim() ? formData.cardNumber : null
      const cvv = formData.cvv.trim() ? formData.cvv : null
      const url = formData.url.trim() ? formData.url : null
      const notes = formData.notes.trim() ? formData.notes : null

      if (editingId) {
        await CreditCardsApi.update(editingId, {
          title: formData.title,
          cardholderName,
          brand: formData.brand,
          cardNumber,
          cvv,
          expMonth: formData.expMonth,
          expYear: formData.expYear,
          department: formData.department,
          url,
          notes,
        })
      } else {
        await CreditCardsApi.create({
          title: formData.title,
          cardholderName,
          brand: formData.brand,
          cardNumber,
          cvv,
          expMonth: formData.expMonth,
          expYear: formData.expYear,
          department: formData.department,
          url,
          notes,
        })
      }
      setModalOpen(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save credit card')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await CreditCardsApi.delete(deleteId)
      setDeleteId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete credit card')
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo<ColumnDef<CreditCard>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Card',
        cell: ({ row }) => (
          <div>
            <p className="font-semibold text-foreground">{row.original.title}</p>
            {row.original.cardholderName ? (
              <p className="text-xs text-muted-foreground mt-0.5">{row.original.cardholderName}</p>
            ) : null}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'brand',
        header: 'Brand',
        cell: ({ row }) => (
          <Badge variant="outline" className="font-medium">
            {getBrandLabel(row.original.brand)}
          </Badge>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'last4',
        header: 'Number',
        cell: ({ row }) => (
          <CardNumberCell cardNumber={row.original.cardNumber} last4={row.original.last4} />
        ),
        enableSorting: false,
      },
      {
        id: 'cvc',
        header: 'CVC',
        cell: ({ row }) => <CvcCell cvv={row.original.cvv} />,
        enableSorting: false,
      },
      {
        id: 'expiry',
        header: 'Expiry',
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {String(row.original.expMonth).padStart(2, '0')}/{row.original.expYear}
          </span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'department',
        header: 'Department',
        cell: ({ row }) => {
          const config = getDepartmentConfig(row.original.department)
          return (
            <Badge variant="outline" className={cn("font-medium", config.color)}>
              {config.label}
            </Badge>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'url',
        header: 'Link',
        cell: ({ row }) => row.original.url ? (
          <a
            href={row.original.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <span className="truncate max-w-[150px]">{new URL(row.original.url).hostname}</span>
            <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0" />
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
        enableSorting: false,
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

  const cardToDelete = items.find(c => c.id === deleteId)
  const departmentOptions = useMemo(
    () => DEPARTMENT_OPTIONS.filter((opt) => allowedDepartments.includes(opt.value)),
    [allowedDepartments]
  )

  return (
    <>
      <ListPageHeader
        title="Secrets"
        description="Shared passwords, credentials, and cards"
        icon={<LockClosedIcon className="h-6 w-6 text-white" />}
        showBack
        action={
          <Button onClick={openCreateModal} icon={<PlusIcon className="h-4 w-4" />}>
            Add Card
          </Button>
        }
      />

      <div className="space-y-6">
        <Tabs value="credit-cards">
          <TabsList>
            <TabsTrigger value="passwords" asChild>
              <Link href="/secrets">Passwords</Link>
            </TabsTrigger>
            <TabsTrigger value="credit-cards" asChild>
              <Link href="/secrets/credit-cards">Credit Cards</Link>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {error ? (
          <Alert variant="error" onDismiss={() => setError(null)}>
            {error}
          </Alert>
        ) : null}

        <ResultsCount count={items.length} singular="card" plural="cards" loading={loading} />

        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          skeletonRows={6}
          onRowClick={openEditModal}
          addRow={{ label: 'Add Card', onClick: openCreateModal }}
          emptyState={
            <TableEmptyContent
              icon={<LockClosedIcon className="h-10 w-10" />}
              title="No cards yet"
              description="Add your first card entry to get started."
              action={{ label: 'Add Card', onClick: openCreateModal }}
            />
          }
        />
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Card' : 'Add Card'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the card details below.' : 'Enter the details for the new card entry.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <FormField
              label="Title"
              name="title"
              required
              placeholder="e.g., Finance Corporate Card"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            />

            <FormField
              label="Cardholder Name"
              name="cardholderName"
              placeholder="e.g., John Smith"
              value={formData.cardholderName}
              onChange={(e) => setFormData(prev => ({ ...prev, cardholderName: e.target.value }))}
            />

            <SelectField
              label="Brand"
              name="brand"
              value={formData.brand}
              onChange={(e) => setFormData(prev => ({ ...prev, brand: e.target.value as CreditCardBrand }))}
              options={BRAND_OPTIONS.map((b) => ({ value: b.value, label: b.label }))}
            />

            <FormField
              label="Card Number"
              name="cardNumber"
              required
              placeholder="4111 1111 1111 1234"
              value={formData.cardNumber}
              onChange={(e) => setFormData(prev => ({ ...prev, cardNumber: e.target.value }))}
            />

            <div className="grid grid-cols-3 gap-4">
              <SelectField
                label="Expiry Month"
                name="expMonth"
                value={String(formData.expMonth)}
                onChange={(e) => setFormData(prev => ({ ...prev, expMonth: Number(e.target.value) }))}
                options={monthOptions.map((m) => ({ value: String(m), label: String(m).padStart(2, '0') }))}
              />
              <SelectField
                label="Expiry Year"
                name="expYear"
                value={String(formData.expYear)}
                onChange={(e) => setFormData(prev => ({ ...prev, expYear: Number(e.target.value) }))}
                options={yearOptions.map((y) => ({ value: String(y), label: String(y) }))}
              />
              <FormField
                label="CVC"
                name="cvv"
                placeholder="123"
                value={formData.cvv}
                onChange={(e) => setFormData(prev => ({ ...prev, cvv: e.target.value }))}
              />
            </div>

            <FormField
              label="Link"
              name="url"
              type="url"
              placeholder="https://..."
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
            />

            <SelectField
              label="Department"
              name="department"
              value={formData.department}
              onChange={(e) => setFormData(prev => ({ ...prev, department: e.target.value as PasswordDepartment }))}
              options={departmentOptions.map(d => ({ value: d.value, label: d.label }))}
            />

            <TextareaField
              label="Notes"
              name="notes"
              placeholder="Additional notes..."
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
            />

            <FormActions>
              <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {editingId ? 'Save Changes' : 'Add Card'}
              </Button>
            </FormActions>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Card</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{cardToDelete?.title}"</strong>? This action cannot be undone.
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
