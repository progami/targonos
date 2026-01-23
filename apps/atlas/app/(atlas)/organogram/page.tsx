'use client'

import { useState, useEffect, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { HierarchyApi, DepartmentsApi, ProjectsApi, HierarchyEmployee, Department, Project } from '@/lib/api-client'
import { ListPageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/card'
import { OrgChartIcon, SpinnerIcon, SearchIcon, XIcon, UsersIcon, BuildingIcon, FolderIcon, RefreshIcon } from '@/components/ui/Icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OrgChart } from '@/components/organogram/OrgChart'
import { DepartmentOrgChart } from '@/components/organogram/DepartmentOrgChart'
import { ProjectOrgChart } from '@/components/organogram/ProjectOrgChart'

interface HierarchyData {
  items: HierarchyEmployee[]
  currentEmployeeId: string | null
  managerChainIds: string[]
  directReportIds: string[]
}

type ViewMode = 'person' | 'department' | 'project'

function OrganogramContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [hierarchyData, setHierarchyData] = useState<HierarchyData | null>(null)
  const [departmentData, setDepartmentData] = useState<Department[] | null>(null)
  const [projectData, setProjectData] = useState<Project[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Get view mode and search query from URL
  const viewMode = (searchParams.get('view') as ViewMode) || 'person'
  const searchQuery = searchParams.get('q') ?? ''

  const setViewMode = (mode: ViewMode) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', mode)
    router.replace(`/organogram?${params.toString()}`, { scroll: false })
  }

  const setSearchQuery = (query: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (query) {
      params.set('q', query)
    } else {
      params.delete('q')
    }
    router.replace(`/organogram?${params.toString()}`, { scroll: false })
  }

  const fetchData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      setError(null)

      // Fetch hierarchy, department, and project data in parallel
      const [hierarchy, departments, projects] = await Promise.all([
        HierarchyApi.getFull(),
        DepartmentsApi.getHierarchy(),
        ProjectsApi.getHierarchy(),
      ])

      setHierarchyData(hierarchy)
      setDepartmentData(departments.items)
      setProjectData(projects.items)
      setLastUpdated(new Date())
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load org chart'
      setError(message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Org charts change relatively infrequently; refresh manually via the UI to avoid excessive API traffic.

  // Filter employees based on search query
  const filteredEmployees = hierarchyData?.items.filter((emp) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      emp.firstName.toLowerCase().includes(query) ||
      emp.lastName.toLowerCase().includes(query) ||
      emp.email.toLowerCase().includes(query) ||
      emp.department.toLowerCase().includes(query) ||
      emp.position.toLowerCase().includes(query) ||
      emp.employeeId.toLowerCase().includes(query)
    )
  }) ?? []

  // Filter departments based on search query
  const filteredDepartments = departmentData?.filter((dept) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      dept.name.toLowerCase().includes(query) ||
      (dept.kpi && dept.kpi.toLowerCase().includes(query)) ||
      (dept.head && `${dept.head.firstName} ${dept.head.lastName}`.toLowerCase().includes(query))
    )
  }) ?? []

  // Filter projects based on search query
  const filteredProjects = projectData?.filter((proj) => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return (
      proj.name.toLowerCase().includes(query) ||
      (proj.code && proj.code.toLowerCase().includes(query)) ||
      (proj.description && proj.description.toLowerCase().includes(query)) ||
      (proj.lead && `${proj.lead.firstName} ${proj.lead.lastName}`.toLowerCase().includes(query)) ||
      (proj.members?.some(m =>
        `${m.employee.firstName} ${m.employee.lastName}`.toLowerCase().includes(query) ||
        (m.role && m.role.toLowerCase().includes(query))
      ))
    )
  }) ?? []

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <SpinnerIcon className="h-8 w-8 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Alert variant="error" className="max-w-md mb-4">
          {error}
        </Alert>
        <Button onClick={() => fetchData()}>Retry</Button>
      </div>
    )
  }

  return (
    <Card>
      {/* View Toggle & Search */}
      <div className="mb-6 space-y-4">
        {/* View Mode Toggle & Refresh */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setViewMode('person')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'person'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <UsersIcon className="h-4 w-4" />
            By Person
          </button>
          <button
            onClick={() => setViewMode('department')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'department'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BuildingIcon className="h-4 w-4" />
            By Department
          </button>
          <button
            onClick={() => setViewMode('project')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              viewMode === 'project'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FolderIcon className="h-4 w-4" />
            By Project
          </button>
          </div>

          {/* Refresh Button */}
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors disabled:opacity-50"
            >
              <RefreshIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder={
              viewMode === 'person'
                ? "Search by name, department, position..."
                : viewMode === 'department'
                  ? "Search by department, head..."
                  : "Search by project, lead, member..."
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-10 py-2.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-muted rounded-full"
            >
              <XIcon className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        {searchQuery && (
          <p className="text-sm text-muted-foreground">
            Showing{' '}
            {viewMode === 'person'
              ? filteredEmployees.length
              : viewMode === 'department'
                ? filteredDepartments.length
                : filteredProjects.length}{' '}
            of{' '}
            {viewMode === 'person'
              ? hierarchyData?.items.length
              : viewMode === 'department'
                ? departmentData?.length
                : projectData?.length}{' '}
            {viewMode === 'person' ? 'employees' : viewMode === 'department' ? 'departments' : 'projects'}
          </p>
        )}
      </div>

      {/* Org Chart based on view mode */}
      {viewMode === 'person' ? (
        <OrgChart
          employees={filteredEmployees}
          currentEmployeeId={hierarchyData?.currentEmployeeId ?? null}
          managerChainIds={hierarchyData?.managerChainIds ?? []}
          directReportIds={hierarchyData?.directReportIds ?? []}
        />
      ) : viewMode === 'department' ? (
        <DepartmentOrgChart
          departments={filteredDepartments}
        />
      ) : (
        <ProjectOrgChart
          projects={filteredProjects}
        />
      )}
    </Card>
  )
}

export default function OrganogramPage() {
  return (
    <>
      <ListPageHeader
        title="Organization Chart"
        description="View company structure by person or department"
        icon={<OrgChartIcon className="h-6 w-6 text-white" />}
        showBack
      />

      <Suspense
        fallback={
          <div className="flex items-center justify-center h-64">
            <SpinnerIcon className="h-8 w-8 animate-spin text-accent" />
          </div>
        }
      >
        <OrganogramContent />
      </Suspense>
    </>
  )
}
