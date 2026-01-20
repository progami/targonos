'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ColumnDef } from '@tanstack/react-table'
import { MeApi, PoliciesAdminApi, PoliciesApi, type Policy } from '@/lib/api-client'
import { DocumentIcon, PlusIcon } from '@/components/ui/Icons'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/badge'
import { DataTable, type FilterOption } from '@/components/ui/DataTable'
import { ResultsCount } from '@/components/ui/table'
import { TableEmptyContent } from '@/components/ui/EmptyState'
import {
  POLICY_CATEGORY_LABELS,
  POLICY_REGION_LABELS,
  POLICY_REGION_OPTIONS,
  POLICY_STATUS_LABELS,
  POLICY_STATUS_OPTIONS,
} from '@/lib/domain/policy/constants'

const REGION_FILTER_OPTIONS: FilterOption[] = POLICY_REGION_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

const STATUS_FILTER_OPTIONS: FilterOption[] = POLICY_STATUS_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
}))

export default function PoliciesPage() {
  const router = useRouter()
  const [items, setItems] = useState<Policy[]>([])
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [canManagePolicies, setCanManagePolicies] = useState(false)
  const didConsolidateConduct = useRef(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await PoliciesApi.list({})
      setItems(data.items)
    } catch (e) {
      console.error('Failed to load policies', e)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Single effect that handles permissions check, consolidation, and data loading
  useEffect(() => {
    async function init() {
      try {
        const me = await MeApi.get()
        const canManage = Boolean(me.isSuperAdmin || me.isHR)
        setCanManagePolicies(canManage)

        // Consolidate conduct policies if admin (only once)
        if (canManage && !didConsolidateConduct.current) {
          didConsolidateConduct.current = true
          await PoliciesAdminApi.consolidateConductCompanyWide().catch(() => null)
        }
      } catch {
        setCanManagePolicies(false)
      }

      // Load policies once after permission check
      await load()
    }
    init()
  }, [load])

  // Get unique categories from items
  const categoryOptions = useMemo<FilterOption[]>(() => {
    const categories = [...new Set(items.map((p) => p.category).filter(Boolean))]
    return categories.map((c) => ({
      value: c,
      label: POLICY_CATEGORY_LABELS[c as keyof typeof POLICY_CATEGORY_LABELS] ?? c,
    }))
  }, [items])

  // Apply client-side filters
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filters.region && item.region !== filters.region) return false
      if (filters.status && item.status !== filters.status) return false
      if (filters.category && item.category !== filters.category) return false
      return true
    })
  }, [items, filters])

  const columns = useMemo<ColumnDef<Policy>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Title',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{row.original.title}</p>
            {row.original.summary && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {row.original.summary}
              </p>
            )}
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'category',
        header: 'Category',
        meta: {
          filterKey: 'category',
          filterOptions: categoryOptions,
        },
        cell: ({ getValue }) => {
          const category = getValue<string>()
          return (
            <span className="text-muted-foreground">
              {POLICY_CATEGORY_LABELS[category as keyof typeof POLICY_CATEGORY_LABELS] ?? category}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'region',
        header: 'Region',
        meta: {
          filterKey: 'region',
          filterOptions: REGION_FILTER_OPTIONS,
        },
        cell: ({ getValue }) => {
          const region = getValue<string>()
          return (
            <span className="text-muted-foreground">
              {POLICY_REGION_LABELS[region as keyof typeof POLICY_REGION_LABELS] ?? region}
            </span>
          )
        },
        enableSorting: true,
      },
      {
        accessorKey: 'version',
        header: 'Version',
        cell: ({ getValue }) => (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">
            v{getValue<number>()}
          </span>
        ),
        enableSorting: true,
      },
      {
        accessorKey: 'status',
        header: 'Status',
        meta: {
          filterKey: 'status',
          filterOptions: STATUS_FILTER_OPTIONS,
        },
        cell: ({ getValue }) => {
          const status = getValue<string>()
          return <StatusBadge status={POLICY_STATUS_LABELS[status as keyof typeof POLICY_STATUS_LABELS] ?? status} />
        },
        enableSorting: true,
      },
    ],
    [categoryOptions]
  )

  const handleRowClick = useCallback(
    (policy: Policy) => {
      router.push(`/policies/${policy.id}`)
    },
    [router]
  )

  return (
    <>
      <ListPageHeader
        title="Policies"
        description="Manage company policies and guidelines"
        icon={<DocumentIcon className="h-6 w-6 text-white" />}
        action={
          canManagePolicies ? (
            <Button href="/policies/add" icon={<PlusIcon className="h-4 w-4" />}>
              Add Policy
            </Button>
          ) : null
        }
      />

      <div className="space-y-4">
        <ResultsCount
          count={filteredItems.length}
          singular="policy"
          plural="policies"
          loading={loading}
        />

        <DataTable
          columns={columns}
          data={filteredItems}
          loading={loading}
          skeletonRows={5}
          onRowClick={handleRowClick}
          filters={filters}
          onFilterChange={setFilters}
          addRow={canManagePolicies ? { label: 'Add Policy', onClick: () => router.push('/policies/add') } : undefined}
          emptyState={
            <TableEmptyContent
              icon={<DocumentIcon className="h-10 w-10" />}
              title="No policies found"
              action={{ label: 'Add your first policy', href: '/policies/add' }}
            />
          }
        />
      </div>
    </>
  )
}
