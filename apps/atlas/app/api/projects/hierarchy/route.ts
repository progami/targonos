import { NextResponse } from 'next/server'
import prisma from '../../../../lib/prisma'
import { withRateLimit } from '@/lib/api-helpers'
import { getCurrentEmployeeId } from '@/lib/current-user'

export async function GET(req: Request) {
  const rateLimitError = withRateLimit(req)
  if (rateLimitError) return rateLimitError

  try {
    const actorId = await getCurrentEmployeeId()
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if the project model exists (migration may not have been run yet)
    const projectModel = (prisma as any).project
    if (!projectModel) {
      return NextResponse.json({ items: [] })
    }

    // Fetch all projects with member details (lead is derived from members with role="Lead")
    const projects = await projectModel.findMany({
      where: {
        status: {
          in: ['ACTIVE', 'PLANNING'],
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        description: true,
        status: true,
        startDate: true,
        endDate: true,
        members: {
          select: {
            id: true,
            role: true,
            employee: {
              select: {
                id: true,
                employeeId: true,
                firstName: true,
                lastName: true,
                email: true,
                position: true,
                department: true,
                avatar: true,
              },
            },
          },
        },
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    // Derive lead from members - find member with role="Lead" (case-insensitive)
    const projectsWithDerivedLead = projects.map((project: any) => {
      const leadMember = project.members.find((m: any) =>
        m.role?.toLowerCase() === 'lead'
      )
      return {
        ...project,
        leadId: leadMember?.employee?.id || null,
        lead: leadMember?.employee || null,
      }
    })

    return NextResponse.json({ items: projectsWithDerivedLead })
  } catch (e: any) {
    // Handle case where Project table doesn't exist yet
    if (e.code === 'P2021' || e.message?.includes('does not exist')) {
      return NextResponse.json({ items: [] })
    }
    console.error('[Projects Hierarchy] Error:', e)
    return NextResponse.json(
      { error: 'Failed to fetch project hierarchy' },
      { status: 500 }
    )
  }
}
