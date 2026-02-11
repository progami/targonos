'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ColumnDef } from '@tanstack/react-table'
import { PasswordsApi, type Password, type PasswordDepartment } from '@/lib/api-client'
import { LockClosedIcon, PlusIcon, EyeIcon, EyeSlashIcon, ClipboardIcon, ExternalLinkIcon, TrashIcon, PencilIcon } from '@/components/ui/Icons'
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

function PasswordCell({ password }: { password: string }) {
  const [visible, setVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(password)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
      <code className={cn(
        "px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs min-w-[100px]",
        !visible && "tracking-widest"
      )}>
        {visible ? password : '••••••••'}
      </code>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setVisible(!visible) }}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? (
          <EyeSlashIcon className="h-4 w-4 text-muted-foreground" />
        ) : (
          <EyeIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={copied ? 'Copied!' : 'Copy password'}
      >
        <ClipboardIcon className={cn(
          "h-4 w-4 transition-colors",
          copied ? "text-emerald-500" : "text-muted-foreground"
        )} />
      </button>
    </div>
  )
}

function UsernameCell({ username }: { username: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(username)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
      <code className="min-w-0 px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 font-mono text-xs max-w-[220px] truncate">
        {username}
      </code>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={copied ? 'Copied!' : 'Copy username'}
      >
        <ClipboardIcon className={cn(
          "h-4 w-4 transition-colors",
          copied ? "text-emerald-500" : "text-muted-foreground"
        )} />
      </button>
    </div>
  )
}

function addedByName(employee: { firstName: string; lastName: string }) {
  return `${employee.firstName} ${employee.lastName}`.trim()
}

function AddedByCell({ employee }: { employee: { firstName: string; lastName: string; email: string } }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(employee.email)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
      <div className="min-w-0">
        <div className="font-medium text-foreground text-sm truncate">{addedByName(employee)}</div>
        <div className="text-xs text-muted-foreground truncate">{employee.email}</div>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="p-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={copied ? 'Copied!' : 'Copy email'}
      >
        <ClipboardIcon className={cn(
          "h-4 w-4 transition-colors",
          copied ? "text-emerald-500" : "text-muted-foreground"
        )} />
      </button>
    </div>
  )
}

type PasswordFormData = {
  title: string
  username: string
  password: string
  url: string
  department: PasswordDepartment
  notes: string
}

const defaultFormData: PasswordFormData = {
  title: '',
  username: '',
  password: '',
  url: '',
  department: 'OPS',
  notes: '',
}

export default function PasswordsPage() {
  const [items, setItems] = useState<Password[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [allowedDepartments, setAllowedDepartments] = useState<PasswordDepartment[]>([])

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState<PasswordFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const data = await PasswordsApi.list()
      setItems(data.items)
      setAllowedDepartments(data.allowedDepartments)
    } catch (e) {
      console.error('Failed to load passwords', e)
      setItems([])
      setError(e instanceof Error ? e.message : 'Failed to load passwords')
      setAllowedDepartments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const openCreateModal = () => {
    if (!allowedDepartments.length) {
      setError('No department access configured')
      return
    }
    setEditingId(null)
    setFormData({ ...defaultFormData, department: allowedDepartments[0] })
    setModalOpen(true)
  }

  const openEditModal = (password: Password) => {
    // Validate user still has access to this password's department
    if (!allowedDepartments.includes(password.department)) {
      setError('You no longer have access to edit this password')
      return
    }
    setEditingId(password.id)
    setFormData({
      title: password.title,
      username: password.username ?? '',
      password: password.password,
      url: password.url ?? '',
      department: password.department,
      notes: password.notes ?? '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const username = formData.username.trim()
      const url = formData.url.trim()
      const notes = formData.notes.trim()

      if (editingId) {
        await PasswordsApi.update(editingId, {
          title: formData.title,
          username: username.length > 0 ? username : null,
          password: formData.password,
          url: url.length > 0 ? url : null,
          department: formData.department,
          notes: notes.length > 0 ? notes : null,
        })
      } else {
        await PasswordsApi.create({
          title: formData.title,
          username: username.length > 0 ? username : null,
          password: formData.password,
          url: url.length > 0 ? url : null,
          department: formData.department,
          notes: notes.length > 0 ? notes : null,
        })
      }
      setModalOpen(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save password')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await PasswordsApi.delete(deleteId)
      setDeleteId(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete password')
    } finally {
      setDeleting(false)
    }
  }

  const columns = useMemo<ColumnDef<Password>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Title',
	        cell: ({ row }) => (
	          <div className="flex items-center gap-3">
	            <div className="w-9 h-9 shrink-0 rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 dark:from-slate-600 dark:to-slate-800 flex items-center justify-center">
	              <LockClosedIcon className="h-4 w-4 text-white" />
	            </div>
	            <div className="min-w-0 max-w-[220px]">
	              <p className="font-semibold text-foreground truncate">{row.original.title}</p>
	            </div>
	          </div>
	        ),
	        enableSorting: true,
      },
      {
        accessorFn: (row) => row.username ?? '',
        id: 'username',
        header: 'Username',
        cell: ({ row }) => {
          const username = row.original.username
          if (!username) {
            return <span className="text-muted-foreground">—</span>
          }
          return <UsernameCell username={username} />
        },
        enableSorting: true,
      },
      {
        accessorFn: (row) => (row.createdBy ? row.createdBy.email : ''),
        id: 'createdBy',
        header: 'Added By',
        cell: ({ row }) => {
          const createdBy = row.original.createdBy
          if (!createdBy) {
            return <span className="text-muted-foreground">—</span>
          }
          return <AddedByCell employee={createdBy} />
        },
        enableSorting: true,
      },
      {
        accessorKey: 'password',
        header: 'Password',
        cell: ({ row }) => <PasswordCell password={row.original.password} />,
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
        header: 'URL',
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

  const passwordToDelete = items.find(p => p.id === deleteId)
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
            Add Password
          </Button>
        }
      />

      <div className="space-y-6">
        <Tabs value="passwords">
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

        <ResultsCount count={items.length} singular="password" plural="passwords" loading={loading} />

        <DataTable
          columns={columns}
          data={items}
          loading={loading}
          skeletonRows={6}
          onRowClick={openEditModal}
          addRow={{ label: 'Add Password', onClick: openCreateModal }}
          emptyState={
            <TableEmptyContent
              icon={<LockClosedIcon className="h-10 w-10" />}
              title="No passwords yet"
              description="Add your first password to get started."
              action={{ label: 'Add Password', onClick: openCreateModal }}
            />
          }
        />
      </div>

      {/* Create/Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Password' : 'Add Password'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update the password details below.' : 'Enter the details for the new password entry.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            <FormField
              label="Title"
              name="title"
              required
              placeholder="e.g., Company Instagram"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
            />

            <FormField
              label="Username / Email"
              name="username"
              placeholder="e.g., admin@company.com"
              value={formData.username}
              onChange={(e) => setFormData(prev => ({ ...prev, username: e.target.value }))}
            />

            <FormField
              label="Password"
              name="password"
              type="text"
              required
              placeholder="Enter password"
              value={formData.password}
              onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
            />

            <FormField
              label="URL"
              name="url"
              type="url"
              placeholder="https://example.com"
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
                {editingId ? 'Save Changes' : 'Add Password'}
              </Button>
            </FormActions>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Delete Password</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>"{passwordToDelete?.title}"</strong>? This action cannot be undone.
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
