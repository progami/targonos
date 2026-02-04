import { headers } from 'next/headers'
import { decodePortalSession, getCandidateSessionCookieNames, type PortalJwtPayload } from '@targon/auth'
import { prisma } from './prisma'
import { createTemporaryEmployeeId, formatEmployeeId } from './employee-identifiers'

export type CurrentEmployee = {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  email: string
  department: string
  position: string
  reportsToId: string | null
  avatar: string | null
}

export type CurrentUser = {
  session: PortalJwtPayload
  employee: CurrentEmployee | null
}

function parseEmailSet(raw: string | undefined) {
  return new Set(
    (raw ?? '')
      .split(/[,\s]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  )
}

const DEFAULT_ATLAS_SUPER_ADMINS = new Set<string>([])

function atlasSuperAdminEmailSet() {
  const configured = parseEmailSet(process.env.ATLAS_SUPER_ADMIN_EMAILS)
  return new Set([...DEFAULT_ATLAS_SUPER_ADMINS, ...configured])
}

function splitNameFromSession(sessionName: string | undefined, email: string): { firstName: string; lastName: string } {
  const cleaned = (sessionName ?? '').trim()
  if (cleaned) {
    const parts = cleaned.split(/\s+/).filter(Boolean)
    if (parts.length === 1) return { firstName: parts[0]!, lastName: '' }
    return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') }
  }

  const local = email.split('@')[0] ?? ''
  const guessed = local.split(/[._-]+/).filter(Boolean)
  if (guessed.length === 0) return { firstName: 'Employee', lastName: '' }
  if (guessed.length === 1) return { firstName: guessed[0]!, lastName: '' }
  return { firstName: guessed[0]!, lastName: guessed.slice(1).join(' ') }
}

function getPrismaErrorCode(error: unknown): string | null {
  if (!error) return null
  if (typeof error !== 'object') return null
  const maybeCode = (error as Record<string, unknown>).code
  if (typeof maybeCode !== 'string') return null
  return maybeCode
}

async function ensureEmployeeProfile(session: PortalJwtPayload): Promise<CurrentEmployee | null> {
  const email = session.email?.trim().toLowerCase()
  if (!email) return null

  const ensureSuperAdmin = atlasSuperAdminEmailSet().has(email)

  const existing = await prisma.employee.findUnique({
    where: { email },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      email: true,
      department: true,
      position: true,
      reportsToId: true,
      avatar: true,
      permissionLevel: true,
      isSuperAdmin: true,
    },
  })

  if (existing) {
    const permissionLevel = existing.permissionLevel ?? 0
    const needsElevation = ensureSuperAdmin && (!existing.isSuperAdmin || permissionLevel < 100)

    if (!needsElevation) {
      const { permissionLevel: _permissionLevel, isSuperAdmin: _isSuperAdmin, ...employee } = existing
      return employee
    }

    const elevated = await prisma.employee.update({
      where: { id: existing.id },
      data: {
        isSuperAdmin: true,
        permissionLevel: 100,
        position: 'Super Admin',
      },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        email: true,
        department: true,
        position: true,
        reportsToId: true,
        avatar: true,
        permissionLevel: true,
        isSuperAdmin: true,
      },
    })

    const { permissionLevel: _permissionLevel, isSuperAdmin: _isSuperAdmin, ...employee } = elevated
    return employee
  }

  // SECURITY FIX: Do NOT auto-promote first user to Super Admin
  // Only explicitly configured emails (via ATLAS_SUPER_ADMIN_EMAILS) should become Super Admins
  // This prevents attackers from gaining admin access by being the first to log in
  const shouldBeSuperAdmin = ensureSuperAdmin
  const { firstName, lastName } = splitNameFromSession(session.name, email)

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const created = await tx.employee.create({
          data: {
            employeeId: createTemporaryEmployeeId(),
            firstName,
            lastName,
            email,
            department: 'Unassigned',
            position: shouldBeSuperAdmin ? 'Super Admin' : 'Employee',
            joinDate: new Date(),
            permissionLevel: shouldBeSuperAdmin ? 100 : 0,
            isSuperAdmin: shouldBeSuperAdmin,
          },
          select: { id: true, employeeNumber: true },
        })

        return tx.employee.update({
          where: { id: created.id },
          data: { employeeId: formatEmployeeId(created.employeeNumber) },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
            reportsToId: true,
            avatar: true,
          },
        })
      })
    } catch (error) {
      const errorCode = getPrismaErrorCode(error)
      if (errorCode === 'P2002') {
        const fetched = await prisma.employee.findUnique({
          where: { email },
          select: {
            id: true,
            employeeId: true,
            firstName: true,
            lastName: true,
            email: true,
            department: true,
            position: true,
            reportsToId: true,
            avatar: true,
          },
        })
        if (fetched) return fetched
        continue
      }
      throw error
    }
  }

  return null
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const headersList = await headers()
  const cookieHeader = headersList.get('cookie')

  const cookieNames = Array.from(
    new Set([
      ...getCandidateSessionCookieNames('targon'),
      ...getCandidateSessionCookieNames('atlas'),
    ])
  )
  const sharedSecret = process.env.PORTAL_AUTH_SECRET ?? process.env.NEXTAUTH_SECRET

  const session = await decodePortalSession({
    cookieHeader,
    cookieNames,
    secret: sharedSecret,
    appId: 'atlas',
  })

  if (!session?.email) {
    return null
  }

  const employee = await ensureEmployeeProfile(session)

  return {
    session,
    employee,
  }
}

export async function getCurrentEmployeeId(): Promise<string | null> {
  const user = await getCurrentUser()
  return user?.employee?.id ?? null
}
