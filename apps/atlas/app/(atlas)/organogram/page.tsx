'use client'

import { useEffect, useState } from 'react'
import { HierarchyApi, ProjectsApi, type HierarchyEmployee, type Project } from '@/lib/api-client'
import { SpinnerIcon } from '@/components/ui/Icons'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { OrgChartRevamp } from '@/components/organogram/OrgChartRevamp'

type HierarchyData = {
  items: HierarchyEmployee[]
  currentEmployeeId: string | null
  managerChainIds: string[]
  directReportIds: string[]
}

export default function OrganogramPage() {
  const [hierarchyData, setHierarchyData] = useState<HierarchyData | null>(null)
  const [projectData, setProjectData] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)
      const [hierarchy, projects] = await Promise.all([
        HierarchyApi.getFull(),
        ProjectsApi.getHierarchy(),
      ])
      setHierarchyData(hierarchy)
      setProjectData(projects.items)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load org chart'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

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
        <Button onClick={fetchData}>Retry</Button>
      </div>
    )
  }

  return (
    <OrgChartRevamp
      employees={hierarchyData ? hierarchyData.items : []}
      projects={projectData}
      currentEmployeeId={hierarchyData ? hierarchyData.currentEmployeeId : null}
    />
  )
}
