import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withRateLimit, safeErrorResponse } from '@/lib/api-helpers'
import { getCurrentUser } from '@/lib/current-user'
import { getManagerChain } from '@/lib/permissions'

type HierarchyEmployee = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  department: string
  position: string
  employmentType: string
  avatar: string | null
  reportsToId: string | null
  status: string
  phone?: string | null
  city?: string | null
  country?: string | null
  joinDate?: Date | null
  projects?: string[]
}

export async function GET(req: Request) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'direct-reports'

    const user = await getCurrentUser()
    const currentEmployeeId = user?.employee?.id
    if (type === 'direct-reports') {
      if (!currentEmployeeId) {
        return NextResponse.json({ items: [], currentEmployeeId: null })
      }

      const directReports = await prisma.employee.findMany({
        where: {
          reportsToId: currentEmployeeId,
          status: 'ACTIVE',
        },
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
          employmentType: true,
          avatar: true,
          reportsToId: true,
          status: true,
          phone: true,
          city: true,
          country: true,
          joinDate: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      })

      return NextResponse.json({ items: directReports, currentEmployeeId })
    }

    if (type === 'manager-chain') {
      if (!currentEmployeeId) {
        return NextResponse.json({ items: [], currentEmployeeId: null })
      }

      const chain: HierarchyEmployee[] = []
      let currentId: string | null = currentEmployeeId

      // Walk up the hierarchy to get the manager chain
      while (currentId) {
        const emp: HierarchyEmployee | null = await prisma.employee.findUnique({
          where: { id: currentId },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
            employmentType: true,
            avatar: true,
            reportsToId: true,
            status: true,
            phone: true,
            city: true,
            country: true,
            joinDate: true,
          },
        })

        if (!emp) break

        // Skip adding the current user to the chain (we start from their manager)
        if (emp.id !== currentEmployeeId) {
          chain.push(emp)
        }

        currentId = emp.reportsToId
      }

      return NextResponse.json({ items: chain, currentEmployeeId })
    }

    if (type === 'full') {
      // Get all active employees for the org chart.
      const employees = await prisma.employee.findMany({
        where: {
          status: 'ACTIVE',
        },
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          email: true,
          department: true,
          position: true,
          employmentType: true,
          avatar: true,
          reportsToId: true,
          status: true,
          phone: true,
          city: true,
          country: true,
          joinDate: true,
          projectMemberships: {
            select: {
              projectId: true,
            },
          },
        },
        orderBy: [{ employeeNumber: 'asc' }],
      })

      const managerChainIds = currentEmployeeId ? await getManagerChain(currentEmployeeId) : []
      const directReportIds = currentEmployeeId
        ? employees
          .filter((emp: HierarchyEmployee) => emp.reportsToId === currentEmployeeId)
          .map((emp: HierarchyEmployee) => emp.id)
        : []

      const mappedEmployees = employees.map((emp: any) => {
        const projects: string[] = []
        const memberships = emp.projectMemberships
        if (memberships) {
          for (const membership of memberships) {
            projects.push(membership.projectId)
          }
        }
        const { projectMemberships, ...rest } = emp
        return {
          ...rest,
          projects,
        }
      })

      return NextResponse.json({
        items: mappedEmployees,
        currentEmployeeId,
        managerChainIds,
        directReportIds,
      })
    }

    return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  } catch (e) {
    return safeErrorResponse(e, 'Failed to fetch hierarchy')
  }
}
